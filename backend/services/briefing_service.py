from datetime import datetime

from backend.services.workout_service import get_next_workout_logic, get_latest_top_set
from backend.utils.formatters import format_lift_name, round_to_nearest_5
from backend.db.supabase_client import supabase


def build_business_status() -> str:
    return "No active Aegis Intake Systems alerts. No Fiverr spike alerts yet."


def get_shift_brief() -> str:
    now = datetime.now()
    weekday = now.weekday()

    if weekday in [0, 1]:
        return "You have a 12 hour night shift starting at 6 PM."
    if weekday in [5, 6]:
        return "You have a 12 hour day shift starting at 6 AM."
    return "You have no shifts scheduled for today."


def get_lift_profile(user_id: str, lift: str) -> dict | None:
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


def build_morning_brief(user_id: str = "john") -> dict:
    workout_logic = get_next_workout_logic(user_id)
    lift = workout_logic.get("actual_next")

    if not lift:
        return {
            "status": "ok",
            "user_id": user_id,
            "next_lift": None,
            "cycle": None,
            "week": None,
            "training_max": None,
            "latest_top_set": None,
            "business_status": build_business_status(),
            "spoken_response": (
                f"Good morning, Daddy. "
                f"{get_shift_brief()} "
                f"{workout_logic.get('spoken_response', 'No workout scheduled.')} "
                f"{build_business_status()}"
            )
        }

    profile = get_lift_profile(user_id, lift)

    cycle = int(profile.get("cycle", 1)) if profile else None
    week = int(profile.get("week", 1)) if profile and profile.get("week") else None
    training_max = round_to_nearest_5(float(profile.get("training_max", 0))) if profile else None

    latest_top_set = get_latest_top_set(user_id, lift)

    if latest_top_set:
        latest_weight = latest_top_set.get("weight")
        latest_reps = latest_top_set.get("reps")
        latest_line = f"Latest top {format_lift_name(lift)} set was {latest_weight} for {latest_reps}."
    else:
        latest_line = f"No recent {format_lift_name(lift)} history found."

    shift_line = get_shift_brief()
    business_line = build_business_status()

    now = datetime.now().hour
    if now < 12:
        greeting = "Good morning"
    elif now < 18:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"

    workout_line = workout_logic.get("spoken_response", f"Your next workout is {format_lift_name(lift)}.")

    if cycle is not None and week is not None and training_max is not None:
        workout_details = (
            f"{format_lift_name(lift).capitalize()} is cycle {cycle} week {week}. "
            f"Training max {training_max} pounds."
        )
    else:
        workout_details = f"Your next lift is {format_lift_name(lift)}."

    spoken_response = (
        f"{greeting}, Sexy Daddy. All systems operational. "
        f"{shift_line} "
        f"{workout_line} "
        f"{workout_details} "
        f"{latest_line} "
        f"{business_line}"
    )

    return {
        "status": "ok",
        "user_id": user_id,
        "next_lift": lift,
        "cycle": cycle,
        "week": week,
        "training_max": training_max,
        "latest_top_set": latest_top_set,
        "business_status": business_line,
        "workout_logic": workout_logic,
        "spoken_response": spoken_response
    }