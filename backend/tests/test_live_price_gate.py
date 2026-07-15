import unittest
from unittest.mock import patch

from backend.assistant.execution import capability_manifest
from backend.assistant.tools.registry import extract_price_query, select_tools
from backend.services.live_price_service import _nearest_kroger_location, _preferred_search_query, _rank_preferred_offers, search_live_prices
from backend.services.ollama_service import build_live_price_reply


class LivePriceGateTests(unittest.TestCase):
    def test_red_bull_price_request_selects_evidence_tool(self):
        calls = select_tools("What are Red Bull prices near me?")
        self.assertEqual(calls[0]["name"], "search_live_prices")
        self.assertEqual(calls[0]["input"]["query"], "Red Bull")

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
        preference = {"preferred_brand": "Red Bull", "preferred_product_name": "Original", "all_sizes": True, "notes": "Regular/original flavor only"}
        offers = [
            {"title": "Red Bull Original", "size": "8.4 fl oz", "price": 2.79, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original", "size": "8.4 fl oz", "price": 2.49, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original", "size": "12 fl oz", "price": 3.00, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Watermelon", "size": "12 fl oz", "price": 2.00, "evidence": {"provider": "kroger"}},
            {"title": "Red Bull Original Sugar Free", "size": "16 fl oz", "price": 1.00, "evidence": {"provider": "kroger"}},
        ]
        ranked = _rank_preferred_offers(offers, preference)
        self.assertEqual([(item["size"], item["price"]) for item in ranked], [("8.4 fl oz", 2.49), ("12 fl oz", 3.00)])
        self.assertEqual(_preferred_search_query("Red Bull", preference), "Red Bull Original")

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


if __name__ == "__main__":
    unittest.main()
