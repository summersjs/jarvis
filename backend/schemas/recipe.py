from pydantic import BaseModel
from typing import Optional, List

class RecipeIngredientIn(BaseModel):
    item_name: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    is_optional: Optional[bool] = False

class RecipeCreate(BaseModel):
    user_id: str
    title: str
    source_type: str = "manual"
    source_url: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    is_favorite: bool = False
    ingredients: List[RecipeIngredientIn] = []

class RecipeUpdate(BaseModel):
    title: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    is_favorite: Optional[bool] = None

class RecipeIngredientUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    is_optional: Optional[bool] = None