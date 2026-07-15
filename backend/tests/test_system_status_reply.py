import unittest

from backend.services.ollama_service import build_system_status_reply


class SystemStatusReplyTests(unittest.TestCase):
    def test_all_green_reply_comes_directly_from_live_checks(self):
        reply = build_system_status_reply([{
            "tool": "get_system_status",
            "success": True,
            "result": {"checks": [{"state": "online"}, {"state": "online"}], "red_checks": []},
        }])
        self.assertEqual(reply, "I ran the live ping: all 2 checks are green.")

    def test_red_reply_names_every_failed_check(self):
        reply = build_system_status_reply([{
            "tool": "get_system_status",
            "success": True,
            "result": {
                "checks": [{"state": "online"}, {"state": "offline"}, {"state": "offline"}],
                "red_checks": [
                    {"label": "Calendar", "detail": "Token expired"},
                    {"label": "Voice", "detail": "Offline"},
                ],
            },
        }])
        self.assertIn("2 of 3 checks are red", reply)
        self.assertIn("Calendar: Token expired", reply)
        self.assertIn("Voice: Offline", reply)


if __name__ == "__main__":
    unittest.main()
