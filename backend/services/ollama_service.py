import json
import os
import re
import urllib.error
import urllib.request

from backend.assistant.tools.registry import AssistantToolContext, execute_tool_calls, select_tools
from backend.prompts.jarvis import JARVIS_SYSTEM_PROMPT
from backend.prompts.user_profile import JOHN_USER_PROFILE

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


def chat_with_jarvis(messages: list[dict], model: str | None = None) -> dict:
    selected_model = (model or OLLAMA_MODEL).strip()
    latest_user_text = next(
        (item.get("content", "") for item in reversed(messages) if item.get("role") == "user" and item.get("content")),
        "",
    )
    tool_calls = select_tools(latest_user_text)
    tool_calls.extend(select_followup_tools(messages, latest_user_text, tool_calls))
    tool_results = execute_tool_calls(tool_calls, AssistantToolContext())
    action_reply = build_action_reply(tool_results)
    if action_reply:
        return {"message": {"role": "assistant", "content": action_reply}, "model": selected_model, "tools": tool_results}

    safe_messages = [
        {"role": "system", "content": JARVIS_SYSTEM_PROMPT},
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

    return {"message": {"role": "assistant", "content": content.strip()}, "model": selected_model, "tools": tool_results}


# Compatibility alias for any older local integration importing this symbol.
chat_with_chloe = chat_with_jarvis


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


def build_action_reply(tool_results: list[dict]) -> str:
    write_results = [item for item in tool_results if item.get("access") == "write"]
    if not write_results:
        return ""

    confirmations = []
    failures = []
    for item in write_results:
        result = item.get("result") or {}
        if result.get("needs_input"):
            failures.append(str(result.get("question") or "I need a little more information before I can do that."))
        elif item.get("success") and result.get("updated") is not False:
            confirmations.append(format_write_confirmation(item.get("tool"), result))
        else:
            reason = result.get("reason") or (item.get("error") or {}).get("message") or "Jarvis could not complete that update."
            failures.append(f"I could not update {friendly_tool_name(item.get('tool'))}: {reason}")

    lines = [line for line in confirmations if line] + failures
    if not lines:
        return ""
    return " ".join(lines)


def format_write_confirmation(tool_name: str | None, result: dict) -> str:
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
        if result.get("already_done"):
            return f"{meal.get('name') or meal.get('meal_type') or 'That meal'} was already marked eaten."
        return f"Done. I marked {meal.get('name') or meal.get('meal_type') or 'that meal'} eaten."

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


def build_tool_context_message(tool_results: list[dict]) -> str:
    return "\n".join(
        [
            "Jarvis supplied these approved assistant tool results as JSON.",
            "Use successful write results to confirm exactly what changed. Do not claim a change if the tool failed or returned updated=false.",
            "If a tool failed, say that Jarvis could not load that piece right now.",
            json.dumps(tool_results, default=str)[:12000],
        ]
    )


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
