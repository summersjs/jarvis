import unittest
from unittest.mock import MagicMock, patch

from backend.assistant.tools.registry import select_tools
from backend.integrations.google_calendar import CalendarAuthRequired, GMAIL_SCOPES, SCOPES, get_google_credentials
from backend.integrations.google_gmail import GMAIL_API_ENABLE_URL, gmail_error_guidance
from backend.services.ollama_service import build_calendar_reply


class GmailAndCalendarToolTests(unittest.TestCase):
    def test_gmail_scopes_are_read_and_compose_only(self):
        self.assertIn("https://www.googleapis.com/auth/gmail.readonly", GMAIL_SCOPES)
        self.assertIn("https://www.googleapis.com/auth/gmail.compose", GMAIL_SCOPES)
        self.assertNotIn("https://mail.google.com/", SCOPES)
        self.assertFalse(any(scope.endswith("gmail.modify") or scope.endswith("gmail.send") for scope in SCOPES))

    @patch("backend.integrations.google_calendar._granted_token_scopes")
    @patch("backend.integrations.google_calendar.Credentials.from_authorized_user_file")
    @patch("backend.integrations.google_calendar.TOKEN_PATH", new_callable=MagicMock)
    def test_actual_google_grant_must_include_requested_gmail_scopes(self, token_path, load_credentials, granted_scopes):
        token_path.exists.return_value = True
        credentials = load_credentials.return_value
        credentials.valid = True
        credentials.token = "access-token"
        credentials.has_scopes.return_value = True
        granted_scopes.return_value = {"https://www.googleapis.com/auth/calendar"}

        with self.assertRaises(CalendarAuthRequired):
            get_google_credentials(GMAIL_SCOPES)

    def test_natural_calendar_phrases_select_verified_reads(self):
        cases = {
            "Do I have anything planned for today?": "get_today_schedule",
            "What's happening tomorrow?": "get_schedule_for_date",
            "Do I have anything for tomorrow?": "get_schedule_for_date",
            "Anything going on for the week?": "get_week_schedule",
        }
        for phrase, tool in cases.items():
            with self.subTest(phrase=phrase):
                self.assertIn(tool, [call["name"] for call in select_tools(phrase)])

    def test_calendar_reply_uses_only_tool_results(self):
        reply = build_calendar_reply([{"tool": "get_schedule_for_date", "success": True, "result": {"label": "tomorrow", "events": [{"title": "Dentist"}]}}])
        self.assertEqual(reply, "You have 1 event tomorrow: Dentist.")

    def test_email_search_uses_gmail_tool(self):
        calls = select_tools("Do I have any emails from Tierra?")
        gmail = next(call for call in calls if call["name"] == "search_gmail")
        self.assertEqual(gmail["input"]["query"], "from:(Tierra)")

    def test_summarize_email_requests_verified_message_body(self):
        calls = select_tools("Summarize my latest email from Tierra")
        gmail = next(call for call in calls if call["name"] == "search_gmail")
        self.assertTrue(gmail["input"]["include_first_body"])

    @patch("backend.assistant.tools.registry.create_gmail_draft")
    def test_draft_command_never_sends(self, create_draft):
        create_draft.return_value = {"id": "draft-1", "verified": True, "to": "t@example.com", "subject": "Dinner"}
        calls = select_tools("Draft an email to t@example.com about Dinner saying See you at six")
        draft = next(call for call in calls if call["name"] == "create_gmail_draft")
        self.assertEqual(draft["input"]["body"], "See you at six")

    def test_named_recipient_draft_routes_to_verified_lookup(self):
        calls = select_tools("draft an email to tierra saying i love you")
        self.assertEqual([call["name"] for call in calls], ["create_gmail_draft"])
        draft = next(call for call in calls if call["name"] == "create_gmail_draft")
        self.assertEqual(draft["input"]["recipient_query"], "tierra")
        self.assertEqual(draft["input"]["body"], "i love you")

    def test_disabled_gmail_api_has_actionable_guidance(self):
        guidance = gmail_error_guidance(RuntimeError("Gmail API has not been used in project 836526312487 before or it is disabled"))
        self.assertIn("disabled", guidance)
        self.assertIn(GMAIL_API_ENABLE_URL, guidance)


if __name__ == "__main__":
    unittest.main()
