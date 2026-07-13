import html
import json
import secrets

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from backend.core.security import verify_api_key
from backend.services.calendar_service import (
    get_calendar_summary_for_date,
    get_next_calendar_summary,
    get_next_work_summary,
    get_today_calendar_summary,
)
from backend.core.config import LOCAL_TZ
from backend.integrations.google_calendar import (
    CalendarAuthRequired,
    begin_calendar_oauth,
    complete_calendar_oauth,
    refresh_calendar_auth,
)
from datetime import datetime, timedelta

router = APIRouter()
protected = [Depends(verify_api_key)]


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


@router.get("/calendar/next", dependencies=protected)
def get_next_calendar_event():
    return calendar_response(
        get_next_calendar_summary,
        "Calendar check failed. Jarvis could not fetch your next event.",
    )


@router.get("/calendar/next/work", dependencies=protected)
def next_work():
    return calendar_response(
        get_next_work_summary,
        "Calendar check failed. Jarvis could not fetch your next work event.",
    )


@router.get("/calendar/today", dependencies=protected)
def today_events():
    return calendar_response(
        get_today_calendar_summary,
        "Calendar check failed. Jarvis could not fetch today's events.",
    )


@router.post("/calendar/resync", dependencies=protected)
def resync_calendar(return_origin: str | None = Query(default=None)):
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
        response = {
            "status": "auth_required",
            "message": str(exc),
        }
        try:
            auth = begin_calendar_oauth(return_origin)
            response.update({
                "reauth_url": auth["authorization_url"],
                "reauth_expires_in": auth["expires_in"],
            })
        except CalendarAuthRequired:
            pass
        return response
    except Exception as exc:
        return {
            "status": "error",
            "message": f"Google Calendar resync failed: {exc}",
        }


@router.post("/calendar/oauth/start", dependencies=protected)
def start_calendar_oauth(return_origin: str | None = Query(default=None)):
    auth = begin_calendar_oauth(return_origin)
    return {
        "status": "auth_required",
        "message": "Google Calendar needs your permission. Continue in the Google window.",
        "reauth_url": auth["authorization_url"],
        "reauth_expires_in": auth["expires_in"],
    }


@router.get("/calendar/oauth/callback", response_class=HTMLResponse)
def calendar_oauth_callback(
    state: str = Query(min_length=20, max_length=256),
    code: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    if error or not code:
        return _oauth_result_page(False, "Google Calendar authorization was cancelled.", "*")

    try:
        result = complete_calendar_oauth(state, code)
        return _oauth_result_page(True, "Google Calendar is connected. You can close this window.", result["return_origin"])
    except Exception:
        return _oauth_result_page(False, "Calendar authorization failed or expired. Return to Jarvis and try again.", "*")


def _oauth_result_page(success: bool, message: str, return_origin: str) -> HTMLResponse:
    nonce = secrets.token_urlsafe(18)
    safe_message = html.escape(message)
    event = json.dumps({"type": "jarvis:calendar-auth", "status": "ok" if success else "error"})
    target = json.dumps(return_origin)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Jarvis Calendar</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#020806;color:#dcfce7;font:16px system-ui}}main{{max-width:34rem;border:1px solid #22c55e;padding:2rem;background:#03140c;box-shadow:0 0 30px #22c55e33}}h1{{letter-spacing:.18em;text-transform:uppercase}}</style></head>
<body><main><h1>Jarvis Calendar</h1><p>{safe_message}</p></main>
<script nonce="{nonce}">if(window.opener){{window.opener.postMessage({event},{target});setTimeout(()=>window.close(),500);}}</script></body></html>"""
    response = HTMLResponse(page, status_code=200 if success else 400)
    response.headers["Content-Security-Policy"] = f"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'"
    response.headers["Cache-Control"] = "no-store"
    return response
