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
    "add_food_vault_item": {"name", "brand", "serving_size", "current_quantity", "shopping_category", "notes"},
    "add_recipe": {"title", "description", "instructions", "servings", "ingredients", "source_url"},
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

    if re.search(r"\badd\b.+\b(?:snack|meal plan|breakfast|lunch|dinner)\b", lower):
        meal_type = next((value for value in ("breakfast", "lunch", "dinner", "snack") if value in lower), "snack")
        name = extract_added_name(message, ("to a snack", "as a snack", "to my meal plan", "for breakfast", "for lunch", "for dinner"))
        if not name:
            return clarification(resolution.intent, "What food or recipe should I add to today's meal plan?")
        return ready(resolution.intent, "add_meal_plan_item", {"meal_date": date.today().isoformat(), "meal_type": meal_type, "custom_meal_name": name})

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
