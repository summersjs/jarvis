import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from backend.assistant.daily_planning import DailySignal, DailyState, compose_daily_plan, derive_daily_signals, validate_daily_plan
from backend.assistant.memory import MemoryStore, record_feedback
from backend.utils.local_store import DATA_DIR


def state(**updates):
    base = dict(
        user_id="john", local_date="2026-07-21", local_time="09:00", timezone="America/New_York",
        calendar_events=[], commitments=[], workout={"most_recent": None, "days_since_last": None, "completed_this_week": 0, "target_per_week": 4},
        health={"recent_checkins": [], "recent_events": [], "stale": True}, projects=[], overdue_tasks=[],
        brief_status={"morning_brief": "unknown", "evening_debrief": "not_logged"}, financial_events=[],
        preferences={"check_calendar_first": True, "check_workout_gap": True, "max_major_projects_per_day": 2, "exact_times_require_availability": True, "include_financial_events": True},
        memories=[], missing_data=[], source_timestamps={"aggregated_at": "2026-07-21T09:00:00-04:00"},
    )
    base.update(updates)
    return DailyState(**base)


class DailyPlanningTests(unittest.TestCase):
    def test_allied_payday_appears_in_plan(self):
        event = {"title": "Allied Payday", "date": "2026-07-21", "all_day": True, "start": "2026-07-21", "end": "2026-07-22", "location": None, "event_type": "default"}
        daily = state(calendar_events=[event], financial_events=[event])
        signals = derive_daily_signals(daily)
        text = compose_daily_plan(daily, signals)
        self.assertIn("Allied Payday", text)
        self.assertTrue(any(signal.type == "payday_today" for signal in signals))

    def test_five_day_workout_gap_creates_high_signal(self):
        signals = derive_daily_signals(state(workout={"most_recent": {"date": "2026-07-16"}, "days_since_last": 5, "completed_this_week": 0, "target_per_week": 4}))
        signal = next(item for item in signals if item.type == "no_workout_logged_for_5_days")
        self.assertEqual(signal.severity, "high")

    def test_unknown_availability_does_not_invent_exact_time(self):
        text = compose_daily_plan(state(missing_data=["google_calendar_today"]), [])
        self.assertNotRegex(text, r"\b(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?\b")
        self.assertIn("not assigning new exact times", text)

    def test_high_priority_calendar_event_cannot_be_silently_omitted(self):
        event = {"title": "Allied Payday", "date": "2026-07-21", "all_day": True, "start": "2026-07-21", "end": "2026-07-22"}
        failures = validate_daily_plan("Work on World Walker.", state(calendar_events=[event], financial_events=[event]), [])
        self.assertTrue(any("Allied Payday" in failure for failure in failures))

    def test_daily_plan_has_no_unsupported_action_claim(self):
        text = compose_daily_plan(state(), [])
        failures = validate_daily_plan(text, state(), [])
        self.assertFalse(any("unsupported completion" in failure for failure in failures))
        self.assertNotRegex(text.lower(), r"\bjarvis (?:logged|paid|scheduled|completed)\b")


class MemoryLearningTests(unittest.TestCase):
    def setUp(self):
        self.filename = "test_assistant_memories_daily_planning.json"
        self.feedback_filename = "test_assistant_feedback_daily_planning.json"
        self.store = MemoryStore(self.filename)

    def tearDown(self):
        for filename in (self.filename, self.feedback_filename):
            path = DATA_DIR / filename
            if path.exists():
                path.unlink()

    def test_stale_temporary_memory_expires(self):
        record, _ = self.store.remember("john", memory_type="temporary_state", content="Working late today", expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        self.assertEqual(self.store.list("john"), [])
        expired = self.store.list("john", include_expired=True)
        self.assertEqual(expired[0].id, record.id)
        self.assertEqual(expired[0].status, "expired")

    def test_same_memory_is_not_stored_repeatedly(self):
        first, created = self.store.remember("john", memory_type="commitment", content="Call Tierra after work")
        second, created_again = self.store.remember("john", memory_type="commitment", content="Call Tierra after work.")
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(self.store.list("john")), 1)

    def test_missed_context_feedback_updates_preferences(self):
        with patch("backend.assistant.memory.MEMORY_STORE", self.store), patch("backend.assistant.memory.FEEDBACK_FILE", self.feedback_filename):
            result = record_feedback("john", {"message_id": "message-123", "rating": "down", "reason": "Missed context"})
        self.assertTrue(result["updated_preferences"]["check_calendar_first"])
        self.assertTrue(result["updated_preferences"]["check_workout_gap"])
        self.assertTrue(result["updated_preferences"]["include_financial_events"])


if __name__ == "__main__":
    unittest.main()
