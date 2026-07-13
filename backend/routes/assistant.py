import os
import threading
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from backend.assistant.tools.registry import tool_status
from backend.core.security import verify_api_key
from backend.prompts.jarvis import JARVIS_PROMPT_FILE, JARVIS_PROMPT_VERSION
from backend.schemas.assistant import AssistantChatRequest, AssistantSpeechRequest
from backend.services.ollama_service import OllamaServiceError, chat_with_jarvis, get_ollama_status
from backend.services.tts_service import get_tts_status, synthesize_speech

router = APIRouter(dependencies=[Depends(verify_api_key)])
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
    result = {"ollama": get_ollama_status(), "tts": get_tts_status(), "tools": tool_status()}
    diagnostics = _development_diagnostics()
    if diagnostics:
        result["identityDiagnostics"] = diagnostics
    return result


@router.get("/assistant/tools/status")
def assistant_tools_status():
    return tool_status()


@router.post("/assistant/chat")
def assistant_chat(payload: AssistantChatRequest):
    cache_key = payload.request_id or payload.source_message_id
    legacy_detected = any("chloe" in message.content.lower() for message in payload.messages)
    if cache_key:
        with _cache_lock:
            cached = _response_cache.get(cache_key)
            if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS:
                result = dict(cached[1])
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
                result = dict(cached[1])
                diagnostics = _development_diagnostics(legacy_detected=legacy_detected, cached=True, model=result.get("model"))
                if diagnostics:
                    result["identityDiagnostics"] = diagnostics
                return result
            raise HTTPException(status_code=409, detail={"code": "duplicate_inflight", "message": "That Jarvis request is already being processed."})
    try:
        result = chat_with_jarvis([message.model_dump() for message in payload.messages], payload.model)
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


@router.post("/assistant/speech")
def assistant_speech(payload: AssistantSpeechRequest):
    try:
        audio, content_type = synthesize_speech(payload.text, payload.voice, payload.speed)
        return Response(content=audio, media_type=content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
