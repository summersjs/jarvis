from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.errors import HttpError
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/calendar"]

BASE_DIR = Path(__file__).resolve().parents[2]
TOKEN_PATH = BASE_DIR / "token.json"
CREDS_PATH = BASE_DIR / "credentials.json"


def get_calendar_service():
    creds = None

    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        if not creds.has_scopes(SCOPES):
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                creds = None

        if not creds or not creds.valid:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_PATH.write_text(creds.to_json())

    return build("calendar", "v3", credentials=creds)


def create_calendar_event(
    summary: str,
    date_str: str,
    time_str: str | None = None,
    notes: str | None = None,
    calendar_id: str = "primary",
    duration_minutes: int = 120,
) -> dict:
    service = get_calendar_service()
    if time_str:
        start_dt = datetime.fromisoformat(f"{date_str}T{time_str}").astimezone()
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        event_body = {
            "summary": summary,
            "description": notes or "",
            "start": {
                "dateTime": start_dt.isoformat(),
                "timeZone": "America/New_York",
            },
            "end": {
                "dateTime": end_dt.isoformat(),
                "timeZone": "America/New_York",
            },
        }
    else:
        start_date = datetime.fromisoformat(date_str).date()
        event_body = {
            "summary": summary,
            "description": notes or "",
            "start": {"date": start_date.isoformat()},
            "end": {"date": (start_date + timedelta(days=1)).isoformat()},
        }

    try:
        return service.events().insert(calendarId=calendar_id, body=event_body).execute()
    except HttpError as exc:
        if exc.resp.status == 403 and b"insufficientPermissions" in exc.content:
            TOKEN_PATH.unlink(missing_ok=True)
            service = get_calendar_service()
            return service.events().insert(calendarId=calendar_id, body=event_body).execute()
        raise


def get_next_event(calendar_id: str = "primary") -> dict | None:
    service = get_calendar_service()
    now = datetime.now(timezone.utc).isoformat()

    events_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=now,
            maxResults=1,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    events = events_result.get("items", [])
    return events[0] if events else None


def summarize_next_event(calendar_id: str = "primary") -> str:
    event = get_next_event(calendar_id=calendar_id)
    if not event:
        return "You have no upcoming calendar events."

    start = event["start"].get("dateTime", event["start"].get("date", "unknown time"))
    summary = event.get("summary", "Untitled event")

    return f"Your next event is {summary} at {start}."

def get_next_event_by_tag(tag: str, calendar_id: str = "primary"):
    service = get_calendar_service()
    now = datetime.now(timezone.utc).isoformat()

    events_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=now,
            maxResults=10,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    events = events_result.get("items", [])

    for event in events:
        summary = event.get("summary", "").lower()

        if tag.lower() in summary:
            return event
    return None
