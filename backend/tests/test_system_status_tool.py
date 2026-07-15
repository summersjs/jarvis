import unittest
from unittest.mock import patch

from backend.assistant.tools.registry import get_system_status_tool, select_read_tools


class SystemStatusToolTests(unittest.TestCase):
    def test_running_and_red_phrases_select_live_status(self):
        for prompt in [
            "Is everything running?",
            "Are all systems up?",
            "Check the ping and tell me if anything is red",
            "What is the system status?",
        ]:
            with self.subTest(prompt=prompt):
                self.assertIn("get_system_status", select_read_tools(prompt))

    @patch("backend.routes.status.get_status")
    def test_returns_all_red_checks(self, get_status):
        get_status.return_value = {
            "systems": "Degraded",
            "checked_at": "2026-07-15T12:00:00+00:00",
            "uptime_seconds": 42,
            "checks": [
                {"label": "Local API", "state": "online", "latency_ms": 1.2},
                {"label": "Jarvis Voice TTS", "state": "offline", "detail": "offline", "latency_ms": 3.4},
            ],
        }

        result = get_system_status_tool(None, {})

        self.assertFalse(result["all_green"])
        self.assertEqual([check["label"] for check in result["red_checks"]], ["Jarvis Voice TTS"])
        self.assertEqual(len(result["checks"]), 2)


if __name__ == "__main__":
    unittest.main()
