from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class DebriefObjective(BaseModel):
    id: Optional[str] = None
    title: str
    completed: bool = False
    notes: Optional[str] = None
    blocker: Optional[str] = None


class TrainingDebrief(BaseModel):
    workout_completed: bool = False
    lift_completed: Optional[str] = None
    top_set_weight: Optional[float] = None
    top_set_reps: Optional[int] = None
    energy_level: Optional[int] = None
    pain_notes: Optional[str] = None
    training_notes: Optional[str] = None


class NutritionDebrief(BaseModel):
    meals_planned_today: int = 0
    meals_completed: int = 0
    ate_out_today: bool = False
    estimated_food_spend: float = 0
    notes: Optional[str] = None


class FinanceDebrief(BaseModel):
    money_spent_today: float = 0
    category: Optional[str] = None
    notes: Optional[str] = None
    unexpected_expense: Optional[bool] = False
    spending_status: Optional[str] = None


class VictoryLog(BaseModel):
    win: str
    category: str = "Other"


class LessonsLearned(BaseModel):
    worked: Optional[str] = None
    did_not_work: Optional[str] = None
    adjust_tomorrow: Optional[str] = None


class TomorrowPrep(BaseModel):
    top_priorities: list[str] = Field(default_factory=list)
    shopping_items: list[str] = Field(default_factory=list)
    meal_prep: Optional[str] = None
    reminder: Optional[str] = None


class DailyDebriefEntryCreate(BaseModel):
    user_id: str
    date: str
    overall_status: str
    summary: Optional[str] = None
    objectives: list[DebriefObjective] = Field(default_factory=list)
    training: TrainingDebrief = Field(default_factory=TrainingDebrief)
    nutrition: NutritionDebrief = Field(default_factory=NutritionDebrief)
    finance: FinanceDebrief = Field(default_factory=FinanceDebrief)
    victory: VictoryLog = Field(default_factory=lambda: VictoryLog(win="", category="Other"))
    lessons: LessonsLearned = Field(default_factory=LessonsLearned)
    tomorrow: TomorrowPrep = Field(default_factory=TomorrowPrep)
    notes: Optional[dict[str, Any]] = None
