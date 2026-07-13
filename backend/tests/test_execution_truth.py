import inspect
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.assistant.execution import (
    ActionAuditStore,
    capability_manifest,
    detect_nonexecuted_action,
    execute_governed_tool_calls,
    validate_final_response,
    verified,
)
from backend.assistant.tools.registry import AssistantToolContext
from backend.routes.assistant import _cached_response
from backend.schemas.assistant import ActionVerification, AssistantActionExecution
from pydantic import ValidationError
from backend.services import ollama_service
from backend.services.ollama_service import chat_with_jarvis


def action(status, *, verification="unavailable", requested="enable_vercel_auto_deploy"):
    return AssistantActionExecution(
        action_id="act_test",
        source_message_id="source_test",
        conversation_id="conversation_test",
        intent="configure_deployment",
        requested_action=requested,
        execution_status=status,
        tool_name=None if status in {"proposed", "unavailable"} else "test_tool",
        verification=ActionVerification(status=verification, summary="test verification"),
        user_message="No verified change was made.",
    )


class ExecutionTruthTests(unittest.TestCase):
    def test_execution_status_rejects_free_form_values(self):
        with self.assertRaises(ValidationError):
            action("pretended_done")

    def test_planning_response_cannot_become_done(self):
        content, status = validate_final_response("Done. I configured it.", [action("proposed")])
        self.assertEqual(content, "No verified change was made.")
        self.assertEqual(status, "rewritten_unsupported_completion")

    def test_vercel_knowledge_does_not_imply_access(self):
        context = AssistantToolContext(source_message_id="source_vercel", conversation_id="conversation_vercel")
        detected = detect_nonexecuted_action("Can you enable Vercel deployment after every Git push?", context)
        self.assertEqual(detected.execution_status, "unavailable")
        self.assertIsNone(detected.tool_name)
        self.assertIn("not changed anything", detected.user_message)
        manifest = capability_manifest()
        self.assertNotIn("vercel_admin", manifest.available_tools)
        self.assertIn("vercel_admin", manifest.unavailable_capabilities)

    @patch("backend.services.ollama_service.record_nonexecuted_action")
    def test_no_vercel_tool_returns_deterministic_unavailable(self, _record):
        result = chat_with_jarvis(
            [{"role": "user", "content": "Enable Vercel auto-deploy after GitHub pushes."}],
            context=AssistantToolContext(request_id="request_vercel", source_message_id="source_vercel", conversation_id="conversation_vercel"),
        )
        self.assertEqual(result["actions"][0]["execution_status"], "unavailable")
        self.assertNotRegex(result["message"]["content"], r"(?i)\b(done|enabled|configured)\b")

    def test_failed_tool_cannot_produce_completion_language(self):
        content, _ = validate_final_response("Done. It is updated.", [action("failed", verification="failed")])
        self.assertEqual(content, "No verified change was made.")

    def test_unverified_success_cannot_produce_verified_claim(self):
        content, status = validate_final_response("Done and verified.", [action("verification_failed", verification="unavailable")])
        self.assertEqual(content, "No verified change was made.")
        self.assertEqual(status, "rewritten_unsupported_completion")

    def test_verified_tool_can_produce_completion_claim(self):
        content, status = validate_final_response("Done. The change was verified.", [action("succeeded", verification="verified")])
        self.assertEqual(content, "Done. The change was verified.")
        self.assertEqual(status, "passed")

    def test_duplicate_request_does_not_repeat_action(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ActionAuditStore(str(Path(directory) / "audit.json"))
            context = AssistantToolContext(source_message_id="source_duplicate", conversation_id="conversation_duplicate")
            success = {"tool": "create_goal", "access": "write", "success": True, "result": {"updated": True, "goal": {"id": "g1", "title": "Test"}}}
            with patch("backend.assistant.execution.execute_tool_calls", return_value=[success]) as execute:
                first = execute_governed_tool_calls([{"name": "create_goal", "input": {"title": "Test"}}], context, store=store, verifier=lambda *_: verified("reread matched"))
                second = execute_governed_tool_calls([{"name": "create_goal", "input": {"title": "Test"}}], context, store=store, verifier=lambda *_: verified("reread matched"))
            self.assertEqual(execute.call_count, 1)
            self.assertEqual(first[1][0].execution_status, "succeeded")
            self.assertEqual(second[1][0].execution_status, "cancelled")

    def test_tool_results_are_scoped_to_source_message(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ActionAuditStore(str(Path(directory) / "audit.json"))
            success = {"tool": "create_goal", "access": "write", "success": True, "result": {"updated": True, "goal": {"id": "g1", "title": "Test"}}}
            with patch("backend.assistant.execution.execute_tool_calls", return_value=[success]) as execute:
                for source in ("source_one", "source_two"):
                    execute_governed_tool_calls(
                        [{"name": "create_goal", "input": {"title": "Test"}}],
                        AssistantToolContext(source_message_id=source, conversation_id="conversation_shared"),
                        store=store,
                        verifier=lambda *_: verified("reread matched"),
                    )
            self.assertEqual(execute.call_count, 2)

    def test_cached_success_receipt_is_not_replayed_as_new_success(self):
        cached = _cached_response({
            "message": {"role": "assistant", "content": "Done."},
            "tools": [{"tool": "create_goal", "success": True}],
            "actions": [action("succeeded", verification="verified").model_dump()],
            "executionTrace": {"finalExecutionStatus": "succeeded", "finalResponseValidation": "passed"},
        })
        self.assertEqual(cached["actions"][0]["execution_status"], "cancelled")
        self.assertEqual(cached["tools"], [])
        self.assertIn("did not repeat", cached["message"]["content"])
        self.assertEqual(cached["executionTrace"]["finalExecutionStatus"], "cancelled")

    def test_persona_cannot_override_execution_truth(self):
        content, status = validate_final_response("With a wink: done, handsome.", [action("unavailable")])
        self.assertEqual(content, "No verified change was made.")
        self.assertEqual(status, "rewritten_unsupported_completion")

    def test_streaming_is_disabled_until_final_guard_completes(self):
        source = inspect.getsource(ollama_service.chat_with_jarvis)
        self.assertIn('"stream": False', source)
        self.assertIn("build_service_result", source)


if __name__ == "__main__":
    unittest.main()
