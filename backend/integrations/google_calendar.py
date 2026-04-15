from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

BASE_DIR = Path(__file__).resolve().parents[2]
TOKEN_PATH = BASE_DIR / "token.json"
CREDS_PATH = BASE_DIR / "credentials.json"


def get_calendar_service():
    creds = None

    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_PATH.write_text(creds.to_json())

    return build("calendar", "v3", credentials=creds)


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