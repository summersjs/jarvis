import unittest
from unittest.mock import patch
from datetime import date

from backend.assistant.tools.registry import resolve_activity_date, select_write_tools
from backend.services.ollama_service import format_write_confirmation


class RelativeGoalDateTests(unittest.TestCase):
    def test_bare_weekday_resolves_to_most_recent_day(self):
        self.assertEqual(resolve_activity_date("I went on a date on Saturday", date(2026, 7, 21)), "2026-07-18")

    def test_last_same_weekday_resolves_seven_days_back(self):
        self.assertEqual(resolve_activity_date("I went on a date last Saturday", date(2026, 7, 18)), "2026-07-11")

    def test_yesterday_and_explicit_dates(self):
        self.assertEqual(resolve_activity_date("We went yesterday", date(2026, 7, 21)), "2026-07-20")
        self.assertEqual(resolve_activity_date("We went July 18th", date(2026, 7, 21)), "2026-07-18")
        self.assertEqual(resolve_activity_date("We went on 7/18", date(2026, 7, 21)), "2026-07-18")

    def test_date_completion_passes_resolved_date_to_goal_tool(self):
        calls = select_write_tools("Tierra and I went on a date on 2026-07-18 to play Magic")
        call = next(item for item in calls if item["name"] == "log_goal_progress")
        self.assertEqual(call["input"]["planned_for"], "2026-07-18")

    def test_historical_confirmation_names_previous_period(self):
        result = {
            "goal": {"title": "1 Date weekly", "frequency": "weekly", "progress": {"percent": 0}},
            "log": {"planned_for": "2026-07-18", "notes": "Played Magic."},
        }
        with patch("backend.services.ollama_service.datetime") as mocked_datetime:
            mocked_datetime.now.return_value.date.return_value = date(2026, 7, 21)
            text = format_write_confirmation("log_goal_progress", result)
        self.assertIn("Saturday, July 18", text)
        self.assertIn("previous weekly period", text)
        self.assertNotIn("0%", text)


if __name__ == "__main__":
    unittest.main()
