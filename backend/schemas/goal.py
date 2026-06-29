from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class GoalCreate(BaseModel):
    user_id: str
    title: str
    description: Optional[str] = None
    category: str
    goal_type: str
    target_value: Optional[float] = None
    current_value: float = 0
    unit: Optional[str] = None
    frequency: Optional[str] = None
    is_active: bool = True
    mission_type: str = "objective"
    status: str = "active"
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    planned_date: Optional[str] = None
    planned_time: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    milestones: list[GoalMilestoneCreate] = Field(default_factory=list)


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    goal_type: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    frequency: Optional[str] = None
    is_active: Optional[bool] = None
    mission_type: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    planned_date: Optional[str] = None
    planned_time: Optional[str] = None
    metadata: Optional[dict] = None


class GoalLogCreate(BaseModel):
    value: Optional[float] = 1
    notes: Optional[str] = None
    log_type: str = "progress"
    planned_for: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class GoalLogUpdate(BaseModel):
    value: Optional[float] = None
    notes: Optional[str] = None
    log_type: Optional[str] = None
    planned_for: Optional[str] = None
    metadata: Optional[dict] = None


class GoalMilestoneCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "open"
    target_date: Optional[str] = None
    completed_at: Optional[str] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    sort_order: int = 0


class GoalMilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    completed_at: Optional[str] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None
