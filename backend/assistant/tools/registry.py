from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable

from backend.core.config import LOCAL_TZ
from backend.services.briefing_service import build_morning_brief
from backend.services.calendar_service import get_calendar_events_for_date
from backend.services.debrief_service import build_daily_debrief_summary
from backend.schemas.forge import ForgeProjectUpdate, ForgeSparkCreate, ForgeTaskUpdate
from backend.schemas.goal import GoalCreate, GoalLogCreate
from backend.schemas.health import HealthDailyCheckinUpsert, HealthEventCreate
from backend.schemas.meal_planner import MealPlanEntryCreate, MealPlanEntryUpdate
from backend.schemas.shopping import ShoppingListCreate, ShoppingListItemCreate, ShoppingListItemUpdate
from backend.schemas.food_vault import FoodVaultItemCreate
from backend.schemas.recipe import RecipeCreate
from backend.services.forge_service import (
    create_forge_spark,
    is_project_active,
    list_forge_projects,
    list_forge_tasks,
    update_forge_project,
    update_forge_task,
)
from backend.services.goal_service import create_goal, create_goal_log, get_goal, list_goals
from backend.services.health_service import build_health_dashboard, create_health_event, upsert_daily_checkin
from backend.services.meal_planner_service import create_meal_plan_entry, delete_meal_plan_entry, get_meal_plan_entry, list_meal_plan_entries, update_meal_plan_entry
from backend.services.food_vault_service import create_food_vault_item, delete_food_vault_item, get_food_vault_item, list_food_vault_items
from backend.services.recipe_service import create_recipe, delete_recipe, get_recipe
from backend.services.shopping_service import (
    add_shopping_list_item,
    create_shopping_list,
    delete_shopping_list,
    delete_shopping_list_item,
    get_shopping_list,
    list_shopping_lists,
    update_shopping_list_item,
)
from backend.services.workout_service import get_next_workout_logic, get_todays_workout_summary
from backend.services.live_price_service import search_live_prices


READ_TOOLS_ENABLED = os.getenv("JARVIS_TOOLS_ENABLED", "true").lower() == "true"
WRITE_TOOLS_ENABLED = os.getenv("JARVIS_WRITE_TOOLS_ENABLED", "true").lower() == "true"
CONFIRMATION_TOOLS_ENABLED = os.getenv("JARVIS_CONFIRMATION_TOOLS_ENABLED", "false").lower() == "true"
MAX_TOOL_CALLS = int(os.getenv("JARVIS_MAX_TOOL_CALLS", "5"))


@dataclass(frozen=True)
class AssistantToolContext:
    user_id: str = "john"
    session_id: str = "local-jarvis"
    request_id: str = "local-request"
    source_message_id: str = "local-source"
    conversation_id: str = "local-jarvis"
    source: str = "jarvis-chat"
    timezone: str = "America/New_York"
    confirmed_action_id: str | None = None
    resolution_meta: dict[str, Any] | None = None
    tool_plan: dict[str, Any] | None = None


@dataclass(frozen=True)
class AssistantToolDefinition:
    name: str
    description: str
    risk_level: int
    access: str
    requires_confirmation: bool
    execute: Callable[[AssistantToolContext, dict[str, Any]], dict[str, Any]]
    evidence_class: str = "internal_record"


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
                "evidenceClass": tool.evidence_class,
            }
            for tool in TOOL_REGISTRY.values()
        ],
    }


def select_read_tools(user_text: str) -> list[str]:
    if not READ_TOOLS_ENABLED:
        return []
    text = user_text.lower()
    selected: list[str] = []
    status_phrases = [
        "everything running",
        "everything is running",
        "all systems up",
        "systems up",
        "all systems running",
        "systems running",
        "anything red",
        "system status",
        "systems status",
        "health check",
        "check the ping",
        "check ping",
    ]
    if any(phrase in text for phrase in status_phrases):
        selected.append("get_system_status")
    if is_live_commerce_request(text):
        selected.append("search_live_prices")
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


def select_tools(user_text: str) -> list[dict[str, Any]]:
    calls = [{"name": name, "input": {"query": extract_price_query(user_text), "retailer": extract_retailer(user_text)}} if name == "search_live_prices" else {"name": name, "input": {}} for name in select_read_tools(user_text)]
    lower = user_text.lower()
    wants_tomorrow_schedule = any(phrase in lower for phrase in ["tomorrow", "tomorrow's"]) and any(word in lower for word in ["calendar", "schedule", "going on", "have going", "events"])
    if wants_tomorrow_schedule:
        calls = [call for call in calls if call["name"] != "get_today_schedule"]
        calls.append({"name": "get_schedule_for_date", "input": {"date_offset": 1, "label": "tomorrow"}})
    if WRITE_TOOLS_ENABLED:
        calls.extend(select_write_tools(user_text))
    deduped: list[dict[str, Any]] = []
    seen = set()
    for call in calls:
        key = (call["name"], str(sorted((call.get("input") or {}).items())))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(call)
    return deduped[:MAX_TOOL_CALLS]


def is_live_commerce_request(text: str) -> bool:
    lower = text.lower()
    commerce = any(word in lower for word in ("price", "prices", "cost", "cheapest", "cheaper", "better deal", "compare", "how much", "availability", "in stock", "nearby store", "stores near"))
    commerce = commerce or bool(re.search(r"\bwhat did\s+(?:kroger|walmart)\s+have\b", lower))
    return commerce and not any(phrase in lower for phrase in ("estimated price", "my food vault", "i paid", "did i pay"))


def extract_price_query(text: str) -> str:
    cleaned = re.sub(r"(?i)\b(?:what(?:'s|s| is| are)?|how much(?: does| is| are)?|find|check|compare|show me|tell me)\b", " ", text)
    cleaned = re.sub(r"(?i)\b(?:current|live|nearby|local|prices?|cost|costs|availability|in stock|at stores?|near me|around me|please)\b", " ", cleaned)
    cleaned = re.sub(r"(?i)\b(?:the|at|from|of|for|kroger|walmart|instacart)\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ?.,")
    cleaned = re.sub(r"(?i)\bredbull\b", "Red Bull", cleaned)
    return cleaned or text.strip()


def extract_retailer(text: str) -> str | None:
    lower = text.lower()
    named = [name for name in ("kroger", "walmart", "instacart") if name in lower]
    return named[0] if len(named) == 1 else None


def select_write_tools(user_text: str) -> list[dict[str, Any]]:
    text = user_text.strip()
    lower = text.lower()
    calls: list[dict[str, Any]] = []

    date_match = re.search(r"\b(?:went on|had|completed)\s+(?:a\s+)?date\b", lower)
    if date_match:
        person_match = re.search(r"\bdate\s+with\s+([a-z][a-z'-]*)", lower)
        person = clean_title_case(person_match.group(1) if person_match else "")
        notes = clean_sentence(text) or f"Went on a date{f' with {person}' if person else ''}."
        calls.append({"name": "log_goal_progress", "input": {"goal_query": "date", "value": 1, "log_type": "completed", "notes": notes}})

    checkin_fields = parse_checkin_fields(lower)
    if "complete my daily check" in lower or "daily check in" in lower or "daily check-in" in lower or checkin_fields:
        fields = checkin_fields
        calls.append({"name": "complete_daily_checkin", "input": fields})

    goal_fields = parse_goal_create_fields(text)
    if "create a goal" in lower or "new goal" in lower or {"title", "category", "goal_type"} <= set(goal_fields):
        calls.append({"name": "create_goal", "input": goal_fields})

    red_bull_match = re.search(r"\b(?:drank|had|log(?:ged)?)\s+(?:a\s+)?(?:(?:\d+(?:\.\d+)?\s*(?:oz|ounce|ounces)\s+)?(?:red bull|redbull)|(?:red bull|redbull))\b", lower)
    if red_bull_match:
        calls.append({"name": "log_caffeine_drink", "input": parse_caffeine_drink_fields(lower, "Red Bull")})

    goal_match = re.search(r"\b(?:log|record|mark)\s+(?:that\s+)?(?:i\s+)?(?:completed|finished|did)\s+(.+?)(?:\s+(?:for|toward)\s+(?:my\s+)?goal)?[.!?]?$", lower)
    if goal_match and "date" not in lower:
        activity = clean_sentence(goal_match.group(1))
        calls.append({"name": "log_goal_progress", "input": {"goal_query": activity, "value": 1, "log_type": "completed", "notes": f"Completed: {activity}."}})

    shopping_match = re.search(r"\badd\s+(.+?)\s+to\s+(?:my\s+)?(?:shopping|grocery)(?:\s+list)?", lower)
    if shopping_match:
        item_name = clean_sentence(shopping_match.group(1))
        calls.append({"name": "add_shopping_item", "input": {"item_name": item_name}})

    checked_match = re.search(r"\b(?:check off|mark)\s+(.+?)\s+(?:as\s+)?(?:bought|done|checked)", lower)
    if checked_match and ("shopping" in lower or "grocery" in lower or "list" in lower):
        calls.append({"name": "check_shopping_item", "input": {"item_query": clean_sentence(checked_match.group(1))}})

    symptom = infer_health_event_type(lower)
    if symptom:
        calls.append({"name": "log_health_event", "input": {"event_type": symptom, "notes": text}})
    elif re.search(r"\b(?:log|record|add)\s+(?:a\s+)?symptom\b", lower):
        calls.append({"name": "log_health_event", "input": {}})

    water_match = re.search(r"\b(?:drank|had|log(?:ged)?)\s+(\d+(?:\.\d+)?)\s*(?:oz|ounces)\s+(?:of\s+)?water\b", lower)
    caffeine_match = re.search(r"\b(?:had|drank|log(?:ged)?)\s+(\d+(?:\.\d+)?)\s*(?:mg)\s+(?:of\s+)?caffeine\b", lower)
    if water_match or caffeine_match:
        calls.append({"name": "complete_daily_checkin", "input": {
            "water_oz": float(water_match.group(1)) if water_match else None,
            "caffeine_mg": float(caffeine_match.group(1)) if caffeine_match else None,
            "notes": text,
        }})

    project_complete = re.search(r"\b(?:archive|complete|mark)\s+(?:project\s+)?(.+?)\s+(?:as\s+)?(?:complete|completed|archived|done)\b", lower)
    if project_complete and ("project" in lower or "forge" in lower):
        calls.append({"name": "complete_forge_project", "input": {"project_query": clean_sentence(project_complete.group(1))}})

    task_complete = re.search(r"\b(?:complete|finish|mark)\s+(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed)\b", lower)
    if task_complete and "goal" not in lower and "project" not in lower:
        calls.append({"name": "complete_forge_task", "input": {"task_query": clean_sentence(task_complete.group(1))}})

    spark_match = re.search(r"\b(?:capture|save|remember)\s+(?:this\s+)?(?:spark|idea):?\s+(.+)", text, re.IGNORECASE)
    if spark_match:
        calls.append({"name": "capture_forge_spark", "input": {"spark_text": clean_sentence(spark_match.group(1))}})

    return calls


def execute_selected_tools(tool_names: list[str], context: AssistantToolContext | None = None) -> list[dict[str, Any]]:
    return execute_tool_calls([{"name": name, "input": {}} for name in tool_names], context)


def execute_tool_calls(tool_calls: list[dict[str, Any]], context: AssistantToolContext | None = None) -> list[dict[str, Any]]:
    context = context or AssistantToolContext()
    results = []
    for call in tool_calls[:MAX_TOOL_CALLS]:
        name = str(call.get("name") or "")
        input_data = call.get("input") or {}
        tool = TOOL_REGISTRY.get(name)
        if not tool:
            results.append({"tool": name, "success": False, "error": {"code": "UNAVAILABLE", "message": "Tool is not registered."}})
            continue
        if tool.access != "read" and not WRITE_TOOLS_ENABLED:
            results.append({"tool": name, "success": False, "error": {"code": "WRITE_DISABLED", "message": "Write tools are disabled."}})
            continue
        try:
            results.append({"tool": name, "access": tool.access, "success": True, "result": tool.execute(context, input_data)})
        except Exception:
            results.append({"tool": name, "access": tool.access, "success": False, "error": {"code": "UNAVAILABLE", "message": "Jarvis could not complete that approved tool right now."}})
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


def get_system_status_tool(_context: AssistantToolContext, _input: dict[str, Any]) -> dict[str, Any]:
    # Import here to keep status route initialization independent of the tool registry.
    from backend.routes.status import get_status

    status = get_status()
    checks = status.get("checks") or []
    red = [check for check in checks if check.get("state") == "offline"]
    return {
        "systems": status.get("systems"),
        "checked_at": status.get("checked_at"),
        "uptime_seconds": status.get("uptime_seconds"),
        "all_green": not red,
        "red_checks": red,
        "checks": checks,
    }


def search_live_prices_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    return search_live_prices(
        str(input_data.get("query") or ""), str(input_data.get("location") or "") or None,
        _context.user_id, str(input_data.get("retailer") or "") or None,
    )


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


def get_schedule_for_date_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    offset = int(input_data.get("date_offset") or 0)
    label = str(input_data.get("label") or "that day")
    target_date = datetime.now(LOCAL_TZ).date() + timedelta(days=offset)
    events = get_calendar_events_for_date(target_date)
    return {
        "date": target_date.isoformat(),
        "label": label,
        "events": [
            {
                "title": event.get("summary"),
                "start": event.get("start"),
                "end": event.get("end"),
                "location": event.get("location"),
            }
            for event in events[:10]
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


def log_goal_progress_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    goal_query = str(input_data.get("goal_query") or "").strip()
    goal = find_best_goal(context.user_id, goal_query)
    if not goal:
        return {"updated": False, "reason": "No matching goal found.", "goal_query": goal_query}

    today = datetime.now(LOCAL_TZ).date().isoformat()
    payload = GoalLogCreate(
        value=float(input_data.get("value") or 1),
        notes=str(input_data.get("notes") or f"Logged from Jarvis: {goal_query}").strip(),
        log_type=str(input_data.get("log_type") or "progress"),
        planned_for=str(input_data.get("planned_for") or today),
        metadata={
            "source": "jarvis",
            "session_id": context.session_id,
            "request_id": context.request_id,
            "goal_query": goal_query,
        },
    )
    result = create_goal_log(goal["id"], payload)
    updated_goal = (result or {}).get("goal") or get_goal(goal["id"])
    return {
        "updated": bool(result),
        "goal": summarize_goal(updated_goal or goal),
        "log": summarize_goal_log((result or {}).get("log")),
    }


def add_shopping_item_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    item_name = clean_sentence(str(input_data.get("item_name") or ""))
    source_result_id = str(input_data.get("source_result_id") or "").strip()
    if source_result_id:
        from backend.assistant.conversation_state import CONVERSATION_STATE_STORE
        from backend.assistant.planner import latest_price_comparison
        comparison = latest_price_comparison(CONVERSATION_STATE_STORE.get(context.conversation_id))
        source = next((item for item in ((comparison.data.get("results") or []) if comparison else []) if item.get("result_id") == source_result_id and item.get("verified")), None)
        if not source:
            return {"updated": False, "reason": "The referenced verified price result is missing or expired."}
        item_name = clean_sentence(str(source.get("product_name") or ""))
    if not item_name:
        return {"updated": False, "reason": "No item name supplied."}
    lists = list_shopping_lists(context.user_id)
    requested_list_id = str(input_data.get("shopping_list_id") or "").strip()
    shopping_list = next((item for item in lists if str(item.get("id")) == requested_list_id), None) if requested_list_id else None
    if requested_list_id and not shopping_list:
        return {"updated": False, "needs_input": True, "question": "I couldn't verify that shopping list. Which existing list should I use?", "options": summarize_shopping_list_options(lists)}
    if not requested_list_id:
        if not lists:
            return {"updated": False, "needs_input": True, "question": f"You don't have a shopping list yet. What should I call the new list before I add {item_name}?", "options": [{"action": "create", "title": "Create a new shopping list"}]}
        return {"updated": False, "needs_input": True, "question": f"Which shopping list should I add {item_name} to?", "options": summarize_shopping_list_options(lists)}
    shopping_list = get_shopping_list(shopping_list["id"]) or shopping_list
    item = add_shopping_list_item(
        ShoppingListItemCreate(
            shopping_list_id=shopping_list["id"],
            item_name=item_name,
            quantity=input_data.get("quantity"),
            category=input_data.get("category"),
            source="jarvis",
        )
    )
    return {"updated": True, "shopping_list": {"id": shopping_list.get("id"), "title": shopping_list.get("title")}, "item": summarize_shopping_item(item)}


def summarize_shopping_list_options(lists: list[dict]) -> list[dict[str, str]]:
    return [{"id": str(item.get("id")), "title": str(item.get("title") or "Untitled list")} for item in lists[:8] if item.get("id")]


def create_shopping_list_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    title = clean_sentence(str(input_data.get("title") or ""))
    if not title:
        return {"updated": False, "needs_input": True, "question": "What should I call the new shopping list?"}
    shopping_list = create_shopping_list(ShoppingListCreate(user_id=context.user_id, title=title))
    return {"updated": bool(shopping_list), "shopping_list": {"id": shopping_list.get("id"), "title": shopping_list.get("title")}}


def add_meal_plan_item_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    meal_date = str(input_data.get("meal_date") or date.today().isoformat())
    meal_type = normalize_meal_type(str(input_data.get("meal_type") or "snack"))
    name = clean_sentence(str(input_data.get("custom_meal_name") or ""))
    recipe_id = str(input_data.get("recipe_id") or "").strip() or None
    if not name and not recipe_id:
        return {"updated": False, "needs_input": True, "question": "What food or recipe should I add to the meal plan?"}
    meal = create_meal_plan_entry(MealPlanEntryCreate(
        user_id=context.user_id, meal_date=meal_date, meal_type=meal_type,
        custom_meal_name=name or None, recipe_id=recipe_id, notes=input_data.get("notes"),
    ))
    return {"updated": bool(meal), "meal": summarize_meal(meal)}


def add_food_vault_item_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    name = clean_sentence(str(input_data.get("name") or ""))
    if not name:
        return {"updated": False, "needs_input": True, "question": "What food should I add to the Food Vault?"}
    required = [key for key in ("calories", "protein_g", "carbs_g", "fat_g") if input_data.get(key) is None]
    if required:
        return {"updated": False, "needs_input": True, "question": "Before I create that Food Vault item, give me calories, protein, carbs, and fat.", "missing_entities": required}
    item = create_food_vault_item(FoodVaultItemCreate(
        user_id=context.user_id, name=name, brand=input_data.get("brand"), serving_size=input_data.get("serving_size"),
        calories=input_data.get("calories"), protein_g=input_data.get("protein_g"), carbs_g=input_data.get("carbs_g"), fat_g=input_data.get("fat_g"),
        package_quantity=input_data.get("package_quantity", 1), current_quantity=input_data.get("current_quantity", 0),
        low_stock_threshold=input_data.get("low_stock_threshold", 0), estimated_price=input_data.get("estimated_price"),
        default_store=input_data.get("default_store"), shopping_category=input_data.get("shopping_category"), notes=input_data.get("notes"),
        is_favorite=bool(input_data.get("is_favorite", False)),
    ))
    return {"updated": bool(item), "food_vault_item": summarize_food_vault_item(item)}


def find_food_vault_matches_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    query = clean_sentence(str(input_data.get("query") or ""))
    def food_tokens(value: str) -> set[str]:
        normalized = re.sub(r"(?i)\b(?:reece|reeces|reese|reeses)\b", "reese", value.replace("’", "'").replace("'s", "s"))
        return {token for token in re.findall(r"[a-z0-9]+", normalized.lower()) if len(token) > 2}

    tokens = food_tokens(query)
    matches = []
    minimum_score = max(1, (len(tokens) + 1) // 2)
    for item in list_food_vault_items(context.user_id):
        haystack = " ".join(str(item.get(key) or "") for key in ("brand", "name", "serving_size")).lower()
        item_tokens = food_tokens(haystack)
        score = len(tokens & item_tokens)
        if score >= minimum_score:
            matches.append((score, item))
    matches.sort(key=lambda pair: (-pair[0], str(pair[1].get("name") or "")))
    options = [summarize_food_vault_item(item) for _, item in matches[:6]]
    if options:
        names = ", ".join(str(item.get("name")) for item in options)
        question = f"I found these verified Food Vault matches: {names}. Did you mean one of those, or should I create a new item?"
    else:
        question = f"I couldn't find {query} in the Food Vault. Should I create a new item? If yes, I'll need name, calories, protein, carbs, and fat. Other fields are optional."
    return {"verified": True, "query": query, "matches": options, "needs_input": True, "question": question, "options": options + [{"action": "create", "name": "Create a new item"}]}


def add_recipe_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    title = clean_sentence(str(input_data.get("title") or ""))
    if not title:
        return {"updated": False, "needs_input": True, "question": "What should I call the recipe?"}
    recipe = create_recipe(RecipeCreate(
        user_id=context.user_id, title=title, source_type="manual", source_url=input_data.get("source_url"),
        description=input_data.get("description"), instructions=input_data.get("instructions"), servings=input_data.get("servings"),
        ingredients=input_data.get("ingredients") or [],
    ))
    return {"updated": bool(recipe), "recipe": summarize_recipe(recipe)}


def get_recent_price_comparison_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    from backend.assistant.conversation_state import CONVERSATION_STATE_STORE
    from backend.assistant.planner import latest_price_comparison

    state = CONVERSATION_STATE_STORE.get(context.conversation_id)
    comparison = latest_price_comparison(state)
    requested_id = str(input_data.get("comparison_id") or "")
    if not comparison or (requested_id and requested_id != comparison.result_id):
        return {"verified": False, "stale": True, "reason": "The verified price comparison is missing or expired."}
    results = [item for item in comparison.data.get("results") or [] if item.get("verified")]
    selection = str(input_data.get("selection") or "").lower()
    requested_size = str(input_data.get("size") or "").lower()
    if requested_size:
        size_number = re.search(r"\d+(?:\.\d+)?", requested_size)
        if size_number:
            results = [item for item in results if size_number.group() in str(item.get("size") or "")]
    if selection in {"list_walmart", "list_kroger"}:
        retailer = selection.removeprefix("list_")
        matches = [item for item in results if str(item.get("retailer") or "").lower() == retailer]
        return {"verified": bool(matches), "comparison_id": comparison.result_id, "results": matches, "selected": None, "verified_at": comparison.verified_at.isoformat(), "expires_at": comparison.expires_at.isoformat() if comparison.expires_at else None}
    if selection in {"walmart", "kroger"}:
        matches = [item for item in results if str(item.get("retailer") or "").lower() == selection]
        if not matches:
            return {"verified": False, "reason": f"No verified {selection.title()} result exists in that comparison."}
        if len(matches) != 1:
            return {"verified": False, "ambiguous": True, "reason": f"There are multiple verified {selection.title()} sizes. Which size do you mean?"}
        selected = matches[0]
    elif selection == "cheapest":
        if not results:
            return {"verified": False, "reason": "No verified results exist."}
        sizes = {str(item.get("size") or "size not listed").lower() for item in results}
        if len(sizes) != 1:
            return {"verified": False, "ambiguous": True, "reason": "The verified results have different sizes. Which size should I compare?"}
        low = min(item["price"] for item in results)
        matches = [item for item in results if item["price"] == low]
        if len(matches) != 1:
            return {"verified": False, "ambiguous": True, "reason": "The cheapest verified result is tied."}
        selected = matches[0]
    else:
        selected = None
    return {"verified": True, "comparison_id": comparison.result_id, "results": results, "selected": selected, "verified_at": comparison.verified_at.isoformat(), "expires_at": comparison.expires_at.isoformat() if comparison.expires_at else None}


def remove_shopping_item_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    record_id = str(input_data.get("record_id") or "")
    deleted = delete_shopping_list_item(record_id) if record_id else None
    return {"updated": bool(deleted), "deleted_record_id": record_id, "record_type": "shopping_item"}


def remove_shopping_list_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    record_id = str(input_data.get("record_id") or "")
    deleted = delete_shopping_list(record_id) if record_id else None
    return {"updated": bool(deleted), "deleted_record_id": record_id, "record_type": "shopping_list"}


def remove_meal_plan_item_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    record_id = str(input_data.get("record_id") or "")
    deleted = delete_meal_plan_entry(record_id) if record_id else None
    return {"updated": bool(deleted), "deleted_record_id": record_id, "record_type": "meal"}


def remove_food_vault_item_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    record_id = str(input_data.get("record_id") or "")
    deleted = delete_food_vault_item(record_id) if record_id else None
    return {"updated": bool(deleted), "deleted_record_id": record_id, "record_type": "food_vault_item"}


def remove_recipe_tool(_context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    record_id = str(input_data.get("record_id") or "")
    deleted = delete_recipe(record_id) if record_id else None
    return {"updated": bool(deleted), "deleted_record_id": record_id, "record_type": "recipe"}


def check_shopping_item_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    item_query = clean_sentence(str(input_data.get("item_query") or ""))
    shopping_list = find_default_shopping_list(context.user_id)
    if not shopping_list:
        return {"updated": False, "reason": "No shopping list found."}
    item = find_best_shopping_item(shopping_list, item_query)
    if not item:
        return {"updated": False, "reason": "No matching shopping item found.", "item_query": item_query}
    updated = update_shopping_list_item(item["id"], ShoppingListItemUpdate(is_checked=True))
    return {"updated": bool(updated), "shopping_list": {"id": shopping_list.get("id"), "title": shopping_list.get("title")}, "item": summarize_shopping_item(updated or item)}


def log_health_event_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    event_type = clean_sentence(str(input_data.get("event_type") or ""))
    if not event_type:
        return {
            "updated": False,
            "needs_input": True,
            "question": "What symptom should I log, and how severe is it if you want that included?",
        }
    event = create_health_event(
        HealthEventCreate(
            user_id=context.user_id,
            event_type=event_type,
            severity=input_data.get("severity"),
            notes=str(input_data.get("notes") or "").strip() or None,
            context={"source": "jarvis", "request_id": context.request_id},
        )
    )
    return {"updated": True, "event": {"id": event.get("id"), "event_type": event.get("event_type"), "event_date": event.get("event_date"), "notes": event.get("notes")}}


def upsert_health_checkin_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    today = datetime.now(LOCAL_TZ).date().isoformat()
    payload = HealthDailyCheckinUpsert(
        user_id=context.user_id,
        checkin_date=str(input_data.get("checkin_date") or today),
        water_oz=input_data.get("water_oz"),
        caffeine_mg=input_data.get("caffeine_mg"),
        notes=input_data.get("notes"),
        source_data={"source": "jarvis", "request_id": context.request_id},
    )
    checkin = upsert_daily_checkin(payload)
    return {"updated": True, "checkin": {"id": checkin.get("id"), "checkin_date": checkin.get("checkin_date"), "water_oz": checkin.get("water_oz"), "caffeine_mg": checkin.get("caffeine_mg")}}


def complete_daily_checkin_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    allowed_fields = {
        "energy",
        "mood",
        "stress",
        "sleep_quality",
        "hours_slept",
        "water_oz",
        "caffeine_mg",
        "workout_completed",
        "meals_completed",
        "notes",
    }
    supplied = {key: value for key, value in input_data.items() if key in allowed_fields and value is not None}
    if not supplied:
        return {
            "updated": False,
            "needs_input": True,
            "question": "Give me any check-in fields you want saved: energy, mood, stress, sleep quality, hours slept, water ounces, caffeine mg, workout completed, meals completed, and notes.",
        }
    today = datetime.now(LOCAL_TZ).date().isoformat()
    payload = HealthDailyCheckinUpsert(
        user_id=context.user_id,
        checkin_date=str(input_data.get("checkin_date") or today),
        energy=input_data.get("energy"),
        mood=input_data.get("mood"),
        stress=input_data.get("stress"),
        sleep_quality=input_data.get("sleep_quality"),
        hours_slept=input_data.get("hours_slept"),
        water_oz=input_data.get("water_oz"),
        caffeine_mg=input_data.get("caffeine_mg"),
        workout_completed=input_data.get("workout_completed"),
        meals_completed=input_data.get("meals_completed"),
        notes=input_data.get("notes"),
        source_data={"source": "jarvis", "request_id": context.request_id},
    )
    checkin = upsert_daily_checkin(payload)
    return {"updated": True, "checkin": summarize_checkin(checkin)}


def create_goal_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    title = clean_sentence(str(input_data.get("title") or ""))
    category = clean_sentence(str(input_data.get("category") or ""))
    goal_type = clean_sentence(str(input_data.get("goal_type") or ""))
    missing = []
    if not title:
        missing.append("title")
    if not category:
        missing.append("category")
    if not goal_type:
        missing.append("goal type")
    if missing:
        return {
            "updated": False,
            "needs_input": True,
            "question": "I can create that goal. Tell me the title, category, goal type, target value if it has one, unit, and frequency if it repeats.",
            "missing": missing,
        }
    goal = create_goal(
        GoalCreate(
            user_id=context.user_id,
            title=title,
            description=input_data.get("description"),
            category=category,
            goal_type=goal_type,
            target_value=input_data.get("target_value"),
            unit=input_data.get("unit"),
            frequency=input_data.get("frequency"),
            mission_type=input_data.get("mission_type") or infer_mission_type(goal_type, input_data.get("frequency")),
            metadata={"source": "jarvis", "request_id": context.request_id},
        )
    )
    return {"updated": True, "goal": summarize_goal(goal)}


def complete_meal_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    meal_type = normalize_meal_type(str(input_data.get("meal_type") or ""))
    meal_id = str(input_data.get("meal_id") or "")
    confirmation_id = str(input_data.get("confirmation_id") or "")
    if not meal_type or not meal_id or not confirmation_id or confirmation_id != context.confirmed_action_id:
        return {"updated": False, "reason": "A current server-validated meal confirmation is required."}
    today = datetime.now(LOCAL_TZ).date().isoformat()
    meals = list_meal_plan_entries(context.user_id, today, today)
    meal = next(
        (
            candidate
            for candidate in meals
            if str(candidate.get("id") or "") == meal_id
            and str(candidate.get("meal_date") or "") == today
            and normalize_meal_type(str(candidate.get("meal_type") or "")) == meal_type
        ),
        None,
    )
    if not meal:
        return {"updated": False, "reason": f"I could not verify that planned {meal_type} for today."}
    meta = meal_meta(meal)
    if meta.get("completed"):
        return {"updated": True, "already_done": True, "meal": summarize_meal(meal)}
    meta.update({"completed": True, "completed_at": datetime.now(LOCAL_TZ).isoformat(), "completed_by": "jarvis"})
    updated = update_meal_plan_entry(meal["id"], MealPlanEntryUpdate(notes=build_meal_notes(meta)))
    return {"updated": bool(updated), "meal": summarize_meal(updated or meal)}


def log_caffeine_drink_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    drink = str(input_data.get("drink") or "Red Bull")
    size_oz = input_data.get("size_oz")
    if size_oz is None:
        return {"updated": False, "needs_input": True, "question": f"What size was the {drink}? For Red Bull, 8.4 oz, 12 oz, 16 oz, or 20 oz works."}
    nutrition = red_bull_nutrition(float(size_oz))
    today = datetime.now(LOCAL_TZ).date().isoformat()
    checkin = upsert_daily_checkin(
        HealthDailyCheckinUpsert(
            user_id=context.user_id,
            checkin_date=today,
            caffeine_mg=nutrition["caffeine_mg"],
            notes=f"Logged {nutrition['label']}.",
            source_data={
                "source": "jarvis",
                "caffeine_items": [{"name": nutrition["label"], "size_oz": nutrition["size_oz"]}],
                "caffeine_nutrition": {"calories": nutrition["calories"], "protein_g": 0, "carbs_g": nutrition["carbs_g"], "fat_g": 0},
            },
        )
    )
    create_meal_plan_entry(
        MealPlanEntryCreate(
            user_id=context.user_id,
            meal_date=today,
            meal_type="snack",
            custom_meal_name=nutrition["label"],
            notes=build_meal_notes({
                "source": "caffeine",
                "note": "Logged by Jarvis.",
                "calories": nutrition["calories"],
                "protein_g": 0,
                "carbs_g": nutrition["carbs_g"],
                "fat_g": 0,
                "caffeine_mg": nutrition["caffeine_mg"],
                "completed": True,
                "completed_at": datetime.now(LOCAL_TZ).isoformat(),
                "servings": 1,
            }),
        )
    )
    return {"updated": True, "drink": nutrition, "checkin": summarize_checkin(checkin)}


def complete_forge_project_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    project_query = clean_sentence(str(input_data.get("project_query") or ""))
    project = find_best_forge_project(context.user_id, project_query)
    if not project:
        return {"updated": False, "reason": "No matching Forge project found.", "project_query": project_query}
    updated = update_forge_project(project["id"], ForgeProjectUpdate(status="Archived", progress_percent=100))
    return {"updated": bool(updated), "project": summarize_forge_project(updated or project)}


def complete_forge_task_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    task_query = clean_sentence(str(input_data.get("task_query") or ""))
    task = find_best_forge_task(context.user_id, task_query)
    if not task:
        return {"updated": False, "reason": "No matching Forge task found.", "task_query": task_query}
    updated = update_forge_task(task["id"], ForgeTaskUpdate(status="Done", completed_at=datetime.now(LOCAL_TZ).isoformat()))
    return {"updated": bool(updated), "task": summarize_forge_task(updated or task)}


def capture_forge_spark_tool(context: AssistantToolContext, input_data: dict[str, Any]) -> dict[str, Any]:
    spark_text = clean_sentence(str(input_data.get("spark_text") or ""))
    if not spark_text:
        return {"updated": False, "reason": "No spark text supplied."}
    spark = create_forge_spark(ForgeSparkCreate(user_id=context.user_id, spark_text=spark_text, category=input_data.get("category"), tags=["jarvis"]))
    return {"updated": True, "spark": {"id": spark.get("id"), "spark_text": spark.get("spark_text"), "category": spark.get("category")}}


def find_best_goal(user_id: str, query: str) -> dict | None:
    goals = list_goals(user_id, active_only=True)
    normalized_query = query.strip().lower()
    if normalized_query in {"date", "dating"}:
        date_goal = best_match(goals, "date", ["title"])
        if date_goal:
            return date_goal
    return best_match(goals, query, ["title", "category", "description"])


def find_best_forge_project(user_id: str, query: str) -> dict | None:
    return best_match(list_forge_projects(user_id), query, ["title", "category", "summary", "next_milestone"])


def find_best_forge_task(user_id: str, query: str) -> dict | None:
    tasks = [task for task in list_forge_tasks(user_id) if str(task.get("status") or "").lower() not in {"done", "complete", "completed"}]
    return best_match(tasks, query, ["title", "description", "milestone_group"])


def find_default_shopping_list(user_id: str) -> dict | None:
    lists = list_shopping_lists(user_id)
    if not lists:
        return None
    preferred = next((row for row in lists if "week of" in str(row.get("title") or "").lower()), lists[0])
    return get_shopping_list(preferred["id"]) or preferred


def find_best_shopping_item(shopping_list: dict, query: str) -> dict | None:
    items = shopping_list.get("items") or []
    return best_match(items, query, ["item_name", "category"])


def meal_meta(entry: dict) -> dict[str, Any]:
    notes = entry.get("notes") or ""
    if isinstance(notes, str) and notes.startswith("JARVIS_META:"):
        try:
            import json

            return json.loads(notes.replace("JARVIS_META:", "", 1))
        except Exception:
            return {}
    return {
        "source": "recipe" if entry.get("recipe_id") else "custom",
        "note": notes or None,
        "completed": False,
        "completed_at": None,
        "servings": 1,
    }


def build_meal_notes(meta: dict[str, Any]) -> str:
    import json

    return f"JARVIS_META:{json.dumps(meta)}"


def normalize_meal_type(value: str) -> str:
    text = value.strip().lower()
    if text in {"breakfast", "lunch", "dinner"}:
        return text
    if text.startswith("snack"):
        return "snack"
    return ""


def summarize_meal(meal: dict | None) -> dict | None:
    if not meal:
        return None
    meta = meal_meta(meal)
    return {
        "id": meal.get("id"),
        "meal_date": meal.get("meal_date"),
        "meal_type": meal.get("meal_type"),
        "name": meal.get("custom_meal_name") or (meal.get("recipes") or {}).get("title"),
        "completed": bool(meta.get("completed")),
    }


def summarize_checkin(checkin: dict | None) -> dict | None:
    if not checkin:
        return None
    return {
        "id": checkin.get("id"),
        "checkin_date": checkin.get("checkin_date"),
        "energy": checkin.get("energy"),
        "mood": checkin.get("mood"),
        "stress": checkin.get("stress"),
        "sleep_quality": checkin.get("sleep_quality"),
        "hours_slept": checkin.get("hours_slept"),
        "water_oz": checkin.get("water_oz"),
        "caffeine_mg": checkin.get("caffeine_mg"),
        "workout_completed": checkin.get("workout_completed"),
        "meals_completed": checkin.get("meals_completed"),
    }


def parse_checkin_fields(text: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    patterns = {
        "energy": r"\benergy\s*(?:is|was|:)?\s*(\d{1,2})\b",
        "mood": r"\bmood\s*(?:is|was|:)?\s*(\d{1,2})\b",
        "stress": r"\bstress\s*(?:is|was|:)?\s*(\d{1,2})\b",
        "sleep_quality": r"\bsleep quality\s*(?:is|was|:)?\s*(\d{1,2})\b",
        "hours_slept": r"\b(?:slept|sleep)\s*(?:for)?\s*(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)\b",
        "water_oz": r"\bwater\s*(?:is|was|:)?\s*(\d+(?:\.\d+)?)\s*(?:oz|ounces)?\b",
        "caffeine_mg": r"\bcaffeine\s*(?:is|was|:)?\s*(\d+(?:\.\d+)?)\s*(?:mg)?\b",
        "meals_completed": r"\b(?:meals completed|ate)\s*(?:is|was|:)?\s*(\d{1,2})\b",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            value = float(match.group(1))
            fields[key] = int(value) if value.is_integer() else value
    if "workout" in text:
        if any(word in text for word in ["yes", "done", "completed", "did"]):
            fields["workout_completed"] = True
        elif any(word in text for word in ["no", "missed", "skipped"]):
            fields["workout_completed"] = False
    return fields


def parse_goal_create_fields(text: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    title_match = re.search(r"(?:called|named|title)\s+['\"]?([^,'\".]+)", text, re.IGNORECASE)
    category_match = re.search(r"\bcategory\s+['\"]?([a-zA-Z ]+?)(?:,|\.|\s+type|\s+target|\s+frequency|$)", text, re.IGNORECASE)
    type_match = re.search(r"\b(?:type|goal type)\s+([a-zA-Z_]+)", text, re.IGNORECASE)
    target_match = re.search(r"\btarget\s+(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    unit_match = re.search(r"\bunit\s+([a-zA-Z]+)", text, re.IGNORECASE)
    frequency_match = re.search(r"\b(daily|weekly|monthly)\b", text, re.IGNORECASE)
    if title_match:
        fields["title"] = clean_sentence(title_match.group(1))
    if category_match:
        fields["category"] = clean_sentence(category_match.group(1))
    if type_match:
        fields["goal_type"] = clean_sentence(type_match.group(1)).lower()
    if target_match:
        fields["target_value"] = float(target_match.group(1))
    if unit_match:
        fields["unit"] = clean_sentence(unit_match.group(1))
    if frequency_match:
        fields["frequency"] = frequency_match.group(1).lower()
    return fields


def parse_caffeine_drink_fields(text: str, drink: str) -> dict[str, Any]:
    fields: dict[str, Any] = {"drink": drink}
    size_match = re.search(r"\b(8\.4|12|16|20)\s*(?:oz|ounce|ounces)?\b", text)
    if size_match:
        fields["size_oz"] = float(size_match.group(1))
    return fields


def red_bull_nutrition(size_oz: float) -> dict[str, Any]:
    known = {
        8.4: {"caffeine_mg": 80, "calories": 110, "carbs_g": 28},
        12.0: {"caffeine_mg": 114, "calories": 160, "carbs_g": 39},
        16.0: {"caffeine_mg": 151, "calories": 220, "carbs_g": 54},
        20.0: {"caffeine_mg": 189, "calories": 270, "carbs_g": 66},
    }
    closest = min(known, key=lambda item: abs(item - size_oz))
    values = known[closest]
    return {"label": f"{closest:g} oz Red Bull", "size_oz": closest, **values}


def infer_mission_type(goal_type: str | None, frequency: str | None) -> str:
    if frequency:
        return "standard"
    if (goal_type or "").lower() in {"habit", "count", "binary"}:
        return "standard"
    return "objective"


def best_match(rows: list[dict], query: str, fields: list[str]) -> dict | None:
    query_tokens = tokenize(query)
    if not query_tokens:
        return None
    best_row = None
    best_score = 0
    for row in rows:
        score = 0
        for index, field in enumerate(fields):
            field_value = str(row.get(field) or "").lower()
            field_tokens = tokenize(field_value)
            weight = max(1, len(fields) - index)
            score += len(query_tokens & field_tokens) * weight
            if query_tokens and query_tokens <= field_tokens:
                score += weight
        if score > best_score:
            best_score = score
            best_row = row
    return best_row if best_score > 0 else None


def infer_health_event_type(text: str) -> str | None:
    event_keywords = {
        "headache": "headache",
        "brain fog": "brain_fog",
        "foggy": "brain_fog",
        "forgot": "forgetfulness",
        "forgetfulness": "forgetfulness",
        "lightheaded": "lightheaded",
        "dizzy": "lightheaded",
        "heart flutter": "heart_flutter",
        "flutter": "heart_flutter",
        "diarrhea": "diarrhea",
        "deep breath": "deep_breath_awareness",
    }
    if not any(prefix in text for prefix in ["log", "record", "had", "have", "having", "felt", "feeling"]):
        return None
    for keyword, event_type in event_keywords.items():
        if keyword in text:
            return event_type
    return None


def clean_sentence(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip(" .!?;:\"'")).strip()


def clean_title_case(value: str) -> str:
    cleaned = clean_sentence(value)
    return " ".join(part.capitalize() for part in cleaned.split())


def tokenize(value: str) -> set[str]:
    stop_words = {"a", "an", "and", "as", "for", "i", "my", "of", "on", "the", "to", "with"}
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if token not in stop_words}


def summarize_goal(goal: dict | None) -> dict | None:
    if not goal:
        return None
    return {
        "id": goal.get("id"),
        "title": goal.get("title"),
        "status": goal.get("status"),
        "current_value": goal.get("current_value"),
        "target_value": goal.get("target_value"),
        "progress": goal.get("progress"),
        "standard": goal.get("standard"),
    }


def summarize_goal_log(log: dict | None) -> dict | None:
    if not log:
        return None
    return {"id": log.get("id"), "value": log.get("value"), "log_type": log.get("log_type"), "notes": log.get("notes"), "planned_for": log.get("planned_for")}


def summarize_shopping_item(item: dict | None) -> dict | None:
    if not item:
        return None
    return {"id": item.get("id"), "name": item.get("item_name"), "quantity": item.get("quantity"), "category": item.get("category"), "checked": item.get("is_checked")}


def summarize_food_vault_item(item: dict | None) -> dict | None:
    if not item:
        return None
    return {key: item.get(key) for key in ("id", "name", "brand", "serving_size", "current_quantity") if item.get(key) is not None}


def summarize_recipe(recipe: dict | None) -> dict | None:
    if not recipe:
        return None
    return {"id": recipe.get("id"), "title": recipe.get("title"), "servings": recipe.get("servings"), "ingredient_count": len(recipe.get("ingredients") or [])}


def summarize_forge_project(project: dict | None) -> dict | None:
    if not project:
        return None
    return {"id": project.get("id"), "title": project.get("title"), "status": project.get("status"), "progress_percent": project.get("progress_percent")}


def summarize_forge_task(task: dict | None) -> dict | None:
    if not task:
        return None
    return {"id": task.get("id"), "title": task.get("title"), "status": task.get("status"), "completed_at": task.get("completed_at")}


TOOL_REGISTRY: dict[str, AssistantToolDefinition] = {
    "search_live_prices": AssistantToolDefinition("search_live_prices", "Search configured live retail providers for current prices; refuses unsourced price claims.", 1, "read", False, search_live_prices_tool, "verified_provider_result"),
    "get_recent_price_comparison": AssistantToolDefinition("get_recent_price_comparison", "Read a fresh verified price comparison from bounded conversation state.", 1, "read", False, get_recent_price_comparison_tool, "verified_provider_result"),
    "find_food_vault_matches": AssistantToolDefinition("find_food_vault_matches", "Find verified Food Vault matches before creating or planning a food item.", 1, "read", False, find_food_vault_matches_tool, "internal_record"),
    "get_system_status": AssistantToolDefinition("get_system_status", "Run the live Jarvis ping/health checks and report every red (offline) service.", 1, "read", False, get_system_status_tool),
    "get_morning_brief": AssistantToolDefinition("get_morning_brief", "Get today's sanitized morning brief.", 1, "read", False, get_morning_brief_tool),
    "get_daily_debrief": AssistantToolDefinition("get_daily_debrief", "Get today's sanitized daily debrief summary.", 1, "read", False, get_daily_debrief_tool),
    "get_today_schedule": AssistantToolDefinition("get_today_schedule", "Get today's calendar schedule.", 1, "read", False, get_today_schedule_tool),
    "get_schedule_for_date": AssistantToolDefinition("get_schedule_for_date", "Get calendar schedule for a requested date offset.", 1, "read", False, get_schedule_for_date_tool),
    "list_active_goals": AssistantToolDefinition("list_active_goals", "List active Jarvis goals.", 1, "read", False, list_active_goals_tool),
    "get_goal": AssistantToolDefinition("get_goal", "Get one goal by server-approved ID.", 1, "read", False, get_goal_tool),
    "list_shopping_items": AssistantToolDefinition("list_shopping_items", "List current shopping list items.", 1, "read", False, list_shopping_items_tool),
    "list_active_forge_projects": AssistantToolDefinition("list_active_forge_projects", "List active Forge projects.", 1, "read", False, list_active_forge_projects_tool),
    "get_today_workout": AssistantToolDefinition("get_today_workout", "Get today's workout and next workout context.", 1, "read", False, get_today_workout_tool),
    "get_recent_health_summary": AssistantToolDefinition("get_recent_health_summary", "Get recent health dashboard summary.", 1, "read", False, get_recent_health_summary_tool),
    "log_goal_progress": AssistantToolDefinition("log_goal_progress", "Log progress against the best matching active goal.", 2, "write", False, log_goal_progress_tool),
    "add_shopping_item": AssistantToolDefinition("add_shopping_item", "Add an item to the current shopping list.", 2, "write", False, add_shopping_item_tool),
    "create_shopping_list": AssistantToolDefinition("create_shopping_list", "Create a named shopping list.", 2, "write", False, create_shopping_list_tool),
    "add_meal_plan_item": AssistantToolDefinition("add_meal_plan_item", "Add a food or recipe to a dated meal-plan slot; defaults an explicitly requested snack to today.", 2, "write", False, add_meal_plan_item_tool),
    "add_food_vault_item": AssistantToolDefinition("add_food_vault_item", "Add a named food to the Food Vault without inventing nutrition data.", 2, "write", False, add_food_vault_item_tool),
    "add_recipe": AssistantToolDefinition("add_recipe", "Create a recipe record from supplied recipe fields.", 2, "write", False, add_recipe_tool),
    "remove_shopping_item": AssistantToolDefinition("remove_shopping_item", "Remove one exact shopping item as a bounded undo.", 3, "write", False, remove_shopping_item_tool),
    "remove_shopping_list": AssistantToolDefinition("remove_shopping_list", "Remove one exact shopping list as a bounded undo.", 3, "write", False, remove_shopping_list_tool),
    "remove_meal_plan_item": AssistantToolDefinition("remove_meal_plan_item", "Remove one exact meal-plan entry as a bounded undo.", 3, "write", False, remove_meal_plan_item_tool),
    "remove_food_vault_item": AssistantToolDefinition("remove_food_vault_item", "Remove one exact Food Vault item as a bounded undo.", 3, "write", False, remove_food_vault_item_tool),
    "remove_recipe": AssistantToolDefinition("remove_recipe", "Remove one exact recipe as a bounded undo.", 3, "write", False, remove_recipe_tool),
    "check_shopping_item": AssistantToolDefinition("check_shopping_item", "Check off an item on the current shopping list.", 2, "write", False, check_shopping_item_tool),
    "log_health_event": AssistantToolDefinition("log_health_event", "Log a health symptom/event.", 2, "write", False, log_health_event_tool),
    "upsert_health_checkin": AssistantToolDefinition("upsert_health_checkin", "Update today's health check-in values.", 2, "write", False, upsert_health_checkin_tool),
    "complete_daily_checkin": AssistantToolDefinition("complete_daily_checkin", "Complete or update today's daily health check-in.", 2, "write", False, complete_daily_checkin_tool),
    "create_goal": AssistantToolDefinition("create_goal", "Create a new Jarvis goal from supplied fields.", 2, "write", False, create_goal_tool),
    "complete_meal": AssistantToolDefinition("complete_meal", "Mark a server-confirmed planned meal eaten.", 2, "write", True, complete_meal_tool),
    "log_caffeine_drink": AssistantToolDefinition("log_caffeine_drink", "Log a caffeine drink with nutrition context.", 2, "write", False, log_caffeine_drink_tool),
    "complete_forge_project": AssistantToolDefinition("complete_forge_project", "Archive/complete a matching Forge project.", 3, "write", False, complete_forge_project_tool),
    "complete_forge_task": AssistantToolDefinition("complete_forge_task", "Mark a matching Forge task complete.", 2, "write", False, complete_forge_task_tool),
    "capture_forge_spark": AssistantToolDefinition("capture_forge_spark", "Capture a Forge spark/idea.", 2, "write", False, capture_forge_spark_tool),
}
