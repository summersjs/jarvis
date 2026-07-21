import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from backend.assistant.execution import ActionAuditStore, execute_governed_tool_calls, verified
from backend.assistant.meal_confirmation import (
    PendingMealConfirmation,
    PendingMealStore,
    form_of_address,
    parse_ad_hoc_meal,
    resolve_meal_claim,
    response_kind,
)
from backend.assistant.tools.registry import AssistantToolContext, complete_meal_tool, select_write_tools
from backend.core.config import LOCAL_TZ


TODAY = datetime.now(LOCAL_TZ).date().isoformat()
YOGURT = {
    "id": "meal-yogurt",
    "meal_date": TODAY,
    "meal_type": "breakfast",
    "custom_meal_name": "Yo Yo Crunch M&M 4 oz yogurt",
    "recipes": None,
    "notes": None,
}


class MealConfirmationTests(unittest.TestCase):
    def test_ad_hoc_breakfast_food_is_parsed_for_creation_and_confirmation(self):
        parsed = parse_ad_hoc_meal("I ate Chobani S'mores yogurt for breakfast")
        self.assertEqual(parsed, ("Chobani S'mores yogurt", "breakfast", True))

    def test_add_only_breakfast_does_not_claim_it_was_eaten(self):
        parsed = parse_ad_hoc_meal("Can you add Chobani S'mores yogurt to my breakfast")
        self.assertEqual(parsed, ("Chobani S'mores yogurt", "breakfast", False))

    def test_morning_yogurt_resolves_exact_planned_breakfast(self):
        pending = resolve_meal_claim(
            "I ate my morning yogurt",
            "john",
            "source-yogurt",
            "conversation-yogurt",
            meals=[YOGURT],
            now=datetime.now(LOCAL_TZ),
        )
        self.assertIsNotNone(pending)
        self.assertEqual(pending.meal_id, "meal-yogurt")
        self.assertEqual(pending.meal_type, "breakfast")
        self.assertEqual(pending.meal_name, "Yo Yo Crunch M&M 4 oz yogurt")

    def test_ate_breakfast_resolves_and_requires_confirmation(self):
        pending = resolve_meal_claim(
            "I ate my breakfast", "john", "source-breakfast", "conversation-breakfast", meals=[YOGURT]
        )
        self.assertEqual(pending.meal_id, "meal-yogurt")
        self.assertNotIn("complete_meal", [call["name"] for call in select_write_tools("I ate my breakfast")])

    def test_yes_and_no_are_explicit_and_natural_variants_work(self):
        for value in ("yes", "yes please", "yup", "Yep!", "do it", "go ahead"):
            self.assertEqual(response_kind(value), "yes")
        for value in ("no", "no thanks", "nope", "cancel", "not that"):
            self.assertEqual(response_kind(value), "no")
        self.assertIsNone(response_kind("I guess maybe"))

    def test_pending_confirmation_is_scoped_and_can_be_cleared(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PendingMealStore(str(Path(directory) / "pending.json"))
            pending = PendingMealConfirmation(
                "confirm-1", "conversation-one", "source-one", "meal-yogurt", "breakfast",
                "Yo Yo Crunch M&M 4 oz yogurt", TODAY, datetime.now(LOCAL_TZ).isoformat(),
                datetime.now(LOCAL_TZ).replace(year=datetime.now(LOCAL_TZ).year + 1).isoformat(),
            )
            store.put(pending)
            self.assertEqual(store.get("conversation-one").meal_id, "meal-yogurt")
            self.assertIsNone(store.get("conversation-two"))
            store.clear("conversation-one", "confirm-1")
            self.assertIsNone(store.get("conversation-one"))

    def test_complete_meal_rejects_untrusted_or_wrong_confirmation(self):
        context = AssistantToolContext(confirmed_action_id="confirm-right")
        with patch("backend.assistant.tools.registry.list_meal_plan_entries") as meals:
            result = complete_meal_tool(context, {
                "meal_id": "meal-yogurt", "meal_type": "breakfast", "confirmation_id": "confirm-wrong"
            })
        self.assertFalse(result["updated"])
        meals.assert_not_called()

    def test_governor_waits_without_server_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ActionAuditStore(str(Path(directory) / "audit.json"))
            calls = [{"name": "complete_meal", "input": {
                "meal_id": "meal-yogurt", "meal_type": "breakfast", "confirmation_id": "confirm-1"
            }}]
            with patch("backend.assistant.execution.execute_tool_calls") as execute:
                result = execute_governed_tool_calls(calls, AssistantToolContext(), store=store)
            self.assertEqual(result[1][0].execution_status, "awaiting_confirmation")
            execute.assert_not_called()

    def test_governor_executes_once_after_matching_server_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ActionAuditStore(str(Path(directory) / "audit.json"))
            context = AssistantToolContext(
                source_message_id="source-confirmed", conversation_id="conversation-confirmed",
                confirmed_action_id="confirm-1",
            )
            calls = [{"name": "complete_meal", "input": {
                "meal_id": "meal-yogurt", "meal_type": "breakfast", "confirmation_id": "confirm-1"
            }}]
            success = {"tool": "complete_meal", "access": "write", "success": True, "result": {
                "updated": True, "meal": {"id": "meal-yogurt", "name": "Yo Yo Crunch M&M 4 oz yogurt"}
            }}
            with patch("backend.assistant.execution.execute_tool_calls", return_value=[success]) as execute:
                first = execute_governed_tool_calls(calls, context, store=store, verifier=lambda *_: verified("meal reread"))
                second = execute_governed_tool_calls(calls, context, store=store, verifier=lambda *_: verified("meal reread"))
            self.assertEqual(first[1][0].execution_status, "succeeded")
            self.assertEqual(second[1][0].execution_status, "cancelled")
            self.assertEqual(execute.call_count, 1)

    def test_forms_of_address_cover_exactly_one_quarter_of_hash_buckets(self):
        addressed = [form_of_address(f"request-{index}") for index in range(4096)]
        ratio = sum(value is not None for value in addressed) / len(addressed)
        self.assertGreater(ratio, 0.22)
        self.assertLess(ratio, 0.28)
        self.assertIsNone(form_of_address("request-serious", serious=True))
        self.assertTrue({value for value in addressed if value} <= {
            "daddy", "sexy daddy", "John", "Commander", "homie", "boss", "chief"
        })


if __name__ == "__main__":
    unittest.main()
