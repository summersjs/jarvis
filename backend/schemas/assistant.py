from typing import Literal

from pydantic import BaseModel, Field


AssistantRole = Literal["system", "user", "assistant"]


class AssistantMessage(BaseModel):
    role: AssistantRole
    content: str = Field(min_length=1, max_length=12000)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=24)
    model: str | None = Field(default=None, min_length=1, max_length=160)
    request_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    source_message_id: str | None = Field(default=None, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")


class AssistantSpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: Literal["af_bella", "af_nicole"] = "af_bella"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)
