from datetime import datetime

from backend.services.workout_service import get_next_lift_profile, get_latest_top_set
from backend.utils.formatters import format_lift_name, round_to_nearest_5


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


def build_morning_brief(user_id: str = "john") -> dict:
    next_lift = get_next_lift_profile(user_id)

    if not next_lift:
        return {
            "status": "error",
            "spoken_response": "Good morning, Daddy. I could not find your workout data."
        }

    lift = next_lift["lift"]
    cycle = int(next_lift.get("cycle", 1))
    week = int(next_lift.get("week", 1))
    training_max = round_to_nearest_5(float(next_lift.get("training_max", 0)))

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

    spoken_response = (
        f"{greeting}, Sexy Daddy. All systems operational. "
        f"{shift_line} "
        f"Today is {format_lift_name(lift)}, cycle {cycle} week {week}. "
        f"Training max {training_max} pounds. "
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
        "spoken_response": spoken_response
    }