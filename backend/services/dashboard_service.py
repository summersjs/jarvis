import re
from datetime import datetime, timedelta

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.services.briefing_service import get_shift_brief
from backend.services.calendar_service import get_calendar_summary_for_date
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.services.workout_service import (
    estimate_one_rep_max,
    get_next_workout_logic,
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


def _get_shift_brief_for_date(date_obj) -> str:
    weekday = date_obj.weekday()

    if weekday in [0, 1]:
        return "You have a 12 hour night shift starting at 6 PM."
    if weekday in [5, 6]:
        return "You have a 12 hour day shift starting at 6 AM."
    return "You have no shifts scheduled."


def _get_calendar_summary_for_day(date_obj, label: str) -> dict:
    fallback = get_shift_brief()
    if label != "today":
        fallback = _get_shift_brief_for_date(date_obj)

    try:
        summary = get_calendar_summary_for_date(date_obj, label)
        if summary and "no events scheduled" not in summary.lower():
            return {
                "status": "ok",
                "spoken_response": summary,
                "fallback_shift": fallback,
            }
    except Exception as e:
        return {
            "status": "fallback",
            "spoken_response": fallback,
            "fallback_shift": fallback,
            "error": str(e),
        }

    return {
        "status": "fallback",
        "spoken_response": fallback,
        "fallback_shift": fallback,
    }


def _get_calendar_summary(today_date) -> dict:
    tomorrow_date = today_date + timedelta(days=1)
    return {
        "today": _get_calendar_summary_for_day(today_date, "today"),
        "tomorrow": _get_calendar_summary_for_day(tomorrow_date, "tomorrow"),
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

    return {
        "status": "ok",
        "user_id": user_id,
        "date": today,
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
        "coaching_note": _build_coaching_note(user_id, workout_logic, meals, shopping, today),
    }
