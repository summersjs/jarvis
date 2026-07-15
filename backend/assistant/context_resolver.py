from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Callable

from pydantic import ValidationError

from backend.assistant.conversation_state import sanitize_state_for_resolver
from backend.schemas.conversation import ContextResolution, ConversationState


logger = logging.getLogger("jarvis.context")


RESOLVER_SYSTEM_PROMPT = """You are Jarvis's context resolver, not the assistant responder.
Return only JSON matching the supplied schema. Resolve references conservatively.
Never invent a database ID or result ID. IDs may only be copied from verified_result_targets or pending_clarification options supplied by the backend.
Explicit values in the current message are entity_updates. Unmentioned values may be inherited only for a genuine follow-up.
Classify writes such as add, log, update, remove, undo, or change as operation_type=write.
If a reference is ambiguous or lacks a verified target, set needs_clarification=true.
Do not include reasoning, credentials, secrets, prose, or keys outside the schema."""


def resolve_context(
    user_message: str,
    state: ConversationState,
    model: str,
    request_json: Callable[..., dict[str, Any]],
) -> ContextResolution:
    started = time.monotonic()
    schema = ContextResolution.model_json_schema()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": RESOLVER_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"current_message": user_message, "conversation_state": sanitize_state_for_resolver(state)}, separators=(",", ":"))},
        ],
        "stream": False,
        "think": False,
        "format": schema,
        "options": {"temperature": 0},
    }
    try:
        data = request_json("/api/chat", payload)
        message = data.get("message") if isinstance(data, dict) else None
        raw = message.get("content") if isinstance(message, dict) else data.get("response") if isinstance(data, dict) else None
        parsed = parse_resolver_json(str(raw or ""))
        resolution = ContextResolution.model_validate(parsed)
        logger.info("context_resolver_result conversation_id=%s duration_ms=%d success=true intent=%s operation=%s clarification=%s", state.conversation_id, int((time.monotonic() - started) * 1000), resolution.intent, resolution.operation_type, resolution.needs_clarification)
        return resolution
    except (ValueError, TypeError, json.JSONDecodeError, ValidationError) as exc:
        logger.warning("context_resolver_result conversation_id=%s duration_ms=%d success=false error_code=INVALID_RESOLVER_OUTPUT", state.conversation_id, int((time.monotonic() - started) * 1000))
        raise ResolverFailure("INVALID_RESOLVER_OUTPUT") from exc


def parse_resolver_json(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    value = json.loads(cleaned)
    if not isinstance(value, dict):
        raise ValueError("Resolver output must be a JSON object.")
    return value


class ResolverFailure(RuntimeError):
    pass


def direct_resolution(user_message: str) -> ContextResolution:
    lower = user_message.lower()
    write = bool(re.search(r"\b(add|log|update|change|remove|delete|undo|mark|create)\b", lower))
    live = bool(re.search(r"\b(price|prices|cheaper|cheapest|cost|availability|in stock)\b", lower))
    product = None
    if "red bull" in lower or "redbull" in lower:
        product = "Red Bull"
    shopping_match = re.search(r"(?i)\badd\s+(.+?)\s+to\s+(?:my\s+)?(?:shopping|grocery)(?:\s+list)?\b", user_message)
    if shopping_match:
        product = shopping_match.group(1).strip(" .?")
    size_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(fl\s*)?oz\b", lower)
    location_match = re.search(r"\b(?:near|in|around)\s+([a-z][a-z .'-]+(?:,\s*[a-z]{2})?)", user_message, re.IGNORECASE)
    retailer = next((name.title() for name in ("kroger", "walmart", "instacart") if name in lower), None)
    variant = "Sugar Free" if re.search(r"\bsugar[- ]?free\b", lower) else "Original" if "original" in lower else None
    intent = "manage_shopping_list" if "shopping list" in lower or "grocery list" in lower or shopping_match else "compare_local_prices" if live else "direct_request"
    return ContextResolution(
        request_type="new_request", intent=intent, inherit_context=False,
        entity_updates={
            "product": product,
            "brand": "Red Bull" if product == "Red Bull" else None,
            "size": f"{size_match.group(1)} oz" if size_match else None,
            "variant": variant,
            "location": location_match.group(1).strip(" .?") if location_match else None,
            "retailer": retailer,
        },
        reference_resolution=[], required_entities=[], missing_entities=[],
        requires_tool=write or live, operation_type="write" if write else "live_external" if live else "conversation",
        needs_clarification=False, clarification_question=None,
    )


def needs_model_resolution(state: ConversationState, user_message: str) -> bool:
    if state.active_intent or state.pending_clarification:
        return True
    return bool(re.search(r"(?i)\b(it|that|that one|the one|cheaper one|other one|that meal|actually|what about|which one|undo)\b", user_message))


def safe_read_followup_resolution(user_message: str, state: ConversationState) -> ContextResolution | None:
    lower = user_message.lower()
    updates: dict[str, Any] = {}
    intent = state.active_intent or "follow_up_read"
    operation: str = "read"
    if re.search(r"\b(?:which one|which)\s+is\s+cheaper\b", lower):
        intent = "compare_local_prices"
        operation = "live_external"
    elif re.search(r"\bwhat did\s+(kroger|walmart)\s+have\b", lower):
        retailer = re.search(r"\b(kroger|walmart)\b", lower)
        updates["retailer"] = retailer.group(1).title() if retailer else None
        intent = "compare_local_prices"
        operation = "live_external"
    elif re.search(r"\bwhat about\s+sugar[- ]?free\b", lower):
        updates["variant"] = "Sugar Free"
        intent = "compare_local_prices"
        operation = "live_external"
    elif "yesterday" in lower:
        updates["date_range"] = "yesterday"
    elif "usual location" in lower:
        updates["location"] = os.getenv("JARVIS_SHOPPING_LOCATION") or state.entities.location
    else:
        return None
    return ContextResolution(
        request_type="follow_up", intent=intent, inherit_context=True,
        entity_updates=updates, reference_resolution=[], required_entities=[], missing_entities=[],
        requires_tool=True, operation_type=operation, needs_clarification=False, clarification_question=None,
    )
