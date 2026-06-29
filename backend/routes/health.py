from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.health import HealthDailyCheckinUpsert, HealthEventCreate, HealthEventUpdate
from backend.services.health_service import (
    build_doctor_summary,
    build_health_dashboard,
    create_health_event,
    update_health_event,
    upsert_daily_checkin,
)

router = APIRouter(
    prefix="/health-ops",
    tags=["health-ops"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/dashboard")
def health_dashboard(user_id: str = "john", date: str | None = None):
    return build_health_dashboard(user_id, date)


@router.post("/events")
def create_event(payload: HealthEventCreate):
    try:
        return {
            "status": "ok",
            "event": create_health_event(payload),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/events/{event_id}")
def patch_event(event_id: str, payload: HealthEventUpdate):
    event = update_health_event(event_id, payload)
    if not event:
        raise HTTPException(status_code=404, detail="Health event not found.")
    return {
        "status": "ok",
        "event": event,
    }


@router.post("/checkins")
def save_checkin(payload: HealthDailyCheckinUpsert):
    try:
        return {
            "status": "ok",
            "checkin": upsert_daily_checkin(payload),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/doctor-summary")
def doctor_summary(user_id: str = "john", days: int = 7):
    if days not in {7, 30, 90}:
        raise HTTPException(status_code=400, detail="days must be 7, 30, or 90.")
    return {
        "status": "ok",
        "summary": build_doctor_summary(user_id, days),
    }
