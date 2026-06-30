from typing import Optional

from pydantic import BaseModel


class ArchiveDreamCreate(BaseModel):
    user_id: str = "john"
    title: Optional[str] = None
    dream_text: Optional[str] = None
    dream_prompt: Optional[str] = None
    dream_date: Optional[str] = None
    moon_phase: Optional[str] = None
    people: list[str] = []
    emotions: list[str] = []
    settings: list[str] = []
    symbols: list[str] = []
    lucid: Optional[str] = None
    recurring: Optional[str] = None
    intensity: Optional[int] = None
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
    lucid: Optional[str] = None
    recurring: Optional[str] = None
    intensity: Optional[int] = None
    notes: Optional[str] = None
