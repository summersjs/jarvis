from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.finance import FinanceTransactionCreate, MonthlyBudgetUpdate
from backend.services.debrief_service import (
    build_finance_ops_summary,
    list_monthly_budgets,
    list_transactions,
    save_monthly_budget,
    save_transaction,
)

router = APIRouter(
    prefix="/finance",
    tags=["finance"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/ops")
def finance_ops(user_id: str = "john", month: str | None = None):
    return build_finance_ops_summary(user_id, month)


@router.get("/budgets")
def finance_budgets(user_id: str = "john"):
    return {
        "status": "ok",
        "budgets": list_monthly_budgets(user_id),
    }


@router.put("/budgets")
def upsert_budget(payload: MonthlyBudgetUpdate):
    try:
        return {
            "status": "ok",
            "budget": save_monthly_budget(payload.model_dump()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions")
def finance_transactions(user_id: str = "john", month: str | None = None):
    return {
        "status": "ok",
        "transactions": list_transactions(user_id, month),
    }


@router.post("/transactions")
def create_transaction(payload: FinanceTransactionCreate):
    try:
        return {
            "status": "ok",
            "transaction": save_transaction(payload.model_dump()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
