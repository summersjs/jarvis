from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from backend.core.config import LOCAL_TZ
from backend.services.briefing_service import build_morning_brief
from backend.services.calendar_service import get_calendar_events_for_date
from backend.services.debrief_service import build_daily_debrief_summary
from backend.services.forge_service import is_project_active, list_forge_projects
from backend.services.goal_service import get_goal, list_goals
from backend.services.health_service import build_health_dashboard
from backend.services.shopping_service import get_shopping_list, list_shopping_lists
from backend.services.workout_service import get_next_workout_logic, get_todays_workout_summary


READ_TOOLS_ENABLED = os.getenv("CHLOE_TOOLS_ENABLED", "true").lower() == "true"
WRITE_TOOLS_ENABLED = os.getenv("CHLOE_WRITE_TOOLS_ENABLED", "false").lower() == "true"
CONFIRMATION_TOOLS_ENABLED = os.getenv("CHLOE_CONFIRMATION_TOOLS_ENABLED", "false").lower() == "true"
MAX_TOOL_CALLS = int(os.getenv("CHLOE_MAX_TOOL_CALLS", "5"))


@dataclass(frozen=True)
class AssistantToolContext:
    user_id: str = "john"
    session_id: str = "local-chloe"
    request_id: str = "local-request"
    source: str = "chloe-chat"
    timezone: str = "America/New_York"


@dataclass(frozen=True)
class AssistantToolDefinition:
    name: str
    description: str
    risk_level: int
    access: str
    requires_confirmation: bool
    execute: Callable[[AssistantToolContext, dict[str, Any]], dict[str, Any]]


def tool_status() -> dict[str, Any]:
    return {
        "enabled": READ_TOOLS_ENABLED,
        "readToolsEnabled": READ_TOOLS_ENABLED,
        "writeToolsEnabled": WRITE_TOOLS_ENABLED,
        "confirmationToolsEnabled": CONFIRMATION_TOOLS_ENABLED,
        "maxToolCalls": MAX_TOOL_CALLS,
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "riskLevel": tool.risk_level,
                "access": tool.access,
                "requiresConfirmation": tool.requires_confirmation,
            }
            for tool in TOOL_REGISTRY.values()
        ],
    }


def select_read_tools(user_text: str) -> list[str]:
    if not READ_TOOLS_ENABLED:
        return []
    text = user_text.lower()
    selected: list[str] = []
    if "morning" in text and "brief" in text:
        selected.append("get_morning_brief")
    if "daily debrief" in text or "evening debrief" in text or ("debrief" in text and "daily" in text):
        selected.append("get_daily_debrief")
    if "calendar" in text or "schedule" in text or "today's events" in text or "today events" in text:
        selected.append("get_today_schedule")
    if "goal" in text or "goals" in text:
        selected.append("list_active_goals")
    if "shopping" in text or "grocery" in text:
        selected.append("list_shopping_items")
    if "forge" in text or "project" in text:
        selected.append("list_active_forge_projects")
    if "workout" in text or "lift" in text or "training" in text:
        selected.append("get_today_workout")
    if "health" in text or "symptom" in text or "water" in text or "caffeine" in text:
        selected.append("get_recent_health_summary")
    return list(dict.fromkeys(selected))[:MAX_TOOL_CALLS]


def execute_selected_tools(tool_names: list[str], context: AssistantToolContext | None = None) -> list[dict[str, Any]]:
    context = context or AssistantToolContext()
    results = []
    for name in tool_names[:MAX_TOOL_CALLS]:
        tool = TOOL_REGISTRY.get(name)
        if not tool:
            results.append({"tool": name, "success": False, "error": {"code": "UNAVAILABLE", "message": "Tool is not registered."}})
            continue
        try:
            results.append({"tool": name, "success": True, "result": tool.execute(context, {})})
        except Exception:
            results.append({"tool": name, "success": False, "error": {"code": "UNAVAILABLE", "message": "Jarvis could not load that read-only tool right now."}})
    return results


def get_morning_brief_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    data = build_morning_brief(context.user_id)
    return {
        "spoken_response": data.get("spoken_response"),
        "next_lift": data.get("next_lift"),
        "cycle": data.get("cycle"),
        "week": data.get("week"),
        "training_max": data.get("training_max"),
        "business_status": data.get("business_status"),
        "journal_status": data.get("journal_status"),
    }


def get_daily_debrief_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    data = build_daily_debrief_summary(context.user_id)
    return {
        "date": data.get("date"),
        "spoken_response": data.get("spoken_response"),
        "status": data.get("status"),
        "daily_score": data.get("daily_score") or (data.get("mission_scores") or {}).get("daily", {}).get("score"),
        "weekly_score": data.get("weekly_score") or (data.get("mission_scores") or {}).get("weekly", {}).get("score"),
        "next_protocol": data.get("next_protocol"),
    }


def get_today_schedule_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    today = datetime.now(LOCAL_TZ).date()
    events = get_calendar_events_for_date(today)
    return {
        "date": today.isoformat(),
        "events": [
            {
                "title": event.get("summary"),
                "start": event.get("start"),
                "end": event.get("end"),
                "location": event.get("location"),
            }
            for event in events[:8]
        ],
    }


def list_active_goals_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    goals = [
        goal
        for goal in list_goals(context.user_id, active_only=True)
        if (goal.get("status") or "").lower() in {"active", "in_progress", "in progress"}
        and not (goal.get("progress") or {}).get("is_complete")
    ]
    return {
        "goals": [
            {
                "id": goal.get("id"),
                "title": goal.get("title"),
                "status": goal.get("status"),
                "category": goal.get("category"),
                "mission_type": goal.get("mission_type"),
                "progress": goal.get("progress"),
            }
            for goal in goals[:12]
        ]
    }


def get_goal_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    goal_id = str(input_data.get("goal_id") or "")
    goal = get_goal(goal_id) if goal_id else None
    if not goal or goal.get("user_id") != context.user_id:
        return {"goal": None}
    return {
        "goal": {
            "id": goal.get("id"),
            "title": goal.get("title"),
            "status": goal.get("status"),
            "category": goal.get("category"),
            "progress": goal.get("progress"),
            "eta": goal.get("eta"),
        }
    }


def list_shopping_items_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    lists = list_shopping_lists(context.user_id)
    detailed_lists = [get_shopping_list(shopping_list["id"]) or shopping_list for shopping_list in lists[:3]]
    return {
        "shopping_lists": [
            {
                "id": shopping_list.get("id"),
                "title": shopping_list.get("title"),
                "items": [
                    {
                        "id": item.get("id"),
                        "name": item.get("item_name"),
                        "quantity": item.get("quantity"),
                        "category": item.get("category"),
                        "checked": item.get("is_checked"),
                    }
                    for item in (shopping_list.get("items") or [])[:20]
                ],
            }
            for shopping_list in detailed_lists
        ]
    }


def list_active_forge_projects_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    projects = [project for project in list_forge_projects(context.user_id) if is_project_active(project)]
    return {
        "projects": [
            {
                "id": project.get("id"),
                "title": project.get("title"),
                "category": project.get("category"),
                "status": project.get("status"),
                "progress_percent": project.get("progress_percent"),
                "next_milestone": project.get("next_milestone"),
            }
            for project in projects[:12]
        ]
    }


def get_today_workout_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    today = datetime.now(LOCAL_TZ).date()
    return {
        "date": today.isoformat(),
        "completed_workout": get_todays_workout_summary(context.user_id, today),
        "next_workout": get_next_workout_logic(context.user_id),
    }


def get_recent_health_summary_tool(context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    data = build_health_dashboard(context.user_id)
    return {
        "date": data.get("date"),
        "snapshot": data.get("snapshot"),
        "weekly_summary": data.get("weekly_summary"),
    }


TOOL_REGISTRY: dict[str, AssistantToolDefinition] = {
    "get_morning_brief": AssistantToolDefinition("get_morning_brief", "Get today's sanitized morning brief.", 1, "read", False, get_morning_brief_tool),
    "get_daily_debrief": AssistantToolDefinition("get_daily_debrief", "Get today's sanitized daily debrief summary.", 1, "read", False, get_daily_debrief_tool),
    "get_today_schedule": AssistantToolDefinition("get_today_schedule", "Get today's calendar schedule.", 1, "read", False, get_today_schedule_tool),
    "list_active_goals": AssistantToolDefinition("list_active_goals", "List active Jarvis goals.", 1, "read", False, list_active_goals_tool),
    "get_goal": AssistantToolDefinition("get_goal", "Get one goal by server-approved ID.", 1, "read", False, get_goal_tool),
    "list_shopping_items": AssistantToolDefinition("list_shopping_items", "List current shopping list items.", 1, "read", False, list_shopping_items_tool),
    "list_active_forge_projects": AssistantToolDefinition("list_active_forge_projects", "List active Forge projects.", 1, "read", False, list_active_forge_projects_tool),
    "get_today_workout": AssistantToolDefinition("get_today_workout", "Get today's workout and next workout context.", 1, "read", False, get_today_workout_tool),
    "get_recent_health_summary": AssistantToolDefinition("get_recent_health_summary", "Get recent health dashboard summary.", 1, "read", False, get_recent_health_summary_tool),
}
