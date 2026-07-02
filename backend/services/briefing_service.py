from datetime import datetime

from backend.services.workout_service import get_next_workout_logic, get_latest_top_set
from backend.utils.formatters import format_lift_name, round_to_nearest_5
from backend.db.supabase_client import supabase


def build_business_status() -> str:
    return "No active Aegis Intake Systems alerts. No Fiverr spike alerts yet."


def build_journal_status(user_id: str) -> str:
    today = datetime.now().date().isoformat()
    try:
        response = (
            supabase
            .table("archive_chronicles")
            .select("entry_date,status,story_text,future_me_message,notes")
            .eq("user_id", user_id)
            .order("entry_date", desc=True)
            .limit(90)
            .execute()
        )
    except Exception:
        return ""

    rows = response.data or []
    documented_dates = {
        str(row.get("entry_date") or "")[:10]
        for row in rows
        if row.get("story_text")
        or row.get("future_me_message")
        or row.get("notes")
        or row.get("status") in {"in_progress", "filed"}
    }
    if today in documented_dates:
        return f"Chronicles is already active today. You have {len(documented_dates)} documented days in the Archive."
    if documented_dates:
        return f"Chronicles is not logged yet today. Make one paragraph a priority; the Archive has {len(documented_dates)} documented days so far."
    return "Chronicles is not logged yet today. Start the record with one simple paragraph."


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
    journal_status = build_journal_status(user_id)

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
            "journal_status": journal_status,
            "spoken_response": (
                f"Good morning, Daddy. "
                f"{workout_logic.get('spoken_response', 'No workout scheduled.')} "
                f"{journal_status} "
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
        f"{workout_line} "
        f"{workout_details} "
        f"{latest_line} "
        f"{journal_status} "
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
        "journal_status": journal_status,
        "workout_logic": workout_logic,
        "spoken_response": spoken_response
    }
