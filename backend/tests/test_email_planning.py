import json
import unittest
import uuid
from unittest.mock import patch

from backend.assistant.email_planning import (
    EMAIL_PLAN_STORE,
    PendingEmailPlan,
    apply_revision_metadata,
    classify_brief_locally,
    contains_private_style_language,
    draft_hash,
    is_email_plan_request,
    is_plan_approval,
    is_plan_cancel,
    is_plan_rejection,
    parse_email_plan_request,
    reject_current_draft,
)
from backend.assistant.tools.registry import AssistantToolContext, create_gmail_draft_tool, select_tools
from backend.services.contact_service import resolve_contact_email
from backend.services.ollama_service import chat_with_jarvis, compose_email_plan, revise_email_plan


class EmailPlanningTests(unittest.TestCase):
    conversation_id = "conv_email_plan_tests"

    def tearDown(self):
        EMAIL_PLAN_STORE.clear(self.conversation_id)

    def test_tierra_aliases_are_permanent_and_case_insensitive(self):
        for alias in ("Tierra", "tierra", "baby girl", "BABY GIRL"):
            self.assertEqual(resolve_contact_email("john", alias)["email"], "tco2725@gmail.com")

    def test_direct_draft_uses_saved_contact_without_gmail_search(self):
        call = next(item for item in select_tools("draft an email to baby girl saying I love you") if item["name"] == "create_gmail_draft")
        with patch("backend.assistant.tools.registry.search_gmail") as search, patch("backend.assistant.tools.registry.create_gmail_draft", return_value={"id": "d1", "verified": True}) as create:
            result = create_gmail_draft_tool(AssistantToolContext(), call["input"])
        search.assert_not_called()
        create.assert_called_once_with("tco2725@gmail.com", "A note from John", "I love you")
        self.assertFalse(result["sent"])

    def test_plan_request_and_approval_language(self):
        self.assertEqual(parse_email_plan_request("/plan draft an email to Tierra"), ("Tierra", None))
        self.assertEqual(parse_email_plan_request("can you help me /plan a draft email to tierra"), ("tierra", None))
        self.assertTrue(is_email_plan_request("can you help me /plan a draft email to tierra"))
        self.assertTrue(is_plan_approval("yes, I love it"))
        self.assertTrue(is_plan_approval("I love it"))
        self.assertTrue(is_plan_rejection("no"))
        self.assertFalse(is_plan_cancel("no"))

    @patch("backend.services.ollama_service._request_json")
    def test_plan_waits_for_approval_before_creating_draft(self, request_json):
        run_id = uuid.uuid4().hex
        context = AssistantToolContext(conversation_id=self.conversation_id, request_id=f"req_{run_id}", source_message_id=f"msg_{run_id}")
        first = chat_with_jarvis([{"role": "user", "content": "/plan draft an email to Tierra"}], context=context)
        self.assertIn("What do you want to say", first["message"]["content"])
        request_json.return_value = {"message": {"content": json.dumps({"subject": "Love you", "body": "I love you."})}}
        preview = chat_with_jarvis([{"role": "user", "content": "Tell her I love her"}], context=context)
        self.assertIn("Subject: Love you", preview["message"]["content"])
        self.assertEqual(preview["actions"], [])
        with patch("backend.assistant.tools.registry.create_gmail_draft", return_value={"id": "draft-1", "message_id": "m1", "to": "tco2725@gmail.com", "subject": "Love you", "verified": True}):
            approved = chat_with_jarvis([{"role": "user", "content": "yes I love it"}], context=AssistantToolContext(conversation_id=self.conversation_id, request_id=f"req_approve_{run_id}", source_message_id=f"msg_approve_{run_id}"))
        self.assertEqual(approved["actions"][0]["execution_status"], "succeeded")
        self.assertIsNone(EMAIL_PLAN_STORE.get(self.conversation_id))

    @patch("backend.services.ollama_service._request_json")
    def test_embedded_plan_command_keeps_followups_in_verified_workflow(self, request_json):
        run_id = uuid.uuid4().hex
        context = AssistantToolContext(conversation_id=self.conversation_id, request_id=f"req_{run_id}", source_message_id=f"msg_{run_id}")
        first = chat_with_jarvis([{"role": "user", "content": "can you help me /plan a draft email to tierra"}], context=context)
        self.assertIn("What do you want to say", first["message"]["content"])

        request_json.return_value = {"message": {"content": json.dumps({"subject": "Proud of you", "body": "I love you, and I'm proud of you."})}}
        preview = chat_with_jarvis([{"role": "user", "content": "Playful and affectionate. Tell her I love her and I'm proud of her."}], context=context)
        self.assertIn("Say `yes, I love it`", preview["message"]["content"])

        with patch("backend.assistant.tools.registry.create_gmail_draft", return_value={"id": "draft-2", "message_id": "m2", "to": "tco2725@gmail.com", "subject": "Proud of you", "verified": True}):
            approved = chat_with_jarvis([{"role": "user", "content": "I love it"}], context=AssistantToolContext(conversation_id=self.conversation_id, request_id=f"req_approve_{run_id}", source_message_id=f"msg_approve_{run_id}"))
        self.assertEqual(approved["actions"][0]["execution_status"], "succeeded")

    def test_style_instruction_is_separate_private_metadata(self):
        content, tone, _constraints = classify_brief_locally("I want to come off with some dom vibes. I love her and she is doing an amazing job.")
        self.assertEqual(content, ["I love her and she is doing an amazing job."])
        self.assertEqual(tone, ["I want to come off with some dom vibes."])

    def test_correction_moves_style_phrase_out_of_content(self):
        plan = self.make_plan(content_goals=["I want to come off with dom vibes", "I love Tierra"])
        apply_revision_metadata(plan, "Don't tell her I want to come off with dom vibes. That should only be the tone.")
        self.assertEqual(plan.content_goals, ["I love Tierra"])
        self.assertTrue(any("assertive" in item for item in plan.tone))

    @patch("backend.services.ollama_service._request_json")
    def test_meta_language_is_regenerated_before_preview(self, request_json):
        request_json.side_effect = [
            {"message": {"content": json.dumps({"subject": "Hey", "body": "I want to come off with dom vibes. I love you.", "content_goals": ["I love you"], "tone": ["dom vibes"], "constraints": []})}},
            {"message": {"content": json.dumps({"subject": "Proud of you", "body": "I love you. You're doing an amazing job, and I'm proud of you.", "content_goals": ["I love you", "You are doing an amazing job"], "tone": ["confident and assertive"], "constraints": []})}},
        ]
        plan = self.make_plan()
        compose_email_plan("qwen3:8b", plan, "Give it dom vibes. Tell her I love her and she is doing an amazing job.")
        self.assertNotIn("dom vibes", plan.body.lower())
        self.assertEqual(request_json.call_count, 2)

    @patch("backend.services.ollama_service._request_json")
    def test_rejected_and_try_again_drafts_cannot_return_unchanged(self, request_json):
        plan = self.make_plan(body="Old exact wording", content_goals=["I love Tierra"], tone=["affectionate"], status="proposed", revision_number=1)
        reject_current_draft(plan)
        request_json.return_value = {"message": {"content": json.dumps({"subject": "Same", "body": "Old exact wording", "content_goals": plan.content_goals, "tone": plan.tone, "constraints": []})}}
        revise_email_plan("qwen3:8b", plan, "Try again")
        self.assertNotEqual(plan.body, "Old exact wording")
        self.assertIn(draft_hash("Old exact wording"), plan.rejected_draft_hashes)
        self.assertEqual(plan.revision_number, 2)

    @patch("backend.services.ollama_service._request_json")
    def test_everything_rewrites_from_goals_and_preserves_recipient(self, request_json):
        plan = self.make_plan(body="Rejected copy", content_goals=["I love Tierra", "I am proud of her"], tone=["confident"], status="proposed", revision_number=1)
        reject_current_draft(plan)
        request_json.return_value = {"message": {"content": json.dumps({"subject": "Proud of you", "body": "Tierra, I love you. I see the work you're doing, and I'm proud of you.", "content_goals": plan.content_goals, "tone": plan.tone, "constraints": []})}}
        revise_email_plan("qwen3:8b", plan, "Rewrite everything from scratch")
        self.assertEqual(plan.recipient_name, "Tierra")
        self.assertEqual(plan.content_goals, ["I love Tierra", "I am proud of her"])
        self.assertNotEqual(plan.body, "Rejected copy")

    def test_no_is_rejection_and_intimate_tone_stays_private(self):
        self.assertTrue(is_plan_rejection("No"))
        self.assertTrue(contains_private_style_language("I want to give dom vibes.", ["confident, affectionate, and assertive"]))
        self.assertFalse(contains_private_style_language("I love you. I'm proud of you, and I've got you.", ["confident, affectionate, and assertive"]))

    @staticmethod
    def make_plan(**updates):
        values = {
            "conversation_id": "conv_structured_email_test",
            "recipient_name": "Tierra",
            "recipient_email": "tco2725@gmail.com",
        }
        values.update(updates)
        return PendingEmailPlan(**values)


if __name__ == "__main__":
    unittest.main()
