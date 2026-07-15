import unittest
from unittest.mock import patch

from backend.routes.status import _brain_summary, _ollama_check
from backend.services.ollama_service import get_ollama_status


MODELS = [
    {"name": "fredrezones55/Qwen3.5-Uncensored-HauhauCS-Aggressive:4b"},
    {"name": "qwen3:8b"},
]


class OllamaStatusTests(unittest.TestCase):
    @patch("backend.services.ollama_service._request_json")
    def test_reports_installed_and_loaded_models(self, request):
        request.side_effect = [{"models": MODELS}, {"models": [{"name": "qwen3:8b"}]}]
        status = get_ollama_status()
        self.assertTrue(status["online"])
        self.assertTrue(status["modelAvailable"])
        self.assertEqual(status["activeModel"], "qwen3:8b")
        self.assertEqual(status["loadedModels"], ["qwen3:8b"])
        self.assertEqual(status["installedModels"], [MODELS[0]["name"], MODELS[1]["name"]])

    @patch("backend.services.ollama_service._request_json")
    def test_uses_configured_model_when_nothing_is_loaded(self, request):
        request.side_effect = [{"models": MODELS}, {"models": []}]
        status = get_ollama_status()
        self.assertEqual(status["activeModel"], "qwen3:8b")
        self.assertEqual(status["loadedModels"], [])
        self.assertIn("ready on demand", _ollama_check(status))
        self.assertIn("2 models installed", _brain_summary(status))

    @patch("backend.services.ollama_service._request_json", side_effect=ConnectionError("offline"))
    def test_offline_status_never_claims_a_model_is_active(self, _request):
        status = get_ollama_status()
        self.assertFalse(status["online"])
        self.assertIsNone(status["activeModel"])
        self.assertEqual(_brain_summary(status), "Jarvis local LLM offline")
        with self.assertRaisesRegex(RuntimeError, "offline"):
            _ollama_check(status)


if __name__ == "__main__":
    unittest.main()
