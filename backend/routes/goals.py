from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.goal import GoalCreate, GoalLogCreate, GoalLogUpdate, GoalUpdate
from backend.services.goal_service import (
    create_goal,
    create_goal_log,
    delete_goal,
    delete_goal_log,
    get_goal,
    get_goal_period_history,
    list_goal_logs,
    list_goals,
    update_goal,
    update_goal_log,
)

router = APIRouter(
    prefix="/goals",
    tags=["goals"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("")
def create_goal_route(payload: GoalCreate):
    try:
        return {
            "status": "ok",
            "goal": create_goal(payload),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def list_goals_route(user_id: str, active_only: bool = True):
    return {
        "status": "ok",
        "goals": list_goals(user_id, active_only),
    }

@router.get("/brief")
def goals_brief_route(user_id: str = "john"):
    goals = list_goals(user_id, active_only=True)

    if not goals:
        return {
            "status": "ok",
            "spoken_response": "You do not have any active goals yet."
        }

    lines = []
    for goal in goals:
        title = goal.get("title", "Unnamed goal")
        current = float(goal.get("current_value") or 0)
        target = float(goal.get("target_value") or 0)
        unit = goal.get("unit") or ""

        if target > 0:
            percent = round((current / target) * 100)
            remaining = max(target - current, 0)
            lines.append(
                f"{title}: {percent} percent complete. "
                f"{remaining:g} {unit} remaining."
            )
        else:
            lines.append(f"{title}: current progress is {current:g} {unit}.")

    spoken_response = "Here is your goals progress. " + " ".join(lines)

    return {
        "status": "ok",
        "goal_count": len(goals),
        "goals": goals,
        "spoken_response": spoken_response
    }

@router.get("/{goal_id}")
def get_goal_route(goal_id: str):
    goal = get_goal(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {
        "status": "ok",
        "goal": goal,
    }


@router.patch("/{goal_id}")
def update_goal_route(goal_id: str, payload: GoalUpdate):
    goal = update_goal(goal_id, payload)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {
        "status": "ok",
        "goal": goal,
    }


@router.delete("/{goal_id}")
def delete_goal_route(goal_id: str):
    return {
        "status": "ok",
        "deleted": delete_goal(goal_id),
    }


@router.get("/{goal_id}/logs")
def list_goal_logs_route(goal_id: str):
    return {
        "status": "ok",
        "logs": list_goal_logs(goal_id),
    }


@router.get("/{goal_id}/period-history")
def goal_period_history_route(goal_id: str, periods: int = 8):
    history = get_goal_period_history(goal_id, periods)
    if history is None:
        raise HTTPException(status_code=404, detail="Goal not found.")

    return {
        "status": "ok",
        "period_history": history,
    }


@router.post("/{goal_id}/logs")
def create_goal_log_route(goal_id: str, payload: GoalLogCreate):
    result = create_goal_log(goal_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {
        "status": "ok",
        **result,
    }


@router.patch("/logs/{log_id}")
def update_goal_log_route(log_id: str, payload: GoalLogUpdate):
    log = update_goal_log(log_id, payload)
    if not log:
        raise HTTPException(status_code=404, detail="Goal log not found.")
    return {
        "status": "ok",
        "log": log,
    }


@router.delete("/logs/{log_id}")
def delete_goal_log_route(log_id: str):
    return {
        "status": "ok",
        "deleted": delete_goal_log(log_id),
    }
