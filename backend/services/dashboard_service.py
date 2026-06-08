import re
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


def _get_today_meals(user_id: str, today: str) -> list[dict]:
    entries = list_meal_plan_entries(user_id=user_id, start_date=today, end_date=today)
    return [
        {
            "id": entry.get("id"),
            "meal_date": entry.get("meal_date"),
            "meal_type": entry.get("meal_type"),
            "name": _meal_name(entry),
            "notes": entry.get("notes"),
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


def _highest_priority_remaining_task(user_id: str, workout_logic: dict, shopping: dict, mission: dict) -> str:
    goals = mission.get("goals") or []
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
    goals = mission.get("goals") or []
    incomplete_goal = next((goal for goal in goals if not goal.get("progress", {}).get("is_complete")), None)
    priority = dashboard.get("highest_priority_remaining_task") or "Hold the line."

    if phase["key"] == "briefing":
        items = [
            f"Priority: {today.get('scheduled_lift_label') or 'Recovery'}",
            f"Workout: {today.get('spoken_response') or 'No workout data'}",
            f"Schedule: {calendar.get('today', {}).get('spoken_response') or 'No schedule data'}",
            f"Nutrition: {len(meals)} meal{'' if len(meals) == 1 else 's'} planned",
        ]
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


def _build_coaching_note(user_id: str, workout_logic: dict, meals: list[dict], shopping: dict, today: str) -> str:
    completed_note = _get_completed_workout_note(user_id, today)
    if completed_note:
        return completed_note

    actual_next = workout_logic.get("actual_next")
    day_type = workout_logic.get("day_type")

    if day_type == "rest":
        return "Rest day. Recover like it is part of the program: walk, stretch, eat protein, and do not invent chaos."

    if actual_next:
        lift = format_lift_name(actual_next)
        return f"Keep today simple: handle {lift}, eat what is planned, and clear the highest-priority shopping item."

    if not meals:
        return "No meals are planned for today. Add one easy anchor meal before the day gets away from you."

    if shopping.get("unchecked_count", 0) > 0:
        return "Your shopping list still has open items. Knock out the essentials before they block tomorrow."

    return "Systems are clear. Protect the routine and avoid adding noise."


def build_daily_dashboard(user_id: str = "john") -> dict:
    now = datetime.now(LOCAL_TZ)
    today = now.date().isoformat()
    scheduled_today = get_scheduled_lift_for_date(now.date())
    workout_logic = get_next_workout_logic(user_id)
    meals = _get_today_meals(user_id, today)
    shopping = _get_latest_unchecked_shopping_items(user_id)
    calendar = _get_calendar_summary(now.date())
    finance_summary = build_finance_ops_summary(user_id, today[:7])
    goals = list_goals(user_id, active_only=False)
    mission_phase = _get_mission_phase(now)
    today_workout = get_todays_workout_summary(user_id, now.date())
    workout_profile = _get_lift_profile(user_id, scheduled_today)
    latest_top_set = get_latest_top_set(user_id, scheduled_today) if scheduled_today else None
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
    highest_priority_remaining_task = _highest_priority_remaining_task(user_id, workout_logic, shopping, {"goals": goals})
    previous_mission_score = get_previous_mission_score(user_id)
    mission_delta = mission["score"] - previous_mission_score if previous_mission_score is not None else None

    dashboard_base = {
        "status": "ok",
        "user_id": user_id,
        "date": today,
        "birthday_note": _get_birthday_note(now.date()),
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
        "coaching_note": _build_coaching_note(user_id, workout_logic, meals, shopping, today),
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
