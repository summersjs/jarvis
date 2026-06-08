from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class MonthlyBudgetUpdate(BaseModel):
    user_id: str
    month: str
    income: float = 0
    fixed_bills: float = 0
    groceries_budget: float = 0
    eating_out_budget: float = 0
    gas_budget: float = 0
    kids_family_budget: float = 0
    debt_budget: float = 0
    miscellaneous_budget: float = 0
    variable_categories: dict[str, float] = Field(default_factory=dict)


class FinanceTransactionCreate(BaseModel):
    user_id: str
    date: str
    amount: float
    category: str
    store_vendor: str
    notes: Optional[str] = None
    linked_to_meal_plan: bool = False


class FinanceTransactionUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    store_vendor: Optional[str] = None
    notes: Optional[str] = None
    linked_to_meal_plan: Optional[bool] = None
