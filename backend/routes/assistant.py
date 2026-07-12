from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from backend.core.security import verify_api_key
from backend.schemas.assistant import AssistantChatRequest, AssistantSpeechRequest
from backend.services.ollama_service import OllamaServiceError, chat_with_chloe, get_ollama_status
from backend.services.tts_service import get_tts_status, synthesize_speech

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/assistant/status")
def assistant_status():
    return {"ollama": get_ollama_status(), "tts": get_tts_status()}


@router.post("/assistant/chat")
def assistant_chat(payload: AssistantChatRequest):
    try:
        return chat_with_chloe([message.dict() for message in payload.messages], payload.model)
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail={"code": exc.code, "message": str(exc)}) from exc


@router.post("/assistant/speech")
def assistant_speech(payload: AssistantSpeechRequest):
    try:
        audio, content_type = synthesize_speech(payload.text, payload.voice, payload.speed)
        return Response(content=audio, media_type=content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
