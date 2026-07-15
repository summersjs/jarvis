import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.assistant.conversation_state import record_reversible_actions
from backend.assistant.context_resolver import deterministic_sensitive_resolution
from backend.assistant.execution import verified
from backend.assistant.planner import build_tool_plan
from backend.assistant.tools.registry import AssistantToolContext, find_food_vault_matches_tool
from backend.schemas.assistant import AssistantActionExecution
from backend.schemas.conversation import ContextResolution, ConversationState, PendingClarification, RecentAction


def resolution(intent="follow_up", operation="write"):
    return ContextResolution.model_validate({
        "request_type": "follow_up", "intent": intent, "inherit_context": True, "entity_updates": {},
        "reference_resolution": [], "required_entities": [], "missing_entities": [], "requires_tool": True,
        "operation_type": operation, "needs_clarification": False, "clarification_question": None,
    })


class Phase3ContextUndoTests(unittest.TestCase):
    @patch("backend.assistant.tools.registry.list_food_vault_items")
    def test_food_vault_lookup_offers_verified_match_or_create(self, items):
        items.return_value = [
            {"id": "food_1", "brand": "Reese's", "name": "Big Cup", "serving_size": "1 package"},
            {"id": "food_2", "brand": "Quaker", "name": "Oats", "serving_size": "1 cup"},
        ]
        result = find_food_vault_matches_tool(AssistantToolContext(), {"query": "reeces big cup"})
        self.assertTrue(result["verified"])
        self.assertEqual(result["matches"][0]["id"], "food_1")
        self.assertEqual(len(result["matches"]), 1)
        self.assertEqual(result["options"][-1]["action"], "create")
        self.assertIn("Did you mean", result["question"])

    @patch("backend.assistant.tools.registry.list_food_vault_items", return_value=[])
    def test_no_food_match_requests_required_nutrition(self, _items):
        result = find_food_vault_matches_tool(AssistantToolContext(), {"query": "Reese Big Cup"})
        self.assertIn("calories, protein, carbs, and fat", result["question"])

    def test_create_new_food_clarifies_when_required_nutrition_missing(self):
        state = ConversationState(
            conversation_id="phase3-food", active_intent="resolve_food_vault_meal_item",
            entities={"product": "Reese's Big Cup"},
            pending_clarification=PendingClarification(question="I couldn't find it in the Food Vault. Create a new item?"),
        )
        plan = build_tool_plan("Create a new one", resolution(), state)
        self.assertEqual(plan.status, "clarification_required")
        self.assertIn("calories", plan.clarification_question)

    def test_complete_new_food_creates_vault_item_then_todays_snack(self):
        state = ConversationState(
            conversation_id="phase3-food-complete", active_intent="resolve_food_vault_meal_item",
            entities={"product": "Reese's Big Cup"},
            pending_clarification=PendingClarification(question="Create a new Food Vault item?"),
        )
        plan = build_tool_plan("Create new, name Reese's Big Cup, 200 calories, 4g protein, 24g carbs, 10g fat", resolution(), state)
        self.assertEqual([step.tool for step in plan.steps], ["add_food_vault_item", "add_meal_plan_item"])
        self.assertEqual(plan.steps[0].arguments["calories"], 200)
        self.assertEqual(plan.steps[1].arguments["meal_type"], "snack")

    def test_food_vault_nutrition_followup_resolves_without_inventing_fields(self):
        state = ConversationState(
            conversation_id="phase3-nutrition", entities={"product": "Reese's Big Cup"},
            pending_clarification=PendingClarification(question="Create a new Food Vault item?"),
        )
        result = deterministic_sensitive_resolution("Create new: 200 calories, 4g protein, 24g carbs, 10g fat", state)
        self.assertEqual(result.entity_updates.calories, 200)
        self.assertEqual(result.entity_updates.protein_g, 4)
        self.assertIsNone(result.entity_updates.serving_size)

    def test_repeated_explicit_snack_request_uses_deterministic_resolution(self):
        state = ConversationState(
            conversation_id="phase3-repeat", active_intent="resolve_food_vault_meal_item",
            pending_clarification=PendingClarification(question="Create a new Food Vault item?"),
        )
        result = deterministic_sensitive_resolution("Can you add Reece's big cup to my snack for today?", state)
        self.assertEqual(result.entity_updates.product, "Reece's big cup")
        self.assertEqual(result.operation_type, "write")

    def test_one_recent_verified_action_can_be_undone(self):
        now = datetime.now(timezone.utc)
        state = ConversationState(
            conversation_id="phase3-undo",
            recent_actions=[RecentAction(execution_id="exec_1", tool="add_food_vault_item", record_id="food_1", verified_at=now, reversible=True, reverse_tool="remove_food_vault_item", expires_at=now + timedelta(minutes=5))],
        )
        plan = build_tool_plan("Undo that", resolution("undo_last_action"), state)
        self.assertEqual(plan.steps[0].tool, "remove_food_vault_item")
        self.assertEqual(plan.steps[0].arguments["record_id"], "food_1")

    def test_two_recent_actions_make_undo_ambiguous(self):
        now = datetime.now(timezone.utc)
        actions = [
            RecentAction(execution_id=f"exec_{index}", tool="add_recipe", record_id=f"recipe_{index}", verified_at=now, reversible=True, reverse_tool="remove_recipe", expires_at=now + timedelta(minutes=5))
            for index in (1, 2)
        ]
        plan = build_tool_plan("Undo that", resolution("undo_last_action"), ConversationState(conversation_id="phase3-ambiguous", recent_actions=actions))
        self.assertEqual(plan.status, "clarification_required")

    def test_expired_action_cannot_be_undone(self):
        now = datetime.now(timezone.utc)
        action = RecentAction(execution_id="exec_old", tool="add_recipe", record_id="recipe_old", verified_at=now - timedelta(minutes=20), reversible=True, reverse_tool="remove_recipe", expires_at=now - timedelta(minutes=10))
        plan = build_tool_plan("Undo that", resolution("undo_last_action"), ConversationState(conversation_id="phase3-expired", recent_actions=[action]))
        self.assertEqual(plan.status, "clarification_required")

    def test_verified_create_records_exact_reverse_metadata(self):
        execution = AssistantActionExecution(
            action_id="act_1", source_message_id="source_1", conversation_id="phase3-record", intent="add_recipe",
            requested_action="add_recipe", execution_status="succeeded", tool_name="add_recipe", result={"recipe": {"id": "recipe_1"}},
            verification=verified("matched"), user_message="verified",
        )
        state = record_reversible_actions(ConversationState(conversation_id="phase3-record"), [execution])
        self.assertEqual(state.recent_actions[0].record_id, "recipe_1")
        self.assertEqual(state.recent_actions[0].reverse_tool, "remove_recipe")


if __name__ == "__main__":
    unittest.main()
