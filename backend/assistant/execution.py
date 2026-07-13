from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from backend.assistant.tools.registry import (
    READ_TOOLS_ENABLED,
    MAX_TOOL_CALLS,
    TOOL_REGISTRY,
    WRITE_TOOLS_ENABLED,
    AssistantToolContext,
    execute_tool_calls,
)
from backend.schemas.assistant import ActionVerification, AssistantActionExecution, AssistantCapabilityManifest
from backend.utils.local_store import read_json, write_json

AUDIT_FILE = "assistant_action_log.json"
UNAVAILABLE_CAPABILITIES = ["github_write", "vercel_admin", "email_send", "arbitrary_shell"]
FINAL_STATUSES = {"succeeded", "failed", "verification_failed", "unavailable", "cancelled"}
COMPLETION_PATTERN = re.compile(
    r"(?i)\b(done|completed|deployed|enabled|updated|saved|sent|created|installed|restarted|fixed|configured|took care of|set (?:it|everything) up)\b"
)
VERIFIED_PATTERN = re.compile(r"(?i)\bverified\b")
EXPLANATION_PATTERN = re.compile(r"(?i)\b(how (?:do|would|can)|show me|explain|what (?:are|is) the steps|walk me through)\b")


class ActionAuditStore:
    def __init__(self, filename: str = AUDIT_FILE):
        self.filename = filename
        self._lock = threading.Lock()

    def find_final(self, source_message_id: str, tool_name: str, arguments_hash: str) -> dict[str, Any] | None:
        with self._lock:
            entries = read_json(self.filename, [])
        return next(
            (
                entry
                for entry in reversed(entries)
                if entry.get("source_message_id") == source_message_id
                and entry.get("tool_name") == tool_name
                and entry.get("arguments_hash") == arguments_hash
                and entry.get("execution_status") in FINAL_STATUSES
            ),
            None,
        )

    def upsert(self, entry: dict[str, Any]) -> None:
        with self._lock:
            entries = read_json(self.filename, [])
            index = next((i for i, item in enumerate(entries) if item.get("action_id") == entry["action_id"]), None)
            if index is None:
                entries.append(entry)
            else:
                entries[index] = entry
            write_json(self.filename, entries[-1000:])


ACTION_AUDIT_STORE = ActionAuditStore()


def capability_manifest() -> AssistantCapabilityManifest:
    available = []
    for tool in TOOL_REGISTRY.values():
        if tool.access == "read" and READ_TOOLS_ENABLED:
            available.append(tool.name)
        elif tool.access == "write" and WRITE_TOOLS_ENABLED:
            available.append(tool.name)
    return AssistantCapabilityManifest(
        available_tools=sorted(available),
        unavailable_capabilities=list(UNAVAILABLE_CAPABILITIES),
    )


def capability_manifest_prompt(manifest: AssistantCapabilityManifest) -> str:
    return "\n".join([
        "Server-authoritative capability manifest for this request:",
        json.dumps(manifest.model_dump(), sort_keys=True),
        "Only available_tools can be executed. Unavailable capabilities do not exist for you, even if you know their setup steps.",
    ])


def detect_nonexecuted_action(text: str, context: AssistantToolContext) -> AssistantActionExecution | None:
    lower = text.lower()
    target = None
    intent = "external_state_change"
    if "vercel" in lower and re.search(r"\b(deploy|enable|configure|set up|auto.?deploy|change|update)\b", lower):
        target = "enable_vercel_auto_deploy"
        intent = "configure_deployment"
    elif "github" in lower and re.search(r"\b(webhook|push|write|create|configure|enable|change|update)\b", lower):
        target = "configure_github"
        intent = "configure_source_control"
    elif re.search(r"\b(send|email)\b", lower) and "email" in lower:
        target = "send_email"
        intent = "external_communication"
    elif re.search(r"\b(run|execute)\b", lower) and re.search(r"\b(shell|powershell|command)\b", lower):
        target = "execute_shell_command"
        intent = "operating_system_action"
    if not target:
        return None
    proposed = bool(EXPLANATION_PATTERN.search(text))
    status = "proposed" if proposed else "unavailable"
    message = (
        "I can explain how to configure this, but I have not changed anything."
        if proposed
        else unavailable_action_message(target)
    )
    return AssistantActionExecution(
        action_id=new_action_id(),
        source_message_id=context.source_message_id,
        conversation_id=context.conversation_id,
        intent=intent,
        requested_action=target,
        execution_status=status,
        tool_name=None,
        requires_confirmation=False,
        result=None,
        verification=ActionVerification(status="unavailable", summary="No authorized tool is registered for this capability."),
        user_message=message,
    )


def record_nonexecuted_action(execution: AssistantActionExecution, store: ActionAuditStore = ACTION_AUDIT_STORE) -> None:
    now = utc_now()
    store.upsert({
        "action_id": execution.action_id,
        "source_message_id": execution.source_message_id,
        "conversation_id": execution.conversation_id,
        "requested_action": execution.requested_action,
        "tool_name": None,
        "arguments_hash": hash_arguments({}),
        "execution_status": execution.execution_status,
        "start_time": now,
        "end_time": now,
        "result_summary": "No tool executed.",
        "verification_status": execution.verification.status if execution.verification else "unavailable",
        "error_category": "CAPABILITY_UNAVAILABLE" if execution.execution_status == "unavailable" else None,
    })


def execute_governed_tool_calls(
    tool_calls: list[dict[str, Any]],
    context: AssistantToolContext,
    *,
    store: ActionAuditStore = ACTION_AUDIT_STORE,
    verifier: Callable[[str, dict[str, Any], AssistantToolContext], ActionVerification] | None = None,
) -> tuple[list[dict[str, Any]], list[AssistantActionExecution], list[dict[str, Any]]]:
    results: list[dict[str, Any]] = []
    executions: list[AssistantActionExecution] = []
    trace: list[dict[str, Any]] = []
    verify = verifier or verify_tool_result
    for call in tool_calls[:MAX_TOOL_CALLS]:
        tool_name = str(call.get("name") or "")
        input_data = call.get("input") if isinstance(call.get("input"), dict) else {}
        definition = TOOL_REGISTRY.get(tool_name)
        if not definition or definition.access != "write":
            result = execute_tool_calls([call], context)[0]
            results.append(result)
            continue
        if definition.requires_confirmation:
            execution = AssistantActionExecution(
                action_id=new_action_id(), source_message_id=context.source_message_id, conversation_id=context.conversation_id,
                intent=tool_name, requested_action=tool_name, execution_status="awaiting_confirmation", tool_name=tool_name,
                requires_confirmation=True, result=None,
                verification=ActionVerification(status="pending", summary="The tool has not executed; explicit confirmation is required."),
                user_message=f"I can {friendly_action(tool_name)}, but I need your confirmation before the tool can execute.",
            )
            now = utc_now()
            store.upsert({
                "action_id": execution.action_id, "source_message_id": context.source_message_id, "conversation_id": context.conversation_id,
                "requested_action": tool_name, "tool_name": tool_name, "arguments_hash": hash_arguments(input_data),
                "execution_status": "awaiting_confirmation", "start_time": now, "end_time": now,
                "result_summary": "Tool not executed; confirmation required.", "verification_status": "pending", "error_category": None,
            })
            results.append({"tool": tool_name, "access": "write", "success": False, "error": {"code": "CONFIRMATION_REQUIRED", "message": "Explicit confirmation is required."}})
            executions.append(execution)
            trace.append({"tool": tool_name, "event": "awaiting_confirmation", "status": "awaiting_confirmation"})
            continue
        arguments_hash = hash_arguments(input_data)
        duplicate = store.find_final(context.source_message_id, tool_name, arguments_hash)
        if duplicate:
            result = {"tool": tool_name, "access": "write", "success": False, "error": {"code": "DUPLICATE", "message": "Duplicate action request; no action was repeated."}}
            execution = AssistantActionExecution(
                action_id=new_action_id(), source_message_id=context.source_message_id, conversation_id=context.conversation_id,
                intent=tool_name, requested_action=tool_name, execution_status="cancelled", tool_name=tool_name,
                requires_confirmation=definition.requires_confirmation, result=None,
                verification=ActionVerification(status="unavailable", summary="Duplicate request blocked by its idempotency key."),
                user_message="I detected a duplicate request and did not repeat the action.",
            )
            results.append(result); executions.append(execution)
            store.upsert({
                "action_id": execution.action_id, "source_message_id": context.source_message_id, "conversation_id": context.conversation_id,
                "requested_action": tool_name, "tool_name": tool_name, "arguments_hash": arguments_hash,
                "execution_status": "cancelled", "start_time": utc_now(), "end_time": utc_now(),
                "result_summary": "Duplicate request blocked; tool was not executed.", "verification_status": "unavailable",
                "error_category": "DUPLICATE",
            })
            trace.append({"tool": tool_name, "event": "duplicate_blocked", "status": "cancelled"})
            continue
        action_id = new_action_id()
        started_at = utc_now()
        audit = {
            "action_id": action_id, "source_message_id": context.source_message_id, "conversation_id": context.conversation_id,
            "requested_action": tool_name, "tool_name": tool_name, "arguments_hash": arguments_hash,
            "execution_status": "executing", "start_time": started_at, "end_time": None,
            "result_summary": None, "verification_status": "pending", "error_category": None,
        }
        store.upsert(audit)
        trace.append({"tool": tool_name, "event": "tool_start", "status": "executing"})
        result = execute_tool_calls([call], context)[0]
        tool_result = result.get("result") if isinstance(result.get("result"), dict) else {}
        if tool_result.get("needs_input"):
            status = "awaiting_confirmation"
            verification = ActionVerification(status="unavailable", summary="Required action fields are missing.")
            user_message = str(tool_result.get("question") or "I need more information before I can perform that action.")
        elif not result.get("success") or tool_result.get("updated") is False:
            status = "failed"
            verification = ActionVerification(status="failed", summary="The tool did not report a successful state change.")
            reason = tool_result.get("reason") or (result.get("error") or {}).get("message") or "The action failed."
            user_message = f"I tried to {friendly_action(tool_name)}, but it failed: {reason} No verified change was recorded."
        else:
            verification = verify(tool_name, tool_result, context)
            status = "succeeded" if verification.status in {"verified", "not_required"} else "verification_failed"
            if status == "succeeded":
                user_message = f"The {friendly_action(tool_name)} action succeeded and was verified."
            else:
                user_message = f"The tool reported success for {friendly_action(tool_name)}, but I could not verify the resulting state, so I am not calling it complete."
        execution = AssistantActionExecution(
            action_id=action_id, source_message_id=context.source_message_id, conversation_id=context.conversation_id,
            intent=tool_name, requested_action=tool_name, execution_status=status, tool_name=tool_name,
            requires_confirmation=definition.requires_confirmation, result=safe_result_summary(tool_result),
            verification=verification, user_message=user_message,
        )
        audit.update({
            "execution_status": status, "end_time": utc_now(), "result_summary": summarize_for_audit(result, tool_result),
            "verification_status": verification.status,
            "error_category": (result.get("error") or {}).get("code") if not result.get("success") else None,
        })
        store.upsert(audit)
        trace.append({"tool": tool_name, "event": "tool_result", "success": bool(result.get("success")), "status": status})
        trace.append({"tool": tool_name, "event": "verification_result", "status": verification.status})
        results.append(result); executions.append(execution)
    return results, executions, trace


def verify_tool_result(tool_name: str, result: dict[str, Any], context: AssistantToolContext) -> ActionVerification:
    try:
        if tool_name in {"create_goal", "log_goal_progress"}:
            from backend.services.goal_service import get_goal
            expected = result.get("goal") or {}
            current = get_goal(str(expected.get("id") or ""))
            log_id = (result.get("log") or {}).get("id")
            log_matches = tool_name != "log_goal_progress" or bool(current and any(log.get("id") == log_id for log in current.get("logs") or []))
            if current and current.get("id") == expected.get("id") and log_matches and (not expected.get("title") or current.get("title") == expected.get("title")):
                return verified("Goal state was reread by ID and matched.")
        elif tool_name in {"add_shopping_item", "check_shopping_item"}:
            from backend.services.shopping_service import get_shopping_list
            expected = result.get("item") or {}
            current_list = get_shopping_list(str((result.get("shopping_list") or {}).get("id") or "")) or {}
            current = next((item for item in current_list.get("items") or [] if item.get("id") == expected.get("id")), None)
            if current and (tool_name != "check_shopping_item" or current.get("is_checked") is True):
                return verified("Shopping item was reread and matched.")
        elif tool_name in {"complete_forge_project", "complete_forge_task", "capture_forge_spark"}:
            from backend.services.forge_service import list_forge_projects, list_forge_sparks, list_forge_tasks
            key = "project" if tool_name == "complete_forge_project" else "task" if tool_name == "complete_forge_task" else "spark"
            expected = result.get(key) or {}
            rows = list_forge_projects(context.user_id) if key == "project" else list_forge_tasks(context.user_id) if key == "task" else list_forge_sparks(context.user_id)
            current = next((row for row in rows if row.get("id") == expected.get("id")), None)
            if current and (key == "spark" or str(current.get("status") or "").lower() in {"archived", "done", "complete", "completed"}):
                return verified(f"Forge {key} was reread and matched.")
        elif tool_name == "complete_meal":
            from backend.services.meal_planner_service import get_meal_plan_entry
            expected = result.get("meal") or {}
            current = get_meal_plan_entry(str(expected.get("id") or ""))
            if current and current.get("id") == expected.get("id") and "\"completed\": true" in str(current.get("notes") or "").lower():
                return verified("Meal entry was reread and remained completed.")
        elif tool_name in {"upsert_health_checkin", "complete_daily_checkin", "log_caffeine_drink"}:
            from backend.services.health_service import _daily_checkin
            expected = result.get("checkin") or {}
            current = _daily_checkin(context.user_id, str(expected.get("checkin_date") or ""))
            if current and current.get("id") == expected.get("id"):
                return verified("Health check-in was reread by date and matched.")
        elif tool_name == "log_health_event":
            from backend.services.health_service import _health_events
            expected = result.get("event") or {}
            event_date = str(expected.get("event_date") or "")
            current = next((event for event in _health_events(context.user_id, event_date, event_date) if event.get("id") == expected.get("id")), None)
            if current and current.get("event_type") == expected.get("event_type"):
                return verified("Health event was reread by ID and matched.")
    except Exception:
        return ActionVerification(status="failed", summary="The verification reread failed.")
    return ActionVerification(status="unavailable", summary="No reliable reread verifier is available for this tool result.")


def validate_final_response(content: str, executions: list[AssistantActionExecution]) -> tuple[str, str]:
    if not executions:
        return content, "passed_no_action"
    completion_language = bool(COMPLETION_PATTERN.search(content))
    verified_language = bool(VERIFIED_PATTERN.search(content))
    succeeded = [item for item in executions if item.execution_status == "succeeded"]
    verified_success = [item for item in succeeded if item.verification and item.verification.status == "verified"]
    blocking = [item for item in executions if item.execution_status in {"failed", "verification_failed", "unavailable", "cancelled"}]
    if blocking and (completion_language or verified_language):
        return " ".join(item.user_message for item in blocking), "rewritten_unsupported_completion"
    if verified_language and not verified_success:
        return " ".join(item.user_message for item in executions), "rewritten_unsupported_verification"
    if completion_language and not succeeded:
        return " ".join(item.user_message for item in executions), "rewritten_unsupported_completion"
    return content, "passed"


def unavailable_action_message(action: str) -> str:
    if action == "enable_vercel_auto_deploy":
        return "I can show you how to configure that, but I do not currently have authorized Vercel access, so I have not changed anything."
    if action == "configure_github":
        return "I can explain the GitHub configuration, but no authorized GitHub write tool is connected, so I have not changed anything."
    if action == "send_email":
        return "Email sending is unavailable, so no message was sent."
    return "That operating-system action is unavailable through Jarvis, so no change was made."


def safe_result_summary(result: dict[str, Any]) -> dict[str, Any] | None:
    if not result:
        return None
    summary: dict[str, Any] = {}
    for key in ("updated", "already_done"):
        if key in result and isinstance(result[key], bool):
            summary[key] = result[key]
    for key in ("goal", "item", "event", "checkin", "meal", "drink", "project", "task", "spark"):
        value = result.get(key)
        if isinstance(value, dict):
            summary[key] = {field: value.get(field) for field in ("id", "title", "name", "item_name", "status", "event_type", "checkin_date", "label") if value.get(field) is not None}
    return summary or {"updated": True}


def summarize_for_audit(result: dict[str, Any], tool_result: dict[str, Any]) -> str:
    if result.get("success") and tool_result.get("updated") is not False:
        return "Tool returned success for a validated state-changing action."
    return "Tool did not confirm a state change."


def hash_arguments(arguments: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(arguments, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def friendly_action(name: str) -> str:
    return name.replace("_", " ")


def new_action_id() -> str:
    return f"act_{uuid.uuid4().hex}"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def verified(summary: str) -> ActionVerification:
    return ActionVerification(status="verified", summary=summary, verified_at=utc_now())


def development_trace_enabled() -> bool:
    return os.getenv("ENVIRONMENT", "development").lower() in {"development", "dev", "local"}
