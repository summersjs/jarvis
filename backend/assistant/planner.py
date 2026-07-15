from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from pydantic import ValidationError

from backend.assistant.conversation_state import LIVE_RESULT_TTL_SECONDS
from backend.assistant.tools.registry import TOOL_REGISTRY
from backend.schemas.conversation import ContextResolution, ConversationState, VerifiedToolResult
from backend.schemas.planner import ToolPlan, ToolPlanStep


TOOL_ARGUMENTS: dict[str, set[str]] = {
    "search_live_prices": {"query", "location", "retailer"},
    "get_recent_price_comparison": {"comparison_id", "retailer", "selection", "size"},
    "add_shopping_item": {"item_name", "quantity", "category", "shopping_list_id", "source_result_id"},
    "create_shopping_list": {"title"},
    "add_meal_plan_item": {"meal_date", "meal_type", "custom_meal_name", "recipe_id", "notes"},
    "find_food_vault_matches": {"query"},
    "add_food_vault_item": {"name", "brand", "serving_size", "calories", "protein_g", "carbs_g", "fat_g", "package_quantity", "current_quantity", "low_stock_threshold", "estimated_price", "default_store", "shopping_category", "notes", "is_favorite"},
    "add_recipe": {"title", "description", "instructions", "servings", "ingredients", "source_url"},
    "remove_shopping_item": {"record_id"},
    "remove_shopping_list": {"record_id"},
    "remove_meal_plan_item": {"record_id"},
    "remove_food_vault_item": {"record_id"},
    "remove_recipe": {"record_id"},
}


def latest_price_comparison(state: ConversationState) -> VerifiedToolResult | None:
    now = datetime.now(timezone.utc)
    return next(
        (
            result for result in reversed(state.last_verified_tool_results)
            if result.tool == "search_live_prices" and (result.expires_at is None or result.expires_at > now)
        ),
        None,
    )


def build_tool_plan(message: str, resolution: ContextResolution, state: ConversationState) -> ToolPlan:
    lower = message.lower()
    entities = state.entities
    if resolution.needs_clarification:
        return ToolPlan(status="clarification_required", intent=resolution.intent, clarification_question=resolution.clarification_question, steps=[])

    if re.search(r"(?i)\b(?:undo that|undo|remove the last one)\b", message):
        now = datetime.now(timezone.utc)
        actions = [action for action in state.recent_actions if action.reversible and action.reverse_tool and action.record_id and (action.expires_at is None or action.expires_at > now)]
        if len(actions) != 1:
            return clarification("undo_last_action", "Which recent action should I undo?" if actions else "There isn't a recent reversible verified action I can safely undo.")
        action = actions[0]
        return ready("undo_last_action", action.reverse_tool, {"record_id": action.record_id})

    if state.pending_clarification and "shopping list" in state.pending_clarification.question.lower():
        create_match = re.search(r"(?i)\b(?:create|new)(?:\s+(?:a|the))?\s+(?:shopping\s+)?list(?:\s+(?:called|named))?\s+(.+)$", message)
        if create_match and entities.product:
            title = create_match.group(1).strip(" .?")
            return ToolPlan(status="ready", intent="add_item_to_new_shopping_list", steps=[
                ToolPlanStep(step_id="1", tool="create_shopping_list", arguments={"title": title}, depends_on=[]),
                ToolPlanStep(step_id="2", tool="add_shopping_item", arguments={"shopping_list_id": "$step1.shopping_list.id", "item_name": entities.product, "quantity": entities.quantity or 1}, depends_on=["1"]),
            ])
        if entities.shopping_list_id and entities.product:
            return ready("add_item_to_shopping_list", "add_shopping_item", {"shopping_list_id": entities.shopping_list_id, "item_name": entities.product, "quantity": entities.quantity or 1})

    if state.pending_clarification and "food vault" in state.pending_clarification.question.lower():
        selected = match_pending_option(message, state.pending_clarification.options)
        if selected:
            return ready("add_existing_food_to_meal_plan", "add_meal_plan_item", {"meal_date": date.today().isoformat(), "meal_type": "snack", "custom_meal_name": selected.get("name") or selected.get("title")})
        if any(phrase in lower for phrase in ("create new", "new one", "make a new")) or nutrition_values(message):
            nutrition = {**{key: getattr(entities, key) for key in ("calories", "protein_g", "carbs_g", "fat_g", "serving_size") if getattr(entities, key) is not None}, **nutrition_values(message)}
            name = nutrition.pop("name", None)
            missing = [label for key, label in (("name", "name"), ("calories", "calories"), ("protein_g", "protein"), ("carbs_g", "carbs"), ("fat_g", "fat")) if (name if key == "name" else nutrition.get(key)) is None]
            if missing:
                return clarification("create_food_vault_snack", "To create the new Food Vault item, give me its " + ", ".join(missing) + ". Serving size, brand, quantity, threshold, store, category, notes, and favorite status are optional.")
            food_args = {"name": name, **nutrition}
            return ToolPlan(status="ready", intent="create_food_vault_snack", steps=[
                ToolPlanStep(step_id="1", tool="add_food_vault_item", arguments=food_args, depends_on=[]),
                ToolPlanStep(step_id="2", tool="add_meal_plan_item", arguments={"meal_date": date.today().isoformat(), "meal_type": "snack", "custom_meal_name": "$step1.food_vault_item.name"}, depends_on=["1"]),
            ])

    if re.search(r"\badd\b.+\b(?:snack|meal plan|breakfast|lunch|dinner)\b", lower):
        meal_type = next((value for value in ("breakfast", "lunch", "dinner", "snack") if value in lower), "snack")
        name = extract_added_name(message, ("to a snack", "as a snack", "to my meal plan", "for breakfast", "for lunch", "for dinner"))
        if not name:
            return clarification(resolution.intent, "What food or recipe should I add to today's meal plan?")
        return ready("resolve_food_vault_meal_item", "find_food_vault_matches", {"query": name})

    if "food vault" in lower and "recipe" not in lower and re.search(r"\b(add|save|put)\b", lower):
        name = extract_added_name(message, ("to the food vault", "to my food vault", "in the food vault", "in my food vault"))
        if not name:
            return clarification(resolution.intent, "What food should I add to the Food Vault?")
        return ready(resolution.intent, "add_food_vault_item", {"name": name})

    if "recipe" in lower and re.search(r"\b(add|save|create)\b", lower):
        title = extract_recipe_title(message)
        if not title:
            return clarification(resolution.intent, "What should I call the recipe?")
        return ready(resolution.intent, "add_recipe", {"title": title})

    reference_add = re.search(r"\badd\s+(?:(\d+|one|two|three)\s+of\s+)?(?:the\s+)?(cheapest|walmart|kroger)(?:\s+one)?\b", lower)
    if reference_add:
        comparison = latest_price_comparison(state)
        if not comparison:
            product = entities.product
            if not product:
                return clarification(resolution.intent, "Which product should I price before adding it?")
            return ToolPlan(status="ready", intent=resolution.intent, steps=[
                ToolPlanStep(step_id="1", tool="search_live_prices", arguments={"query": product, "location": entities.location}, depends_on=[]),
                ToolPlanStep(step_id="2", tool="get_recent_price_comparison", arguments={"comparison_id": "$step1.comparison_id", "selection": reference_add.group(2), "size": entities.size}, depends_on=["1"]),
                ToolPlanStep(step_id="3", tool="add_shopping_item", arguments={"source_result_id": "$step2.selected.result_id", "item_name": "$step2.selected.product_name", "quantity": quantity_value(reference_add.group(1))}, depends_on=["2"]),
            ])
        return ToolPlan(status="ready", intent=resolution.intent, steps=[
            ToolPlanStep(step_id="1", tool="get_recent_price_comparison", arguments={"comparison_id": comparison.result_id, "selection": reference_add.group(2), "size": entities.size}, depends_on=[]),
            ToolPlanStep(step_id="2", tool="add_shopping_item", arguments={"source_result_id": "$step1.selected.result_id", "item_name": "$step1.selected.product_name", "quantity": quantity_value(reference_add.group(1))}, depends_on=["1"]),
        ])

    if any(phrase in lower for phrase in ("which one is cheaper", "which is cheaper", "what did kroger have", "what did walmart have")):
        comparison = latest_price_comparison(state)
        if not comparison:
            return ready(resolution.intent, "search_live_prices", {"query": entities.product or "", "location": entities.location, "retailer": entities.retailer})
        selection = "list_kroger" if "kroger" in lower else "list_walmart" if "walmart" in lower else "cheapest"
        return ready(resolution.intent, "get_recent_price_comparison", {"comparison_id": comparison.result_id, "selection": selection, "size": entities.size})

    return ToolPlan(status="ready", intent=resolution.intent, steps=[])


def validate_tool_plan(plan: ToolPlan) -> ToolPlan:
    for step in plan.steps:
        if step.tool not in TOOL_REGISTRY:
            raise ValueError(f"Unknown tool: {step.tool}")
        allowed = TOOL_ARGUMENTS.get(step.tool)
        if allowed is not None and any(key not in allowed for key in step.arguments):
            raise ValueError(f"Invalid arguments for {step.tool}")
    return plan


def ready(intent: str, tool: str, arguments: dict[str, Any]) -> ToolPlan:
    return ToolPlan(status="ready", intent=intent, steps=[ToolPlanStep(step_id="1", tool=tool, arguments={key: value for key, value in arguments.items() if value is not None}, depends_on=[])])


def clarification(intent: str, question: str) -> ToolPlan:
    return ToolPlan(status="clarification_required", intent=intent, steps=[], clarification_question=question)


def extract_added_name(message: str, suffixes: tuple[str, ...]) -> str:
    value = re.sub(r"(?i)^.*?\b(?:add|save|put)\s+", "", message).strip(" .?")
    for suffix in suffixes:
        value = re.sub(rf"(?i)\s+{re.escape(suffix)}\s*$", "", value).strip(" .?")
    return value


def extract_recipe_title(message: str) -> str:
    value = re.sub(r"(?i)^.*?\b(?:add|save|create)\s+(?:a\s+)?recipe(?:\s+(?:called|named|for))?\s*", "", message).strip(" .?")
    value = re.sub(r"(?i)\s+to\s+(?:my\s+)?(?:recipes|food vault)\s*$", "", value).strip()
    return value


def quantity_value(value: str | None) -> int:
    words = {"one": 1, "two": 2, "three": 3}
    if not value:
        return 1
    return words.get(value, int(value) if value.isdigit() else 1)


def nutrition_values(message: str) -> dict[str, Any]:
    values: dict[str, Any] = {}
    patterns = {
        "calories": r"\b(\d+(?:\.\d+)?)\s*(?:calories|cal)\b",
        "protein_g": r"\b(\d+(?:\.\d+)?)\s*g?\s*protein\b",
        "carbs_g": r"\b(\d+(?:\.\d+)?)\s*g?\s*carbs?\b",
        "fat_g": r"\b(\d+(?:\.\d+)?)\s*g?\s*fat\b",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, message, re.IGNORECASE)
        if match:
            values[key] = float(match.group(1))
    name = re.search(r"(?i)\b(?:name|called)\s+(?:is\s+)?([^,;]+)", message)
    if name:
        values["name"] = name.group(1).strip(" .")
    serving = re.search(r"(?i)\bserving(?: size)?\s+(?:is\s+)?([^,;]+)", message)
    if serving:
        values["serving_size"] = serving.group(1).strip(" .")
    return values


def match_pending_option(message: str, options: list[dict[str, str]]) -> dict[str, str] | None:
    lower = message.lower()
    matches = [option for option in options if str(option.get("name") or option.get("title") or "").lower() in lower or str(option.get("id") or "").lower() == lower.strip()]
    return matches[0] if len(matches) == 1 else None
