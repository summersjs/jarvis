from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key
from backend.services.calendar_service import (
    get_next_calendar_summary,
    get_next_work_summary,
    get_today_calendar_summary,
)

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/calendar/next")
def get_next_calendar_event():
    try:
        return {
            "status": "ok",
            "spoken_response": get_next_calendar_summary()
        }
    except Exception as e:
        return {
            "status": "error",
            "spoken_response": "Sorry Daddy! I had trouble fetching your calendar events.",
            "error": str(e)
        }


@router.get("/calendar/next/work")
def next_work():
    return {
        "status": "ok",
        "spoken_response": get_next_work_summary()
    }


@router.get("/calendar/today")
def today_events():
    return {
        "status": "ok",
        "spoken_response": get_today_calendar_summary()
    }