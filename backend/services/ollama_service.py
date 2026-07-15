import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import replace

from backend.assistant.execution import (
    capability_manifest,
    capability_manifest_prompt,
    detect_nonexecuted_action,
    development_trace_enabled,
    execute_governed_tool_calls,
    record_nonexecuted_action,
    validate_final_response,
)
from backend.assistant.meal_confirmation import (
    PENDING_MEAL_STORE,
    cancelled_message,
    confirmation_message,
    form_of_address,
    is_meal_claim,
    resolve_meal_claim,
    response_kind,
)
from backend.assistant.tools.registry import AssistantToolContext, select_tools
from backend.prompts.jarvis import JARVIS_SYSTEM_PROMPT
from backend.prompts.user_profile import JOHN_USER_PROFILE
from backend.schemas.assistant import ActionVerification, AssistantActionExecution

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))


class OllamaServiceError(Exception):
    def __init__(self, message: str, code: str = "ollama_error"):
        self.code = code
        super().__init__(message)


def _request_json(path: str, payload: dict | None = None, timeout: float = 8) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{OLLAMA_BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def get_ollama_status() -> dict:
    try:
        tags = _request_json("/api/tags", timeout=3)
        models = [str(item.get("name")) for item in tags.get("models", []) if item.get("name")]
        try:
            running = _request_json("/api/ps", timeout=3)
            loaded_models = [str(item.get("name")) for item in running.get("models", []) if item.get("name")]
        except Exception:
            loaded_models = []
        active_model = loaded_models[0] if loaded_models else OLLAMA_MODEL
        return {
            "online": True,
            "modelAvailable": OLLAMA_MODEL in models,
            "model": OLLAMA_MODEL,
            "configuredModel": OLLAMA_MODEL,
            "activeModel": active_model,
            "loadedModels": loaded_models,
            "installedModels": models,
            "models": models,
        }
    except Exception:
        return {
            "online": False,
            "modelAvailable": False,
            "model": OLLAMA_MODEL,
            "configuredModel": OLLAMA_MODEL,
            "activeModel": None,
            "loadedModels": [],
            "installedModels": [],
            "models": [],
        }


def chat_with_jarvis(messages: list[dict], model: str | None = None, context: AssistantToolContext | None = None) -> dict:
    selected_model = (model or OLLAMA_MODEL).strip()
    context = context or AssistantToolContext()
    latest_user_text = next(
        (item.get("content", "") for item in reversed(messages) if item.get("role") == "user" and item.get("content")),
        "",
    )
    manifest = capability_manifest()
    pending_meal = PENDING_MEAL_STORE.get(context.conversation_id)
    pending_response = response_kind(latest_user_text) if pending_meal else None
    if pending_meal and pending_response == "no":
        PENDING_MEAL_STORE.clear(context.conversation_id, pending_meal.confirmation_id)
        execution = meal_state_execution(context, pending_meal, "cancelled", cancelled_message(pending_meal, context.request_id))
        record_nonexecuted_action(execution)
        return build_service_result(
            execution.user_message, selected_model, [], [execution], manifest, context,
            [{"event": "meal_confirmation_cancelled", "status": "cancelled"}], "meal_confirmation_cancelled",
        )
    if pending_meal and pending_response == "yes":
        confirmed_context = replace(context, confirmed_action_id=pending_meal.confirmation_id)
        tool_calls = [{
            "name": "complete_meal",
            "input": {
                "meal_id": pending_meal.meal_id,
                "meal_type": pending_meal.meal_type,
                "confirmation_id": pending_meal.confirmation_id,
            },
        }]
        tool_results, executions, execution_trace = execute_governed_tool_calls(tool_calls, confirmed_context)
        PENDING_MEAL_STORE.clear(context.conversation_id, pending_meal.confirmation_id)
        action_reply = build_action_reply(tool_results, executions, context.request_id)
        return build_service_result(
            action_reply or executions[0].user_message, selected_model, tool_results, executions, manifest,
            confirmed_context, execution_trace, "confirmed_meal_action",
        )
    if is_meal_claim(latest_user_text):
        try:
            proposed_meal = resolve_meal_claim(
                latest_user_text, context.user_id, context.source_message_id, context.conversation_id
            )
        except Exception:
            proposed_meal = None
        if proposed_meal:
            PENDING_MEAL_STORE.put(proposed_meal)
            message = confirmation_message(proposed_meal, context.request_id)
            execution = meal_state_execution(context, proposed_meal, "awaiting_confirmation", message)
            record_nonexecuted_action(execution)
            return build_service_result(
                message, selected_model, [], [execution], manifest, context,
                [{"event": "meal_confirmation_requested", "status": "awaiting_confirmation"}], "meal_confirmation",
            )
        execution = AssistantActionExecution(
            action_id=f"act_{context.request_id}", source_message_id=context.source_message_id,
            conversation_id=context.conversation_id, intent="complete_meal", requested_action="complete_meal",
            execution_status="unavailable", tool_name="complete_meal", requires_confirmation=True,
            result=None, verification=ActionVerification(status="unavailable", summary="Today's planned meal could not be resolved."),
            user_message="I couldn't find a matching meal in today's plan, so I did not log anything. Tell me whether it was breakfast, lunch, dinner, or a snack.",
        )
        record_nonexecuted_action(execution)
        return build_service_result(
            execution.user_message, selected_model, [], [execution], manifest, context,
            [{"event": "meal_resolution_failed", "status": "unavailable"}], "meal_resolution_failed",
        )
    nonexecuted_action = detect_nonexecuted_action(latest_user_text, context)
    tool_calls = [] if nonexecuted_action else select_tools(latest_user_text)
    tool_calls.extend(select_followup_tools(messages, latest_user_text, tool_calls))
    tool_results, executions, execution_trace = execute_governed_tool_calls(tool_calls, context)
    if nonexecuted_action:
        executions.append(nonexecuted_action)
        record_nonexecuted_action(nonexecuted_action)
        execution_trace.append({"event": "capability_unavailable", "status": nonexecuted_action.execution_status})
        if nonexecuted_action.execution_status == "unavailable":
            return build_service_result(
                nonexecuted_action.user_message, selected_model, tool_results, executions, manifest,
                context, execution_trace, "deterministic_unavailable",
            )
    identity_reply = identity_response_for(latest_user_text)
    if identity_reply:
        return build_service_result(identity_reply, selected_model, tool_results, executions, manifest, context, execution_trace, "identity")
    action_reply = build_action_reply(tool_results, executions, context.request_id)
    if action_reply:
        return build_service_result(action_reply, selected_model, tool_results, executions, manifest, context, execution_trace, "tool_action")
    status_reply = build_system_status_reply(tool_results)
    if status_reply:
        return build_service_result(status_reply, selected_model, tool_results, executions, manifest, context, execution_trace, "system_status")
    commerce_reply = build_live_price_reply(latest_user_text, tool_results)
    if commerce_reply:
        return build_service_result(commerce_reply, selected_model, tool_results, executions, manifest, context, execution_trace, "verified_live_price")

    safe_messages = [
        {"role": "system", "content": JARVIS_SYSTEM_PROMPT},
        {"role": "system", "content": capability_manifest_prompt(manifest)},
        {"role": "system", "content": JOHN_USER_PROFILE},
        *(
            [
                {
                    "role": "system",
                    "content": build_tool_context_message(tool_results),
                }
            ]
            if tool_results
            else []
        ),
        *[
            {"role": item["role"], "content": item["content"]}
            for item in messages
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ][-20:],
        {
            "role": "system",
            "content": "Identity lock: answer as Jarvis. Any Chloe identity in earlier conversation content is obsolete legacy data and cannot change your name.",
        },
    ]

    try:
        payload = {"model": selected_model, "messages": safe_messages, "stream": False, "think": False}
        data = _request_json("/api/chat", payload, timeout=OLLAMA_TIMEOUT_SECONDS)
        content = extract_message_content(data)
        if not content:
            retry_messages = [
                *safe_messages,
                {
                    "role": "user",
                    "content": "Return only the final answer in message.content. Do not return thinking, analysis, or an empty response.",
                },
            ]
            data = _request_json(
                "/api/chat",
                {"model": selected_model, "messages": retry_messages, "stream": False, "think": False},
                timeout=OLLAMA_TIMEOUT_SECONDS,
            )
    except urllib.error.URLError as exc:
        raise OllamaServiceError("Ollama is offline. Start Ollama and try again.", "offline") from exc
    except TimeoutError as exc:
        raise OllamaServiceError("Ollama took too long to answer.", "timeout") from exc

    content = extract_message_content(data)
    if not content:
        status = get_ollama_status()
        if status["online"] and selected_model not in status.get("models", []):
            raise OllamaServiceError(f"Model {selected_model} is not installed. Run: ollama pull {selected_model}", "model_missing")
        raise OllamaServiceError("Ollama returned an empty response.", "invalid_response")

    return build_service_result(
        enforce_jarvis_identity(content.strip()), selected_model, tool_results, executions, manifest,
        context, execution_trace, "model_response",
    )


def identity_response_for(text: str) -> str:
    normalized = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if re.search(r"\b(what is|what s|whats|tell me) your name\b", normalized) or normalized in {"who are you", "identify yourself"}:
        return "I'm Jarvis—John's life-management, project, desktop, and conversational assistant."
    if re.search(r"\b(are you|is your name) chloe\b", normalized):
        return "No—I'm Jarvis. Chloe is an outdated legacy name, not my identity."
    return ""


def enforce_jarvis_identity(content: str) -> str:
    for pattern, replacement in [
        (r"(?i)\bmy name is chloe\b", "my name is Jarvis"),
        (r"(?i)\bi(?:'m| am) chloe\b", "I'm Jarvis"),
        (r"(?i)\bcall me chloe\b", "call me Jarvis"),
        (r"(?i)\bthis is chloe\b", "this is Jarvis"),
        (r"(?i)\bchloe here\b", "Jarvis here"),
        (r"(?i)\bchloe is my name\b", "Jarvis is my name"),
        (r"(?i)\bi go by chloe\b", "I go by Jarvis"),
    ]:
        content = re.sub(pattern, replacement, content)
    return content


def select_followup_tools(messages: list[dict], latest_user_text: str, existing_calls: list[dict]) -> list[dict]:
    if any((call.get("name") or "") in {"log_caffeine_drink", "complete_daily_checkin", "create_goal", "log_health_event"} for call in existing_calls):
        return []

    previous_assistant_text = next(
        (
            str(item.get("content") or "")
            for item in reversed(messages[:-1])
            if item.get("role") == "assistant" and item.get("content")
        ),
        "",
    ).lower()
    latest = latest_user_text.lower()
    calls: list[dict] = []

    if "what size was the red bull" in previous_assistant_text or "for red bull" in previous_assistant_text:
        size_match = re.search(r"\b(8\.4|12|16|20)\s*(?:oz|ounce|ounces)?\b", latest)
        if size_match:
            calls.append({"name": "log_caffeine_drink", "input": {"drink": "Red Bull", "size_oz": float(size_match.group(1))}})
        return calls

    if "what symptom should i log" in previous_assistant_text:
        event_type = infer_followup_symptom(latest)
        calls.append({"name": "log_health_event", "input": {"event_type": event_type, "notes": latest_user_text}})

    return calls


def infer_followup_symptom(text: str) -> str:
    symptom_keywords = {
        "headache": "headache",
        "brain fog": "brain_fog",
        "foggy": "brain_fog",
        "forgot": "forgetfulness",
        "forgetfulness": "forgetfulness",
        "lightheaded": "lightheaded",
        "dizzy": "lightheaded",
        "heart flutter": "heart_flutter",
        "flutter": "heart_flutter",
        "diarrhea": "diarrhea",
        "deep breath": "deep_breath_awareness",
    }
    for keyword, event_type in symptom_keywords.items():
        if keyword in text:
            return event_type
    return "custom_event"


def build_action_reply(tool_results: list[dict], executions: list, request_id: str = "") -> str:
    write_results = [item for item in tool_results if item.get("access") == "write"]
    if not write_results:
        return ""

    confirmations = []
    failures = []
    for item in write_results:
        execution = next((action for action in executions if action.tool_name == item.get("tool")), None)
        result = item.get("result") or {}
        if execution and execution.execution_status == "succeeded" and execution.verification and execution.verification.status == "verified":
            confirmations.append(format_write_confirmation(item.get("tool"), result, request_id))
        elif execution:
            failures.append(execution.user_message)
        else:
            reason = result.get("reason") or (item.get("error") or {}).get("message") or "Jarvis could not complete that update."
            failures.append(f"I could not update {friendly_tool_name(item.get('tool'))}: {reason}")

    lines = [line for line in confirmations if line] + failures
    if not lines:
        return ""
    return " ".join(lines)


def build_system_status_reply(tool_results: list[dict]) -> str:
    status_result = next((item for item in tool_results if item.get("tool") == "get_system_status"), None)
    if not status_result:
        return ""
    if not status_result.get("success"):
        return "I could not complete the live system checks. The status probe is red."

    result = status_result.get("result") or {}
    checks = result.get("checks") or []
    red = result.get("red_checks") or []
    if not red:
        return f"I ran the live ping: all {len(checks)} checks are green."

    details = []
    for check in red:
        label = check.get("label") or "Unknown service"
        detail = check.get("detail") or "Offline"
        details.append(f"{label}: {detail}")
    return f"I ran the live ping. {len(red)} of {len(checks)} checks are red: " + "; ".join(details)


def build_live_price_reply(user_text: str, tool_results: list[dict]) -> str:
    from backend.assistant.tools.registry import is_live_commerce_request

    if not is_live_commerce_request(user_text):
        return ""
    item = next((result for result in tool_results if result.get("tool") == "search_live_prices"), None)
    result = (item or {}).get("result") or {}
    offers = result.get("offers") or []
    if not item or not item.get("success") or not result.get("verified") or not offers:
        providers = result.get("providers") or []
        configured = [provider.get("provider") for provider in providers if provider.get("configured") and not provider.get("error")]
        missing = [provider.get("provider") for provider in providers if not provider.get("configured")]
        checked = f" I checked {', '.join(filter(None, configured))}, but it returned no matching verified price." if configured else ""
        optional = f" Other providers not configured: {', '.join(filter(None, missing))}." if missing else ""
        return "I don't have a verified live source for that price, so I won't guess." + checked + optional

    lines = []
    for offer in offers[:5]:
        evidence = offer.get("evidence") or {}
        title = offer.get("title") or result.get("query")
        size = f" {offer.get('size')}" if offer.get("size") else ""
        lines.append(f"{offer.get('retailer')}: {title}{size} — ${float(offer['price']):.2f} [{evidence.get('provider')}]")
    location = f" near {result.get('location')}" if result.get("location") else ""
    return f"Verified live results{location}: " + "; ".join(lines)


def format_write_confirmation(tool_name: str | None, result: dict, request_id: str = "") -> str:
    if tool_name == "log_goal_progress":
        goal = result.get("goal") or {}
        log = result.get("log") or {}
        title = goal.get("title") or "that goal"
        notes = log.get("notes")
        progress = goal.get("progress") or {}
        percent = progress.get("percent")
        progress_text = f" It is now at {percent:g}%." if isinstance(percent, (int, float)) else ""
        note_text = f" Note: {notes}" if notes else ""
        return f"Done. I logged that against {title}.{progress_text}{note_text}"

    if tool_name == "add_shopping_item":
        item = result.get("item") or {}
        shopping_list = result.get("shopping_list") or {}
        return f"Done. I added {item.get('name') or 'that item'} to {shopping_list.get('title') or 'your shopping list'}."

    if tool_name == "check_shopping_item":
        item = result.get("item") or {}
        return f"Done. I checked off {item.get('name') or 'that shopping item'}."

    if tool_name == "log_health_event":
        event = result.get("event") or {}
        event_type = str(event.get("event_type") or "health event").replace("_", " ")
        return f"Done. I logged that {event_type} health event."

    if tool_name == "upsert_health_checkin":
        checkin = result.get("checkin") or {}
        details = []
        if checkin.get("water_oz") is not None:
            details.append(f"{checkin.get('water_oz'):g} oz water")
        if checkin.get("caffeine_mg") is not None:
            details.append(f"{checkin.get('caffeine_mg'):g} mg caffeine")
        detail_text = ", ".join(details) if details else "today's check-in"
        return f"Done. I updated {detail_text}."

    if tool_name == "complete_daily_checkin":
        checkin = result.get("checkin") or {}
        saved = [
            label
            for key, label in [
                ("energy", "energy"),
                ("mood", "mood"),
                ("stress", "stress"),
                ("sleep_quality", "sleep quality"),
                ("hours_slept", "sleep"),
                ("water_oz", "water"),
                ("caffeine_mg", "caffeine"),
                ("workout_completed", "workout"),
                ("meals_completed", "meals"),
            ]
            if checkin.get(key) is not None
        ]
        return f"Done. I updated today's check-in{': ' + ', '.join(saved) if saved else ''}."

    if tool_name == "create_goal":
        goal = result.get("goal") or {}
        return f"Done. I created the goal {goal.get('title') or 'you requested'}."

    if tool_name == "complete_meal":
        meal = result.get("meal") or {}
        address = form_of_address(request_id)
        prefix = f"You got it, {address}. " if address else "You got it. "
        if result.get("already_done"):
            return f"{prefix}{meal.get('name') or meal.get('meal_type') or 'That meal'} was already marked eaten."
        return f"{prefix}Done—I marked {meal.get('name') or meal.get('meal_type') or 'that meal'} eaten and verified it."

    if tool_name == "log_caffeine_drink":
        drink = result.get("drink") or {}
        return f"Done. I logged {drink.get('label') or 'that caffeine drink'}: {drink.get('caffeine_mg')} mg caffeine and {drink.get('calories')} calories."

    if tool_name == "complete_forge_project":
        project = result.get("project") or {}
        return f"Done. I archived {project.get('title') or 'that Forge project'}."

    if tool_name == "complete_forge_task":
        task = result.get("task") or {}
        return f"Done. I marked {task.get('title') or 'that Forge task'} complete."

    if tool_name == "capture_forge_spark":
        spark = result.get("spark") or {}
        return f"Done. I saved that Forge spark: {spark.get('spark_text') or 'idea'}."

    return f"Done. I completed {friendly_tool_name(tool_name)}."


def friendly_tool_name(tool_name: str | None) -> str:
    return str(tool_name or "that action").replace("_", " ")


def meal_state_execution(context, pending, status: str, message: str) -> AssistantActionExecution:
    verification_status = "pending" if status == "awaiting_confirmation" else "unavailable"
    summary = "Waiting for explicit yes or no; no meal write has executed." if status == "awaiting_confirmation" else "Confirmation was declined; no meal write executed."
    return AssistantActionExecution(
        action_id=f"act_{pending.confirmation_id}", source_message_id=context.source_message_id,
        conversation_id=context.conversation_id, intent="complete_meal", requested_action="complete_meal",
        execution_status=status, tool_name="complete_meal", requires_confirmation=True,
        result={"meal": {"id": pending.meal_id, "name": pending.meal_name, "meal_type": pending.meal_type}},
        verification=ActionVerification(status=verification_status, summary=summary), user_message=message,
    )


def build_tool_context_message(tool_results: list[dict]) -> str:
    return "\n".join(
        [
            "Jarvis supplied these approved assistant tool results as JSON.",
            "Use successful write results to confirm exactly what changed. Do not claim a change if the tool failed or returned updated=false.",
            "If a tool failed, say that Jarvis could not load that piece right now.",
            json.dumps(tool_results, default=str)[:12000],
        ]
    )


def build_service_result(content, selected_model, tool_results, executions, manifest, context, trace, response_source):
    guarded_content, validation = validate_final_response(str(content).strip(), executions)
    result = {
        "message": {"role": "assistant", "content": guarded_content},
        "model": selected_model,
        "tools": tool_results,
        "actions": [item.model_dump() for item in executions],
        "capabilities": manifest.model_dump(),
    }
    if development_trace_enabled():
        result["executionTrace"] = {
            "requestId": context.request_id,
            "intent": executions[0].intent if executions else "conversation",
            "proposedAction": executions[0].requested_action if executions else None,
            "capabilityLookup": "available" if not executions or executions[0].tool_name else executions[0].execution_status,
            "selectedTool": executions[0].tool_name if executions else None,
            "confirmationRequired": executions[0].requires_confirmation if executions else False,
            "events": trace,
            "finalExecutionStatus": executions[0].execution_status if executions else None,
            "finalResponseValidation": validation,
            "responseSource": response_source,
            "cacheStatus": "miss",
            "streaming": False,
        }
    return result


def extract_message_content(data: dict) -> str:
    message = data.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not content and isinstance(message, dict):
        content = extract_final_answer(message.get("thinking") or "")
    if not content:
        content = data.get("response")
    return str(content or "").strip()


def extract_final_answer(thinking: str) -> str:
    if not thinking:
        return ""
    markers = ["Final Decision:", "Final Answer:", "Answer:"]
    for marker in markers:
        if marker in thinking:
            return thinking.rsplit(marker, 1)[-1].strip().strip("`")
    return ""
