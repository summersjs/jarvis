from typing import Any, Optional

from pydantic import BaseModel, Field


class HealthEventCreate(BaseModel):
    user_id: str = "john"
    event_type: str
    occurred_at: Optional[str] = None
    event_date: Optional[str] = None
    activity: Optional[str] = None
    duration: Optional[str] = None
    trigger: Optional[str] = None
    relief: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)


class HealthEventUpdate(BaseModel):
    activity: Optional[str] = None
    duration: Optional[str] = None
    trigger: Optional[str] = None
    relief: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None
    context: Optional[dict[str, Any]] = None


class HealthDailyCheckinUpsert(BaseModel):
    user_id: str = "john"
    checkin_date: str
    energy: Optional[int] = None
    mood: Optional[int] = None
    stress: Optional[int] = None
    sleep_quality: Optional[int] = None
    hours_slept: Optional[float] = None
    water_oz: Optional[float] = None
    caffeine_mg: Optional[float] = None
    workout_completed: Optional[bool] = None
    meals_planned: Optional[int] = None
    meals_completed: Optional[int] = None
    ate_out: Optional[bool] = None
    food_spend: Optional[float] = None
    training_notes: Optional[str] = None
    supplements: list[str] = Field(default_factory=list)
    medications: dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    source_data: dict[str, Any] = Field(default_factory=dict)
