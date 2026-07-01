from __future__ import annotations

import json
from calendar import monthrange
from datetime import date, datetime, timedelta

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.services.calendar_service import (
    get_calendar_events_for_date,
    get_calendar_summary_for_date,
)
from backend.services.goal_service import list_goal_logs, list_goals
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.services.workout_service import (
    get_scheduled_lift_for_date,
    get_next_scheduled_lift_after,
    get_next_workout_logic,
    get_todays_workout_summary,
    get_unique_completed_workouts,
)
from backend.utils.formatters import format_lift_name
from backend.utils.local_store import read_json, write_json


DEBRIEF_FILE = "daily_debriefs.json"
MONTHLY_BUDGET_FILE = "finance_monthly_budgets.json"
TRANSACTIONS_FILE = "finance_transactions.json"


def _today_str() -> str:
    return datetime.now(LOCAL_TZ).date().isoformat()


def _month_key(date_str: str | None = None) -> str:
    if date_str:
        return date_str[:7]
    return _today_str()[:7]


def _debrief_entries() -> list[dict]:
    return read_json(DEBRIEF_FILE, [])


def _save_debrief_entries(entries: list[dict]):
    return write_json(DEBRIEF_FILE, entries)


def _budget_entries() -> list[dict]:
    return read_json(MONTHLY_BUDGET_FILE, [])


def _save_budget_entries(entries: list[dict]):
    return write_json(MONTHLY_BUDGET_FILE, entries)


def _transactions() -> list[dict]:
    return read_json(TRANSACTIONS_FILE, [])


def _save_transactions(transactions: list[dict]):
    return write_json(TRANSACTIONS_FILE, transactions)


def _lookup_latest_debrief(user_id: str, date_str: str) -> dict | None:
    matches = [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id and entry.get("date") == date_str
    ]
    if not matches:
        return None
    return sorted(matches, key=lambda entry: entry.get("updated_at") or entry.get("created_at") or "", reverse=True)[0]


def get_previous_mission_score(user_id: str, before_date: str | None = None) -> int | None:
    entries = [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id and (before_date is None or (entry.get("date") or "") < before_date)
    ]
    if not entries:
        return None

    latest = sorted(entries, key=lambda entry: entry.get("updated_at") or entry.get("created_at") or "", reverse=True)[0]
    score = _saved_debrief_score(latest)
    if score is None:
        return None

    try:
        return int(score)
    except (TypeError, ValueError):
        return None


def _saved_debrief_score(entry: dict) -> int | None:
    for key in ("daily_score", "mission_score"):
        score = entry.get(key)
        if score is None:
            continue
        try:
            return int(score)
        except (TypeError, ValueError):
            continue
    return None


def _latest_unchecked_shopping_items(user_id: str) -> dict:
    lists_response = (
        supabase
        .table("shopping_lists")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not lists_response.data:
        return {
            "unchecked_count": 0,
        }

    shopping_list = lists_response.data[0]
    items_response = (
        supabase
        .table("shopping_list_items")
        .select("*")
        .eq("shopping_list_id", shopping_list["id"])
        .order("created_at")
        .execute()
    )

    items = items_response.data or []
    return {
        "unchecked_count": sum(1 for item in items if not item.get("is_checked")),
        "unchecked_items": [item for item in items if not item.get("is_checked")],
        "items": items,
    }


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_same_local_date(value: str | None, date_str: str) -> bool:
    parsed = _parse_iso_datetime(value)
    if not parsed:
        return False
    return parsed.astimezone(LOCAL_TZ).date().isoformat() == date_str


def _day_progress_weight(today_date: date) -> float:
    weekday = today_date.weekday()
    if weekday <= 3:
        return 0.0
    if weekday == 4:
        return 0.35
    if weekday == 5:
        return 0.65
    return 1.0


def _safe_lift_label(lift: str | None) -> str:
    if not lift:
        return "Training"
    return format_lift_name(lift)


def _safe_day_label(value: str | None) -> str:
    if not value:
        return "day"
    return value.replace("_", " ")


def _mission_status_label(score: int) -> str:
    if score >= 90:
        return "ON MISSION"
    if score >= 75:
        return "ON TRACK"
    if score >= 50:
        return "WATCH"
    if score >= 25:
        return "AT RISK"
    return "OFF MISSION"


def _mission_status_class(label: str) -> str:
    if label in {"ON MISSION", "ON TRACK"}:
        return "online"
    if label in {"WATCH", "AT RISK"}:
        return "pending"
    return "offline"


def _objective_completion_ratio(goals: list[dict]) -> float:
    if not goals:
        return 1.0
    completed = sum(1 for goal in goals if goal.get("progress", {}).get("is_complete"))
    return completed / len(goals)


def _budget_score(finance_summary: dict) -> float:
    status = finance_summary.get("dashboard_cards", {}).get("spending_status", "WATCH")
    if status == "ON TRACK":
        return 1.0
    if status == "WATCH":
        return 0.65
    return 0.15


def _calendar_score(calendar: dict) -> float:
    today_status = calendar.get("today", {}).get("status")
    today_score = 1.0 if today_status == "ok" else 0.65
    return round(today_score, 2)


def _workout_score(workout_context: dict) -> float:
    if workout_context.get("today_day_type") == "rest":
        return 1.0
    if workout_context.get("workout_completed"):
        return 1.0
    if workout_context.get("next_protocol"):
        return 0.15
    return 0.6


def _goal_logs_for_date(goal_id: str, date_str: str) -> list[dict]:
    logs = list_goal_logs(goal_id)
    return [log for log in logs if _is_same_local_date(log.get("created_at"), date_str)]


def _goal_group(goal: dict) -> str:
    def _normalized_frequency(value: str | None) -> str:
        value = (value or "").strip().lower()
        if value in {"d", "day", "daily", "every day"}:
            return "daily"
        if value in {"w", "wk", "week", "weekly", "every week", "once a week"}:
            return "weekly"
        if value in {"m", "mo", "month", "monthly", "every month", "once a month"}:
            return "monthly"
        return value

    mission_type = (goal.get("mission_type") or "").lower()
    frequency = _normalized_frequency(goal.get("frequency"))
    if mission_type == "objective":
        return "long_term"
    if mission_type == "project":
        return "weekly" if frequency in {"weekly", "monthly"} else "long_term"
    if mission_type == "standard":
        if frequency == "daily":
            return "daily"
        if frequency == "weekly":
            return "weekly"
        return "long_term"

    if frequency == "daily":
        return "daily"
    if frequency == "weekly":
        return "weekly"
    if frequency == "monthly":
        return "long_term"

    text = " ".join(
        str(part or "").lower()
        for part in (goal.get("title"), goal.get("description"), goal.get("category"))
    )
    if any(token in text for token in ("weekly", "every week", "once a week", "wk ", " wk", "week ")):
        return "weekly"
    if "date" in text and (goal.get("goal_type") or "").lower() in {"binary", "count", "habit"}:
        return "weekly"
    if "daily" in text or "every day" in text:
        return "daily"

    period = goal.get("period") or {}
    period_frequency = _normalized_frequency(period.get("frequency"))
    if period_frequency == "weekly":
        return "weekly"
    if period_frequency == "daily":
        return "daily"
    if period_frequency == "monthly":
        return "long_term"

    for field in ("cadence", "recurrence", "interval", "schedule"):
        field_frequency = _normalized_frequency(goal.get(field))
        if field_frequency == "weekly":
            return "weekly"
        if field_frequency == "daily":
            return "daily"
        if field_frequency == "monthly":
            return "long_term"

    goal_type = (goal.get("goal_type") or "").lower()
    if goal_type in {"habit"}:
        return "daily"
    if goal_type in {"count", "binary"} and frequency not in {"monthly"}:
        return "daily"
    return "long_term"


def _goal_impact_from_logs(goal: dict, logs_today: list[dict], workout_context: dict) -> dict | None:
    progress_logs_today = [
        log
        for log in logs_today
        if (log.get("log_type") or "progress").lower() not in {"planned", "note"}
    ]
    if not logs_today:
        if workout_context.get("workout_completed") and _goal_group(goal) == "daily":
            return {
                "id": goal.get("id"),
                "title": goal.get("title", "Untitled goal"),
                "goal_group": _goal_group(goal),
                "completed": True,
                "achievement_tier": "completed",
                "achievement_label": "Completed",
                "bonus_points": 0,
                "over_target_amount": 0,
                "notes": goal.get("description") or "Workout completed today.",
                "blocker": None,
                "current_value": float(goal.get("current_value") or 0),
                "target_value": float(goal.get("target_value") or 0),
                "unit": goal.get("unit"),
                "category": goal.get("category"),
                "progress_percent": goal.get("progress", {}).get("percent"),
                "state": "Completed",
                "detail": f"{_safe_lift_label(workout_context.get('scheduled_lift'))} completed today.",
                "logs_today": [],
            }
        return None

    current = float(goal.get("current_value") or 0)
    target = float(goal.get("target_value") or 0)
    total_value = sum(float(log.get("value") or 1) for log in progress_logs_today)
    tracked_current = max(current, total_value)
    completed = bool(goal.get("progress", {}).get("is_complete")) or (target > 0 and tracked_current >= target)
    latest_note = next((log.get("notes") for log in logs_today if log.get("notes")), None)
    goal_type = (goal.get("goal_type") or "").lower()
    group = _goal_group(goal)
    lift = (workout_context.get("scheduled_lift") or "").replace("_", " ")
    title = (goal.get("title") or "").lower()
    strength_match = any(keyword in title for keyword in ("deadlift", "bench", "squat", "press", "ohp"))
    lift_match = bool(lift and lift in title)
    above_and_beyond = bool(target > 0 and tracked_current > target)
    over_target_amount = max(0.0, tracked_current - target) if target > 0 else 0.0
    bonus_points = 0.0
    if above_and_beyond:
        bonus_points = round(min(5.0, over_target_amount * (1.5 if group == "daily" else 1.0)), 2)

    if workout_context.get("workout_completed") and (lift_match or strength_match or group == "daily"):
        completed = True

    if not progress_logs_today and logs_today:
        state = "Planned"
        completed = False
        detail = latest_note or "Planned for a future mission window."
        return {
            "id": goal.get("id"),
            "title": goal.get("title", "Untitled goal"),
            "goal_group": group,
            "completed": completed,
            "achievement_tier": "planned",
            "achievement_label": "Planned",
            "bonus_points": 0,
            "over_target_amount": 0,
            "notes": latest_note or goal.get("description") or "Planned.",
            "blocker": None,
            "current_value": tracked_current,
            "target_value": target,
            "unit": goal.get("unit"),
            "category": goal.get("category"),
            "progress_percent": goal.get("progress", {}).get("percent"),
            "state": state,
            "detail": detail,
            "logs_today": logs_today,
        }

    if above_and_beyond:
        state = "Above and Beyond"
    elif completed:
        state = "Completed"
    elif total_value > 0:
        state = f"Progress +{format_number(total_value)}"
    else:
        state = "Impacted"

    if above_and_beyond and target > 0:
        unit_label = goal.get("unit") or "units"
        detail = f"Completed {format_number(target)} {unit_label} and exceeded it by {format_number(over_target_amount)}."
    elif completed and target > 0:
        detail = f"Current: {format_number(tracked_current)}/{format_number(target)}"
    elif goal_type == "metric" and target > 0:
        detail = f"Current: {format_number(tracked_current)}/{format_number(target)}"
    else:
        detail = latest_note or goal.get("description") or "Today moved this goal forward."

    return {
        "id": goal.get("id"),
        "title": goal.get("title", "Untitled goal"),
        "goal_group": group,
        "completed": completed,
        "achievement_tier": "above_and_beyond" if above_and_beyond else ("completed" if completed else "progress"),
        "achievement_label": "Above and Beyond" if above_and_beyond else ("Completed" if completed else "In Progress"),
        "bonus_points": bonus_points,
        "over_target_amount": over_target_amount,
        "notes": latest_note or goal.get("description") or "Progress logged today.",
        "blocker": None if completed else _goal_blocker(goal, tracked_current, target),
        "current_value": tracked_current,
        "target_value": target,
        "unit": goal.get("unit"),
        "category": goal.get("category"),
        "progress_percent": goal.get("progress", {}).get("percent"),
        "state": state,
        "detail": detail,
        "logs_today": logs_today,
    }


def _goal_was_touched_today(goal: dict, date_str: str, logs_today: list[dict]) -> bool:
    if logs_today:
        return True
    return _is_same_local_date(goal.get("updated_at"), date_str) or _is_same_local_date(goal.get("created_at"), date_str)


def _daily_goal_impacts(user_id: str, date_str: str, workout_context: dict) -> list[dict]:
    impacts = []
    for goal in list_goals(user_id, active_only=False):
        logs_today = _goal_logs_for_date(goal.get("id"), date_str)
        if not _goal_was_touched_today(goal, date_str, logs_today):
            continue
        impact = _goal_impact_from_logs(goal, logs_today, workout_context)
        if not impact:
            current = float(goal.get("current_value") or 0)
            target = float(goal.get("target_value") or 0)
            progress = goal.get("progress") or {}
            progress_percent = progress.get("percent")
            completed = bool(progress.get("is_complete")) or (target > 0 and current >= target)
            impact = {
                "id": goal.get("id"),
                "title": goal.get("title", "Untitled goal"),
                "goal_group": _goal_group(goal),
                "completed": completed,
                "achievement_tier": "completed" if completed else "progress",
                "achievement_label": "Completed" if completed else "In Progress",
                "bonus_points": 0,
                "over_target_amount": 0,
                "notes": goal.get("description") or "Goal updated today.",
                "blocker": None if completed else _goal_blocker(goal, current, target),
                "current_value": current,
                "target_value": target,
                "unit": goal.get("unit"),
                "category": goal.get("category"),
                "progress_percent": progress_percent,
                "state": "Completed" if completed else "Impacted",
                "detail": _goal_objective_note(goal, current, target),
                "logs_today": logs_today,
            }
        if impact:
            impacts.append(impact)

    impacts.sort(key=lambda item: (not item.get("completed"), item.get("title") or ""))
    return impacts


def _daily_goal_score(goal_impacts: list[dict], daily_goals: list[dict]) -> float:
    if not daily_goals:
        return 1.0 if goal_impacts else 0.85

    today = datetime.now(LOCAL_TZ).date().isoformat()
    actionable_daily_goals = [
        goal
        for goal in daily_goals
        if (goal.get("mission_type") or "").lower() != "standard"
        or (goal.get("standard") or {}).get("status") in {"IN PROGRESS", "COMPLETED", "MISSED"}
        or _is_same_local_date((goal.get("standard") or {}).get("planned_for"), today)
    ]
    if not actionable_daily_goals:
        return 1.0

    completed = sum(
        1
        for goal in actionable_daily_goals
        if (goal.get("standard") or {}).get("status") == "COMPLETED"
        or goal.get("progress", {}).get("is_complete")
    )
    progressed = len([impact for impact in goal_impacts if impact.get("goal_group") == "daily"])
    if progressed == 0:
        return 0.4

    completed_ratio = completed / len(actionable_daily_goals)
    progressed_ratio = min(1.0, progressed / len(actionable_daily_goals))
    return round(min(1.0, 0.35 + (completed_ratio * 0.45) + (progressed_ratio * 0.2)), 2)


def _goal_bonus_points(goal_impacts: list[dict], goal_group: str | None = None) -> float:
    bonus = 0.0
    for impact in goal_impacts:
        if goal_group and impact.get("goal_group") != goal_group:
            continue
        bonus += float(impact.get("bonus_points") or 0)
    return round(min(5.0, bonus), 2)


def _weekly_goal_score(goals: list[dict], today_date: date) -> float:
    weekly_goals = [goal for goal in goals if _goal_group(goal) == "weekly"]
    if not weekly_goals:
        return 1.0

    pressure = _day_progress_weight(today_date)
    scores = []
    for goal in weekly_goals:
        if (goal.get("mission_type") or "").lower() == "standard":
            standard = goal.get("standard") or {}
            status = standard.get("status")
            if status == "COMPLETED":
                scores.append(1.0)
                continue
            if status == "PLANNED":
                scores.append(max(0.75, 0.95 - pressure * 0.15))
                continue
            if status == "MISSED":
                scores.append(0.25)
                continue

        if (goal.get("mission_type") or "").lower() == "project":
            project = goal.get("project") or {}
            completed = float(project.get("completed_count") or 0)
            total = float(project.get("total_count") or 0)
            scores.append(0.85 if total <= 0 else max(0.5, min(1.0, completed / total + 0.35)))
            continue

        progress = goal.get("progress") or {}
        target = float(goal.get("target_value") or 0)
        current = float(goal.get("current_value") or 0)
        if progress.get("is_complete") or (target > 0 and current >= target):
            scores.append(1.0)
            continue

        if target <= 0:
            scores.append(max(0.55, 0.95 - pressure * 0.35))
            continue

        progress_ratio = min(1.0, max(0.0, current / target))
        if pressure <= 0:
            score = 0.95 if progress_ratio < 1.0 else 1.0
        else:
            score = max(0.45, 1.0 - (pressure * 0.35) - ((1.0 - progress_ratio) * 0.5))
        scores.append(round(score, 2))

    return round(sum(scores) / len(scores), 2)


def _lifetime_rank(score: int) -> str:
    if score >= 90:
        return "Legend"
    if score >= 75:
        return "Commander"
    if score >= 60:
        return "Senior Operator"
    if score >= 45:
        return "Specialist"
    if score >= 25:
        return "Operator"
    return "Recruit"


def _lifetime_mission_score(user_id: str, today_score: int) -> dict:
    completed_goals = [
        goal
        for goal in list_goals(user_id, active_only=False)
        if goal.get("progress", {}).get("is_complete")
    ]
    completed_goal_count = len(completed_goals)

    completed_workouts = get_unique_completed_workouts(user_id)
    workout_days = len({row.get("date") for row in completed_workouts if row.get("date")})

    debrief_entries = [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id
    ]
    finalized_debriefs = [
        entry for entry in debrief_entries if entry.get("is_finalized") or entry.get("completed_at")
    ]
    mission_days = [
        entry
        for entry in finalized_debriefs
        if int(entry.get("daily_score") or entry.get("mission_score") or 0) >= 75
    ]

    score = min(
        100,
        (workout_days * 3)
        + (completed_goal_count * 4)
        + (len(mission_days) * 2)
        + (len(finalized_debriefs) * 1)
        + int(today_score * 0.05),
    )

    return {
        "score": score,
        "rank": _lifetime_rank(score),
        "workouts_completed": workout_days,
        "goals_completed": completed_goal_count,
        "mission_days": len(mission_days),
        "debriefs_completed": len(finalized_debriefs),
    }


def build_mission_score_snapshot(
    user_id: str,
    today_date: date,
    workout_context: dict,
    shopping: dict,
    calendar: dict,
    finance_summary: dict,
    goals: list[dict] | None = None,
    debrief_entry: dict | None = None,
) -> dict:
    goals = goals or list_goals(user_id, active_only=False)
    goal_impacts = _daily_goal_impacts(user_id, today_date.isoformat(), workout_context)
    daily_goals = [goal for goal in goals if _goal_group(goal) == "daily"]
    weekly_goals = [goal for goal in goals if _goal_group(goal) == "weekly"]

    workout_score = _workout_score(workout_context)
    daily_goal_score = _daily_goal_score(goal_impacts, daily_goals)
    daily_goal_bonus = _goal_bonus_points(goal_impacts)

    shopping_items = shopping.get("items", []) or shopping.get("unchecked_items", [])
    shopping_touched_today = any(
        _is_same_local_date(item.get("updated_at") or item.get("created_at"), today_date.isoformat())
        for item in shopping_items
    )
    shopping_checked_today = any(
        _is_same_local_date(item.get("updated_at") or item.get("created_at"), today_date.isoformat())
        and bool(item.get("is_checked"))
        for item in shopping_items
    )
    if shopping_touched_today:
        shopping_score = 1.0 if not shopping.get("unchecked_count") else (0.8 if shopping_checked_today else 0.55)
    else:
        shopping_score = 1.0

    budget_status = finance_summary.get("dashboard_cards", {}).get("spending_status", "WATCH")
    budget_score = _budget_score(finance_summary)
    calendar_score = _calendar_score(calendar)
    debrief_complete = bool(debrief_entry and (debrief_entry.get("is_finalized") or debrief_entry.get("completed_at")))
    debrief_score = 1.0 if debrief_complete else 0.0

    daily_score = round(
        100
        * (
            workout_score * 0.30
            + daily_goal_score * 0.25
            + shopping_score * 0.15
            + budget_score * 0.15
            + calendar_score * 0.10
            + debrief_score * 0.05
        )
    )
    daily_score = min(100, daily_score + round(daily_goal_bonus))

    daily_label = _mission_status_label(daily_score)
    weekly_score_base = round(100 * _weekly_goal_score(goals, today_date))
    weekly_goal_bonus = _goal_bonus_points(goal_impacts, "weekly")
    weekly_score = min(100, weekly_score_base + round(weekly_goal_bonus))
    weekly_label = _mission_status_label(weekly_score)
    lifetime = _lifetime_mission_score(user_id, daily_score)

    return {
        "daily": {
            "score": daily_score,
            "label": daily_label,
            "class": _mission_status_class(daily_label),
            "workout_score": workout_score,
            "goal_score": daily_goal_score,
            "shopping_score": shopping_score,
            "budget_score": budget_score,
            "calendar_score": calendar_score,
            "debrief_score": debrief_score,
            "goal_bonus": daily_goal_bonus,
            "goal_impacts": goal_impacts,
            "goals_completed_today": sum(1 for item in goal_impacts if item.get("completed")),
            "goals_above_and_beyond_today": sum(1 for item in goal_impacts if item.get("achievement_tier") == "above_and_beyond"),
            "goals_impacted_today": len(goal_impacts),
        },
        "weekly": {
            "score": weekly_score,
            "label": weekly_label,
            "class": _mission_status_class(weekly_label),
            "goals": weekly_goals,
            "goal_bonus": weekly_goal_bonus,
        },
        "lifetime": lifetime,
        "goal_impacts": goal_impacts,
        "daily_goals": daily_goals,
        "weekly_goals": weekly_goals,
        "scores": {
            "daily": daily_score,
            "weekly": weekly_score,
            "lifetime": lifetime["score"],
        },
    }


def _goals_as_objectives(user_id: str) -> list[dict]:
    goals = list_goals(user_id, active_only=True)
    objectives = []
    for goal in goals[:4]:
        target = float(goal.get("target_value") or 0)
        current = float(goal.get("current_value") or 0)
        progress = goal.get("progress") or {}
        completed = bool(progress.get("is_complete")) or (target > 0 and current >= target)
        note = _goal_objective_note(goal, current, target)
        objectives.append({
            "id": goal.get("id"),
            "title": goal.get("title", "Untitled goal"),
            "completed": completed,
            "notes": note,
            "blocker": None if completed else _goal_blocker(goal, current, target),
            "current_value": current,
            "target_value": target,
            "unit": goal.get("unit"),
            "category": goal.get("category"),
            "progress_percent": progress.get("percent"),
        })
    return objectives


def _goal_objective_note(goal: dict, current: float, target: float) -> str:
    title = (goal.get("title") or "").lower()
    unit = goal.get("unit") or ""
    eta = goal.get("eta") or {}
    eta_summary = eta.get("summary")

    if target > 0 and "feature" in title:
        return f"{int(current)} Jarvis features shipped toward {int(target)} this week."

    if target > 0 and unit:
        return f"{format_number(current)} of {format_number(target)} {unit} toward the target."

    return goal.get("description") or eta_summary or "Progress logged from the goals board."


def _goal_blocker(goal: dict, current: float, target: float) -> str:
    if target > 0 and current < target:
        remaining = round(target - current, 2)
        unit = goal.get("unit") or "units"
        return f"{format_number(remaining)} {unit} remaining to hit the target."

    eta = goal.get("eta") or {}
    return eta.get("summary") or "No blocker recorded."


def _today_meals(user_id: str, date_str: str) -> list[dict]:
    entries = list_meal_plan_entries(user_id=user_id, start_date=date_str, end_date=date_str)
    meals = []
    for entry in entries:
        recipe = entry.get("recipes") or {}
        meta = _meal_meta(entry)
        meals.append({
            "id": entry.get("id"),
            "meal_type": entry.get("meal_type"),
            "name": recipe.get("title") or entry.get("custom_meal_name") or "Unnamed meal",
            "notes": meta.get("note") or _clean_meal_note(entry.get("notes")),
            "source": meta.get("source") or entry.get("meal_source"),
            "completed": bool(meta.get("completed")),
            "estimated_cost": _safe_float(meta.get("estimated_cost") or entry.get("estimated_cost")),
            "calories": _safe_float(meta.get("calories")),
            "protein_g": _safe_float(meta.get("protein_g")),
            "carbs_g": _safe_float(meta.get("carbs_g")),
            "fat_g": _safe_float(meta.get("fat_g")),
            "servings": _safe_float(meta.get("servings") or 1),
        })
    return meals


def _meal_meta(entry: dict) -> dict:
    notes = entry.get("notes") or ""
    if not notes.startswith("JARVIS_META:"):
        return {}
    try:
        return json.loads(notes.replace("JARVIS_META:", "", 1))
    except json.JSONDecodeError:
        return {}


def _clean_meal_note(notes: str | None) -> str | None:
    if not notes or notes.startswith("JARVIS_META:"):
        return None
    return notes


def _today_meal_snapshot(user_id: str, date_str: str) -> dict:
    meals = _today_meals(user_id, date_str)
    completed = [meal for meal in meals if meal.get("completed")]
    normal_meals = [meal for meal in meals if (meal.get("source") or "") != "caffeine"]
    normal_completed = [meal for meal in completed if (meal.get("source") or "") != "caffeine"]
    spend = round(sum(_safe_float(meal.get("estimated_cost")) for meal in completed), 2)
    totals = {
        "calories": round(sum(_safe_float(meal.get("calories")) * _safe_float(meal.get("servings") or 1) for meal in completed), 1),
        "protein_g": round(sum(_safe_float(meal.get("protein_g")) * _safe_float(meal.get("servings") or 1) for meal in completed), 1),
        "carbs_g": round(sum(_safe_float(meal.get("carbs_g")) * _safe_float(meal.get("servings") or 1) for meal in completed), 1),
        "fat_g": round(sum(_safe_float(meal.get("fat_g")) * _safe_float(meal.get("servings") or 1) for meal in completed), 1),
    }
    return {
        "meals": meals,
        "completed": completed,
        "meals_planned_today": len(normal_meals),
        "meals_completed": len(normal_completed),
        "ate_out_today": any((meal.get("source") or "") == "eat_out" for meal in completed),
        "estimated_food_spend": spend,
        "nutrition_totals": totals,
    }


def _food_transactions_for_date(user_id: str, date_str: str) -> list[dict]:
    return [
        transaction
        for transaction in _transactions()
        if transaction.get("user_id") == user_id and transaction.get("date") == date_str
        and transaction.get("category") in {"Groceries", "Eating Out"}
    ]


def _current_month_budget(user_id: str, month: str) -> dict:
    for budget in _budget_entries():
        if budget.get("user_id") == user_id and budget.get("month") == month:
            return budget
    return {
        "user_id": user_id,
        "month": month,
        "income": 0,
        "fixed_bills": 0,
        "groceries_budget": 0,
        "eating_out_budget": 0,
        "gas_budget": 0,
        "kids_family_budget": 0,
        "debt_budget": 0,
        "miscellaneous_budget": 0,
        "variable_categories": {},
    }


def _food_budget_status(spend_today: float, budget: dict, date_obj: datetime) -> str:
    groceries = float(budget.get("groceries_budget") or 0)
    eating_out = float(budget.get("eating_out_budget") or 0)
    monthly_total = groceries + eating_out
    if monthly_total <= 0:
        return "WATCH" if spend_today > 0 else "UNDER CONTROL"

    days_in_month = monthrange(date_obj.year, date_obj.month)[1]
    daily_target = monthly_total / days_in_month
    if spend_today <= daily_target * 0.9:
        return "UNDER CONTROL"
    if spend_today <= daily_target * 1.1:
        return "WATCH"
    return "OVER"


def _safe_float(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def format_number(value: float | int | None) -> str:
    if value is None:
        return "0"
    if float(value).is_integer():
        return str(int(value))
    return f"{round(float(value), 2):g}"


def _planned_standard_summaries(goals: list[dict], today_date: date) -> list[str]:
    summaries = []
    for goal in goals:
        if (goal.get("mission_type") or "").lower() != "standard":
            continue
        standard = goal.get("standard") or {}
        planned_for = standard.get("planned_for") or goal.get("planned_date")
        if not planned_for:
            continue
        planned_date = date.fromisoformat(planned_for[:10])
        if planned_date < today_date:
            continue
        day_label = "today" if planned_date == today_date else planned_date.strftime("%A, %B %-d")
        planned_time = standard.get("planned_time") or goal.get("planned_time")
        time_label = f" at {planned_time}" if planned_time else ""
        summaries.append(f"{goal.get('title', 'Planned standard')} is planned for {day_label}{time_label}.")
    return summaries


def _safe_calendar_events_for_date(date_obj) -> list[dict]:
    try:
        return get_calendar_events_for_date(date_obj)
    except Exception as exc:
        print(f"Daily debrief calendar events unavailable for {date_obj}: {exc}")
        return []


def _safe_calendar_summary_for_date(date_obj, label: str) -> str:
    try:
        return get_calendar_summary_for_date(date_obj, label)
    except Exception as exc:
        print(f"Daily debrief calendar summary unavailable for {date_obj}: {exc}")
        return f"Calendar sync unavailable for {label}."


def _today_workout_context(user_id: str, today_date) -> dict:
    scheduled_lift = get_scheduled_lift_for_date(today_date)
    workout_summary = get_todays_workout_summary(user_id, today_date)
    next_protocol = get_next_scheduled_lift_after(today_date)
    workout_logic = get_next_workout_logic(user_id)
    tomorrow_date = today_date + timedelta(days=1)
    tomorrow_lift = get_scheduled_lift_for_date(tomorrow_date)
    today_events = _safe_calendar_events_for_date(today_date)
    tomorrow_events = _safe_calendar_events_for_date(tomorrow_date)

    workout_completed = bool(workout_summary) or workout_logic.get("day_type") == "completed"
    lift_completed = None
    top_set = None
    sets_completed = 0
    logs = []
    if workout_summary:
        lift_completed = workout_summary.get("lift_label") or format_lift_name(workout_summary.get("lift") or "")
        top_set = workout_summary.get("top_set") or {}
        sets_completed = len(workout_summary.get("logs") or [])
        logs = workout_summary.get("logs") or []

    return {
        "today_day_type": workout_logic.get("day_type") or (scheduled_lift or "rest"),
        "scheduled_lift": scheduled_lift,
        "workout_completed": workout_completed,
        "lift_completed": lift_completed,
        "top_set": top_set,
        "sets_completed": sets_completed,
        "logs": logs,
        "workout_logic": workout_logic,
        "next_protocol": next_protocol,
        "tomorrow_day_type": tomorrow_lift or "rest",
        "tomorrow_scheduled_lift": tomorrow_lift,
        "today_calendar_events": today_events,
        "tomorrow_calendar_events": tomorrow_events,
        "today_calendar_summary": _safe_calendar_summary_for_date(today_date, "today"),
        "tomorrow_calendar_summary": _safe_calendar_summary_for_date(tomorrow_date, "tomorrow"),
    }


def _build_objectives(user_id: str, saved_objectives: list[dict] | None = None) -> list[dict]:
    derived = _goals_as_objectives(user_id)
    if not saved_objectives:
        return derived

    saved_by_title = {
        (objective.get("title") or "").lower(): objective
        for objective in saved_objectives
        if objective.get("title")
    }

    merged = []
    for objective in derived:
        saved = saved_by_title.get((objective.get("title") or "").lower())
        if saved:
            merged.append({
                **objective,
                "notes": saved.get("notes") or objective.get("notes"),
                "blocker": saved.get("blocker") if saved.get("blocker") is not None else objective.get("blocker"),
            })
        else:
            merged.append(objective)
    return merged


def _build_victory(saved_victory: dict | None, training: dict, objectives: list[dict]) -> dict:
    if saved_victory and saved_victory.get("win"):
        return saved_victory

    if training.get("workout_completed") and training.get("lift_completed"):
        return {
            "win": f"Finished {training['lift_completed']} and pushed the training chain forward.",
            "category": "Training",
        }

    featured_objective = next((objective for objective in objectives if "feature" in (objective.get("title") or "").lower()), None)
    if featured_objective:
        return {
            "win": featured_objective.get("notes") or f"Moved {featured_objective['title']} forward.",
            "category": "App Build",
        }

    return {
        "win": "Kept the system moving.",
        "category": "Personal",
    }


def _build_lessons(saved_lessons: dict | None, training: dict, daily_status: str, tomorrow_day_type: str) -> dict:
    if saved_lessons and any(saved_lessons.get(key) for key in ("worked", "did_not_work", "adjust_tomorrow")):
        return saved_lessons

    did_workout = bool(training.get("workout_completed"))
    if did_workout:
        worked = f"{training.get('lift_completed') or 'Training'} was logged and the session moved your goals forward."
        did_not_work = "Nothing significant blocked the session."
        adjust_tomorrow = f"Keep {_safe_day_label(tomorrow_day_type)} day simple and stay on plan."
    else:
        worked = "The schedule and goals were readable."
        did_not_work = "The workout log is missing for today."
        adjust_tomorrow = "Do the first important thing earlier and keep tomorrow simple."

    if daily_status == "OVER":
        adjust_tomorrow = "Tighten spending and stay inside the food budget."

    return {
        "worked": worked,
        "did_not_work": did_not_work,
        "adjust_tomorrow": adjust_tomorrow,
    }


def _build_tomorrow_prep(saved_tomorrow: dict | None, tomorrow_events: list[dict], next_protocol: dict | None, tomorrow_day_type: str) -> dict:
    calendar_items = [event.get("summary") for event in tomorrow_events if event.get("summary")]
    calendar_items = calendar_items[:3]

    if not calendar_items:
        if tomorrow_day_type == "rest":
            calendar_items = ["Recovery day", "Keep the calendar clear", "Protect energy"]
        else:
            calendar_items = ["Clear the morning", "Keep the calendar clean", "Protect the first hour"]

    priorities = []
    if next_protocol and next_protocol.get("lift"):
        priorities.append(f"Prepare for {_safe_lift_label(next_protocol.get('lift'))}")
    priorities.extend([
        item
        for item in (saved_tomorrow.get("top_priorities") if saved_tomorrow and saved_tomorrow.get("top_priorities") else [])
        if item
    ])
    if not priorities:
        priorities = ["Review tomorrow's first task", "Protect the schedule", "Stay on plan"]
    priorities = priorities[:3]

    workout = None
    if next_protocol and next_protocol.get("lift"):
        workout = {
            "lift": next_protocol.get("lift"),
            "label": _safe_lift_label(next_protocol.get("lift")),
            "weekday": next_protocol.get("weekday"),
        }
    elif tomorrow_day_type == "rest":
        workout = {
            "lift": "rest",
            "label": "Rest Day",
            "weekday": None,
        }

    return {
        "calendar": saved_tomorrow.get("calendar") if saved_tomorrow and saved_tomorrow.get("calendar") else calendar_items,
        "priorities": saved_tomorrow.get("priorities") if saved_tomorrow and saved_tomorrow.get("priorities") else priorities,
        "workout": saved_tomorrow.get("workout") if saved_tomorrow and saved_tomorrow.get("workout") else workout,
        "shopping_items": saved_tomorrow.get("shopping_items") if saved_tomorrow and saved_tomorrow.get("shopping_items") else [],
        "meal_prep": saved_tomorrow.get("meal_prep") if saved_tomorrow else None,
        "reminder": saved_tomorrow.get("reminder") if saved_tomorrow else None,
    }


def save_daily_debrief_entry(payload: dict) -> dict:
    entries = _debrief_entries()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["created_at"] = payload.get("created_at") or now
    payload["updated_at"] = now
    if payload.get("is_finalized") and not payload.get("completed_at"):
        payload["completed_at"] = now
    if payload.get("daily_score") is not None and payload.get("mission_score") is None:
        payload["mission_score"] = payload.get("daily_score")
    if payload.get("mission_score") is not None and payload.get("daily_score") is None:
        payload["daily_score"] = payload.get("mission_score")

    entries = [
        entry
        for entry in entries
        if not (entry.get("user_id") == payload.get("user_id") and entry.get("date") == payload.get("date"))
    ]
    entries.append(payload)
    _save_debrief_entries(entries)
    return payload


def list_daily_debrief_entries(user_id: str) -> list[dict]:
    return [
        entry
        for entry in _debrief_entries()
        if entry.get("user_id") == user_id
    ]


def build_daily_debrief_summary(user_id: str = "john") -> dict:
    now = datetime.now(LOCAL_TZ)
    today = now.date().isoformat()
    month = today[:7]
    saved = _lookup_latest_debrief(user_id, today) or {}
    budget = _current_month_budget(user_id, month)
    transactions = _food_transactions_for_date(user_id, today)
    meal_snapshot = _today_meal_snapshot(user_id, today)
    transaction_food_spend = round(sum(float(item.get("amount") or 0) for item in transactions), 2)
    food_spend_today = round(transaction_food_spend + meal_snapshot["estimated_food_spend"], 2)
    workout_context = _today_workout_context(user_id, now.date())
    scheduled_lift = workout_context["scheduled_lift"]
    next_protocol = workout_context["next_protocol"]
    tomorrow_day_type = workout_context["tomorrow_day_type"]
    workout_completed = workout_context["workout_completed"]
    shopping = _latest_unchecked_shopping_items(user_id)
    all_goals = list_goals(user_id, active_only=False)
    planned_standard_summaries = _planned_standard_summaries(all_goals, now.date())
    objectives = _daily_goal_impacts(user_id, today, workout_context)
    objectives_completed = sum(1 for objective in objectives if objective.get("completed"))
    objectives_total = len(objectives)
    daily_goal_impacts = [objective for objective in objectives if objective.get("goal_group") == "daily"]
    weekly_goal_impacts = [objective for objective in objectives if objective.get("goal_group") == "weekly"]
    daily_goals_completed = sum(1 for objective in daily_goal_impacts if objective.get("completed"))
    daily_goals_above = sum(1 for objective in daily_goal_impacts if objective.get("achievement_tier") == "above_and_beyond")
    weekly_goals_completed = sum(1 for objective in weekly_goal_impacts if objective.get("completed"))
    weekly_goals_above = sum(1 for objective in weekly_goal_impacts if objective.get("achievement_tier") == "above_and_beyond")
    daily_status = _food_budget_status(food_spend_today, budget, now)
    finance_summary = build_finance_ops_summary(user_id, month)
    mission_scores = build_mission_score_snapshot(
        user_id,
        now.date(),
        workout_context,
        shopping,
        {
            "today": {
                "status": "ok",
                "spoken_response": workout_context["today_calendar_summary"],
            },
            "tomorrow": {
                "status": "ok",
                "spoken_response": workout_context["tomorrow_calendar_summary"],
            },
        },
        finance_summary,
        goals=all_goals,
        debrief_entry=saved,
    )
    daily_score = mission_scores["daily"]["score"]
    weekly_score = mission_scores["weekly"]["score"]
    lifetime_score = mission_scores["lifetime"]["score"]
    lifetime_rank = mission_scores["lifetime"]["rank"]

    if not workout_context["today_day_type"] or workout_context["today_day_type"] == "rest":
        overall_status = "RECOVERY"
    elif not workout_completed:
        overall_status = "MISSED" if daily_status != "OVER" else "CHAOTIC"
    elif objectives_completed >= objectives_total and daily_status == "UNDER CONTROL":
        overall_status = "COMPLETE"
    elif daily_status == "OVER":
        overall_status = "CHAOTIC"
    else:
        overall_status = "PARTIAL"

    training_defaults = {
        "workout_completed": workout_completed,
        "scheduled_lift": scheduled_lift,
        "lift_completed": workout_context["lift_completed"] or (_safe_lift_label(scheduled_lift) if scheduled_lift else None),
        "workout_status": "Completed" if workout_completed and (workout_context["lift_completed"] or scheduled_lift) else ("Rest Day" if workout_context["today_day_type"] == "rest" else ("Scheduled" if scheduled_lift else "None")),
        "top_set_weight": workout_context["top_set"].get("weight") if workout_context["top_set"] else None,
        "top_set_reps": workout_context["top_set"].get("reps") if workout_context["top_set"] else None,
        "sets_completed": workout_context["sets_completed"],
        "goal_impact": None,
        "energy_level": saved.get("training", {}).get("energy_level"),
        "pain_notes": saved.get("training", {}).get("pain_notes"),
        "training_notes": saved.get("training", {}).get("training_notes"),
    }

    if workout_completed and scheduled_lift:
        lift_text = (scheduled_lift or "").replace("_", " ")
        matching_goal = next((objective for objective in objectives if lift_text and lift_text in (objective.get("title") or "").lower()), None)
        if matching_goal:
            training_defaults["goal_impact"] = f"{matching_goal['title']} moved today: {matching_goal.get('state')}."
        else:
            training_defaults["goal_impact"] = f"{_safe_lift_label(scheduled_lift)} pushed the strength plan closer to the next milestone."

    training = {
        **training_defaults,
        **(saved.get("training") or {}),
    }
    training["workout_completed"] = workout_completed
    training["scheduled_lift"] = scheduled_lift
    training["lift_completed"] = training_defaults["lift_completed"]
    training["workout_status"] = training_defaults["workout_status"]
    training["top_set_weight"] = training_defaults["top_set_weight"]
    training["top_set_reps"] = training_defaults["top_set_reps"]
    training["sets_completed"] = training_defaults["sets_completed"]
    training["goal_impact"] = training_defaults["goal_impact"]

    nutrition_defaults = {
        "meals_planned_today": meal_snapshot["meals_planned_today"],
        "meals_completed": meal_snapshot["meals_completed"],
        "ate_out_today": meal_snapshot["ate_out_today"] or any(
            row.get("category") == "Eating Out"
            or "eat out" in (row.get("notes") or "").lower()
            for row in transactions
        ),
        "estimated_food_spend": food_spend_today,
        "nutrition_totals": meal_snapshot["nutrition_totals"],
        "meals": meal_snapshot["meals"],
        "notes": saved.get("nutrition", {}).get("notes"),
    }
    nutrition = {
        **nutrition_defaults,
        **(saved.get("nutrition") or {}),
    }
    nutrition["meals_planned_today"] = nutrition_defaults["meals_planned_today"]
    nutrition["meals_completed"] = nutrition_defaults["meals_completed"]
    nutrition["estimated_food_spend"] = nutrition_defaults["estimated_food_spend"]
    nutrition["ate_out_today"] = nutrition_defaults["ate_out_today"]
    nutrition["nutrition_totals"] = nutrition_defaults["nutrition_totals"]
    nutrition["meals"] = nutrition_defaults["meals"]

    finance_defaults = {
        "money_spent_today": food_spend_today,
        "category": "Food" if food_spend_today else "None",
        "notes": saved.get("finance", {}).get("notes"),
        "unexpected_expense": saved.get("finance", {}).get("unexpected_expense", False),
        "spending_status": daily_status,
    }
    finance = {
        **finance_defaults,
        **(saved.get("finance") or {}),
    }
    finance["money_spent_today"] = finance_defaults["money_spent_today"]
    finance["spending_status"] = finance_defaults["spending_status"]

    victory = _build_victory(saved.get("victory"), training, objectives)
    lessons = _build_lessons(saved.get("lessons"), training, daily_status, tomorrow_day_type)
    tomorrow = _build_tomorrow_prep(saved.get("tomorrow"), workout_context["tomorrow_calendar_events"], next_protocol, tomorrow_day_type)

    if saved.get("victory", {}).get("win"):
        victory = saved["victory"]
    if saved.get("lessons"):
        lessons = {
            "worked": saved.get("lessons", {}).get("worked") or lessons.get("worked"),
            "did_not_work": saved.get("lessons", {}).get("did_not_work") or lessons.get("did_not_work"),
            "adjust_tomorrow": saved.get("lessons", {}).get("adjust_tomorrow") or lessons.get("adjust_tomorrow"),
        }
    if saved.get("tomorrow"):
        tomorrow = {
            "calendar": saved.get("tomorrow", {}).get("calendar") or tomorrow.get("calendar"),
            "priorities": saved.get("tomorrow", {}).get("priorities") or saved.get("tomorrow", {}).get("top_priorities") or tomorrow.get("priorities"),
            "workout": saved.get("tomorrow", {}).get("workout") or tomorrow.get("workout"),
            "shopping_items": saved.get("tomorrow", {}).get("shopping_items") or tomorrow.get("shopping_items"),
            "meal_prep": saved.get("tomorrow", {}).get("meal_prep") or tomorrow.get("meal_prep"),
            "reminder": saved.get("tomorrow", {}).get("reminder") or tomorrow.get("reminder"),
        }

    spoken_bits = [
        f"Evening debrief, John. Today was {overall_status.lower().replace('_', ' ')}.",
        f"Daily score {daily_score}. Weekly score {weekly_score}. Lifetime rank {lifetime_rank}.",
        f"{_safe_lift_label(scheduled_lift)} was scheduled today." if scheduled_lift else "Today was a recovery day.",
        f"You completed {objectives_completed} of {objectives_total} goal impacts today." if objectives_total else "No goal impacts were logged today.",
        f"Daily goals moved: {daily_goals_completed} completed{f', {daily_goals_above} above and beyond' if daily_goals_above else ''}." if daily_goal_impacts else None,
        f"Weekly goals moved: {weekly_goals_completed} completed{f', {weekly_goals_above} above and beyond' if weekly_goals_above else ''}." if weekly_goal_impacts else None,
        f"Workout logged: {training['lift_completed']}." if workout_completed and training.get("lift_completed") else "No workout log was found today.",
        f"That session moved {training['goal_impact']}" if training.get("goal_impact") else None,
        f"Stayed {daily_status.lower()} on spending." if daily_status else None,
        f"Planned standard: {planned_standard_summaries[0]}" if planned_standard_summaries else None,
        f"Next protocol is {_safe_lift_label(next_protocol['lift'])} on {next_protocol['weekday']}." if next_protocol else None,
        f"Tomorrow looks like a {_safe_day_label(tomorrow_day_type)} day." if tomorrow_day_type else None,
        f"Main lesson: {lessons.get('adjust_tomorrow') or lessons.get('worked') or 'keep tomorrow simple.'}",
        f"Top priority tomorrow is {tomorrow.get('priorities', ['keeping things simple'])[0]}." if tomorrow.get("priorities") else None,
    ]
    spoken_response = " ".join(bit for bit in spoken_bits if bit)

    return {
        "status": "ok",
        "user_id": user_id,
        "date": today,
        "mission_score": daily_score,
        "daily_score": daily_score,
        "weekly_score": weekly_score,
        "lifetime_score": lifetime_score,
        "lifetime_rank": lifetime_rank,
        "mission_scores": mission_scores,
        "overall_status": overall_status,
        "day_type": workout_context["today_day_type"],
        "scheduled_lift": scheduled_lift,
        "scheduled_lift_label": _safe_lift_label(scheduled_lift) if scheduled_lift else None,
        "next_protocol": next_protocol,
        "tomorrow_day_type": tomorrow_day_type,
        "tomorrow_scheduled_lift": workout_context["tomorrow_scheduled_lift"],
        "objectives_completed": objectives_completed,
        "objectives_total": objectives_total,
        "goal_summary": {
            "daily_completed": daily_goals_completed,
            "daily_above_and_beyond": daily_goals_above,
            "weekly_completed": weekly_goals_completed,
            "weekly_above_and_beyond": weekly_goals_above,
        },
        "workout_completed": workout_completed,
        "food_spend_today": food_spend_today,
        "daily_spending_status": daily_status,
        "victory": victory,
        "lessons": lessons,
        "tomorrow_priorities": tomorrow.get("priorities", []),
        "calendar": {
            "today": {
                "summary": workout_context["today_calendar_summary"],
                "events": workout_context["today_calendar_events"],
            },
            "tomorrow": {
                "summary": workout_context["tomorrow_calendar_summary"],
                "events": workout_context["tomorrow_calendar_events"],
            },
        },
        "saved_entry": saved,
        "objectives": objectives,
        "training": training,
        "nutrition": nutrition,
        "finance": finance,
        "tomorrow": {
            **tomorrow,
            "top_priorities": tomorrow.get("priorities", []),
        },
        "spoken_response": spoken_response,
    }


def save_monthly_budget(payload: dict) -> dict:
    budgets = _budget_entries()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["created_at"] = payload.get("created_at") or now
    payload["updated_at"] = now

    budgets = [
        budget
        for budget in budgets
        if not (budget.get("user_id") == payload.get("user_id") and budget.get("month") == payload.get("month"))
    ]
    budgets.append(payload)
    _save_budget_entries(budgets)
    return payload


def list_monthly_budgets(user_id: str) -> list[dict]:
    return [budget for budget in _budget_entries() if budget.get("user_id") == user_id]


def save_transaction(payload: dict) -> dict:
    transactions = _transactions()
    now = datetime.now(LOCAL_TZ).isoformat()
    payload = dict(payload)
    payload["id"] = payload.get("id") or f"txn_{len(transactions) + 1}"
    payload["created_at"] = payload.get("created_at") or now
    transactions.append(payload)
    _save_transactions(transactions)
    return payload


def list_transactions(user_id: str, month: str | None = None) -> list[dict]:
    rows = [transaction for transaction in _transactions() if transaction.get("user_id") == user_id]
    if month:
        rows = [row for row in rows if (row.get("date") or "").startswith(month)]
    return sorted(rows, key=lambda row: row.get("date") or "", reverse=True)


def build_finance_ops_summary(user_id: str = "john", month: str | None = None) -> dict:
    now = datetime.now(LOCAL_TZ)
    month_key = month or now.date().isoformat()[:7]
    budget = _current_month_budget(user_id, month_key)
    transactions = list_transactions(user_id, month_key)
    food_transactions = [row for row in transactions if row.get("category") in {"Groceries", "Eating Out"}]

    month_year = datetime.strptime(month_key + "-01", "%Y-%m-%d")
    days_in_month = monthrange(month_year.year, month_year.month)[1]
    weekly_divisor = 52 / 12

    monthly_groceries = float(budget.get("groceries_budget") or 0)
    monthly_eating_out = float(budget.get("eating_out_budget") or 0)
    weekly_grocery_target = round(monthly_groceries / weekly_divisor, 2)
    weekly_eating_out_target = round(monthly_eating_out / weekly_divisor, 2)
    weekly_total_target = round(weekly_grocery_target + weekly_eating_out_target, 2)

    week_start = now.date() - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=6)
    week_transactions = [
        row for row in transactions
        if week_start.isoformat() <= (row.get("date") or "") <= week_end.isoformat()
    ]
    actual_grocery_spend = round(sum(float(row.get("amount") or 0) for row in week_transactions if row.get("category") == "Groceries"), 2)
    actual_eating_out_spend = round(sum(float(row.get("amount") or 0) for row in week_transactions if row.get("category") == "Eating Out"), 2)
    total_actual_food_spend = round(actual_grocery_spend + actual_eating_out_spend, 2)
    over_under = round(weekly_total_target - total_actual_food_spend, 2)
    spending_status = "ON TRACK" if over_under >= 25 else "WATCH" if over_under >= 0 else "OVER"

    return {
        "status": "ok",
        "user_id": user_id,
        "month": month_key,
        "budget": budget,
        "transactions": transactions,
        "dashboard_cards": {
            "food_budget_remaining_week": round(weekly_total_target - total_actual_food_spend, 2),
            "eating_out_budget_remaining_week": round(weekly_eating_out_target - actual_eating_out_spend, 2),
            "total_food_over_under": over_under,
            "spending_status": spending_status,
        },
        "weekly_food_budget": {
            "monthly_grocery_budget": monthly_groceries,
            "monthly_eating_out_budget": monthly_eating_out,
            "weekly_grocery_target": weekly_grocery_target,
            "weekly_eating_out_target": weekly_eating_out_target,
            "weekly_total_food_target": weekly_total_target,
            "actual_grocery_spend_this_week": actual_grocery_spend,
            "actual_eating_out_spend_this_week": actual_eating_out_spend,
            "total_actual_food_spend_this_week": total_actual_food_spend,
            "over_under_amount": over_under,
        },
        "summary": {
            "month_income": float(budget.get("income") or 0),
            "fixed_bills": float(budget.get("fixed_bills") or 0),
            "variable_categories": budget.get("variable_categories") or {},
            "days_in_month": days_in_month,
            "food_transactions_count": len(food_transactions),
        },
    }
