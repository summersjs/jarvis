from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key
from backend.services.calendar_service import (
    get_next_calendar_summary,
    get_next_work_summary,
    get_today_calendar_summary,
)

router = APIRouter(dependencies=[Depends(verify_api_key)])


def calendar_response(callback, fallback: str):
    try:
        return {
            "status": "ok",
            "spoken_response": callback(),
        }
    except Exception as e:
        return {
            "status": "error",
            "spoken_response": fallback,
            "error": str(e),
        }


@router.get("/calendar/next")
def get_next_calendar_event():
    return calendar_response(
        get_next_calendar_summary,
        "Calendar check failed. Jarvis could not fetch your next event.",
    )


@router.get("/calendar/next/work")
def next_work():
    return calendar_response(
        get_next_work_summary,
        "Calendar check failed. Jarvis could not fetch your next work event.",
    )


@router.get("/calendar/today")
def today_events():
    return calendar_response(
        get_today_calendar_summary,
        "Calendar check failed. Jarvis could not fetch today's events.",
    )
