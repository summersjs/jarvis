from __future__ import annotations

import os
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
DEFAULT_TIMEZONE = "America/New_York"


class CalendarIntegrationError(RuntimeError):
    pass


class CalendarAuthRequired(CalendarIntegrationError):
    pass


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
            if not CREDS_PATH.exists():
                raise CalendarAuthRequired("Google Calendar credentials.json is missing.")

            allow_bootstrap = os.getenv("JARVIS_ALLOW_CALENDAR_OAUTH_BOOTSTRAP", "").lower() in {"1", "true", "yes"}
            if not allow_bootstrap:
                raise CalendarAuthRequired("Google Calendar token is missing or expired. Reconnect Calendar from a local shell.")

            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_PATH.write_text(creds.to_json())

    return build("calendar", "v3", credentials=creds)


def refresh_calendar_auth() -> dict:
    if not CREDS_PATH.exists():
        raise CalendarAuthRequired("Google Calendar credentials.json is missing.")
    if not TOKEN_PATH.exists():
        raise CalendarAuthRequired("Google Calendar token.json is missing. Reconnect Calendar from a local shell.")

    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds.has_scopes(SCOPES):
        raise CalendarAuthRequired("Google Calendar token does not include calendar scope. Reconnect Calendar from a local shell.")

    refreshed = False
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
            refreshed = True
        except RefreshError as exc:
            raise CalendarAuthRequired(f"Google Calendar token refresh failed: {exc}") from exc

    service = build("calendar", "v3", credentials=creds)
    profile = service.calendarList().get(calendarId="primary").execute()
    return {
        "credentials_file": str(CREDS_PATH),
        "token_file": str(TOKEN_PATH),
        "token_valid": creds.valid,
        "token_expired": creds.expired,
        "token_refreshed": refreshed,
        "calendar_id": profile.get("id", "primary"),
        "calendar_summary": profile.get("summary", "Primary calendar"),
    }


def _event_body(
    summary: str,
    date_str: str,
    time_str: str | None = None,
    notes: str | None = None,
    duration_minutes: int = 120,
    reminders: list[int] | None = None,
    extended_properties: dict | None = None,
) -> dict:
    reminders = reminders if reminders is not None else [1440, 60]
    event_body = {
        "summary": summary,
        "description": notes or "",
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": minutes}
                for minutes in reminders
                if minutes >= 0
            ],
        },
    }

    if extended_properties:
        event_body["extendedProperties"] = {
            "private": {
                key: str(value)
                for key, value in extended_properties.items()
                if value is not None
            }
        }

    if time_str:
        start_dt = datetime.fromisoformat(f"{date_str}T{time_str}").astimezone()
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        event_body.update({
            "start": {
                "dateTime": start_dt.isoformat(),
                "timeZone": DEFAULT_TIMEZONE,
            },
            "end": {
                "dateTime": end_dt.isoformat(),
                "timeZone": DEFAULT_TIMEZONE,
            },
        })
    else:
        start_date = datetime.fromisoformat(date_str).date()
        event_body.update({
            "start": {"date": start_date.isoformat()},
            "end": {"date": (start_date + timedelta(days=1)).isoformat()},
        })

    return event_body


def create_calendar_event(
    summary: str,
    date_str: str,
    time_str: str | None = None,
    notes: str | None = None,
    calendar_id: str = "primary",
    duration_minutes: int = 120,
    reminders: list[int] | None = None,
    extended_properties: dict | None = None,
) -> dict:
    service = get_calendar_service()
    event_body = _event_body(
        summary=summary,
        date_str=date_str,
        time_str=time_str,
        notes=notes,
        duration_minutes=duration_minutes,
        reminders=reminders,
        extended_properties=extended_properties,
    )

    try:
        return service.events().insert(calendarId=calendar_id, body=event_body).execute()
    except HttpError as exc:
        if exc.resp.status == 403 and b"insufficientPermissions" in exc.content:
            TOKEN_PATH.unlink(missing_ok=True)
            service = get_calendar_service()
            return service.events().insert(calendarId=calendar_id, body=event_body).execute()
        raise


def update_calendar_event(
    event_id: str,
    summary: str,
    date_str: str,
    time_str: str | None = None,
    notes: str | None = None,
    calendar_id: str = "primary",
    duration_minutes: int = 120,
    reminders: list[int] | None = None,
    extended_properties: dict | None = None,
) -> dict:
    service = get_calendar_service()
    event_body = _event_body(
        summary=summary,
        date_str=date_str,
        time_str=time_str,
        notes=notes,
        duration_minutes=duration_minutes,
        reminders=reminders,
        extended_properties=extended_properties,
    )
    return service.events().update(calendarId=calendar_id, eventId=event_id, body=event_body).execute()


def delete_calendar_event(event_id: str, calendar_id: str = "primary") -> dict:
    service = get_calendar_service()
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return {"deleted": True, "event_id": event_id}
    except HttpError as exc:
        if exc.resp.status == 404:
            return {"deleted": False, "event_id": event_id, "reason": "not_found"}
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
