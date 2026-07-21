import unittest
from unittest.mock import patch

from backend.assistant.execution import capability_manifest
from backend.assistant.tools.registry import extract_price_query, select_tools
from backend.services.live_price_service import _extract_retail_size, _nearest_kroger_location, _preferred_search_query, _rank_preferred_offers, search_live_prices, search_obsession_deals
from backend.assistant.tools.registry import AssistantToolContext
from backend.services.ollama_service import build_live_price_reply, chat_with_jarvis, resolve_live_price_followup


class LivePriceGateTests(unittest.TestCase):
    @patch("backend.services.ollama_service.resolve_context")
    @patch("backend.services.ollama_service.execute_governed_tool_calls")
    def test_exact_obsession_prompt_bypasses_context_resolver(self, execute, resolver):
        execute.return_value = ([{
            "tool": "search_live_prices", "access": "read", "success": True, "result": {
                "verified": True, "obsessions": ["red bull"], "has_verified_deals": True,
                "deal_offers": [{"retailer": "Kroger", "title": "Red Bull Original", "size": "12 fl oz", "price": 3.00, "regular_price": 3.19, "is_deal": True, "evidence": {"provider": "kroger"}}],
                "offers": [{"retailer": "Kroger", "title": "Red Bull Original", "size": "12 fl oz", "price": 3.00, "regular_price": 3.19, "is_deal": True, "evidence": {"provider": "kroger"}}],
            },
        }], [], [])
        result = chat_with_jarvis(
            [{"role": "user", "content": "are there any good deals based on my obsessions at kroger right now?"}],
            context=AssistantToolContext(conversation_id="browser-conversation", request_id="request-deals"),
        )
        resolver.assert_not_called()
        self.assertIn("Verified promotion", result["message"]["content"])

    def test_obsession_deal_request_selects_grounded_live_search(self):
        calls = select_tools("Are there any good deals based on my obsessions at Kroger right now?")
        self.assertEqual(calls[0]["name"], "search_live_prices")
        self.assertTrue(calls[0]["input"]["use_obsessions"])
        self.assertEqual(calls[0]["input"]["retailer"], "kroger")

    @patch("backend.services.live_price_service.search_live_prices")
    @patch("backend.services.live_price_service.list_preferences")
    def test_obsession_deals_search_only_saved_active_obsessions(self, preferences, search):
        preferences.return_value = [{"item_keyword": "red bull", "preference_type": "obsession", "is_active": True}]
        search.return_value = {"verified": True, "offers": [{"retailer": "Kroger", "title": "Red Bull", "price": 2.50, "evidence": {"provider": "kroger"}}], "providers": [{"provider": "kroger", "configured": True}]}
        result = search_obsession_deals("john", retailer="kroger")
        search.assert_called_once_with("red bull", None, "john", "kroger")
        self.assertEqual(result["obsessions"], ["red bull"])
        self.assertEqual(result["offers"][0]["matched_obsession"], "red bull")

    def test_red_bull_price_request_selects_evidence_tool(self):
        calls = select_tools("What are Red Bull prices near me?")
        self.assertEqual(calls[0]["name"], "search_live_prices")
        self.assertEqual(calls[0]["input"]["query"], "Red Bull")

    def test_cheaper_question_must_select_evidence_tool(self):
        calls = select_tools("Is Kroger or Walmart cheaper?")
        self.assertEqual(calls[0]["name"], "search_live_prices")

    def test_retailer_name_is_not_sent_as_part_of_product_term(self):
        calls = select_tools("What are Red Bull prices at Kroger near me?")
        self.assertEqual(calls[0]["input"]["query"], "Red Bull")

    def test_exact_redbull_phrasings_normalize_for_kroger(self):
        for prompt in ("whats the price of redbull at kroger?", "whats the price of redbull"):
            with self.subTest(prompt=prompt):
                calls = select_tools(prompt)
                self.assertEqual(calls[0]["input"]["query"], "Red Bull")

    @patch.dict("os.environ", {}, clear=True)
    def test_no_credentials_means_no_verified_price(self):
        result = search_live_prices("Red Bull")
        self.assertFalse(result["verified"])
        self.assertEqual(result["offers"], [])

    def test_hard_gate_refuses_to_guess_without_evidence(self):
        reply = build_live_price_reply("How much is Red Bull?", [{
            "tool": "search_live_prices", "success": True,
            "result": {"verified": False, "offers": [], "providers": [{"provider": "kroger", "configured": False}]},
        }])
        self.assertIn("won't guess", reply)
        self.assertNotIn("$", reply)

    def test_obsession_listing_is_not_called_a_deal_without_promo_evidence(self):
        reply = build_live_price_reply("Any deals based on my obsessions at Kroger?", [{
            "tool": "search_live_prices", "success": True,
            "result": {"verified": True, "obsessions": ["red bull"], "has_verified_deals": False, "offers": [{
                "retailer": "Kroger", "title": "Red Bull Original", "size": "8.4 fl oz", "price": 2.50,
                "evidence": {"provider": "kroger"},
            }]},
        }])
        self.assertIn("no verified promotional price", reply)
        self.assertIn("won't call them deals", reply)

    def test_verified_offer_is_labeled_with_provider(self):
        reply = build_live_price_reply("Red Bull price", [{
            "tool": "search_live_prices", "success": True,
            "result": {"verified": True, "offers": [{
                "retailer": "Kroger", "title": "Red Bull 4 pack", "price": 8.99,
                "evidence": {"provider": "kroger", "classification": "official_retailer_api"},
            }]},
        }])
        self.assertIn("$8.99", reply)
        self.assertIn("Verified via Kroger", reply)

    def test_mixed_retailers_and_providers_are_all_attributed(self):
        reply = build_live_price_reply("Red Bull price", [{
            "tool": "search_live_prices", "success": True,
            "result": {"verified": True, "preference": {"item_keyword": "red bull"}, "offers": [
                {"retailer": "Walmart", "title": "Red Bull", "size": "8.4 fl oz", "price": 2.34,
                 "evidence": {"provider": "searchapi", "classification": "retailer_web_result"}},
                {"retailer": "Kroger", "title": "Red Bull", "size": "8.4 fl oz", "price": 2.50,
                 "evidence": {"provider": "kroger", "classification": "official_retailer_api"}},
            ]},
        }])
        self.assertIn("Walmart is cheaper", reply)
        self.assertIn("Walmart $2.34, Kroger $2.50", reply)
        self.assertIn("Verified via Kroger and SearchAPI", reply)

    def test_walmart_request_is_scoped_to_walmart(self):
        call = select_tools("How much is Red Bull at Walmart?")[0]
        self.assertEqual(call["input"]["query"], "Red Bull")
        self.assertEqual(call["input"]["retailer"], "walmart")

    def test_price_followup_reuses_product_but_keeps_new_retailer(self):
        messages = [
            {"role": "user", "content": "What is the price of Red Bull?"},
            {"role": "assistant", "content": "Red Bull prices from Kroger and Walmart."},
            {"role": "user", "content": "How much is it at Walmart?"},
        ]
        calls = resolve_live_price_followup(messages, messages[-1]["content"], select_tools(messages[-1]["content"]))
        self.assertEqual(calls[0]["input"], {"query": "Red Bull", "retailer": "walmart"})

    def test_capability_manifest_declares_live_evidence_requirement(self):
        manifest = capability_manifest()
        self.assertEqual(manifest.evidence_requirements["live_price"], "verified_provider_result")
        self.assertIn("search_live_prices", manifest.available_tools)

    @patch("backend.services.live_price_service._json_request")
    def test_kroger_location_can_be_resolved_from_zip(self, request):
        request.return_value = {"data": [{"locationId": "02900513"}]}
        self.assertEqual(_nearest_kroger_location("https://api.kroger.test/v1", "token", "22980"), "02900513")
        self.assertIn("filter.zipCode.near=22980", request.call_args.args[0])

    def test_red_bull_preference_keeps_original_and_cheapest_per_size(self):
        preference = {"item_keyword": "red bull", "preferred_brand": "Red Bull", "preferred_product_name": "Original", "all_sizes": True, "notes": "Regular/original flavor only"}
        offers = [
            {"title": "Red Bull Original", "size": "8.4 fl oz", "price": 2.79, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original", "size": "8.4 fl oz", "price": 2.49, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original", "size": "12 fl oz", "price": 3.00, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Watermelon", "size": "12 fl oz", "price": 2.00, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original Sugar Free", "size": "16 fl oz", "price": 1.00, "evidence": {"provider": "kroger"}},
        ]
        ranked = _rank_preferred_offers(offers, preference)
        self.assertEqual([(item["size"], item["price"]) for item in ranked], [("8.4 fl oz", 2.49), ("12 fl oz", 3.00)])
        self.assertEqual(_preferred_search_query("Red Bull", preference), "Red Bull")

    def test_generic_butter_returns_only_cheapest_verified_offer(self):
        offers = [
            {"title": "Butter A", "price": 4.00, "evidence": {"provider": "kroger"}},
            {"title": "Butter B", "price": 3.25, "evidence": {"provider": "kroger"}},
        ]
        offers.append({"title": "Blue Bonnet Vegetable Oil Sticks", "price": 1.00, "evidence": {"provider": "kroger"}})
        self.assertEqual(_rank_preferred_offers(offers, None, "butter")[0]["title"], "Butter B")
        self.assertEqual(len(_rank_preferred_offers(offers, None, "butter")), 1)

    def test_colgate_preference_builds_specific_search(self):
        preference = {"preferred_brand": "Colgate", "preferred_product_name": "Total Whitening", "preferred_size": "20", "preferred_unit": "oz", "all_sizes": False}
        self.assertEqual(_preferred_search_query("toothpaste", preference), "Colgate Total Whitening 20 oz")

    @patch("backend.services.live_price_service._json_request")
    @patch.dict("os.environ", {"SEARCH_API_KEY": "alias-key"}, clear=True)
    def test_searchapi_local_key_alias_is_supported(self, request):
        request.return_value = {"organic_results": [{"title": "Red Bull Original", "price": 2.98, "link": "https://www.walmart.com/ip/1"}]}
        from backend.services.live_price_service import _searchapi_walmart
        result = _searchapi_walmart("Red Bull", None)
        self.assertTrue(result["configured"])
        self.assertEqual(result["offers"][0]["price"], 2.98)
        self.assertIn("api_key=alias-key", request.call_args.args[0])

    def test_walmart_title_size_and_pack_are_normalized(self):
        self.assertEqual(_extract_retail_size("Red Bull 8.4 fl. oz., Pack of 12 Cans"), "12 pk / 8.4 fl oz")
        self.assertEqual(_extract_retail_size("Red Bull 12 fl. oz. Can"), "12 fl oz")

    def test_all_sizes_are_preserved_per_retailer(self):
        preference = {"preferred_brand": "Red Bull", "preferred_product_name": "", "all_sizes": True}
        offers = [
            {"retailer": "Kroger", "title": "Red Bull", "size": "12 fl oz", "price": 3.00, "evidence": {"provider": "kroger"}},
            {"retailer": "Walmart", "title": "Red Bull", "size": "12 fl oz", "price": 2.94, "evidence": {"provider": "searchapi"}},
        ]
        self.assertEqual(len(_rank_preferred_offers(offers, preference, "Red Bull")), 2)


if __name__ == "__main__":
    unittest.main()
