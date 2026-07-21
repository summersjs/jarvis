from __future__ import annotations

import re
import threading
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.utils.local_store import read_json, write_json

PLAN_FILE = "assistant_email_plans.json"


class PendingEmailPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_id: str = Field(min_length=8, max_length=100)
    recipient_name: str = Field(min_length=1, max_length=160)
    recipient_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(default="A note from John", min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=12000)
    content_goals: list[str] = Field(default_factory=list, max_length=30)
    tone: list[str] = Field(default_factory=list, max_length=20)
    constraints: list[str] = Field(default_factory=list, max_length=20)
    status: Literal["gathering", "proposed", "revising", "approved", "cancelled"] = "gathering"
    revision_number: int = Field(default=0, ge=0, le=100)
    draft_id: str | None = Field(default=None, max_length=80)
    rejected_draft_hashes: list[str] = Field(default_factory=list, max_length=30)
    awaiting_brief: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmailPlanStore:
    def __init__(self):
        self._lock = threading.Lock()

    def get(self, conversation_id: str) -> PendingEmailPlan | None:
        with self._lock:
            raw = read_json(PLAN_FILE, {}).get(conversation_id)
        try:
            return PendingEmailPlan.model_validate(raw) if raw else None
        except Exception:
            return None

    def save(self, plan: PendingEmailPlan) -> PendingEmailPlan:
        plan.updated_at = datetime.now(timezone.utc)
        with self._lock:
            rows = read_json(PLAN_FILE, {})
            rows[plan.conversation_id] = plan.model_dump(mode="json")
            write_json(PLAN_FILE, dict(list(rows.items())[-100:]))
        return plan

    def clear(self, conversation_id: str) -> None:
        with self._lock:
            rows = read_json(PLAN_FILE, {})
            rows.pop(conversation_id, None)
            write_json(PLAN_FILE, rows)


EMAIL_PLAN_STORE = EmailPlanStore()


def parse_email_plan_request(text: str) -> tuple[str | None, str | None]:
    normalized = re.sub(r"^.*?(?:^|\s)/plan\b\s*", "", text, count=1, flags=re.I).strip()
    match = re.search(r"\b(?:draft|write|create)\s+(?:an?\s+)?email\s+to\s+(.+?)(?:\s+(?:saying|about)\s+(.+))?$", normalized, re.I)
    return (match.group(1).strip(), match.group(2).strip() if match and match.group(2) else None) if match else (None, None)


def is_email_plan_request(text: str) -> bool:
    return bool(re.search(r"(?:^|\s)/plan\b", text, re.I))


def is_plan_approval(text: str) -> bool:
    normalized = re.sub(r"[,]+", " ", text)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return bool(re.fullmatch(r"(?:yes|yes i love it|i love it|love it|looks good|perfect|create it|make the draft|draft it|go ahead)\s*[.!]?", normalized, re.I))


def is_plan_cancel(text: str) -> bool:
    return bool(re.fullmatch(r"\s*(?:cancel|never mind|nevermind|stop)\s*[.!]?\s*", text, re.I))


def is_plan_rejection(text: str) -> bool:
    return bool(re.fullmatch(r"\s*(?:no|nope|not yet|i don t like it|i don't like it|start over|everything|that(?:'s| is) wrong|try again)\s*[.!]?\s*", text, re.I))


def draft_hash(body: str | None) -> str:
    return hashlib.sha256((body or "").strip().encode("utf-8")).hexdigest()


def reject_current_draft(plan: PendingEmailPlan) -> None:
    if plan.body:
        fingerprint = draft_hash(plan.body)
        if fingerprint not in plan.rejected_draft_hashes:
            plan.rejected_draft_hashes.append(fingerprint)
    plan.status = "revising"


def apply_revision_metadata(plan: PendingEmailPlan, feedback: str) -> None:
    """Apply safe, deterministic metadata changes before asking the model to rewrite."""
    normalized = re.sub(r"\s+", " ", feedback).strip()
    lower = normalized.lower()
    tone_terms = {
        "dominant": "confident and assertive",
        "dom vibes": "confident, affectionate, assertive, and protective",
        "confident": "confident",
        "romantic": "romantic",
        "professional": "professional",
        "playful": "playful",
        "affectionate": "affectionate",
        "less cheesy": "restrained and not cheesy",
        "stronger": "stronger and more direct",
        "shorter": "concise",
    }
    for phrase, value in tone_terms.items():
        if phrase in lower and value not in plan.tone:
            plan.tone.append(value)
    if "don't sound desperate" in lower or "do not sound desperate" in lower:
        plan.constraints.append("Do not sound desperate")
    if "don't say that" in lower or "do not say that" in lower or "don't include that" in lower or "do not include that" in lower:
        plan.constraints.append("Remove the wording the user just rejected")
    if "tone" in lower or "come off" in lower or "sound" in lower or "vibes" in lower:
        plan.content_goals = [goal for goal in plan.content_goals if not any(term in goal.lower() for term in ("tone", "come off", "sound", "vibes", "dominant"))]
    add_match = re.search(r"(?i)\badd that\s+(.+)$", normalized)
    if add_match:
        plan.content_goals.append(add_match.group(1).strip(" ."))


def contains_private_style_language(body: str, tone: list[str]) -> bool:
    lower = re.sub(r"\s+", " ", body.lower())
    comparable_body = re.sub(r"[^a-z0-9 ]", "", lower)
    meta_patterns = (
        r"\bi want to (?:sound|come off|give|make this email)\b",
        r"\bthe tone (?:should be|is)\b",
        r"\bi want this email to\b",
        r"\b(?:dom|dominant) vibes\b",
    )
    if any(re.search(pattern, lower) for pattern in meta_patterns):
        return True
    private_phrases = [re.sub(r"[^a-z0-9 ]", "", phrase.lower()) for phrase in tone if len(phrase.split()) >= 2]
    return any(phrase and phrase in comparable_body for phrase in private_phrases)


def next_draft_identity(plan: PendingEmailPlan) -> None:
    plan.revision_number += 1
    plan.draft_id = f"email_{uuid.uuid4().hex}"
    plan.status = "proposed"
    plan.awaiting_brief = False


def classify_brief_locally(brief: str) -> tuple[list[str], list[str], list[str]]:
    content: list[str] = []
    tone: list[str] = []
    constraints: list[str] = []
    style_markers = ("tone", "vibe", "come off", "sound", "make it", "keep it", "don't sound", "do not sound")
    for part in re.split(r"(?<=[.!?])\s+", brief.strip()):
        cleaned = part.strip(" -")
        if not cleaned:
            continue
        lower = cleaned.lower()
        if any(marker in lower for marker in style_markers):
            tone.append(cleaned)
        else:
            content.append(cleaned)
    if not content and brief.strip():
        content.append(brief.strip())
    return content[:30], tone[:20], constraints
