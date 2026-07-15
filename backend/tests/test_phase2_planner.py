import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from pydantic import ValidationError

from backend.assistant.planner import build_tool_plan, latest_price_comparison, validate_tool_plan
from backend.assistant.tools.registry import AssistantToolContext, add_food_vault_item_tool, add_meal_plan_item_tool, add_recipe_tool, add_shopping_item_tool, get_recent_price_comparison_tool
from backend.schemas.conversation import ContextResolution, ConversationState, VerifiedToolResult
from backend.schemas.planner import ToolPlan
from backend.services.ollama_service import execute_validated_plan, resolve_step_arguments


def resolved(intent="manage_food", **updates):
    return ContextResolution.model_validate({
        "request_type": "new_request", "intent": intent, "inherit_context": False,
        "entity_updates": updates, "reference_resolution": [], "required_entities": [], "missing_entities": [],
        "requires_tool": True, "operation_type": "write", "needs_clarification": False, "clarification_question": None,
    })


def state_with_prices(*, expired=False, size="20 fl oz"):
    now = datetime.now(timezone.utc)
    return ConversationState(
        conversation_id="phase2-conversation", active_intent="compare_local_prices",
        entities={"product": "Red Bull", "brand": "Red Bull", "size": "20 oz", "location": "Waynesboro, VA"},
        last_verified_tool_results=[VerifiedToolResult(
            tool="search_live_prices", result_id="cmp_123", verified_at=now - timedelta(minutes=2),
            expires_at=now - timedelta(seconds=1) if expired else now + timedelta(minutes=10),
            data={"results": [
                {"result_id": "price_kroger", "retailer": "Kroger", "product_name": "Red Bull", "size": size, "price": 4.29, "verified": True},
                {"result_id": "price_walmart", "retailer": "Walmart", "product_name": "Red Bull", "size": size, "price": 4.48, "verified": True},
            ]},
        )],
    )


class Phase2PlannerTests(unittest.TestCase):
    def test_unknown_tool_is_rejected(self):
        plan = ToolPlan.model_validate({"status": "ready", "intent": "bad", "steps": [{"step_id": "1", "tool": "made_up_tool", "arguments": {}, "depends_on": []}]})
        with self.assertRaises(ValueError):
            validate_tool_plan(plan)

    def test_circular_dependencies_are_rejected(self):
        with self.assertRaises(ValidationError):
            ToolPlan.model_validate({"status": "ready", "intent": "bad", "steps": [
                {"step_id": "1", "tool": "search_live_prices", "arguments": {}, "depends_on": ["2"]},
                {"step_id": "2", "tool": "search_live_prices", "arguments": {}, "depends_on": ["1"]},
            ]})

    def test_plan_is_limited_to_five_steps(self):
        with self.assertRaises(ValidationError):
            ToolPlan.model_validate({"status": "ready", "intent": "bad", "steps": [
                {"step_id": str(index), "tool": "search_live_prices", "arguments": {}, "depends_on": []} for index in range(6)
            ]})

    def test_reeses_big_cup_defaults_to_todays_snack(self):
        plan = build_tool_plan("Add Reese's Big Cup to a snack", resolved(), ConversationState(conversation_id="phase2-snack"))
        self.assertEqual(plan.steps[0].tool, "add_meal_plan_item")
        self.assertEqual(plan.steps[0].arguments["meal_type"], "snack")
        self.assertEqual(plan.steps[0].arguments["custom_meal_name"], "Reese's Big Cup")
        self.assertRegex(plan.steps[0].arguments["meal_date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_food_vault_and_recipe_plans_use_registered_tools(self):
        food = validate_tool_plan(build_tool_plan("Add Greek yogurt to my Food Vault", resolved(), ConversationState(conversation_id="phase2-food")))
        recipe = validate_tool_plan(build_tool_plan("Create a recipe called John's Chili", resolved(), ConversationState(conversation_id="phase2-recipe")))
        self.assertEqual(food.steps[0].tool, "add_food_vault_item")
        self.assertEqual(food.steps[0].arguments["name"], "Greek yogurt")
        self.assertEqual(recipe.steps[0].tool, "add_recipe")
        self.assertEqual(recipe.steps[0].arguments["title"], "John's Chili")

    def test_add_two_cheapest_resolves_from_fresh_verified_comparison(self):
        plan = build_tool_plan("Add two of the cheapest one", resolved("add_cheapest_product"), state_with_prices())
        self.assertEqual([step.tool for step in plan.steps], ["get_recent_price_comparison", "add_shopping_item"])
        self.assertEqual(plan.steps[1].arguments["quantity"], 2)
        self.assertEqual(plan.steps[1].arguments["item_name"], "$step1.selected.product_name")

    def test_expired_price_result_forces_refresh_step(self):
        state = state_with_prices(expired=True)
        self.assertIsNone(latest_price_comparison(state))
        plan = build_tool_plan("Add two of the cheapest one", resolved("add_cheapest_product"), state)
        self.assertEqual(plan.steps[0].tool, "search_live_prices")

    @patch("backend.assistant.tools.registry.CONVERSATION_STATE_STORE", create=True)
    def test_placeholder_patch_is_not_used(self, _unused):
        self.assertEqual(resolve_step_arguments("$step1.selected.result_id", {"step1": {"selected": {"result_id": "price_1"}}}), "price_1")

    @patch("backend.services.ollama_service.execute_governed_tool_calls")
    def test_plan_stops_when_required_step_fails(self, execute):
        execute.return_value = ([{"tool": "get_recent_price_comparison", "access": "read", "success": True, "result": {"verified": False, "reason": "stale"}}], [], [])
        plan = build_tool_plan("Add two of the cheapest one", resolved("add_cheapest_product"), state_with_prices())
        results, _actions, trace = execute_validated_plan(plan, AssistantToolContext(conversation_id="phase2-conversation"), state_with_prices())
        self.assertEqual(execute.call_count, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(trace[-1]["status"], "failed")

    @patch("backend.assistant.conversation_state.CONVERSATION_STATE_STORE.get")
    def test_cheapest_comparison_selects_only_comparable_verified_result(self, get_state):
        get_state.return_value = state_with_prices()
        result = get_recent_price_comparison_tool(AssistantToolContext(conversation_id="phase2-conversation"), {"comparison_id": "cmp_123", "selection": "cheapest", "size": "20 oz"})
        self.assertTrue(result["verified"])
        self.assertEqual(result["selected"]["result_id"], "price_kroger")

    @patch("backend.assistant.conversation_state.CONVERSATION_STATE_STORE.get")
    def test_incomparable_sizes_require_clarification(self, get_state):
        state = state_with_prices()
        state.last_verified_tool_results[0].data["results"][1]["size"] = "12 fl oz"
        get_state.return_value = state
        result = get_recent_price_comparison_tool(AssistantToolContext(conversation_id="phase2-conversation"), {"comparison_id": "cmp_123", "selection": "cheapest"})
        self.assertFalse(result["verified"])
        self.assertTrue(result["ambiguous"])

    @patch("backend.assistant.conversation_state.CONVERSATION_STATE_STORE.get")
    def test_shopping_write_rejects_unverified_source_result_id(self, get_state):
        get_state.return_value = state_with_prices()
        result = add_shopping_item_tool(AssistantToolContext(conversation_id="phase2-conversation"), {"source_result_id": "invented_result", "item_name": "Made Up Product"})
        self.assertFalse(result["updated"])
        self.assertIn("missing or expired", result["reason"])

    @patch("backend.assistant.tools.registry.create_meal_plan_entry")
    def test_meal_tool_uses_today_and_snack(self, create):
        create.return_value = {"id": "meal_1", "meal_date": "2026-07-15", "meal_type": "snack", "custom_meal_name": "Reese's Big Cup"}
        result = add_meal_plan_item_tool(AssistantToolContext(), {"meal_date": "2026-07-15", "meal_type": "snack", "custom_meal_name": "Reese's Big Cup"})
        self.assertTrue(result["updated"])
        self.assertEqual(result["meal"]["name"], "Reese's Big Cup")

    @patch("backend.assistant.tools.registry.create_food_vault_item")
    def test_food_vault_tool_does_not_invent_nutrition(self, create):
        create.return_value = {"id": "food_1", "name": "Greek yogurt"}
        result = add_food_vault_item_tool(AssistantToolContext(), {"name": "Greek yogurt"})
        payload = create.call_args.args[0]
        self.assertIsNone(payload.calories)
        self.assertTrue(result["updated"])

    @patch("backend.assistant.tools.registry.create_recipe")
    def test_recipe_tool_creates_minimal_manual_recipe(self, create):
        create.return_value = {"id": "recipe_1", "title": "John's Chili", "ingredients": []}
        result = add_recipe_tool(AssistantToolContext(), {"title": "John's Chili"})
        self.assertTrue(result["updated"])
        self.assertEqual(create.call_args.args[0].source_type, "manual")


if __name__ == "__main__":
    unittest.main()
