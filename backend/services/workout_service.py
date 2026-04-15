from datetime import datetime, timedelta

from backend.core.config import LOCAL_TZ, WEEKLY_TEMPLATE
from backend.db.supabase_client import supabase
from backend.utils.formatters import format_lift_name, round_to_nearest_5


def build_plate_breakdown(total_weight: float) -> dict:
    rounded_weight = round_to_nearest_5(total_weight)
    bar_weight = 45

    if rounded_weight < bar_weight:
        return {
            "total_weight": rounded_weight,
            "bar_weight": bar_weight,
            "per_side": {},
            "note": "Weight is below bar weight."
        }

    remaining = rounded_weight - bar_weight
    per_side_weight = remaining / 2
    plate_sizes = [45, 35, 25, 10, 5, 2.5]
    per_side = {}

    for plate in plate_sizes:
        count = int(per_side_weight // plate)
        if count > 0:
            per_side[str(plate)] = count
            per_side_weight -= count * plate

    return {
        "total_weight": rounded_weight,
        "bar_weight": bar_weight,
        "per_side": per_side
    }


def build_warmup_sets(training_max: float) -> list[dict]:
    warmup_percentages = [
        ("Warm-up 1", 0.40, 5),
        ("Warm-up 2", 0.50, 5),
        ("Warm-up 3", 0.60, 3),
    ]

    warmups = []
    for label, pct, reps in warmup_percentages:
        weight = round_to_nearest_5(training_max * pct)
        warmups.append({
            "label": label,
            "percent": int(pct * 100),
            "reps": reps,
            "weight": weight,
            "plates": build_plate_breakdown(weight)
        })
    return warmups


def format_work_set(weight: float, reps_label: str) -> dict:
    rounded_weight = round_to_nearest_5(weight)
    return {
        "reps": reps_label,
        "weight": rounded_weight,
        "plates": build_plate_breakdown(rounded_weight)
    }


def build_work_sets(training_max: float, week: int) -> dict:
    if week == 1:
        return {
            "Set 1": format_work_set(training_max * 0.65, "5"),
            "Set 2": format_work_set(training_max * 0.75, "5"),
            "Set 3": format_work_set(training_max * 0.85, "5+"),
        }
    if week == 2:
        return {
            "Set 1": format_work_set(training_max * 0.70, "3"),
            "Set 2": format_work_set(training_max * 0.80, "3"),
            "Set 3": format_work_set(training_max * 0.90, "3+"),
        }
    if week == 3:
        return {
            "Set 1": format_work_set(training_max * 0.75, "5"),
            "Set 2": format_work_set(training_max * 0.85, "3"),
            "Set 3": format_work_set(training_max * 0.95, "1+"),
        }
    if week == 4:
        return {
            "Set 1": format_work_set(training_max * 0.40, "5"),
            "Set 2": format_work_set(training_max * 0.50, "5"),
            "Set 3": format_work_set(training_max * 0.60, "5"),
        }
    raise ValueError("Week must be 1, 2, 3, or 4.")


def estimate_one_rep_max(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30)


def minimum_required_reps_for_week(week: int) -> int:
    return {1: 5, 2: 3, 3: 1, 4: 5}.get(week, 1)


def get_latest_top_set(user_id: str, lift: str) -> dict | None:
    response = (
        supabase.table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data or []

    for row in rows:
        notes = (row.get("notes") or "").lower()
        if "set 3" in notes or "top set" in notes or "pr" in notes or "voice log" in notes:
            return row

    return rows[0] if rows else None


def get_next_lift_profile(user_id: str) -> dict | None:
    response = (
        supabase.table("lift_profiles")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=False)
        .execute()
    )
    profiles = response.data or []
    if not profiles:
        return None

    profiles_sorted = sorted(
        profiles,
        key=lambda p: (int(p.get("week", 1)), str(p.get("lift", "")))
    )
    return profiles_sorted[0]


def get_pr_prediction(lift: str, set_3_weight: float, target_reps: str, training_max: float) -> str:
    if target_reps == "1+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 3)
        return f"3 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    if target_reps == "3+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 5)
        return f"5 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    if target_reps == "5+":
        predicted_pr = estimate_one_rep_max(set_3_weight, 8)
        return f"8 reps on Set 3 projects about a {round(predicted_pr)} lb estimated 1RM."
    return f"Push the final set hard. TM is {round(training_max)}."


def get_unique_completed_workouts(user_id: str) -> list[dict]:
    response = (
        supabase.table("workouts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = response.data or []
    seen = set()
    unique = []

    for row in rows:
        lift = row.get("lift")
        created_at = row.get("created_at")
        notes = (row.get("notes") or "").lower()

        if not lift or not created_at:
            continue

        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00")).astimezone(LOCAL_TZ)
        local_date = dt.date().isoformat()
        key = (lift, local_date)

        if key not in seen and (
            "set 3" in notes or
            "cycle" in notes or
            "top set" in notes or
            "voice log" in notes
        ):
            seen.add(key)
            unique.append({
                "lift": lift,
                "date": local_date,
                "created_at": created_at,
                "notes": notes,
            })

    return unique


def check_for_pr(user_id: str, lift: str, weight: float, reps: int) -> dict:
    response = (
        supabase.table("workouts")
        .select("weight,reps,notes,lift")
        .eq("user_id", user_id)
        .eq("lift", lift)
        .execute()
    )

    history = response.data or []
    current_est_1rm = estimate_one_rep_max(weight, reps)

    best_weight = 0
    best_est_1rm = 0

    for row in history:
        row_weight = float(row.get("weight", 0))
        row_reps = int(row.get("reps", 0))
        notes = (row.get("notes") or "").lower()

        if "week 4" in notes:
            continue

        if row_weight > best_weight:
            best_weight = row_weight

        row_est_1rm = estimate_one_rep_max(row_weight, row_reps)
        if row_est_1rm > best_est_1rm:
            best_est_1rm = row_est_1rm

    return {
        "is_weight_pr": weight > best_weight,
        "is_est_1rm_pr": current_est_1rm > best_est_1rm,
        "current_est_1rm": round(current_est_1rm),
        "best_weight": best_weight,
        "best_est_1rm": round(best_est_1rm),
    }


def get_scheduled_lift_for_date(date_obj) -> str | None:
    return WEEKLY_TEMPLATE.get(date_obj.weekday())


def get_next_scheduled_lift_after(date_obj):
    for offset in range(1, 8):
        check_date = date_obj + timedelta(days=offset)
        lift = get_scheduled_lift_for_date(check_date)
        if lift:
            return {
                "date": check_date.isoformat(),
                "lift": lift,
                "weekday": check_date.strftime("%A")
            }
    return None


def get_due_lifts(user_id: str, lookback_days: int = 14) -> list[dict]:
    today = datetime.now(LOCAL_TZ).date()
    start_date = today - timedelta(days=lookback_days)

    completed = get_unique_completed_workouts(user_id)
    due_queue = []

    current = start_date
    while current <= today:
        scheduled_lift = get_scheduled_lift_for_date(current)
        if scheduled_lift:
            due_queue.append({
                "date": current.isoformat(),
                "lift": scheduled_lift,
            })
        current += timedelta(days=1)

    for completed_item in completed:
        completed_lift = completed_item["lift"]
        for i, due in enumerate(due_queue):
            if due["lift"] == completed_lift:
                due_queue.pop(i)
                break

    return due_queue


def get_next_workout_logic(user_id: str) -> dict:
    today = datetime.now(LOCAL_TZ).date()
    scheduled_today = get_scheduled_lift_for_date(today)
    due_queue = get_due_lifts(user_id)
    next_scheduled = get_next_scheduled_lift_after(today)

    if due_queue:
        next_due = due_queue[0]
        actual_next = next_due["lift"]
        missed_date = next_due["date"]

        if scheduled_today and actual_next != scheduled_today:
            spoken = (
                f"It's supposed to be {format_lift_name(scheduled_today)} day, "
                f"but you missed {format_lift_name(actual_next)} on {missed_date}. "
                f"So do {format_lift_name(actual_next)}, knucklehead."
            )
        elif scheduled_today is None:
            spoken = (
                f"Nothing is scheduled for today, "
                f"but you still owe {format_lift_name(actual_next)} from {missed_date}."
            )
        else:
            spoken = f"Your next workout is {format_lift_name(actual_next)}."

        return {
            "scheduled_today": scheduled_today,
            "actual_next": actual_next,
            "due_queue": due_queue,
            "next_scheduled": next_scheduled,
            "spoken_response": spoken,
        }

    if scheduled_today:
        spoken = f"Today's scheduled workout is {format_lift_name(scheduled_today)}."
        actual_next = scheduled_today
    else:
        if next_scheduled:
            spoken = (
                f"Nothing is scheduled for today. "
                f"Your next scheduled workout is {format_lift_name(next_scheduled['lift'])} "
                f"on {next_scheduled['weekday']}."
            )
            actual_next = next_scheduled["lift"]
        else:
            spoken = "Nothing is scheduled for today, and I could not find your next workout."
            actual_next = None

    return {
        "scheduled_today": scheduled_today,
        "actual_next": actual_next,
        "due_queue": due_queue,
        "next_scheduled": next_scheduled,
        "spoken_response": spoken,
    }