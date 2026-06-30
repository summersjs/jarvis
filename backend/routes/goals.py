from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.goal import (
    GoalCreate,
    GoalLogCreate,
    GoalLogUpdate,
    GoalMilestoneCreate,
    GoalMilestoneUpdate,
    GoalUpdate,
)
from backend.services.goal_service import (
    create_goal,
    create_goal_log,
    create_goal_milestone,
    delete_goal,
    delete_goal_log,
    delete_goal_milestone,
    get_goal,
    get_goal_period_history,
    list_goal_logs,
    list_goals,
    update_goal,
    update_goal_log,
    update_goal_milestone,
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
    planned_lines = []
    for goal in goals:
        title = goal.get("title", "Unnamed goal")
        current = float(goal.get("current_value") or 0)
        target = float(goal.get("target_value") or 0)
        unit = goal.get("unit") or ""
        mission_type = (goal.get("mission_type") or "").lower()

        planned_summary = goal_planned_summary(goal)
        if planned_summary:
            planned_lines.append(planned_summary)

        if mission_type == "standard":
            standard = goal.get("standard") or {}
            status = standard.get("status") or "NOT PLANNED"
            remaining = standard.get("remaining")
            period_label = standard.get("period_start") and standard.get("period_end")
            period_text = (
                f" Current period is {standard.get('period_start')} through {standard.get('period_end')}."
                if period_label
                else ""
            )
            remaining_text = f" {remaining:g} {unit} remaining this period." if remaining is not None and target > 0 else ""
            lines.append(f"{title}: {status.lower().replace('_', ' ')}.{period_text}{remaining_text}")
        elif mission_type == "project":
            project = goal.get("project") or {}
            completed = project.get("completed_count") or 0
            total = project.get("total_count") or 0
            lines.append(f"{title}: {completed} of {total} milestones complete.")
        elif target > 0:
            percent = round((current / target) * 100)
            remaining = max(target - current, 0)
            lines.append(
                f"{title}: {percent} percent complete. "
                f"{remaining:g} {unit} remaining."
            )
        else:
            lines.append(f"{title}: current progress is {current:g} {unit}.")

    planned_text = ""
    if planned_lines:
        planned_text = " Planned items: " + " ".join(planned_lines)

    spoken_response = "Here is your goals progress." + planned_text + " " + " ".join(lines)

    return {
        "status": "ok",
        "goal_count": len(goals),
        "goals": goals,
        "spoken_response": spoken_response
    }


def goal_planned_summary(goal: dict) -> str | None:
    title = goal.get("title", "Planned goal")
    mission_type = (goal.get("mission_type") or "").lower()

    if mission_type == "standard":
        standard = goal.get("standard") or {}
        planned_for = standard.get("planned_for") or goal.get("planned_date")
        if not planned_for:
            return None
        planned_time = standard.get("planned_time") or goal.get("planned_time")
        return f"{title} is planned for {format_spoken_date(planned_for)}{format_spoken_time(planned_time)}."

    if mission_type == "project":
        milestone = (goal.get("project") or {}).get("next_milestone") or {}
        status = (milestone.get("status") or "").lower()
        target_date = milestone.get("target_date")
        if status != "planned" and not target_date:
            return None
        milestone_title = milestone.get("title") or "next milestone"
        if target_date:
            return f"{title}: {milestone_title} is planned for {format_spoken_date(target_date)}."
        return f"{title}: {milestone_title} is planned."

    planned_date = goal.get("planned_date") or goal.get("due_date")
    if planned_date:
        label = "planned" if goal.get("planned_date") else "due"
        return f"{title} is {label} for {format_spoken_date(planned_date)}{format_spoken_time(goal.get('planned_time'))}."
    return None


def format_spoken_date(value: str | None) -> str:
    if not value:
        return "an unscheduled date"
    planned_date = date.fromisoformat(value[:10])
    today = date.today()
    if planned_date == today:
        return "today"
    if (planned_date - today).days == 1:
        return "tomorrow"
    return f"{planned_date.strftime('%A, %B')} {planned_date.day}"


def format_spoken_time(value: str | None) -> str:
    return f" at {value}" if value else ""

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


@router.post("/{goal_id}/plan")
def plan_standard_route(goal_id: str, payload: GoalLogCreate):
    planned_payload = payload.model_copy(update={"log_type": "planned", "value": 0})
    result = create_goal_log(goal_id, planned_payload)
    if not result:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {
        "status": "ok",
        **result,
    }


@router.post("/{goal_id}/milestones")
def create_goal_milestone_route(goal_id: str, payload: GoalMilestoneCreate):
    goal = get_goal(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return {
        "status": "ok",
        "milestone": create_goal_milestone(goal_id, payload),
        "goal": get_goal(goal_id),
    }


@router.patch("/milestones/{milestone_id}")
def update_goal_milestone_route(milestone_id: str, payload: GoalMilestoneUpdate):
    milestone = update_goal_milestone(milestone_id, payload)
    if not milestone:
        raise HTTPException(status_code=404, detail="Goal milestone not found.")
    return {
        "status": "ok",
        "milestone": milestone,
    }


@router.delete("/milestones/{milestone_id}")
def delete_goal_milestone_route(milestone_id: str):
    return {
        "status": "ok",
        "deleted": delete_goal_milestone(milestone_id),
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
