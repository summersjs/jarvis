import json
import os
import urllib.error
import urllib.request
import threading

KOKORO_TTS_URL = os.getenv("KOKORO_TTS_URL", "http://127.0.0.1:8880").rstrip("/")
KOKORO_DEFAULT_VOICE = os.getenv("KOKORO_DEFAULT_VOICE", "af_bella")
KOKORO_DEFAULT_SPEED = float(os.getenv("KOKORO_DEFAULT_SPEED", "1.0"))
KOKORO_VOICES = ["af_bella", "af_nicole"]
_AUDIO_CACHE: dict[tuple[str, str, float], tuple[bytes, str]] = {}
_CACHE_LOCK = threading.Lock()


def get_tts_status() -> dict:
    try:
        urllib.request.urlopen(f"{KOKORO_TTS_URL}/health", timeout=2).read()
        online = True
    except Exception:
        online = False
    return {
        "online": online,
        "defaultVoice": KOKORO_DEFAULT_VOICE,
        "availableVoices": KOKORO_VOICES,
    }


def synthesize_speech(text: str, voice: str, speed: float) -> tuple[bytes, str]:
    if voice not in KOKORO_VOICES:
        raise ValueError("Unsupported voice.")
    cache_key = (text[:5000], voice, round(speed, 2))
    with _CACHE_LOCK:
        cached = _AUDIO_CACHE.get(cache_key)
    if cached:
        return cached
    payload = {"text": cache_key[0], "voice": voice, "speed": speed}
    request = urllib.request.Request(
        f"{KOKORO_TTS_URL}/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            content_type = response.headers.get("content-type", "audio/wav")
            result = (response.read(), content_type)
            with _CACHE_LOCK:
                if len(_AUDIO_CACHE) >= 32:
                    _AUDIO_CACHE.pop(next(iter(_AUDIO_CACHE)))
                _AUDIO_CACHE[cache_key] = result
            return result
    except urllib.error.URLError as exc:
        raise ConnectionError("Kokoro TTS is offline.") from exc
