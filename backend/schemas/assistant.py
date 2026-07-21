from typing import Any, Literal

from pydantic import BaseModel, Field


AssistantRole = Literal["system", "user", "assistant"]
ExecutionStatus = Literal[
    "proposed",
    "awaiting_confirmation",
    "executing",
    "succeeded",
    "failed",
    "verification_failed",
    "unavailable",
    "cancelled",
]
VerificationStatus = Literal["not_required", "pending", "verified", "failed", "unavailable"]


class AssistantMessage(BaseModel):
    role: AssistantRole
    content: str = Field(min_length=1, max_length=12000)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=24)
    model: str | None = Field(default=None, min_length=1, max_length=160)
    request_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    source_message_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    conversation_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")


class AssistantCapabilityManifest(BaseModel):
    available_tools: list[str]
    unavailable_capabilities: list[str]
    evidence_requirements: dict[str, str] = Field(default_factory=dict)


class ActionVerification(BaseModel):
    status: VerificationStatus
    summary: str | None = Field(default=None, max_length=240)
    verified_at: str | None = None


class AssistantActionExecution(BaseModel):
    action_id: str
    source_message_id: str
    conversation_id: str
    intent: str
    requested_action: str
    execution_status: ExecutionStatus
    tool_name: str | None = None
    requires_confirmation: bool = False
    result: dict[str, Any] | None = None
    verification: ActionVerification | None = None
    user_message: str


class AssistantSpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: Literal["af_bella", "af_nicole"] = "af_bella"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


class AssistantMediaResponseRequest(BaseModel):
    intent: Literal["start_music", "pause_music", "next_track", "previous_track", "now_playing"]
    initial_playback_status: str | None = Field(default=None, max_length=40)
    command_available: bool
    verified_playing: bool
    playback_status: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=300)
    artist: str | None = Field(default=None, max_length=300)
    track_changed: bool | None = None
    command_verified: bool | None = None
