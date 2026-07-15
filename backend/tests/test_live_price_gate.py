import unittest
from unittest.mock import patch

from backend.assistant.execution import capability_manifest
from backend.assistant.tools.registry import extract_price_query, select_tools
from backend.services.live_price_service import search_live_prices
from backend.services.ollama_service import build_live_price_reply


class LivePriceGateTests(unittest.TestCase):
    def test_red_bull_price_request_selects_evidence_tool(self):
        calls = select_tools("What are Red Bull prices near me?")
        self.assertEqual(calls[0]["name"], "search_live_prices")
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
        self.assertIn("[kroger]", reply)

    def test_capability_manifest_declares_live_evidence_requirement(self):
        manifest = capability_manifest()
        self.assertEqual(manifest.evidence_requirements["live_price"], "verified_provider_result")
        self.assertIn("search_live_prices", manifest.available_tools)


if __name__ == "__main__":
    unittest.main()
