from __future__ import annotations

import hashlib
import re
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from typing import Any

from backend.core.config import LOCAL_TZ
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.utils.local_store import read_json, write_json


PENDING_MEALS_FILE = "assistant_pending_meals.json"
PENDING_TTL_MINUTES = 20
AFFIRMATIVE_PATTERN = re.compile(r"^\s*(?:yes(?:\s+please)?|yep|yup|yeah|absolutely|correct|right|sure|do it|please do|go ahead|that'?s right)\s*[.!]?\s*$", re.IGNORECASE)
NEGATIVE_PATTERN = re.compile(r"^\s*(?:no(?:\s+thanks)?|nope|nah|cancel|never mind|nevermind|not that|that'?s wrong)\s*[.!]?\s*$", re.IGNORECASE)
MEAL_TYPE_PATTERN = re.compile(r"\b(breakfast|lunch|dinner|snack(?:s)?)\b", re.IGNORECASE)
MEAL_CLAIM_PATTERN = re.compile(
    r"\b(?:i\s+)?(?:ate|had|finished|completed|just\s+ate|just\s+had|log(?:ged)?|mark(?:ed)?)\b",
    re.IGNORECASE,
)
MEAL_HINT_PATTERN = re.compile(r"\b(?:meal|yogurt|breakfast|lunch|dinner|snack|morning)\b", re.IGNORECASE)
ATE_PATTERN = re.compile(r"\b(?:i\s+)?(?:just\s+)?ate\b", re.IGNORECASE)
ADD_MEAL_PATTERN = re.compile(r"\b(?:add|put)\s+(.+?)\s+(?:to|for)\s+(?:my\s+)?(breakfast|lunch|dinner|snack)\b", re.IGNORECASE)
ATE_MEAL_PATTERN = re.compile(r"\b(?:i\s+)?(?:just\s+)?(?:ate|had)\s+(.+?)\s+(?:for|at)\s+(?:my\s+)?(breakfast|lunch|dinner|snack)\b", re.IGNORECASE)


@dataclass(frozen=True)
class PendingMealConfirmation:
    confirmation_id: str
    conversation_id: str
    source_message_id: str
    meal_id: str
    meal_type: str
    meal_name: str
    meal_date: str
    created_at: str
    expires_at: str


class PendingMealStore:
    def __init__(self, filename: str = PENDING_MEALS_FILE):
        self.filename = filename
        self._lock = threading.Lock()

    def put(self, pending: PendingMealConfirmation) -> None:
        with self._lock:
            entries = self._active_entries(read_json(self.filename, []))
            entries = [entry for entry in entries if entry.get("conversation_id") != pending.conversation_id]
            entries.append(asdict(pending))
            write_json(self.filename, entries[-100:])

    def get(self, conversation_id: str) -> PendingMealConfirmation | None:
        with self._lock:
            entries = self._active_entries(read_json(self.filename, []))
            write_json(self.filename, entries)
        entry = next((item for item in reversed(entries) if item.get("conversation_id") == conversation_id), None)
        if not entry:
            return None
        try:
            return PendingMealConfirmation(**entry)
        except (TypeError, ValueError):
            return None

    def clear(self, conversation_id: str, confirmation_id: str | None = None) -> None:
        with self._lock:
            entries = self._active_entries(read_json(self.filename, []))
            entries = [
                entry
                for entry in entries
                if not (
                    entry.get("conversation_id") == conversation_id
                    and (confirmation_id is None or entry.get("confirmation_id") == confirmation_id)
                )
            ]
            write_json(self.filename, entries)

    @staticmethod
    def _active_entries(entries: Any) -> list[dict[str, Any]]:
        if not isinstance(entries, list):
            return []
        now = datetime.now(LOCAL_TZ)
        active = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            try:
                expires_at = datetime.fromisoformat(str(entry.get("expires_at") or ""))
            except ValueError:
                continue
            if expires_at > now:
                active.append(entry)
        return active


PENDING_MEAL_STORE = PendingMealStore()


def response_kind(text: str) -> str | None:
    if AFFIRMATIVE_PATTERN.match(text):
        return "yes"
    if NEGATIVE_PATTERN.match(text):
        return "no"
    return None


def is_meal_claim(text: str) -> bool:
    return bool(ATE_PATTERN.search(text) or (MEAL_CLAIM_PATTERN.search(text) and MEAL_HINT_PATTERN.search(text)))


def parse_ad_hoc_meal(text: str) -> tuple[str, str, bool] | None:
    """Return (food name, meal type, ate claim) for explicit ad-hoc meal requests."""
    match = ATE_MEAL_PATTERN.search(text) or ADD_MEAL_PATTERN.search(text)
    if not match:
        return None
    name = re.sub(r"\s+", " ", match.group(1)).strip(" ,.!?")
    name = re.sub(r"(?i)^(?:that\s+)?", "", name)
    name = re.sub(r"(?i)\s+and\s+(?:say|mark|log)\s+(?:that\s+)?i\s+ate\s+it.*$", "", name).strip()
    if not name or len(name) > 160:
        return None
    return name, normalize_meal_type(match.group(2)), bool(ATE_MEAL_PATTERN.search(text) or is_meal_claim(text))


def pending_for_meal(
    meal: dict[str, Any], source_message_id: str, conversation_id: str, *, now: datetime | None = None
) -> PendingMealConfirmation:
    now = now or datetime.now(LOCAL_TZ)
    return PendingMealConfirmation(
        confirmation_id=f"meal_{uuid.uuid4().hex}", conversation_id=conversation_id,
        source_message_id=source_message_id, meal_id=str(meal["id"]),
        meal_type=normalize_meal_type(str(meal.get("meal_type") or "")), meal_name=meal_display_name(meal),
        meal_date=str(meal.get("meal_date") or now.date().isoformat()), created_at=now.isoformat(),
        expires_at=(now + timedelta(minutes=PENDING_TTL_MINUTES)).isoformat(),
    )


def resolve_meal_claim(
    text: str,
    user_id: str,
    source_message_id: str,
    conversation_id: str,
    *,
    meals: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> PendingMealConfirmation | None:
    if not is_meal_claim(text):
        return None
    now = now or datetime.now(LOCAL_TZ)
    today = now.date().isoformat()
    rows = meals if meals is not None else list_meal_plan_entries(user_id, today, today)
    candidates = [meal for meal in rows if str(meal.get("meal_date") or today) == today]
    if not candidates:
        return None

    lower = text.lower()
    type_match = MEAL_TYPE_PATTERN.search(lower)
    meal_type = "snack" if type_match and type_match.group(1).startswith("snack") else (type_match.group(1) if type_match else "")
    if not meal_type and "morning" in lower:
        meal_type = "breakfast"
    if meal_type:
        typed = [meal for meal in candidates if normalize_meal_type(str(meal.get("meal_type") or "")) == meal_type]
        if typed:
            candidates = typed

    scored = [(meal_match_score(lower, meal, meal_type), meal) for meal in candidates]
    scored.sort(key=lambda item: item[0], reverse=True)
    score, meal = scored[0]
    if not meal_type and score <= 0:
        return None
    meal_name = meal_display_name(meal)
    if not meal.get("id") or not meal_name:
        return None
    return pending_for_meal(meal, source_message_id, conversation_id, now=now)


def meal_match_score(text: str, meal: dict[str, Any], meal_type: str) -> int:
    name = meal_display_name(meal).lower()
    tokens = {token for token in re.findall(r"[a-z0-9]+", name) if len(token) >= 3}
    ignored = {"the", "and", "with", "ounce", "ounces"}
    score = sum(3 for token in tokens - ignored if re.search(rf"\b{re.escape(token)}\b", text))
    if meal_type and normalize_meal_type(str(meal.get("meal_type") or "")) == meal_type:
        score += 2
    return score


def meal_display_name(meal: dict[str, Any]) -> str:
    name = str(meal.get("custom_meal_name") or meal.get("name") or (meal.get("recipes") or {}).get("title") or "")
    return re.sub(r"\s+", " ", name).strip()[:160]


def normalize_meal_type(value: str) -> str:
    value = value.strip().lower()
    return "snack" if value.startswith("snack") else value if value in {"breakfast", "lunch", "dinner"} else ""


def form_of_address(request_id: str, *, serious: bool = False) -> str | None:
    if serious:
        return None
    digest = hashlib.sha256(request_id.encode("utf-8")).digest()
    if digest[0] >= 64:  # 64 / 256 = exactly 25% of the hash space.
        return None
    choices = ("daddy", "sexy daddy", "John", "Commander", "homie", "boss", "chief")
    return choices[digest[1] % len(choices)]


def confirmation_message(pending: PendingMealConfirmation, request_id: str) -> str:
    address = form_of_address(request_id)
    opener = f"Quick check, {address}:" if address else "Quick check:"
    return (
        f"{opener} today's {pending.meal_type} has **{pending.meal_name}**. "
        "Is that what you ate? Say yes or no, and I’ll only log it after you confirm."
    )


def cancelled_message(pending: PendingMealConfirmation, request_id: str) -> str:
    address = form_of_address(request_id)
    suffix = f", {address}" if address else ""
    return f"Got it{suffix}—I did not log **{pending.meal_name}**. Tell me what you ate and I’ll match it again."
