from typing import Optional

from pydantic import BaseModel


class FoodVaultItemCreate(BaseModel):
    user_id: str = "john"
    name: str
    brand: Optional[str] = None
    serving_size: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    package_quantity: Optional[float] = 1
    current_quantity: Optional[float] = 0
    low_stock_threshold: Optional[float] = 0
    estimated_price: Optional[float] = None
    default_store: Optional[str] = None
    shopping_category: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False


class FoodVaultItemUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    serving_size: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    package_quantity: Optional[float] = None
    current_quantity: Optional[float] = None
    low_stock_threshold: Optional[float] = None
    estimated_price: Optional[float] = None
    default_store: Optional[str] = None
    shopping_category: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: Optional[bool] = None


class FoodVaultConsume(BaseModel):
    quantity: float = 1
    shopping_list_id: Optional[str] = None


class NutritionTargetsUpsert(BaseModel):
    user_id: str = "john"
    daily_calorie_target: Optional[float] = None
    daily_protein_target: Optional[float] = None
    daily_carb_target: Optional[float] = None
    daily_fat_target: Optional[float] = None
