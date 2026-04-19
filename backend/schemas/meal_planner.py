from pydantic import BaseModel
from typing import Optional


class MealPlanEntryCreate(BaseModel):
    user_id: str
    meal_date: str
    meal_type: str
    recipe_id: Optional[str] = None
    custom_meal_name: Optional[str] = None
    notes: Optional[str] = None


class MealPlanEntryUpdate(BaseModel):
    meal_date: Optional[str] = None
    meal_type: Optional[str] = None
    recipe_id: Optional[str] = None
    custom_meal_name: Optional[str] = None
    notes: Optional[str] = None