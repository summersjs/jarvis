from datetime import datetime, timedelta
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
    goal = get_goal(goal_id)
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

    current_value = float(goal.get("current_value") or 0)
    goal_type = (goal.get("goal_type") or "").lower()

    if goal_type in {"count", "habit"}:
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
    enriched["logs"] = logs[:5]
    enriched["progress"] = calculate_progress(goal)
    enriched["eta"] = calculate_eta(goal, logs)
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


def parse_datetime(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(LOCAL_TZ)
