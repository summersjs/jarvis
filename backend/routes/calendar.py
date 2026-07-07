from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key
from backend.services.calendar_service import (
    get_calendar_summary_for_date,
    get_next_calendar_summary,
    get_next_work_summary,
    get_today_calendar_summary,
)
from backend.core.config import LOCAL_TZ
from backend.integrations.google_calendar import CalendarAuthRequired, refresh_calendar_auth
from datetime import datetime, timedelta

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


@router.post("/calendar/resync")
def resync_calendar():
    try:
        auth = refresh_calendar_auth()
        today = datetime.now(LOCAL_TZ).date()
        tomorrow = today + timedelta(days=1)
        return {
            "status": "ok",
            "message": "Google Calendar files and auth token verified.",
            "auth": auth,
            "today": get_calendar_summary_for_date(today, "today"),
            "tomorrow": get_calendar_summary_for_date(tomorrow, "tomorrow"),
            "next_work": get_next_work_summary(),
            "synced_at": datetime.now(LOCAL_TZ).isoformat(),
        }
    except CalendarAuthRequired as exc:
        return {
            "status": "auth_required",
            "message": str(exc),
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": f"Google Calendar resync failed: {exc}",
        }
