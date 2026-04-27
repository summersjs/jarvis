from pydantic import BaseModel
from typing import Optional


class ProductPreferenceCreate(BaseModel):
    user_id: str
    item_keyword: str
    preference_type: str  # favorite or obsession
    preferred_brand: Optional[str] = None
    preferred_product_name: Optional[str] = None
    preferred_size: Optional[str] = None
    preferred_unit: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class ProductPreferenceUpdate(BaseModel):
    item_keyword: Optional[str] = None
    preference_type: Optional[str] = None
    preferred_brand: Optional[str] = None
    preferred_product_name: Optional[str] = None
    preferred_size: Optional[str] = None
    preferred_unit: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None