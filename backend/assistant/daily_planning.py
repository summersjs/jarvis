from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.assistant.memory import MEMORY_STORE, MemoryRecord
from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.services.calendar_service import get_calendar_events_for_date, get_calendar_events_for_range


class DailySignal(BaseModel):
    type: str
    severity: Literal["info", "low", "medium", "high", "critical"]
    evidence: str
    recommended_consideration: str
    source_timestamp: str


class DailyState(BaseModel):
    user_id: str
    local_date: str
    local_time: str
    timezone: str
    calendar_events: list[dict[str, Any]] = Field(default_factory=list)
    commitments: list[dict[str, Any]] = Field(default_factory=list)
    workout: dict[str, Any] = Field(default_factory=dict)
    health: dict[str, Any] = Field(default_factory=dict)
    projects: list[dict[str, Any]] = Field(default_factory=list)
    overdue_tasks: list[dict[str, Any]] = Field(default_factory=list)
    brief_status: dict[str, Any] = Field(default_factory=dict)
    financial_events: list[dict[str, Any]] = Field(default_factory=list)
    preferences: dict[str, Any] = Field(default_factory=dict)
    memories: list[dict[str, Any]] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    source_timestamps: dict[str, str] = Field(default_factory=dict)


DAILY_PLAN_PATTERNS = [
    r"\bwhat should i do today\b", r"\bplan my day\b", r"\bwhat do i need to do today\b",
    r"\bhelp me plan (?:out )?today\b", r"\bpriorit(?:ize|ise) my day\b", r"\btoday'?s plan\b",
]
FINANCIAL_WORDS = {"payday", "pay day", "bill", "payment", "mortgage", "rent", "invoice", "due"}
URGENT_WORDS = {"urgent", "critical", "deadline", "overdue", "appointment", "doctor", "court"}


def is_daily_planning_request(text: str) -> bool:
    lower = text.lower()
    return any(re.search(pattern, lower) for pattern in DAILY_PLAN_PATTERNS)


def _safe(source: str, missing: list[str], fallback: Any, operation):
    try:
        return operation()
    except Exception:
        missing.append(source)
        return fallback


def _event_view(event: dict[str, Any], source_date: date) -> dict[str, Any]:
    start = event.get("start") or {}
    end = event.get("end") or {}
    return {
        "title": event.get("summary") or "Unnamed event",
        "date": source_date.isoformat(),
        "all_day": bool(start.get("date")),
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "location": event.get("location"),
        "event_type": event.get("event_type"),
    }


def _workout_state(user_id: str, today: date) -> dict[str, Any]:
    rows = (supabase.table("workouts").select("id,lift,notes,created_at")
        .eq("user_id", user_id).order("created_at", desc=True).limit(80).execute()).data or []
    unique_dates: dict[str, dict[str, Any]] = {}
    for row in rows:
        created = row.get("created_at")
        if not created:
            continue
        local = datetime.fromisoformat(str(created).replace("Z", "+00:00")).astimezone(LOCAL_TZ)
        date_key = local.date().isoformat()
        unique_dates.setdefault(date_key, {"date": date_key, "lift": row.get("lift"), "created_at": created})
    recent = sorted(unique_dates.values(), key=lambda item: item["date"], reverse=True)
    week_start = today - timedelta(days=today.weekday())
    this_week = [item for item in recent if week_start.isoformat() <= item["date"] <= today.isoformat()]
    latest_date = date.fromisoformat(recent[0]["date"]) if recent else None
    return {
        "most_recent": recent[0] if recent else None,
        "days_since_last": (today - latest_date).days if latest_date else None,
        "completed_this_week": len(this_week),
        "completed_dates_this_week": [item["date"] for item in this_week],
        "target_per_week": 4,
        "source_rows_considered": len(rows),
    }


def _health_state(user_id: str, today: date) -> dict[str, Any]:
    checkins = (supabase.table("health_daily_checkins")
        .select("checkin_date,energy,mood,stress,sleep_quality,hours_slept,water_oz,caffeine_mg,workout_completed")
        .eq("user_id", user_id).order("checkin_date", desc=True).limit(7).execute()).data or []
    events = (supabase.table("health_events")
        .select("event_type,event_date,severity,notes,occurred_at")
        .eq("user_id", user_id).order("occurred_at", desc=True).limit(5).execute()).data or []
    return {"recent_checkins": checkins, "recent_events": events, "stale": not checkins or str(checkins[0].get("checkin_date")) < (today - timedelta(days=2)).isoformat()}


def _goals(user_id: str) -> list[dict[str, Any]]:
    return (supabase.table("goals")
        .select("id,title,category,mission_type,status,target_value,current_value,unit,frequency,due_date,planned_date,planned_time,is_active,metadata,created_at")
        .eq("user_id", user_id).eq("is_active", True).order("created_at", desc=True).limit(25).execute()).data or []


def _projects_and_tasks(user_id: str, today: date) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    projects = (supabase.table("forge_projects")
        .select("id,title,category,status,next_milestone,progress_percent,updated_at")
        .eq("user_id", user_id).order("updated_at", desc=True).limit(10).execute()).data or []
    tasks = (supabase.table("forge_tasks")
        .select("id,project_id,title,status,priority,due_date,updated_at")
        .eq("user_id", user_id).order("due_date", desc=False).limit(50).execute()).data or []
    overdue = [task for task in tasks if task.get("due_date") and str(task["due_date"]) < today.isoformat() and str(task.get("status") or "").lower() not in {"done", "complete", "completed"}]
    title_by_id = {project["id"]: project["title"] for project in projects}
    return projects, [{**task, "project_title": title_by_id.get(task.get("project_id"))} for task in overdue[:10]]


def _brief_status(user_id: str, today: date) -> dict[str, Any]:
    rows = (supabase.table("daily_debrief_entries").select("id,date,created_at")
        .eq("user_id", user_id).eq("date", today.isoformat()).limit(1).execute()).data or []
    daily_memories = [row for row in MEMORY_STORE.list(user_id) if row.scope == "daily_status" and row.metadata.get("date") == today.isoformat()]
    morning = next((row for row in daily_memories if row.metadata.get("kind") == "morning_brief"), None)
    return {"morning_brief": "complete" if morning else "not_logged", "morning_brief_timestamp": morning.lastConfirmedAt.isoformat() if morning else None, "evening_debrief": "complete" if rows else "not_logged", "evening_debrief_timestamp": rows[0].get("created_at") if rows else None}


def build_daily_state(user_id: str = "john", now: datetime | None = None) -> DailyState:
    local_now = (now or datetime.now(LOCAL_TZ)).astimezone(LOCAL_TZ)
    today = local_now.date()
    missing: list[str] = []
    timestamps = {"aggregated_at": local_now.isoformat()}
    calendar_raw = _safe("google_calendar_today", missing, [], lambda: get_calendar_events_for_date(today))
    calendar = [_event_view(event, today) for event in calendar_raw]
    future_financial = []
    upcoming = _safe("google_calendar_upcoming_financial", missing, [], lambda: get_calendar_events_for_range(today + timedelta(days=1), today + timedelta(days=8)))
    for event in upcoming:
        start = event.get("start") or {}
        try:
            event_date = date.fromisoformat(str(start.get("date") or start.get("dateTime") or "")[:10])
        except ValueError:
            continue
        if any(word in str(event.get("summary") or "").lower() for word in FINANCIAL_WORDS):
            future_financial.append(_event_view(event, event_date))
    financial = [event for event in calendar if any(word in event["title"].lower() for word in FINANCIAL_WORDS)] + future_financial
    workout = _safe("workouts", missing, {"most_recent": None, "days_since_last": None, "completed_this_week": 0, "target_per_week": 4}, lambda: _workout_state(user_id, today))
    health = _safe("health_logs", missing, {"recent_checkins": [], "recent_events": [], "stale": True}, lambda: _health_state(user_id, today))
    commitments = _safe("goals", missing, [], lambda: _goals(user_id))
    projects, overdue = _safe("forge_projects_tasks", missing, ([], []), lambda: _projects_and_tasks(user_id, today))
    brief = _safe("daily_debrief_status", missing, {"morning_brief": "unknown", "evening_debrief": "unknown"}, lambda: _brief_status(user_id, today))
    memories = MEMORY_STORE.list(user_id)
    preferences = MEMORY_STORE.preferences(user_id)
    return DailyState(
        user_id=user_id, local_date=today.isoformat(), local_time=local_now.strftime("%H:%M"), timezone=str(LOCAL_TZ),
        calendar_events=calendar, commitments=commitments, workout=workout, health=health, projects=projects,
        overdue_tasks=overdue, brief_status=brief, financial_events=financial, preferences=preferences,
        memories=[{"id": row.id, "type": row.type, "content": row.content, "scope": row.scope, "importance": row.importance, "lastConfirmedAt": row.lastConfirmedAt.isoformat()} for row in memories if row.scope in {"daily_planning", "global", "response_style"}][:12],
        missing_data=list(dict.fromkeys(missing)), source_timestamps=timestamps,
    )


def derive_daily_signals(state: DailyState) -> list[DailySignal]:
    timestamp = state.source_timestamps["aggregated_at"]
    signals: list[DailySignal] = []
    for event in state.financial_events:
        lower = event["title"].lower()
        if event["date"] == state.local_date and ("payday" in lower or "pay day" in lower):
            signals.append(DailySignal(type="payday_today", severity="high", evidence=f"Google Calendar lists {event['title']} as {'an all-day event' if event['all_day'] else 'an event'} today.", recommended_consideration="Acknowledge the payday and reserve a short financial review before optional project work.", source_timestamp=timestamp))
        elif event["date"] > state.local_date:
            signals.append(DailySignal(type="bill_due_soon", severity="medium", evidence=f"Calendar financial event: {event['title']} on {event['date']}.", recommended_consideration="Confirm the amount and payment plan before its due date.", source_timestamp=timestamp))
    gap = state.workout.get("days_since_last")
    if gap is not None and gap >= 3:
        signals.append(DailySignal(type=f"no_workout_logged_for_{gap}_days", severity="high" if gap >= 5 else "medium", evidence=f"The most recent workout log is {gap} days old.", recommended_consideration="Schedule a realistic return-to-training action today or explicitly choose recovery and the next workout day.", source_timestamp=timestamp))
    completed = int(state.workout.get("completed_this_week") or 0)
    target = int(state.workout.get("target_per_week") or 0)
    weekday = date.fromisoformat(state.local_date).weekday()
    expected = min(target, max(0, round(target * (weekday + 1) / 7)))
    if target and completed < expected:
        signals.append(DailySignal(type="workout_target_behind_schedule", severity="medium", evidence=f"{completed} of {target} target workouts are logged this week; pace suggests {expected} by today.", recommended_consideration="Protect one workout/recovery block before adding optional projects.", source_timestamp=timestamp))
    for task in state.overdue_tasks[:5]:
        signals.append(DailySignal(type="overdue_commitment", severity="high" if str(task.get("priority") or "").lower() == "high" else "medium", evidence=f"Forge task '{task['title']}' was due {task['due_date']}.", recommended_consideration="Resolve, reschedule, or explicitly defer this task before selecting new project work.", source_timestamp=timestamp))
    today = date.fromisoformat(state.local_date)
    for commitment in state.commitments:
        due_text = commitment.get("due_date") or commitment.get("planned_date")
        if not due_text:
            continue
        try:
            days = (date.fromisoformat(str(due_text)[:10]) - today).days
        except ValueError:
            continue
        if 0 <= days <= 7:
            signals.append(DailySignal(type="project_deadline_approaching", severity="high" if days <= 2 else "medium", evidence=f"Goal '{commitment.get('title')}' is due in {days} day{'s' if days != 1 else ''} ({due_text}).", recommended_consideration="Protect enough capacity to meet or deliberately reschedule this commitment.", source_timestamp=timestamp))
    timed = []
    for event in state.calendar_events:
        if event.get("all_day") or not event.get("start") or not event.get("end"):
            continue
        try:
            timed.append((datetime.fromisoformat(str(event["start"])), datetime.fromisoformat(str(event["end"])), event["title"]))
        except ValueError:
            continue
    timed.sort(key=lambda item: item[0])
    for previous, current in zip(timed, timed[1:]):
        if current[0] < previous[1]:
            signals.append(DailySignal(type="calendar_conflict", severity="high", evidence=f"Calendar events '{previous[2]}' and '{current[2]}' overlap.", recommended_consideration="Resolve the calendar conflict before committing to optional work.", source_timestamp=timestamp))
    urgent_health = next((event for event in state.health.get("recent_events", []) if str(event.get("severity") or "").lower() in {"high", "severe", "critical"}), None)
    if urgent_health:
        signals.append(DailySignal(type="unresolved_urgent_issue", severity="high", evidence=f"Recent health log: {urgent_health.get('event_type')} ({urgent_health.get('severity')}).", recommended_consideration="Account for this health issue before strenuous or optional work.", source_timestamp=timestamp))
    recent = [project for project in state.projects if project.get("updated_at") and str(project["updated_at"])[:10] >= (date.fromisoformat(state.local_date) - timedelta(days=3)).isoformat()]
    if recent:
        signals.append(DailySignal(type="recent_project_momentum", severity="low", evidence=f"Recently active projects: {', '.join(project['title'] for project in recent[:3])}.", recommended_consideration="Continue at most one momentum project after fixed obligations.", source_timestamp=timestamp))
    major_candidates = len([signal for signal in signals if signal.severity in {"high", "critical"}]) + min(len(state.overdue_tasks), 3) + min(len(recent), 2)
    maximum = int(state.preferences.get("max_major_projects_per_day", 2))
    if major_candidates > maximum:
        signals.append(DailySignal(type="excessive_number_of_major_tasks", severity="medium", evidence=f"{major_candidates} plausible major demands exceed the preference limit of {maximum}.", recommended_consideration=f"Choose no more than {maximum} major focus areas and defer the rest.", source_timestamp=timestamp))
    return signals


def _important_events(state: DailyState) -> list[dict[str, Any]]:
    return [event for event in state.calendar_events if event["all_day"] or any(word in event["title"].lower() for word in URGENT_WORDS | FINANCIAL_WORDS)]


def compose_daily_plan(state: DailyState, signals: list[DailySignal]) -> str:
    important = _important_events(state)
    high = [signal for signal in signals if signal.severity in {"high", "critical"}]
    lines = [f"Here’s the grounded plan for {date.fromisoformat(state.local_date).strftime('%A, %B %d')}.".replace(" 0", " ")]
    if important:
        event_bits = [f"{event['title']} ({'all day' if event['all_day'] else 'calendar time: ' + str(event['start'])})" for event in important]
        lines.append("Known calendar facts: " + "; ".join(event_bits) + ".")
    elif state.calendar_events:
        lines.append("Known calendar facts: " + "; ".join(event["title"] for event in state.calendar_events) + ".")
    else:
        lines.append("Known calendar facts: no events were returned for today." if "google_calendar_today" not in state.missing_data else "Missing data: Google Calendar could not be verified, so I will not invent availability.")
    priorities = []
    for signal in high[:2]:
        priorities.append(f"{len(priorities)+1}. {signal.recommended_consideration} Why: {signal.evidence}")
    if len(priorities) < int(state.preferences.get("max_major_projects_per_day", 2)):
        project = next((project for project in state.projects if str(project.get("status") or "").lower() not in {"archived", "completed"}), None)
        if project:
            priorities.append(f"{len(priorities)+1}. Make one concrete next-step pass on {project['title']}. Why: it is recently active, but it remains optional behind calendar, health, and overdue obligations.")
    if priorities:
        lines.append("Top priorities:\n" + "\n".join(priorities))
    gap = state.workout.get("days_since_last")
    if gap is None:
        lines.append("Workout data is missing, so confirm your last training day before choosing intensity.")
    elif gap >= 3:
        lines.append(f"Recovery plan: the workout log is {gap} days old. Choose a manageable session today if recovery supports it; otherwise set the next training day explicitly. This is a suggestion, not a completed workout.")
    lines.append("Timing: I am not assigning new exact times. Fit these priorities around the verified calendar events and your actual availability.")
    if state.brief_status.get("evening_debrief") != "complete":
        lines.append("Close the day with the Evening Debrief so tomorrow’s plan has fresher evidence.")
    if state.missing_data:
        lines.append("Missing or stale data: " + ", ".join(state.missing_data) + ".")
    return "\n\n".join(lines)


def validate_daily_plan(content: str, state: DailyState, signals: list[DailySignal]) -> list[str]:
    failures = []
    lower = content.lower()
    for event in _important_events(state):
        if event["title"].lower() not in lower:
            failures.append(f"important calendar event omitted: {event['title']}")
    for signal in signals:
        if signal.severity in {"high", "critical"} and signal.evidence.lower() not in lower and signal.recommended_consideration.lower() not in lower:
            failures.append(f"high severity signal omitted: {signal.type}")
    if re.search(r"\b(?:i|jarvis) (?:logged|paid|scheduled|completed)\b", lower):
        failures.append("unsupported completion claim")
    if state.preferences.get("exact_times_require_availability", True) and re.search(r"\b(?:do|work on|start|schedule|complete)\b.{0,40}\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", lower):
        failures.append("suggested exact time lacks an explicit availability check")
    if state.preferences.get("check_calendar_first", True) and "calendar" not in lower:
        failures.append("calendar-first preference not followed")
    if state.preferences.get("check_workout_gap", True) and "workout" not in lower:
        failures.append("workout-gap preference not followed")
    return failures


def build_grounded_daily_plan(user_id: str, model: str) -> dict[str, Any]:
    state = build_daily_state(user_id)
    signals = derive_daily_signals(state)
    content = compose_daily_plan(state, signals)
    failures = validate_daily_plan(content, state, signals)
    regenerated = False
    if failures:
        regenerated = True
        content += "\n\nRequired considerations added during validation:"
        for event in _important_events(state):
            if event["title"].lower() not in content.lower():
                content += f"\n- Calendar fact considered: {event['title']}."
        for signal in signals:
            if signal.severity in {"high", "critical"} and signal.evidence.lower() not in content.lower() and signal.recommended_consideration.lower() not in content.lower():
                content += f"\n- {signal.recommended_consideration} Evidence: {signal.evidence}"
    final_failures = validate_daily_plan(content, state, signals)
    return {
        "content": content,
        "state": state,
        "signals": signals,
        "validation": {"passed": not final_failures, "failures": final_failures, "regenerated": regenerated},
        "transparency": {
            "calendarEvents": state.calendar_events,
            "workoutStatus": state.workout,
            "urgentTasks": state.overdue_tasks,
            "memoriesUsed": state.memories,
            "preferencesUsed": state.preferences,
            "missingData": state.missing_data,
            "signals": [signal.model_dump() for signal in signals],
            "provider": "Jarvis deterministic personal-state planner",
            "model": model,
        },
    }
