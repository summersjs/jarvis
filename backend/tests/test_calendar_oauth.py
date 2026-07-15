import unittest
from unittest.mock import MagicMock, patch

from backend.integrations import google_calendar


class CalendarOAuthTests(unittest.TestCase):
    def setUp(self):
        google_calendar._OAUTH_STATES.clear()

    @patch("backend.integrations.google_calendar.CREDS_PATH")
    @patch("backend.integrations.google_calendar.TOKEN_PATH")
    @patch("backend.integrations.google_calendar.InstalledAppFlow.from_client_secrets_file")
    def test_pkce_verifier_survives_until_callback(self, make_flow, token_path, creds_path):
        creds_path.exists.return_value = True
        begin_flow = MagicMock()
        begin_flow.code_verifier = "one-time-pkce-verifier"
        begin_flow.authorization_url.return_value = ("https://accounts.google.test/auth", "state")
        complete_flow = MagicMock()
        complete_flow.credentials.to_json.return_value = "{}"
        complete_flow.credentials.valid = True
        make_flow.side_effect = [begin_flow, complete_flow]

        with patch("backend.integrations.google_calendar.secrets.token_urlsafe", return_value="test-state-that-is-long-enough"):
            google_calendar.begin_calendar_oauth("http://localhost:3000")

        google_calendar.complete_calendar_oauth("test-state-that-is-long-enough", "google-code")

        self.assertEqual(complete_flow.code_verifier, "one-time-pkce-verifier")
        complete_flow.fetch_token.assert_called_once_with(code="google-code")
        token_path.write_text.assert_called_once_with("{}")


if __name__ == "__main__":
    unittest.main()
