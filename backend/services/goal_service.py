from datetime import date, datetime, time, timedelta
from math import ceil

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.schemas.goal import GoalCreate, GoalLogCreate, GoalLogUpdate, GoalUpdate


STRENGTH_UNITS = {"lb", "lbs", "pound", "pounds"}
STRENGTH_KEYWORDS = {"bench", "squat", "deadlift", "press"}
LIFT_GOAL_KEYWORDS = {
    "bench": {"bench", "bench press"},
    "squat": {"squat"},
    "deadlift": {"deadlift"},
    "overhead_press": {"overhead press", "ohp", "press"},
}
PERIODIC_GOAL_TYPES = {"habit", "count", "binary"}
PERIODIC_FREQUENCIES = {"daily", "weekly"}


def create_goal(payload: GoalCreate):
    insert_data = {
        "user_id": payload.user_id,
        "title": payload.title,
        "description": payload.description,
        "category": payload.category,
        "goal_type": payload.goal_type,
        "target_value": payload.target_value,
        "current_value": payload.current_value,
        "unit": payload.unit,
        "frequency": payload.frequency,
        "is_active": payload.is_active,
    }

    response = supabase.table("goals").insert(insert_data).execute()
    if not response.data:
        raise Exception("Failed to create goal.")

    return get_goal(response.data[0]["id"])


def list_goals(user_id: str, active_only: bool = True):
    query = (
        supabase
        .table("goals")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )

    if active_only:
        query = query.eq("is_active", True)

    response = query.execute()
    goals = response.data or []
    return [enrich_goal(goal) for goal in goals]


def get_goal(goal_id: str):
    response = (
        supabase
        .table("goals")
        .select("*")
        .eq("id", goal_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return enrich_goal(response.data[0])


def update_goal(goal_id: str, payload: GoalUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    response = (
        supabase
        .table("goals")
        .update(update_data)
        .eq("id", goal_id)
        .execute()
    )

    if not response.data:
        return None

    return get_goal(goal_id)


def delete_goal(goal_id: str):
    response = supabase.table("goals").delete().eq("id", goal_id).execute()
    return response.data or []


def list_goal_logs(goal_id: str):
    response = (
        supabase
        .table("goal_logs")
        .select("*")
        .eq("goal_id", goal_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def create_goal_log(goal_id: str, payload: GoalLogCreate):
    goal = get_goal_row(goal_id)
    if not goal:
        return None

    value = payload.value if payload.value is not None else 1
    response = (
        supabase
        .table("goal_logs")
        .insert({
            "goal_id": goal_id,
            "value": value,
            "notes": payload.notes,
        })
        .execute()
    )

    if not response.data:
        raise Exception("Failed to create goal log.")

    logs = list_goal_logs(goal_id)
    current_value = float(goal.get("current_value") or 0)
    goal_type = (goal.get("goal_type") or "").lower()

    if is_periodic_goal(goal):
        period_start, period_end = get_current_period_bounds(goal)
        next_value = sum_log_values_for_period(logs, period_start, period_end)
    elif goal_type in {"count", "habit"}:
        next_value = current_value + float(value or 0)
    else:
        next_value = float(value or 0)

    supabase.table("goals").update({"current_value": next_value}).eq("id", goal_id).execute()

    return {
        "log": response.data[0],
        "goal": get_goal(goal_id),
    }


def update_goal_log(log_id: str, payload: GoalLogUpdate):
    update_data = payload.model_dump(exclude_unset=True)
    response = supabase.table("goal_logs").update(update_data).eq("id", log_id).execute()
    return response.data[0] if response.data else None


def delete_goal_log(log_id: str):
    response = supabase.table("goal_logs").delete().eq("id", log_id).execute()
    return response.data or []


def get_goal_period_history(goal_id: str, periods: int = 8):
    goal = get_goal_row(goal_id)
    if not goal:
        return None

    logs = list_goal_logs(goal_id)
    return build_period_history(goal, logs, periods)


def auto_update_strength_goals(user_id: str, lift: str, estimated_1rm: float, source_note: str):
    response = (
        supabase
        .table("goals")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .eq("category", "fitness")
        .execute()
    )

    updated_goals = []
    for goal in response.data or []:
        if not is_matching_strength_goal(goal, lift):
            continue

        current_value = float(goal.get("current_value") or 0)
        if estimated_1rm <= current_value:
            continue

        supabase.table("goal_logs").insert({
            "goal_id": goal["id"],
            "value": estimated_1rm,
            "notes": source_note,
        }).execute()

        supabase.table("goals").update({
            "current_value": estimated_1rm,
        }).eq("id", goal["id"]).execute()

        updated_goal = get_goal(goal["id"])
        if updated_goal:
            updated_goals.append(updated_goal)

    return updated_goals


def is_matching_strength_goal(goal: dict, lift: str) -> bool:
    title = (goal.get("title") or "").lower()
    unit = (goal.get("unit") or "").lower()
    goal_type = (goal.get("goal_type") or "").lower()

    if goal_type != "metric" or unit not in STRENGTH_UNITS:
        return False

    return any(keyword in title for keyword in LIFT_GOAL_KEYWORDS.get(lift, set()))


def enrich_goal(goal: dict):
    logs = list_goal_logs(goal["id"])
    enriched = dict(goal)

    if is_periodic_goal(goal):
        period_start, period_end = get_current_period_bounds(goal)
        period_value = sum_log_values_for_period(logs, period_start, period_end)
        enriched["current_value"] = period_value
        enriched["period"] = build_period_snapshot(goal, period_start, period_end, period_value, True)
        enriched["period_history"] = build_period_history(goal, logs)

    enriched["logs"] = logs[:5]
    enriched["progress"] = calculate_progress(enriched)
    if is_periodic_goal(goal):
        enriched["eta"] = calculate_periodic_eta(enriched)
    else:
        enriched["eta"] = calculate_eta(enriched, logs)
    return enriched


def calculate_progress(goal: dict) -> dict:
    target = goal.get("target_value")
    current = float(goal.get("current_value") or 0)

    if not target:
        return {
            "percent": None,
            "remaining": None,
            "is_complete": False,
        }

    target_value = float(target)
    percent = min(100, max(0, (current / target_value) * 100)) if target_value > 0 else 0

    return {
        "percent": round(percent, 1),
        "remaining": max(0, round(target_value - current, 2)),
        "is_complete": current >= target_value,
    }


def calculate_eta(goal: dict, logs: list[dict]) -> dict:
    target = goal.get("target_value")
    current = float(goal.get("current_value") or 0)

    if not target:
        return {
            "estimated_completion_date": None,
            "summary": "No target value set.",
            "method": "none",
        }

    target_value = float(target)
    remaining = target_value - current

    if remaining <= 0:
        today = datetime.now(LOCAL_TZ).date().isoformat()
        return {
            "estimated_completion_date": today,
            "summary": "Goal complete.",
            "method": "complete",
        }

    strength_eta = calculate_strength_eta(goal, remaining)
    if strength_eta:
        return strength_eta

    log_eta = calculate_log_rate_eta(goal, logs, remaining)
    if log_eta:
        return log_eta

    return {
        "estimated_completion_date": None,
        "summary": "Not enough progress history to estimate completion.",
        "method": "insufficient_data",
    }


def calculate_periodic_eta(goal: dict) -> dict:
    period = goal.get("period") or {}
    frequency = (goal.get("frequency") or "").lower()
    target = goal.get("target_value")

    if not target:
        return {
            "estimated_completion_date": None,
            "summary": "No target value set.",
            "method": "none",
        }

    if goal.get("progress", {}).get("is_complete"):
        return {
            "estimated_completion_date": datetime.now(LOCAL_TZ).date().isoformat(),
            "summary": f"{frequency.title()} target hit.",
            "method": "periodic_complete",
        }

    return {
        "estimated_completion_date": period.get("period_end"),
        "summary": f"Resets after this {frequency} period.",
        "method": f"{frequency}_period_reset",
    }


def calculate_strength_eta(goal: dict, remaining: float) -> dict | None:
    title = (goal.get("title") or "").lower()
    unit = (goal.get("unit") or "").lower()
    category = (goal.get("category") or "").lower()

    if category != "fitness" or unit not in STRENGTH_UNITS:
        return None

    if not any(keyword in title for keyword in STRENGTH_KEYWORDS):
        return None

    increment = 10 if "squat" in title or "deadlift" in title else 5
    blocks = ceil(remaining / increment)
    weeks = blocks * 4
    estimated_date = (datetime.now(LOCAL_TZ).date() + timedelta(weeks=weeks)).isoformat()

    return {
        "estimated_completion_date": estimated_date,
        "summary": f"About {weeks} weeks at +{increment} lbs every 4 weeks.",
        "method": f"strength_linear_{increment}lb_per_4_weeks",
    }


def calculate_log_rate_eta(goal: dict, logs: list[dict], remaining: float) -> dict | None:
    if len(logs) < 2:
        return None

    sorted_logs = sorted(logs, key=lambda row: row.get("created_at") or "")
    first = sorted_logs[0]
    last = sorted_logs[-1]

    first_date = parse_datetime(first.get("created_at"))
    last_date = parse_datetime(last.get("created_at"))
    if not first_date or not last_date:
        return None

    days = max(1, (last_date - first_date).days)
    goal_type = (goal.get("goal_type") or "").lower()

    if goal_type in {"count", "habit"}:
        total_logged = sum(float(row.get("value") or 0) for row in sorted_logs)
        daily_rate = total_logged / days
    else:
        first_value = float(first.get("value") or 0)
        last_value = float(last.get("value") or 0)
        daily_rate = (last_value - first_value) / days

    if daily_rate <= 0:
        return None

    days_remaining = ceil(remaining / daily_rate)
    estimated_date = (datetime.now(LOCAL_TZ).date() + timedelta(days=days_remaining)).isoformat()

    return {
        "estimated_completion_date": estimated_date,
        "summary": f"About {days_remaining} days at your logged pace.",
        "method": "log_rate",
    }


def get_goal_row(goal_id: str):
    response = (
        supabase
        .table("goals")
        .select("*")
        .eq("id", goal_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def is_periodic_goal(goal: dict) -> bool:
    goal_type = (goal.get("goal_type") or "").lower()
    frequency = (goal.get("frequency") or "").lower()
    return goal_type in PERIODIC_GOAL_TYPES and frequency in PERIODIC_FREQUENCIES


def get_current_period_bounds(goal: dict):
    today = datetime.now(LOCAL_TZ).date()
    return get_period_bounds_for_date(goal, today)


def get_period_bounds_for_date(goal: dict, anchor_date: date):
    frequency = (goal.get("frequency") or "").lower()

    if frequency == "weekly":
        start_date = anchor_date - timedelta(days=anchor_date.weekday())
        end_date = start_date + timedelta(days=7)
    else:
        start_date = anchor_date
        end_date = start_date + timedelta(days=1)

    return (
        datetime.combine(start_date, time.min, tzinfo=LOCAL_TZ),
        datetime.combine(end_date, time.min, tzinfo=LOCAL_TZ),
    )


def sum_log_values_for_period(logs: list[dict], period_start: datetime, period_end: datetime) -> float:
    total = 0.0
    for log in logs:
        created_at = parse_datetime(log.get("created_at"))
        if created_at and period_start <= created_at < period_end:
            total += float(log.get("value") if log.get("value") is not None else 1)
    return total


def build_period_history(goal: dict, logs: list[dict], periods: int = 8):
    if not is_periodic_goal(goal):
        return []

    frequency = (goal.get("frequency") or "").lower()
    today = datetime.now(LOCAL_TZ).date()
    step_days = 7 if frequency == "weekly" else 1
    history = []

    for index in range(max(1, periods)):
        anchor_date = today - timedelta(days=index * step_days)
        period_start, period_end = get_period_bounds_for_date(goal, anchor_date)
        value = sum_log_values_for_period(logs, period_start, period_end)
        history.append(build_period_snapshot(goal, period_start, period_end, value, index == 0))

    return history


def build_period_snapshot(
    goal: dict,
    period_start: datetime,
    period_end: datetime,
    value: float,
    is_current: bool,
):
    target = float(goal.get("target_value") or 0)
    percent = round(min(100, max(0, (value / target) * 100)), 1) if target > 0 else None
    hit_goal = target > 0 and value >= target
    inclusive_end = (period_end - timedelta(days=1)).date()

    return {
        "frequency": (goal.get("frequency") or "").lower(),
        "label": format_period_label(goal, period_start, period_end),
        "period_start": period_start.date().isoformat(),
        "period_end": inclusive_end.isoformat(),
        "value": round(value, 2),
        "target_value": target if target > 0 else None,
        "percent": percent,
        "hit_goal": hit_goal,
        "missed_goal": (not is_current) and target > 0 and not hit_goal,
        "is_current": is_current,
    }


def format_period_label(goal: dict, period_start: datetime, period_end: datetime):
    frequency = (goal.get("frequency") or "").lower()

    if frequency == "weekly":
        inclusive_end = (period_end - timedelta(days=1)).date()
        return f"{period_start.date().isoformat()} to {inclusive_end.isoformat()}"

    return period_start.date().isoformat()


def parse_datetime(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(LOCAL_TZ)
