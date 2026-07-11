from io import BytesIO
import os
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent
CACHE_DIR = SERVICE_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("HF_HOME", str(CACHE_DIR / "huggingface"))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(CACHE_DIR / "huggingface" / "hub"))
os.environ.setdefault("TORCH_HOME", str(CACHE_DIR / "torch"))

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

try:
    from kokoro import KPipeline
except Exception:
    KPipeline = None

app = FastAPI()
pipeline = None
VOICE_ALLOWLIST = {"af_bella", "af_nicole"}


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str = "af_bella"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


def get_pipeline():
    global pipeline
    if KPipeline is None:
        raise HTTPException(status_code=503, detail="Kokoro is not installed in this environment.")
    if pipeline is None:
        pipeline = KPipeline(lang_code="a")
    return pipeline


@app.get("/health")
def health():
    return {"ok": KPipeline is not None, "voices": sorted(VOICE_ALLOWLIST)}


@app.post("/speech")
def speech(payload: SpeechRequest):
    if payload.voice not in VOICE_ALLOWLIST:
        raise HTTPException(status_code=400, detail="Unsupported voice.")

    generator = get_pipeline()(payload.text, voice=payload.voice, speed=payload.speed)
    chunks = [audio for _, _, audio in generator]
    if not chunks:
        raise HTTPException(status_code=500, detail="Kokoro did not produce audio.")

    audio = chunks[0] if len(chunks) == 1 else __import__("numpy").concatenate(chunks)
    buffer = BytesIO()
    sf.write(buffer, audio, 24000, format="WAV")
    return Response(content=buffer.getvalue(), media_type="audio/wav")
