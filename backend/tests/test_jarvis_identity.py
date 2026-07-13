import unittest

from backend.prompts.jarvis import JARVIS_SYSTEM_PROMPT
from backend.routes.assistant import assistant_chat
from backend.schemas.assistant import AssistantChatRequest
from backend.services.ollama_service import chat_with_jarvis, enforce_jarvis_identity


class JarvisIdentityTests(unittest.TestCase):
    def test_name_question_returns_jarvis_without_model_drift(self):
        result = chat_with_jarvis([{"role": "user", "content": "What is your name?"}])
        self.assertIn("Jarvis", result["message"]["content"])

    def test_chloe_question_gets_natural_correction(self):
        result = chat_with_jarvis([{"role": "user", "content": "Are you Chloe?"}])
        self.assertIn("I'm Jarvis", result["message"]["content"])

    def test_legacy_context_cannot_override_identity(self):
        result = chat_with_jarvis([
            {"role": "assistant", "content": "My name is Chloe."},
            {"role": "user", "content": "What is your name?"},
        ])
        self.assertIn("Jarvis", result["message"]["content"])

    def test_prompt_and_output_guard_lock_identity(self):
        self.assertIn("Never claim that Chloe is your name", JARVIS_SYSTEM_PROMPT)
        self.assertIn("Knowing the steps is not performing the steps", JARVIS_SYSTEM_PROMPT)
        self.assertLess(JARVIS_SYSTEM_PROMPT.index("EXECUTION TRUTH"), JARVIS_SYSTEM_PROMPT.index("Jim and Pam"))
        self.assertEqual(enforce_jarvis_identity("Hi, my name is Chloe."), "Hi, my name is Jarvis.")

    def test_duplicate_request_id_returns_cached_response(self):
        payload = AssistantChatRequest(
            request_id="identity-dedupe-test",
            source_message_id="identity-source-test",
            messages=[{"role": "user", "content": "What is your name?"}],
        )
        assistant_chat(payload)
        repeated = assistant_chat(payload)
        self.assertTrue(repeated["identityDiagnostics"]["cachedPromptOrResponseUsed"])


if __name__ == "__main__":
    unittest.main()
