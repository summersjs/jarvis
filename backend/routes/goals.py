from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.goal import GoalCreate, GoalLogCreate, GoalLogUpdate, GoalUpdate
from backend.services.goal_service import (
    create_goal,
    create_goal_log,
    delete_goal,
    delete_goal_log,
    get_goal,
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
