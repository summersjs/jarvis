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


class ArchiveChronicleCreate(BaseModel):
    user_id: str = "john"
    entry_date: Optional[str] = None
    title: Optional[str] = None
    status: Optional[Literal["draft", "in_progress", "filed"]] = "draft"
    daily_score: Optional[float] = None
    weekly_score: Optional[float] = None
    mission_rank: Optional[str] = None
    overall_status: Optional[str] = None
    workout_status: Optional[str] = None
    workout_summary: Optional[str] = None
    next_protocol: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    water_oz: Optional[float] = None
    sleep_hours: Optional[float] = None
    temperature: Optional[str] = None
    health_event_count: Optional[int] = None
    deep_breath_event_count: Optional[int] = None
    goal_impacts: list[dict] = Field(default_factory=list)
    victory_log: Optional[str] = None
    lessons_worked: Optional[str] = None
    lessons_not_worked: Optional[str] = None
    lessons_adjust_tomorrow: Optional[str] = None
    tomorrow_focus: Optional[str] = None
    story_text: Optional[str] = None
    future_me_message: Optional[str] = None
    notes: Optional[str] = None
    source_debrief_id: Optional[str] = None


class ArchiveChronicleUpdate(BaseModel):
    entry_date: Optional[str] = None
    title: Optional[str] = None
    status: Optional[Literal["draft", "in_progress", "filed"]] = None
    filed_at: Optional[str] = None
    daily_score: Optional[float] = None
    weekly_score: Optional[float] = None
    mission_rank: Optional[str] = None
    overall_status: Optional[str] = None
    workout_status: Optional[str] = None
    workout_summary: Optional[str] = None
    next_protocol: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    water_oz: Optional[float] = None
    sleep_hours: Optional[float] = None
    temperature: Optional[str] = None
    health_event_count: Optional[int] = None
    deep_breath_event_count: Optional[int] = None
    goal_impacts: Optional[list[dict]] = None
    victory_log: Optional[str] = None
    lessons_worked: Optional[str] = None
    lessons_not_worked: Optional[str] = None
    lessons_adjust_tomorrow: Optional[str] = None
    tomorrow_focus: Optional[str] = None
    story_text: Optional[str] = None
    future_me_message: Optional[str] = None
    notes: Optional[str] = None
    source_debrief_id: Optional[str] = None
