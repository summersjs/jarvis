from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ConversationEntities(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product: str | None = Field(default=None, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    size: str | None = Field(default=None, max_length=60)
    variant: str | None = Field(default=None, max_length=100)
    quantity: int | None = Field(default=None, ge=1, le=999)
    location: str | None = Field(default=None, max_length=160)
    zip_code: str | None = Field(default=None, pattern=r"^\d{5}(?:-\d{4})?$")
    retailer: str | None = Field(default=None, max_length=80)
    date_range: str | None = Field(default=None, max_length=100)
    meal_id: str | None = Field(default=None, max_length=120)
    goal_id: str | None = Field(default=None, max_length=120)
    health_event_id: str | None = Field(default=None, max_length=120)
    shopping_list_id: str | None = Field(default=None, max_length=120)
    shopping_list_item_id: str | None = Field(default=None, max_length=120)


class VerifiedToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: str = Field(min_length=1, max_length=100)
    result_id: str | None = Field(default=None, max_length=160)
    verified_at: datetime
    expires_at: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class PendingClarification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=500)
    missing_entities: list[str] = Field(default_factory=list, max_length=12)
    options: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class RecentAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution_id: str = Field(min_length=1, max_length=160)
    tool: str = Field(min_length=1, max_length=100)
    record_id: str | None = Field(default=None, max_length=160)
    verified_at: datetime
    reversible: bool = False
    reverse_tool: str | None = Field(default=None, max_length=100)
    expires_at: datetime | None = None


class ConversationState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    active_intent: str | None = Field(default=None, max_length=120)
    entities: ConversationEntities = Field(default_factory=ConversationEntities)
    last_verified_tool_results: list[VerifiedToolResult] = Field(default_factory=list, max_length=20)
    last_successful_tool: str | None = Field(default=None, max_length=100)
    last_selected_entity: dict[str, str] | None = None
    pending_clarification: PendingClarification | None = None
    recent_actions: list[RecentAction] = Field(default_factory=list, max_length=10)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReferenceResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phrase: str = Field(min_length=1, max_length=120)
    resolved_type: str | None = Field(default=None, max_length=80)
    resolved_id: str | None = Field(default=None, max_length=160)
    confidence: float = Field(ge=0, le=1)


class ContextResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_type: Literal["new_request", "follow_up"]
    intent: str = Field(min_length=1, max_length=120)
    inherit_context: bool
    entity_updates: ConversationEntities = Field(default_factory=ConversationEntities)
    reference_resolution: list[ReferenceResolution] = Field(default_factory=list, max_length=12)
    required_entities: list[str] = Field(default_factory=list, max_length=20)
    missing_entities: list[str] = Field(default_factory=list, max_length=20)
    requires_tool: bool
    operation_type: Literal["read", "write", "live_external", "conversation"]
    needs_clarification: bool
    clarification_question: str | None = Field(default=None, max_length=500)


class ContextResolutionMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    follow_up: bool = False
    inherited: dict[str, str] = Field(default_factory=dict)
    changed: dict[str, str] = Field(default_factory=dict)
    refreshed_live_results: bool = False
    pending_clarification: str | None = None

