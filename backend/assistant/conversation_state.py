from __future__ import annotations

import os
import hashlib
import logging
import threading
from datetime import datetime, timezone
from typing import Any

from backend.schemas.conversation import ContextResolution, ContextResolutionMeta, ConversationEntities, ConversationState, PendingClarification, VerifiedToolResult
from backend.utils.local_store import read_json, write_json


STATE_FILE = "assistant_conversation_state.json"
logger = logging.getLogger("jarvis.context")
LIVE_RESULT_TTL_SECONDS = int(os.getenv("JARVIS_LIVE_RESULT_TTL_SECONDS", "900"))
PRODUCT_FIELDS = {"brand", "size", "variant", "retailer", "shopping_list_item_id"}
INTENT_SCOPES = {
    "price": {"product", "brand", "size", "variant", "quantity", "location", "zip_code", "retailer", "shopping_list_id", "shopping_list_item_id"},
    "shopping": {"product", "brand", "size", "variant", "quantity", "retailer", "shopping_list_id", "shopping_list_item_id", "location", "zip_code"},
    "meal": {"date_range", "meal_id", "quantity"},
    "goal": {"goal_id", "date_range"},
    "health": {"health_event_id", "date_range"},
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ConversationStateStore:
    def __init__(self, filename: str = STATE_FILE):
        self.filename = filename
        self._lock = threading.Lock()

    def get(self, conversation_id: str) -> ConversationState:
        with self._lock:
            rows = read_json(self.filename, {})
        raw = rows.get(conversation_id)
        if not raw:
            return ConversationState(conversation_id=conversation_id)
        try:
            return ConversationState.model_validate(raw)
        except Exception:
            return ConversationState(conversation_id=conversation_id)

    def save(self, state: ConversationState) -> ConversationState:
        state.updated_at = utc_now()
        with self._lock:
            rows = read_json(self.filename, {})
            rows[state.conversation_id] = state.model_dump(mode="json")
            if len(rows) > 200:
                ordered = sorted(rows.items(), key=lambda item: item[1].get("updated_at", ""), reverse=True)[:200]
                rows = dict(ordered)
            write_json(self.filename, rows)
        return state

    def clear(self, conversation_id: str) -> bool:
        with self._lock:
            rows = read_json(self.filename, {})
            existed = conversation_id in rows
            rows.pop(conversation_id, None)
            write_json(self.filename, rows)
        return existed


CONVERSATION_STATE_STORE = ConversationStateStore()


def intent_scope(intent: str | None) -> set[str] | None:
    lower = str(intent or "").lower()
    return next((fields for key, fields in INTENT_SCOPES.items() if key in lower), None)


def merge_conversation_state(state: ConversationState, resolution: ContextResolution) -> tuple[ConversationState, ContextResolutionMeta]:
    old = state.entities.model_dump()
    updates = {key: value for key, value in resolution.entity_updates.model_dump().items() if value is not None}
    merged = dict(old) if resolution.inherit_context else {key: None for key in old}
    inherited: dict[str, str] = {}
    changed: dict[str, str] = {}

    old_product = old.get("product")
    new_product = updates.get("product")
    if new_product and old_product and new_product.casefold() != str(old_product).casefold():
        for field in PRODUCT_FIELDS:
            merged[field] = None

    if state.active_intent and resolution.intent != state.active_intent:
        scope = intent_scope(resolution.intent)
        if scope is not None:
            for field in merged:
                if field not in scope:
                    merged[field] = None

    for key, value in updates.items():
        previous = merged.get(key)
        merged[key] = value
        if previous != value:
            changed[key] = f"{previous or 'unset'} → {value}"

    if resolution.inherit_context:
        for key, value in merged.items():
            if value is not None and key not in updates and old.get(key) == value:
                inherited[key] = str(value)

    clarification = None
    if resolution.needs_clarification:
        question = resolution.clarification_question or "I need one more detail before I can safely continue."
        clarification = PendingClarification(question=question, missing_entities=resolution.missing_entities)

    state.active_intent = resolution.intent
    state.entities = ConversationEntities.model_validate(merged)
    state.pending_clarification = clarification
    state.updated_at = utc_now()
    logger.info(
        "context_merge conversation_id=%s success=true intent=%s inherited_count=%d changed_count=%d clarification=%s",
        state.conversation_id, resolution.intent, len(inherited), len(changed), bool(clarification),
    )
    return state, ContextResolutionMeta(
        follow_up=resolution.request_type == "follow_up",
        inherited=inherited,
        changed=changed,
        pending_clarification=clarification.question if clarification else None,
    )


def sanitize_state_for_resolver(state: ConversationState) -> dict[str, Any]:
    return {
        "conversation_id": state.conversation_id,
        "active_intent": state.active_intent,
        "entities": state.entities.model_dump(exclude_none=True),
        "last_successful_tool": state.last_successful_tool,
        "last_selected_entity": state.last_selected_entity,
        "pending_clarification": state.pending_clarification.model_dump() if state.pending_clarification else None,
        "verified_result_targets": [
            {"tool": item.tool, "result_id": item.result_id, "verified_at": item.verified_at.isoformat(), "expires_at": item.expires_at.isoformat() if item.expires_at else None}
            for item in state.last_verified_tool_results[-10:]
        ],
    }


def record_verified_tool_results(state: ConversationState, tool_results: list[dict[str, Any]]) -> ConversationState:
    now = utc_now()
    captured: list[VerifiedToolResult] = []
    for receipt in tool_results:
        if not receipt.get("success") or not isinstance(receipt.get("result"), dict):
            continue
        tool = str(receipt.get("tool") or "")
        result = receipt["result"]
        if tool == "search_live_prices" and result.get("verified"):
            offers = []
            for offer in (result.get("offers") or [])[:12]:
                evidence = offer.get("evidence") or {}
                if not evidence.get("provider") or not isinstance(offer.get("price"), (int, float)):
                    continue
                identity = "|".join(str(offer.get(key) or "") for key in ("retailer", "title", "size", "price"))
                result_id = "price_" + hashlib.sha256(identity.encode()).hexdigest()[:16]
                offers.append({
                    "result_id": result_id, "retailer": offer.get("retailer"), "product_name": offer.get("title"),
                    "size": offer.get("size"), "price": float(offer["price"]), "verified": True,
                    "provider": evidence.get("provider"), "store": evidence.get("store"),
                })
            if offers:
                comparison_id = "cmp_" + hashlib.sha256((state.conversation_id + now.isoformat()).encode()).hexdigest()[:16]
                captured.append(VerifiedToolResult(
                    tool=tool, result_id=comparison_id, verified_at=now,
                    expires_at=datetime.fromtimestamp(now.timestamp() + LIVE_RESULT_TTL_SECONDS, tz=timezone.utc),
                    data={"query": result.get("query"), "preference": result.get("preference"), "results": offers},
                ))
        elif tool:
            safe_ids = extract_record_ids(result)
            captured.append(VerifiedToolResult(tool=tool, result_id=next(iter(safe_ids.values()), None), verified_at=now, data=safe_ids))
    if captured:
        state.last_verified_tool_results = (state.last_verified_tool_results + captured)[-20:]
        state.last_successful_tool = captured[-1].tool
    return state


def extract_record_ids(value: Any, prefix: str = "") -> dict[str, str]:
    found: dict[str, str] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if key == "id" and isinstance(item, str):
                found[path] = item
            elif isinstance(item, (dict, list)):
                found.update(extract_record_ids(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value[:20]):
            found.update(extract_record_ids(item, f"{prefix}[{index}]"))
    return dict(list(found.items())[:30])
