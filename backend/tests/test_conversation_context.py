import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from backend.assistant.context_resolver import ResolverFailure, direct_resolution, parse_resolver_json, resolve_context, safe_read_followup_resolution
from backend.assistant.conversation_state import ConversationStateStore, merge_conversation_state, record_verified_tool_results
from backend.assistant.tools.registry import AssistantToolContext, add_shopping_item_tool
from backend.schemas.conversation import ContextResolution, ConversationState
from backend.services.ollama_service import chat_with_jarvis


def resolution(**overrides):
    data = {
        "request_type": "follow_up",
        "intent": "compare_local_prices",
        "inherit_context": True,
        "entity_updates": {},
        "reference_resolution": [],
        "required_entities": [],
        "missing_entities": [],
        "requires_tool": True,
        "operation_type": "live_external",
        "needs_clarification": False,
        "clarification_question": None,
    }
    data.update(overrides)
    return ContextResolution.model_validate(data)


class ConversationContextTests(unittest.TestCase):
    def test_state_schema_rejects_unknown_model_fields(self):
        with self.assertRaises(ValidationError):
            ConversationState.model_validate({"conversation_id": "conversation-1", "hidden_reasoning": "secret"})

    def test_sugar_free_inherits_product_size_and_location(self):
        state = ConversationState.model_validate({
            "conversation_id": "conversation-1", "active_intent": "compare_local_prices",
            "entities": {"product": "Red Bull", "brand": "Red Bull", "size": "20 oz", "variant": "Original", "location": "Waynesboro, VA", "zip_code": "22980"},
        })
        merged, meta = merge_conversation_state(state, resolution(entity_updates={"variant": "Sugar Free"}))
        self.assertEqual(merged.entities.product, "Red Bull")
        self.assertEqual(merged.entities.size, "20 oz")
        self.assertEqual(merged.entities.location, "Waynesboro, VA")
        self.assertEqual(merged.entities.variant, "Sugar Free")
        self.assertIn("variant", meta.changed)

    def test_new_product_clears_incompatible_product_fields(self):
        state = ConversationState.model_validate({
            "conversation_id": "conversation-2", "active_intent": "compare_local_prices",
            "entities": {"product": "Red Bull", "brand": "Red Bull", "size": "20 oz", "variant": "Original", "retailer": "Walmart"},
        })
        merged, _ = merge_conversation_state(state, resolution(entity_updates={"product": "Toothpaste"}))
        self.assertEqual(merged.entities.product, "Toothpaste")
        self.assertIsNone(merged.entities.brand)
        self.assertIsNone(merged.entities.size)
        self.assertIsNone(merged.entities.variant)
        self.assertIsNone(merged.entities.retailer)

    def test_explicit_values_override_inherited_values(self):
        state = ConversationState.model_validate({"conversation_id": "conversation-3", "entities": {"retailer": "Kroger", "quantity": 1}})
        merged, _ = merge_conversation_state(state, resolution(entity_updates={"retailer": "Walmart", "quantity": 2}))
        self.assertEqual(merged.entities.retailer, "Walmart")
        self.assertEqual(merged.entities.quantity, 2)

    def test_followup_preserves_pending_clarification_for_planner(self):
        state = ConversationState.model_validate({"conversation_id": "conversation-pending", "pending_clarification": {"question": "Create a new Food Vault item?"}})
        merged, _ = merge_conversation_state(state, resolution(intent="resolve_food_vault_meal_item", operation_type="write"))
        self.assertEqual(merged.pending_clarification.question, "Create a new Food Vault item?")

    def test_live_results_are_bounded_verified_targets_with_expiry(self):
        state = ConversationState(conversation_id="conversation-4")
        record_verified_tool_results(state, [{
            "tool": "search_live_prices", "success": True,
            "result": {"verified": True, "query": "Red Bull", "offers": [{
                "retailer": "Walmart", "title": "Red Bull", "size": "20 fl oz", "price": 4.48,
                "evidence": {"provider": "searchapi", "store": {"store_id": "5117"}},
            }]},
        }])
        saved = state.last_verified_tool_results[0]
        self.assertTrue(saved.result_id.startswith("cmp_"))
        self.assertTrue(saved.data["results"][0]["result_id"].startswith("price_"))
        self.assertGreater(saved.expires_at, saved.verified_at)

    def test_state_store_clear_does_not_touch_chat_history(self):
        with tempfile.TemporaryDirectory() as directory:
            filename = str(Path(directory) / "state.json")
            with patch("backend.assistant.conversation_state.read_json") as read, patch("backend.assistant.conversation_state.write_json") as write:
                read.return_value = {"conversation-5": ConversationState(conversation_id="conversation-5").model_dump(mode="json")}
                store = ConversationStateStore(filename)
                self.assertTrue(store.clear("conversation-5"))
                self.assertNotIn("conversation-5", write.call_args.args[1])

    def test_resolver_json_must_match_strict_schema(self):
        state = ConversationState(conversation_id="conversation-6")
        with self.assertRaises(ResolverFailure):
            resolve_context("Add that one", state, "qwen3:8b", lambda *_args, **_kwargs: {"message": {"content": "not json"}})

    @patch("backend.services.ollama_service.execute_governed_tool_calls")
    @patch("backend.services.ollama_service.resolve_context")
    @patch("backend.services.ollama_service.CONVERSATION_STATE_STORE")
    def test_malformed_resolver_never_executes_write(self, store, resolver, execute):
        store.get.return_value = ConversationState(conversation_id="conversation-7", active_intent="manage_shopping_list")
        resolver.side_effect = ResolverFailure("INVALID_RESOLVER_OUTPUT")
        result = chat_with_jarvis(
            [{"role": "user", "content": "Add that one"}],
            context=AssistantToolContext(request_id="request-7", source_message_id="source-7", conversation_id="conversation-7"),
        )
        execute.assert_not_called()
        self.assertIn("did not execute", result["message"]["content"])

    @patch("backend.assistant.tools.registry.list_shopping_lists")
    def test_add_any_item_asks_which_existing_list(self, lists):
        lists.return_value = [{"id": "list-a", "title": "Weekly"}, {"id": "list-b", "title": "Party"}]
        result = add_shopping_item_tool(AssistantToolContext(), {"item_name": "Red Bull"})
        self.assertTrue(result["needs_input"])
        self.assertEqual([item["title"] for item in result["options"]], ["Weekly", "Party"])

    @patch("backend.assistant.tools.registry.list_shopping_lists", return_value=[])
    def test_add_item_offers_list_creation_when_none_exists(self, _lists):
        result = add_shopping_item_tool(AssistantToolContext(), {"item_name": "toothpaste"})
        self.assertTrue(result["needs_input"])
        self.assertEqual(result["options"][0]["action"], "create")

    def test_direct_resolution_extracts_price_entities(self):
        result = direct_resolution("Find the cheapest 20 oz Red Bull near Waynesboro, VA")
        self.assertEqual(result.entity_updates.product, "Red Bull")
        self.assertEqual(result.entity_updates.size, "20 oz")
        self.assertEqual(result.operation_type, "live_external")

    def test_safe_read_fallback_handles_price_comparison_but_not_writes(self):
        state = ConversationState.model_validate({"conversation_id": "conversation-8", "active_intent": "compare_local_prices", "entities": {"product": "Red Bull", "size": "20 oz"}})
        fallback = safe_read_followup_resolution("Which one is cheaper?", state)
        self.assertEqual(fallback.intent, "compare_local_prices")
        self.assertTrue(fallback.inherit_context)
        self.assertIsNone(safe_read_followup_resolution("Add two of the cheapest one", state))


if __name__ == "__main__":
    unittest.main()
