from __future__ import annotations

import hashlib
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.utils.local_store import read_json, write_json


MemoryType = Literal["profile", "preference", "commitment", "project_state", "episodic_event", "correction", "temporary_state"]
MEMORY_FILE = "assistant_memories.json"
FEEDBACK_FILE = "assistant_feedback.json"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MemoryRecord(BaseModel):
    id: str
    type: MemoryType
    content: str
    scope: str = "global"
    importance: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    source: str
    sourceTimestamp: datetime
    lastConfirmedAt: datetime
    expiresAt: datetime | None = None
    status: Literal["active", "expired", "deleted"] = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


DEFAULT_PLANNING_PREFERENCES: dict[str, Any] = {
    "check_calendar_first": True,
    "check_workout_gap": True,
    "max_major_projects_per_day": 2,
    "exact_times_require_availability": True,
    "include_financial_events": True,
}


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if token not in {"a", "an", "and", "i", "is", "it", "the", "this", "to"}}


def semantic_similarity(left: str, right: str) -> float:
    a, b = _tokens(left), _tokens(right)
    return len(a & b) / len(a | b) if a and b else 0.0


class MemoryStore:
    def __init__(self, filename: str = MEMORY_FILE):
        self.filename = filename
        self._lock = threading.Lock()

    def list(self, user_id: str, include_expired: bool = False) -> list[MemoryRecord]:
        now = utc_now()
        with self._lock:
            data = read_json(self.filename, {})
            raw = data.get(user_id, [])
            changed = False
            rows = []
            all_rows = []
            for item in raw:
                try:
                    memory = MemoryRecord.model_validate(item)
                except Exception:
                    continue
                if memory.status == "active" and memory.expiresAt and memory.expiresAt <= now:
                    memory.status = "expired"
                    changed = True
                all_rows.append(memory)
                if include_expired or memory.status == "active":
                    rows.append(memory)
            if changed:
                data[user_id] = [row.model_dump(mode="json") for row in all_rows]
                write_json(self.filename, data)
        return rows

    def remember(self, user_id: str, *, memory_type: MemoryType, content: str, scope: str = "global", importance: float = 0.8, confidence: float = 0.95, source: str = "explicit_user", expires_at: datetime | None = None, metadata: dict[str, Any] | None = None) -> tuple[MemoryRecord, bool]:
        now = utc_now()
        normalized = re.sub(r"\s+", " ", content).strip()
        with self._lock:
            data = read_json(self.filename, {})
            rows = [MemoryRecord.model_validate(item) for item in data.get(user_id, [])]
            duplicate = next((row for row in rows if row.status == "active" and row.type == memory_type and row.scope == scope and semantic_similarity(row.content, normalized) >= 0.82), None)
            if duplicate:
                duplicate.lastConfirmedAt = now
                duplicate.confidence = max(duplicate.confidence, confidence)
                duplicate.importance = max(duplicate.importance, importance)
                data[user_id] = [row.model_dump(mode="json") for row in rows]
                write_json(self.filename, data)
                return duplicate, False
            identity = f"{user_id}|{memory_type}|{scope}|{normalized.lower()}"
            record = MemoryRecord(
                id="mem_" + hashlib.sha256(identity.encode()).hexdigest()[:20], type=memory_type, content=normalized,
                scope=scope, importance=importance, confidence=confidence, source=source,
                sourceTimestamp=now, lastConfirmedAt=now, expiresAt=expires_at, metadata=metadata or {},
            )
            rows.append(record)
            data[user_id] = [row.model_dump(mode="json") for row in rows[-500:]]
            write_json(self.filename, data)
            return record, True

    def delete(self, user_id: str, memory_id: str) -> bool:
        with self._lock:
            data = read_json(self.filename, {})
            rows = data.get(user_id, [])
            before = len(rows)
            data[user_id] = [row for row in rows if row.get("id") != memory_id]
            write_json(self.filename, data)
        return len(data[user_id]) != before

    def preferences(self, user_id: str) -> dict[str, Any]:
        result = dict(DEFAULT_PLANNING_PREFERENCES)
        for row in self.list(user_id):
            if row.type == "preference" and row.scope == "daily_planning":
                result.update(row.metadata.get("preferences") or {})
        return result

    def update_preferences(self, user_id: str, updates: dict[str, Any], source: str) -> MemoryRecord:
        allowed = set(DEFAULT_PLANNING_PREFERENCES)
        clean = {key: value for key, value in updates.items() if key in allowed}
        current = self.preferences(user_id)
        current.update(clean)
        content = "Daily planning preferences: " + ", ".join(f"{key}={current[key]}" for key in sorted(current))
        existing = next((row for row in self.list(user_id) if row.type == "preference" and row.scope == "daily_planning"), None)
        if existing:
            self.delete(user_id, existing.id)
        return self.remember(user_id, memory_type="preference", content=content, scope="daily_planning", importance=0.95, confidence=1.0, source=source, metadata={"preferences": current})[0]


MEMORY_STORE = MemoryStore()


def capture_explicit_memory(user_id: str, text: str) -> MemoryRecord | None:
    remember = re.search(r"(?i)\bremember(?: that| this)?\s+(.+)", text)
    correction = re.search(r"(?i)\b(?:correction|actually|that(?:'s| is) wrong)[:,]?\s*(.+)", text)
    if correction:
        return MEMORY_STORE.remember(user_id, memory_type="correction", content=correction.group(1), importance=1.0, confidence=1.0, source="explicit_correction")[0]
    if remember:
        return MEMORY_STORE.remember(user_id, memory_type="preference", content=remember.group(1), importance=0.95, confidence=1.0, source="explicit_remember")[0]
    return None


def record_feedback(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = utc_now()
    row = {"id": "feedback_" + hashlib.sha256(f"{user_id}|{now.isoformat()}".encode()).hexdigest()[:18], "user_id": user_id, "created_at": now.isoformat(), **payload}
    data = read_json(FEEDBACK_FILE, [])
    data.append(row)
    write_json(FEEDBACK_FILE, data[-1000:])
    reason = str(payload.get("reason") or "")
    updates: dict[str, Any] = {}
    if reason == "Missed context":
        updates = {"check_calendar_first": True, "check_workout_gap": True, "include_financial_events": True}
    elif reason == "Too generic":
        updates = {"max_major_projects_per_day": 2}
    elif reason == "Wrong priority":
        updates = {"check_calendar_first": True, "max_major_projects_per_day": 2}
    if payload.get("rating") == "up" and reason == "Remember this style":
        MEMORY_STORE.remember(user_id, memory_type="preference", content=str(payload.get("written_feedback") or "Preferred the style of this response."), scope="response_style", importance=0.9, confidence=0.95, source="positive_feedback")
    preference = MEMORY_STORE.update_preferences(user_id, updates, "feedback") if updates else None
    return {"feedback": row, "updated_preferences": (preference.metadata.get("preferences") if preference else {})}
