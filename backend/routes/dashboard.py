from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.services.dashboard_service import build_daily_dashboard

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/daily")
def daily_dashboard(user_id: str = "john"):
    try:
        return build_daily_dashboard(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
