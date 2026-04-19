from pydantic import BaseModel
from typing import Optional


class ShoppingListCreate(BaseModel):
    user_id: str
    title: str
    week_start: Optional[str] = None
    notes: Optional[str] = None


class ShoppingListUpdate(BaseModel):
    title: Optional[str] = None
    week_start: Optional[str] = None
    notes: Optional[str] = None


class ShoppingListItemCreate(BaseModel):
    shopping_list_id: str
    item_name: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    is_checked: bool = False
    source: str = "manual"
    recipe_id: Optional[str] = None


class ShoppingListItemUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    is_checked: Optional[bool] = None
    source: Optional[str] = None
    recipe_id: Optional[str] = None