from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.debrief import DailyDebriefEntryCreate
from backend.services.debrief_service import (
    build_daily_debrief_summary,
    list_daily_debrief_entries,
    save_daily_debrief_entry,
)

router = APIRouter(
    prefix="/debrief",
    tags=["debrief"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/daily")
def daily_debrief(user_id: str = "john"):
    return build_daily_debrief_summary(user_id)


@router.get("/daily/history")
def daily_debrief_history(user_id: str = "john"):
    return {
        "status": "ok",
        "entries": list_daily_debrief_entries(user_id),
    }


@router.post("/daily")
def save_daily_debrief(payload: DailyDebriefEntryCreate):
    try:
        return {
            "status": "ok",
            "entry": save_daily_debrief_entry(payload.model_dump()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
