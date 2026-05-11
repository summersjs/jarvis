from pydantic import BaseModel
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


class GoalLogCreate(BaseModel):
    value: Optional[float] = 1
    notes: Optional[str] = None


class GoalLogUpdate(BaseModel):
    value: Optional[float] = None
    notes: Optional[str] = None
