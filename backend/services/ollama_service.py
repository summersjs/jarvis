import json
import os
import urllib.error
import urllib.request

from backend.prompts.chloe import CHLOE_SYSTEM_PROMPT

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
        models = [item.get("name") for item in tags.get("models", [])]
        return {
            "online": True,
            "modelAvailable": OLLAMA_MODEL in models,
            "model": OLLAMA_MODEL,
            "models": models,
        }
    except Exception:
        return {
            "online": False,
            "modelAvailable": False,
            "model": OLLAMA_MODEL,
            "models": [],
        }


def chat_with_chloe(messages: list[dict], model: str | None = None) -> dict:
    selected_model = (model or OLLAMA_MODEL).strip()
    safe_messages = [
        {"role": "system", "content": CHLOE_SYSTEM_PROMPT},
        *[
            {"role": item["role"], "content": item["content"]}
            for item in messages
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ][-20:],
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

    return {"message": {"role": "assistant", "content": content.strip()}, "model": selected_model}


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
