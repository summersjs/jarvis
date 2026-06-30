from typing import Literal, Optional

from pydantic import BaseModel, Field


class ArchiveDreamCreate(BaseModel):
    user_id: str = "john"
    title: Optional[str] = None
    dream_text: Optional[str] = None
    dream_prompt: Optional[str] = None
    dream_date: Optional[str] = None
    moon_phase: Optional[str] = None
    people: list[str] = Field(default_factory=list)
    emotions: list[str] = Field(default_factory=list)
    settings: list[str] = Field(default_factory=list)
    symbols: list[str] = Field(default_factory=list)
    lucid: Optional[Literal["Yes", "No", "Maybe"]] = None
    recurring: Optional[Literal["Yes", "No", "Unknown"]] = None
    intensity: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class ArchiveDreamUpdate(BaseModel):
    title: Optional[str] = None
    dream_text: Optional[str] = None
    dream_prompt: Optional[str] = None
    dream_date: Optional[str] = None
    moon_phase: Optional[str] = None
    people: Optional[list[str]] = None
    emotions: Optional[list[str]] = None
    settings: Optional[list[str]] = None
    symbols: Optional[list[str]] = None
    lucid: Optional[Literal["Yes", "No", "Maybe"]] = None
    recurring: Optional[Literal["Yes", "No", "Unknown"]] = None
    intensity: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None
