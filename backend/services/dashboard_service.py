import re
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.services.calendar_service import get_birthday_note_for_date, get_calendar_summary_for_date
from backend.services.debrief_service import build_finance_ops_summary, build_mission_score_snapshot, get_previous_mission_score
from backend.services.goal_service import list_goals
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.services.workout_service import (
    estimate_one_rep_max,
    get_latest_top_set,
    get_next_workout_logic,
    get_todays_workout_summary,
    get_scheduled_lift_for_date,
    minimum_required_reps_for_week,
)
from backend.utils.formatters import format_lift_name


def _meal_name(entry: dict) -> str:
    recipe = entry.get("recipes") or {}
    return recipe.get("title") or entry.get("custom_meal_name") or "Unnamed meal"


def _meal_meta(entry: dict) -> dict:
    notes = entry.get("notes") or ""
    if not notes.startswith("JARVIS_META:"):
        return {}
    try:
        return json.loads(notes.replace("JARVIS_META:", "", 1))
    except json.JSONDecodeError:
        return {}


def _clean_meal_note(entry: dict) -> str | None:
    meta = _meal_meta(entry)
    if meta:
        return meta.get("note") or None

    notes = entry.get("notes")
    return None if notes and notes.startswith("JARVIS_META:") else notes


def _get_today_meals(user_id: str, today: str) -> list[dict]:
    entries = list_meal_plan_entries(user_id=user_id, start_date=today, end_date=today)
    return [
        {
            "id": entry.get("id"),
            "meal_date": entry.get("meal_date"),
            "meal_type": entry.get("meal_type"),
            "name": _meal_name(entry),
            "notes": _clean_meal_note(entry),
            "meta": _meal_meta(entry),
        }
        for entry in entries
    ]


def _get_latest_unchecked_shopping_items(user_id: str) -> dict:
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
            "list": None,
            "unchecked_count": 0,
            "unchecked_items": [],
        }

    shopping_list = lists_response.data[0]
    items_response = (
        supabase
        .table("shopping_list_items")
        .select("*")
        .eq("shopping_list_id", shopping_list["id"])
        .eq("is_checked", False)
        .order("created_at")
        .execute()
    )

    return {
        "list": {
            "id": shopping_list.get("id"),
            "title": shopping_list.get("title"),
            "week_start": shopping_list.get("week_start"),
        },
        "unchecked_count": len(items_response.data or []),
        "unchecked_items": items_response.data or [],
    }


def _get_calendar_summary_for_day(date_obj, label: str) -> dict:
    try:
        summary = get_calendar_summary_for_date(date_obj, label)
        if summary and "no events scheduled" not in summary.lower():
            return {
                "status": "ok",
                "spoken_response": summary,
            }
    except Exception as e:
        return {
            "status": "error",
            "spoken_response": f"You have no events scheduled for {label}.",
            "error": str(e),
        }

    return {
        "status": "ok",
        "spoken_response": f"You have no events scheduled for {label}.",
    }


def _get_calendar_summary(today_date) -> dict:
    tomorrow_date = today_date + timedelta(days=1)
    return {
        "today": _get_calendar_summary_for_day(today_date, "today"),
        "tomorrow": _get_calendar_summary_for_day(tomorrow_date, "tomorrow"),
    }


def _rotating_pick(options: list[str], today: str, salt: str = "") -> str:
    if not options:
        return ""
    try:
        day_number = datetime.fromisoformat(f"{today[:10]}T12:00:00").date().toordinal()
    except ValueError:
        day_number = datetime.now(LOCAL_TZ).date().toordinal()
    salt_value = sum(ord(char) for char in salt)
    return options[(day_number + salt_value) % len(options)]


def _get_journal_snapshot(user_id: str, today: str) -> dict:
    snapshot = {
        "available": False,
        "documented_days": 0,
        "current_streak": 0,
        "journaled_today": False,
        "today_status": "missing",
        "latest_title": None,
        "latest_date": None,
    }
    try:
        response = (
            supabase
            .table("archive_chronicles")
            .select("entry_date,title,status,story_text,future_me_message,notes")
            .eq("user_id", user_id)
            .order("entry_date", desc=True)
            .limit(120)
            .execute()
        )
    except Exception:
        return snapshot

    rows = response.data or []
    documented_dates: set[str] = set()
    today_entry = None
    latest_documented = None
    for row in rows:
        entry_date = str(row.get("entry_date") or "")[:10]
        if not entry_date:
            continue
        is_documented = bool(
            row.get("story_text")
            or row.get("future_me_message")
            or row.get("notes")
            or row.get("status") in {"in_progress", "filed"}
        )
        if entry_date == today:
            today_entry = row
        if is_documented:
            documented_dates.add(entry_date)
            if latest_documented is None:
                latest_documented = row

    cursor = datetime.fromisoformat(f"{today}T12:00:00").date()
    if today not in documented_dates:
        cursor = cursor - timedelta(days=1)
    current_streak = 0
    while cursor.isoformat() in documented_dates:
        current_streak += 1
        cursor = cursor - timedelta(days=1)

    latest_date = str(latest_documented.get("entry_date"))[:10] if latest_documented else None
    today_status = today_entry.get("status") if today_entry else "missing"
    snapshot.update({
        "available": True,
        "documented_days": len(documented_dates),
        "current_streak": current_streak,
        "journaled_today": today in documented_dates,
        "today_status": today_status or "missing",
        "latest_title": latest_documented.get("title") if latest_documented else None,
        "latest_date": latest_date,
    })
    return snapshot


def _get_mission_phase(now: datetime) -> dict:
    hour = now.hour
    if 5 <= hour < 12:
        return {
            "key": "briefing",
            "label": "BRIEFING",
            "window": "05:00 - 11:59",
        }
    if 12 <= hour < 18:
        return {
            "key": "execution",
            "label": "EXECUTION",
            "window": "12:00 - 17:59",
        }
    if 18 <= hour < 22:
        return {
            "key": "debrief",
            "label": "DEBRIEF",
            "window": "18:00 - 21:59",
        }
    return {
        "key": "recovery",
        "label": "RECOVERY",
        "window": "22:00 - 04:59",
    }


def _get_birthday_note(today_date) -> str | None:
    try:
        return get_birthday_note_for_date(today_date)
    except Exception:
        return None


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


def _shopping_score(shopping: dict) -> float:
    unchecked = int(shopping.get("unchecked_count") or 0)
    if unchecked == 0:
        return 1.0
    if unchecked <= 3:
        return 0.8
    if unchecked <= 6:
        return 0.55
    return 0.3


def _calendar_score(calendar: dict) -> float:
    today_status = calendar.get("today", {}).get("status")
    tomorrow_status = calendar.get("tomorrow", {}).get("status")
    today_score = 1.0 if today_status == "ok" else 0.65
    tomorrow_score = 1.0 if tomorrow_status == "ok" else 0.65
    return round((today_score + tomorrow_score) / 2, 2)


def _workout_score(workout_logic: dict) -> float:
    if workout_logic.get("day_type") == "rest":
        return 1.0
    if workout_logic.get("day_type") == "completed":
        return 1.0
    if workout_logic.get("actual_next"):
        return 0.15
    return 0.6


def _mission_score(user_id: str, workout_logic: dict, shopping: dict, calendar: dict, finance_summary: dict) -> dict:
    goals = get_goal_overview(user_id)
    objectives_completed = sum(1 for goal in goals if goal.get("progress", {}).get("is_complete"))
    objectives_total = len(goals)
    workout_score = _workout_score(workout_logic)
    goal_score = _objective_completion_ratio(goals)
    shopping_score = _shopping_score(shopping)
    budget_score = _budget_score(finance_summary)
    calendar_score = _calendar_score(calendar)

    score = round(
        100
        * (
            workout_score * 0.3
            + goal_score * 0.25
            + shopping_score * 0.15
            + budget_score * 0.15
            + calendar_score * 0.15
        )
    )
    label = _mission_status_label(score)

    return {
        "score": score,
        "label": label,
        "class": _mission_status_class(label),
        "workout_score": workout_score,
        "goal_score": goal_score,
        "shopping_score": shopping_score,
        "budget_score": budget_score,
        "calendar_score": calendar_score,
        "goals": goals,
        "objectives_completed": objectives_completed,
        "objectives_total": objectives_total,
    }


def get_goal_overview(user_id: str) -> list[dict]:
    return list_goals(user_id, active_only=True)


def _get_lift_profile(user_id: str, lift: str | None) -> dict | None:
    if not lift:
        return None

    response = (
        supabase
        .table("lift_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def _planned_standard_for_date(goals: list[dict], date_str: str) -> dict | None:
    for goal in goals:
        if (goal.get("mission_type") or "").lower() != "standard":
            continue
        standard = goal.get("standard") or {}
        planned_for = standard.get("planned_for") or goal.get("planned_date")
        if planned_for and planned_for[:10] == date_str:
            return goal
    return None


def _format_planned_standard(goal: dict) -> str:
    standard = goal.get("standard") or {}
    planned_for = standard.get("planned_for") or goal.get("planned_date")
    planned_time = standard.get("planned_time") or goal.get("planned_time")
    if not planned_for:
        return goal.get("title", "planned standard")
    planned_date = datetime.fromisoformat(f"{planned_for[:10]}T12:00:00")
    date_label = f"{planned_date.strftime('%A, %B')} {planned_date.day}"
    time_label = f" at {planned_time}" if planned_time else ""
    return f"{goal.get('title', 'Planned standard')} on {date_label}{time_label}"


def _highest_priority_remaining_task(
    user_id: str,
    workout_logic: dict,
    shopping: dict,
    mission: dict,
    today: str | None = None,
    journal: dict | None = None,
) -> str:
    goals = mission.get("goals") or []
    if today:
        planned_standard = _planned_standard_for_date(goals, today)
        if planned_standard:
            return f"Planned today: {_format_planned_standard(planned_standard)}."

    incomplete_goal = next(
        (
            goal
            for goal in goals
            if not goal.get("progress", {}).get("is_complete")
        ),
        None,
    )

    if workout_logic.get("day_type") == "rest":
        if workout_logic.get("next_scheduled"):
            return f"Prepare for {format_lift_name(workout_logic['next_scheduled']['lift'])} on {workout_logic['next_scheduled']['weekday']}."
        return "Protect recovery and keep tomorrow clean."

    if workout_logic.get("day_type") != "completed" and workout_logic.get("scheduled_today"):
        return f"Complete {format_lift_name(workout_logic['scheduled_today'])}."

    if journal and journal.get("available") and not journal.get("journaled_today"):
        return "Write today's Chronicle before the day gets away."

    if shopping.get("unchecked_count", 0) > 0:
        item = shopping.get("unchecked_items", [])[0]
        return f"Clear {item.get('item_name', 'the top shopping item')}."

    if incomplete_goal:
        return f"Move {incomplete_goal.get('title', 'the next goal')} forward."

    return "Hold the line and keep the system clean."


def _mission_phase_content(phase: dict, dashboard: dict, mission: dict) -> dict:
    today = dashboard.get("today", {})
    next_workout = dashboard.get("next_workout", {})
    shopping = dashboard.get("shopping", {})
    calendar = dashboard.get("calendar", {})
    meals = dashboard.get("meals", [])
    finance_summary = dashboard.get("finance_summary", {})
    journal = dashboard.get("journal") or {}
    goals = mission.get("goals") or []
    incomplete_goal = next((goal for goal in goals if not goal.get("progress", {}).get("is_complete")), None)
    priority = dashboard.get("highest_priority_remaining_task") or "Hold the line."

    if phase["key"] == "briefing":
        planned_today = _planned_standard_for_date(goals, dashboard.get("date", ""))
        items = [
            f"Priority: {today.get('scheduled_lift_label') or 'Recovery'}",
            f"Workout: {today.get('spoken_response') or 'No workout data'}",
            f"Schedule: {calendar.get('today', {}).get('spoken_response') or 'No schedule data'}",
            f"Nutrition: {len(meals)} meal{'' if len(meals) == 1 else 's'} planned",
        ]
        if planned_today:
            items.insert(1, f"Planned: {_format_planned_standard(planned_today)}")
        if journal.get("available"):
            items.append(
                "Chronicle: logged today"
                if journal.get("journaled_today")
                else "Chronicle: not logged yet"
            )
        recommendation = dashboard.get("coaching_note") or "Keep the day simple and execute the plan."
        return {
            "title": "Today's Priorities",
            "items": items,
            "recommendation": recommendation,
            "primary_label": "Daily recommendation",
            "primary_value": recommendation,
            "secondary_label": "Highest priority remaining task",
            "secondary_value": priority,
        }

    if phase["key"] == "execution":
        objectives_completed = mission.get("objectives_completed", 0)
        objectives_total = mission.get("objectives_total", 0)
        return {
            "title": "Mission Control",
            "items": [
                f"Objectives: {objectives_completed}/{objectives_total} complete",
                f"Workout: {today.get('day_type', 'rest').replace('_', ' ').title()}",
                f"Shopping: {shopping.get('unchecked_count', 0)} items open",
                f"Budget: {finance_summary.get('dashboard_cards', {}).get('spending_status', 'WATCH')}",
            ],
            "recommendation": priority,
            "primary_label": "Highest priority remaining task",
            "primary_value": priority,
            "secondary_label": "Progress note",
            "secondary_value": (
                incomplete_goal.get("title")
                if incomplete_goal
                else "All active goals are moving."
            ),
        }

    if phase["key"] == "debrief":
        objectives_completed = mission.get("objectives_completed", 0)
        objectives_total = mission.get("objectives_total", 0)
        return {
            "title": "End-of-Day Wrap",
            "items": [
                f"Objectives: {objectives_completed}/{objectives_total} complete",
                f"Workout: {today.get('day_type', 'rest').replace('_', ' ').title()}",
                f"Food spend: ${finance_summary.get('weekly_food_budget', {}).get('total_actual_food_spend_this_week', 0):.2f} this week",
                (
                    f"Chronicles: {journal.get('documented_days', 0)} documented day"
                    f"{'' if journal.get('documented_days', 0) == 1 else 's'}"
                ) if journal.get("available") else "Chronicles: unavailable",
                f"Tomorrow focus: {calendar.get('tomorrow', {}).get('spoken_response') or 'No calendar data'}",
            ],
            "recommendation": dashboard.get("debrief_recommendation") or dashboard.get("coaching_note") or "Close the day, log the win, and keep tomorrow simple.",
            "primary_label": "Debrief recommendation",
            "primary_value": dashboard.get("debrief_recommendation") or dashboard.get("coaching_note") or "Close the day cleanly.",
            "secondary_label": "Tomorrow's focus",
            "secondary_value": dashboard.get("tomorrow_focus") or priority,
        }

    return {
        "title": "Recovery Mode",
        "items": [
            f"Tomorrow workout: {next_workout.get('lift_label') or 'Rest'}",
            f"Tomorrow calendar: {calendar.get('tomorrow', {}).get('spoken_response') or 'No calendar data'}",
            f"Meal prep: {len(meals)} meal{'' if len(meals) == 1 else 's'} planned",
        ],
        "recommendation": dashboard.get("recovery_recommendation") or "Protect sleep, hydrate, and clear tomorrow's first task.",
        "primary_label": "Recovery recommendation",
        "primary_value": dashboard.get("recovery_recommendation") or "Protect sleep, hydrate, and clear tomorrow's first task.",
        "secondary_label": "Tomorrow's workout",
        "secondary_value": next_workout.get("lift_label") or "Rest day",
    }


def _parse_week_from_notes(notes: str) -> int:
    match = re.search(r"week\s+(\d+)", notes.lower())
    if not match:
        return 1
    return int(match.group(1))


def _get_best_prior_lift_results(user_id: str, lift: str, before_created_at: str | None) -> dict:
    query = (
        supabase
        .table("workouts")
        .select("weight,reps,notes,created_at")
        .eq("user_id", user_id)
        .eq("lift", lift)
    )

    if before_created_at:
        query = query.lt("created_at", before_created_at)

    response = query.execute()

    best_weight = 0
    best_estimated_1rm = 0
    for row in response.data or []:
        notes = (row.get("notes") or "").lower()
        is_top_set = "set 3" in notes or "top set" in notes or "pr" in notes or "voice log" in notes
        is_deload = "week 4" in notes

        if not is_top_set or is_deload:
            continue

        weight = float(row.get("weight", 0))
        reps = int(row.get("reps", 0))
        best_weight = max(best_weight, weight)
        best_estimated_1rm = max(best_estimated_1rm, estimate_one_rep_max(weight, reps))

    return {
        "best_weight": best_weight,
        "best_estimated_1rm": best_estimated_1rm,
    }


def _get_completed_workout_note(user_id: str, today: str) -> str | None:
    response = (
        supabase
        .table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .gte("created_at", today)
        .order("created_at", desc=True)
        .execute()
    )

    top_set = None
    for row in response.data or []:
        notes = (row.get("notes") or "").lower()
        if "set 3" in notes or "top set" in notes or "voice log" in notes:
            top_set = row
            break

    if not top_set:
        return None

    lift = top_set.get("lift")
    lift_label = format_lift_name(lift)
    weight = float(top_set.get("weight", 0))
    reps = int(top_set.get("reps", 0))
    week = _parse_week_from_notes(top_set.get("notes") or "")
    required_reps = minimum_required_reps_for_week(week)
    current_estimated_1rm = estimate_one_rep_max(weight, reps)
    prior = _get_best_prior_lift_results(user_id, lift, top_set.get("created_at"))
    previous_estimated_1rm = round(prior["best_estimated_1rm"])
    new_estimated_1rm = round(current_estimated_1rm)

    if weight > prior["best_weight"] and current_estimated_1rm > prior["best_estimated_1rm"]:
        return (
            f"Good job on {lift_label}. New weight PR and estimated 1RM PR: "
            f"{previous_estimated_1rm} lbs to {new_estimated_1rm} lbs. "
            f"That one actually earned the victory lap."
        )

    if current_estimated_1rm > prior["best_estimated_1rm"]:
        return (
            f"Good job on {lift_label}. New estimated 1RM PR: "
            f"{previous_estimated_1rm} lbs to {new_estimated_1rm} lbs. "
            f"Take the win and recover."
        )

    if reps < required_reps:
        return f"{lift_label.capitalize()} is done, but you missed the {required_reps}-rep minimum. Eat, sleep, and come back less dramatic next time."

    if reps == required_reps:
        return f"{lift_label.capitalize()} is done. You hit the minimum, which counts, but let's not confuse survival with domination."

    return f"Good work on {lift_label}. No PR today, but you beat the minimum and kept the chain moving."


def _build_coaching_note(
    user_id: str,
    workout_logic: dict,
    meals: list[dict],
    shopping: dict,
    today: str,
    journal: dict | None = None,
) -> str:
    completed_note = _get_completed_workout_note(user_id, today) if workout_logic.get("day_type") == "completed" else None
    if completed_note:
        return completed_note

    actual_next = workout_logic.get("actual_next")
    day_type = workout_logic.get("day_type")

    if journal and journal.get("available") and not journal.get("journaled_today"):
        return _rotating_pick(
            [
                "Chronicle has not been logged yet. Capture the day while the details are still warm.",
                "Put one honest paragraph into Chronicles today. Small record, permanent memory.",
                "Before the day gets noisy, file a quick Chronicle entry so the Archive does not miss this one.",
                "Make journaling the anchor today: write what happened, what mattered, and what needs to carry forward.",
            ],
            today,
            "journal",
        )

    if day_type == "rest":
        return _rotating_pick(
            [
                "Rest day. Recover like it is part of the program: walk, stretch, eat protein, and do not invent chaos.",
                "Recovery is the assignment today. Keep movement light, hit protein, and protect sleep.",
                "No hero lift today. Win by leaving tomorrow easier than you found it.",
                "Use the lighter day to tighten the system: hydrate, prep one thing, and close the loop early.",
            ],
            today,
            "rest",
        )

    if actual_next:
        lift = format_lift_name(actual_next)
        return _rotating_pick(
            [
                f"Primary build today: {lift}. Get the work done, eat the planned food, and keep the rest controlled.",
                f"{lift.capitalize()} is the anchor. Handle the top set first, then clear one operational loose end.",
                f"Treat {lift} like the main mission. Nutrition and shopping support it; they do not replace it.",
                f"Win the day through sequence: {lift}, protein, then the highest-priority admin task.",
            ],
            today,
            f"lift-{actual_next}",
        )

    if not meals:
        return _rotating_pick(
            [
                "No meals are planned for today. Add one easy anchor meal before the day gets away from you.",
                "Food plan is thin. Lock in one reliable protein meal so the rest of the day has guardrails.",
                "Before momentum drops, put a simple meal into Food Ops and mark it eaten when it happens.",
                "Nutrition needs a first move. Add the easiest repeat meal and let the system track the rest.",
            ],
            today,
            "meals",
        )

    if shopping.get("unchecked_count", 0) > 0:
        return _rotating_pick(
            [
                "Your shopping list still has open items. Knock out the essentials before they block tomorrow.",
                "Clear the highest-impact shopping item today so Food Ops does not become tomorrow's friction.",
                "Restock before it becomes a problem. One clean shopping pass protects the week.",
                "The shopping queue is open. Remove the item most likely to disrupt meals or training.",
            ],
            today,
            "shopping",
        )

    return _rotating_pick(
        [
            "Systems are clear. Protect the routine and avoid adding noise.",
            "Nothing is screaming. Use that advantage to move one goal forward deliberately.",
            "Quiet dashboard today. Pick the cleanest next action and make it visible in the logs.",
            "The system is stable. Spend the extra bandwidth on one feature, one task, or one record worth keeping.",
        ],
        today,
        "clear",
    )


def build_daily_dashboard(user_id: str = "john") -> dict:
    now = datetime.now(LOCAL_TZ)
    today = now.date().isoformat()
    scheduled_today = get_scheduled_lift_for_date(now.date())
    mission_phase = _get_mission_phase(now)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            "workout_logic": executor.submit(get_next_workout_logic, user_id),
            "meals": executor.submit(_get_today_meals, user_id, today),
            "shopping": executor.submit(_get_latest_unchecked_shopping_items, user_id),
            "calendar": executor.submit(_get_calendar_summary, now.date()),
            "finance_summary": executor.submit(build_finance_ops_summary, user_id, today[:7]),
            "goals": executor.submit(list_goals, user_id, active_only=False),
            "journal_snapshot": executor.submit(_get_journal_snapshot, user_id, today),
            "today_workout": executor.submit(get_todays_workout_summary, user_id, now.date()),
            "workout_profile": executor.submit(_get_lift_profile, user_id, scheduled_today),
            "birthday_note": executor.submit(_get_birthday_note, now.date()),
            "previous_mission_score": executor.submit(get_previous_mission_score, user_id),
        }
        if scheduled_today:
            futures["latest_top_set"] = executor.submit(get_latest_top_set, user_id, scheduled_today)

        workout_logic = futures["workout_logic"].result()
        meals = futures["meals"].result()
        shopping = futures["shopping"].result()
        calendar = futures["calendar"].result()
        finance_summary = futures["finance_summary"].result()
        goals = futures["goals"].result()
        journal_snapshot = futures["journal_snapshot"].result()
        today_workout = futures["today_workout"].result()
        workout_profile = futures["workout_profile"].result()
        birthday_note = futures["birthday_note"].result()
        previous_mission_score = futures["previous_mission_score"].result()
        latest_top_set = futures["latest_top_set"].result() if "latest_top_set" in futures else None

    workout_context = {
        "today_day_type": workout_logic.get("day_type") or ("rest" if not scheduled_today else scheduled_today),
        "workout_completed": bool(today_workout) or workout_logic.get("day_type") == "completed",
        "next_protocol": workout_logic.get("next_scheduled"),
    }
    mission_scores = build_mission_score_snapshot(
        user_id,
        now.date(),
        workout_context,
        shopping,
        calendar,
        finance_summary,
        goals=goals,
    )
    mission = mission_scores["daily"]
    highest_priority_remaining_task = _highest_priority_remaining_task(
        user_id,
        workout_logic,
        shopping,
        {"goals": goals},
        today,
        journal_snapshot,
    )
    mission_delta = mission["score"] - previous_mission_score if previous_mission_score is not None else None

    dashboard_base = {
        "status": "ok",
        "user_id": user_id,
        "date": today,
        "birthday_note": birthday_note,
        "today": {
            "day_type": workout_logic.get("day_type"),
            "scheduled_lift": scheduled_today,
            "scheduled_lift_label": format_lift_name(scheduled_today) if scheduled_today else None,
            "spoken_response": workout_logic.get("spoken_response"),
        },
        "next_workout": {
            "lift": workout_logic.get("actual_next"),
            "lift_label": format_lift_name(workout_logic["actual_next"]) if workout_logic.get("actual_next") else None,
            "next_scheduled": workout_logic.get("next_scheduled"),
            "spoken_response": workout_logic.get("spoken_response"),
        },
        "meals": meals,
        "shopping": shopping,
        "calendar": calendar,
        "finance_summary": finance_summary,
        "journal": journal_snapshot,
        "goals": goals,
        "today_workout": today_workout,
        "workout_metadata": {
            "lift": scheduled_today,
            "lift_label": format_lift_name(scheduled_today) if scheduled_today else None,
            "training_max": round(float(workout_profile.get("training_max", 0))) if workout_profile and workout_profile.get("training_max") else None,
            "cycle": int(workout_profile.get("cycle", 1)) if workout_profile and workout_profile.get("cycle") else None,
            "week": int(workout_profile.get("week", 1)) if workout_profile and workout_profile.get("week") else None,
            "latest_top_set": latest_top_set,
        },
        "mission_phase": mission_phase,
        "mission_scores": mission_scores,
        "mission_status": {
            "score": mission["score"],
            "label": mission["label"],
            "class": mission["class"],
            "delta": mission_delta,
        },
        "highest_priority_remaining_task": highest_priority_remaining_task,
        "coaching_note": _build_coaching_note(user_id, workout_logic, meals, shopping, today, journal_snapshot),
    }

    phase_content = _mission_phase_content(mission_phase, dashboard_base, mission)

    return {
        **dashboard_base,
        "mission": {
            "phase": mission_phase["label"],
            "phase_key": mission_phase["key"],
            "phase_window": mission_phase["window"],
            "status": mission["label"],
            "score": mission["score"],
            "class": mission["class"],
            "daily_score": mission_scores["daily"]["score"],
            "weekly_score": mission_scores["weekly"]["score"],
            "lifetime_score": mission_scores["lifetime"]["score"],
            "lifetime_rank": mission_scores["lifetime"]["rank"],
            "objectives_completed": mission["goals_completed_today"],
            "objectives_total": mission["goals_impacted_today"],
            "workout_completed": mission["workout_score"] >= 1.0,
            "shopping_open": int(shopping.get("unchecked_count") or 0),
            "budget_status": finance_summary.get("dashboard_cards", {}).get("spending_status", "WATCH"),
            "calendar_today_status": calendar.get("today", {}).get("status"),
            "calendar_tomorrow_status": calendar.get("tomorrow", {}).get("status"),
            "title": phase_content["title"],
            "items": phase_content["items"],
            "recommendation": phase_content["recommendation"],
            "primary_label": phase_content["primary_label"],
            "primary_value": phase_content["primary_value"],
            "secondary_label": phase_content["secondary_label"],
            "secondary_value": phase_content["secondary_value"],
        },
        "coaching_note": phase_content["recommendation"] or dashboard_base["coaching_note"],
    }
