import os
import re
import logging
import threading
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from backend.assistant.execution import capability_manifest
from backend.assistant.tools.registry import AssistantToolContext, tool_status
from backend.core.security import verify_api_key
from backend.core.config import LOCAL_TZ
from backend.prompts.jarvis import JARVIS_PROMPT_FILE, JARVIS_PROMPT_VERSION
from backend.schemas.assistant import AssistantChatRequest, AssistantFeedbackRequest, AssistantMediaResponseRequest, AssistantReadoutStatusRequest, AssistantSpeechRequest
from backend.services.ollama_service import OllamaServiceError, chat_with_jarvis, generate_music_playback_response, get_ollama_status
from backend.assistant.conversation_state import CONVERSATION_STATE_STORE
from backend.assistant.memory import MEMORY_STORE, record_feedback
from backend.services.tts_service import get_tts_status, synthesize_speech

router = APIRouter(dependencies=[Depends(verify_api_key)])
logger = logging.getLogger("jarvis.context")
_response_cache: dict[str, tuple[float, dict]] = {}
_inflight_requests: dict[str, threading.Event] = {}
_cache_lock = threading.Lock()
_CACHE_TTL_SECONDS = 300
OLLAMA_WAIT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90")) + 5


def _development_diagnostics(*, legacy_detected=False, cached=False, model=None):
    if os.getenv("ENVIRONMENT", "development").lower() not in {"development", "dev", "local"}:
        return None
    return {
        "finalAssistantName": "Jarvis",
        "activeAssistantRoute": "/jarvis",
        "promptVersion": JARVIS_PROMPT_VERSION,
        "systemPromptFile": JARVIS_PROMPT_FILE,
        "modelName": model or get_ollama_status().get("model"),
        "legacyChloeTextDetected": legacy_detected,
        "cachedPromptOrResponseUsed": cached,
    }


@router.get("/assistant/status")
def assistant_status():
    result = {"ollama": get_ollama_status(), "tts": get_tts_status(), "tools": tool_status(), "capabilities": capability_manifest().model_dump()}
    diagnostics = _development_diagnostics()
    if diagnostics:
        result["identityDiagnostics"] = diagnostics
    return result


@router.get("/assistant/tools/status")
def assistant_tools_status():
    return tool_status()


@router.get("/assistant/memories")
def assistant_memories(user_id: str = "john", include_expired: bool = False):
    rows = MEMORY_STORE.list(user_id, include_expired=include_expired)
    return {"memories": [row.model_dump(mode="json") for row in rows], "planning_preferences": MEMORY_STORE.preferences(user_id)}


@router.delete("/assistant/memories/{memory_id}")
def delete_assistant_memory(memory_id: str, user_id: str = "john"):
    return {"deleted": MEMORY_STORE.delete(user_id, memory_id), "memory_id": memory_id}


@router.post("/assistant/feedback")
def assistant_feedback(payload: AssistantFeedbackRequest):
    return record_feedback(payload.user_id, payload.model_dump())


@router.post("/assistant/readout-status")
def assistant_readout_status(payload: AssistantReadoutStatusRequest):
    now = datetime.now(LOCAL_TZ)
    expires = now.replace(hour=23, minute=59, second=59, microsecond=999999).astimezone(timezone.utc)
    memory, _ = MEMORY_STORE.remember(
        payload.user_id, memory_type="temporary_state", content=f"{payload.kind} completed on {now.date().isoformat()}",
        scope="daily_status", importance=0.7, confidence=1.0, source="verified_ui_readout", expires_at=expires,
        metadata={"kind": payload.kind, "date": now.date().isoformat()},
    )
    return {"status": "ok", "memory_id": memory.id, "kind": payload.kind, "date": now.date().isoformat()}


@router.post("/assistant/context/{conversation_id}/reset")
def reset_assistant_context(conversation_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", conversation_id):
        raise HTTPException(status_code=422, detail="Invalid conversation ID.")
    cleared = CONVERSATION_STATE_STORE.clear(conversation_id)
    logger.info("context_reset conversation_id=%s success=true cleared=%s", conversation_id, cleared)
    return {"cleared": cleared, "conversation_id": conversation_id, "chat_history_deleted": False}


@router.post("/assistant/chat")
def assistant_chat(payload: AssistantChatRequest):
    cache_key = payload.request_id or payload.source_message_id
    legacy_detected = any("chloe" in message.content.lower() for message in payload.messages)
    if cache_key:
        with _cache_lock:
            cached = _response_cache.get(cache_key)
            if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS:
                result = _cached_response(dict(cached[1]))
                if result.get("executionTrace"):
                    result["executionTrace"] = {**result["executionTrace"], "cacheStatus": "hit"}
                diagnostics = _development_diagnostics(legacy_detected=legacy_detected, cached=True, model=result.get("model"))
                if diagnostics:
                    result["identityDiagnostics"] = diagnostics
                return result
            wait_event = _inflight_requests.get(cache_key)
            if wait_event is None:
                wait_event = threading.Event()
                _inflight_requests[cache_key] = wait_event
                request_owner = True
            else:
                request_owner = False
        if not request_owner:
            wait_event.wait(timeout=OLLAMA_WAIT_SECONDS)
            with _cache_lock:
                cached = _response_cache.get(cache_key)
            if cached:
                result = _cached_response(dict(cached[1]))
                if result.get("executionTrace"):
                    result["executionTrace"] = {**result["executionTrace"], "cacheStatus": "inflight_deduplicated"}
                diagnostics = _development_diagnostics(legacy_detected=legacy_detected, cached=True, model=result.get("model"))
                if diagnostics:
                    result["identityDiagnostics"] = diagnostics
                return result
            raise HTTPException(status_code=409, detail={"code": "duplicate_inflight", "message": "That Jarvis request is already being processed."})
    try:
        request_id = payload.request_id or f"req_{uuid.uuid4().hex}"
        source_message_id = payload.source_message_id or request_id
        result = chat_with_jarvis(
            [message.model_dump() for message in payload.messages],
            payload.model,
            AssistantToolContext(
                request_id=request_id,
                source_message_id=source_message_id,
                conversation_id=payload.conversation_id or "local-jarvis",
            ),
        )
        if cache_key:
            with _cache_lock:
                _response_cache[cache_key] = (time.monotonic(), result)
                expired = [key for key, value in _response_cache.items() if time.monotonic() - value[0] >= _CACHE_TTL_SECONDS]
                for key in expired:
                    _response_cache.pop(key, None)
        diagnostics = _development_diagnostics(legacy_detected=legacy_detected, model=result.get("model"))
        if diagnostics:
            result["identityDiagnostics"] = diagnostics
        return result
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)}) from exc
    finally:
        if cache_key and request_owner:
            with _cache_lock:
                event = _inflight_requests.pop(cache_key, None)
                if event:
                    event.set()


def _cached_response(result: dict) -> dict:
    if result.pop("clientActions", None):
        result["message"] = {
            "role": "assistant",
            "content": "I detected a duplicate request and did not start the music command twice.",
        }
        if result.get("executionTrace"):
            result["executionTrace"] = {
                **result["executionTrace"],
                "finalResponseValidation": "cached_client_action_suppressed",
                "responseSource": "cache_replay",
            }
        return result
    actions = result.get("actions") or []
    if not actions:
        return result
    result["message"] = {
        "role": "assistant",
        "content": "I detected a duplicate request and did not repeat the action. The original request remains recorded in the action audit trail.",
    }
    result["tools"] = []
    if result.get("executionTrace"):
        result["executionTrace"] = {
            **result["executionTrace"],
            "finalExecutionStatus": "cancelled",
            "finalResponseValidation": "cached_duplicate_rewritten",
            "responseSource": "cache_replay",
        }
    result["actions"] = [
        {
            **action,
            "action_id": f"act_{uuid.uuid4().hex}",
            "execution_status": "cancelled",
            "result": None,
            "verification": {"status": "unavailable", "summary": "Cached response; no tool executed again.", "verified_at": None},
            "user_message": "Duplicate request detected; no action was repeated.",
        }
        for action in actions
    ]
    return result


@router.post("/assistant/speech")
def assistant_speech(payload: AssistantSpeechRequest):
    try:
        audio, content_type = synthesize_speech(payload.text, payload.voice, payload.speed)
        return Response(content=audio, media_type=content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/assistant/media-response")
def assistant_media_response(payload: AssistantMediaResponseRequest):
    logger.info(
        "music_playback_receipt intent=%s current_player_state=%s command_available=%s verified_playing=%s playback_status=%s title=%s artist=%s",
        payload.intent,
        payload.initial_playback_status or "unknown",
        payload.command_available,
        payload.verified_playing,
        payload.playback_status or "unknown",
        (payload.title or "unavailable")[:120],
        (payload.artist or "unavailable")[:120],
    )
    response = generate_music_playback_response(payload.model_dump())
    logger.info("music_final_response verified_playing=%s response=%s", payload.verified_playing, response[:240])
    return {"message": {"role": "assistant", "content": response}}
