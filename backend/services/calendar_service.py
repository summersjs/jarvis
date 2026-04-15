from datetime import datetime, timezone
from backend.core.config import LOCAL_TZ
from backend.integrations.google_calendar import (
    get_next_event,
    get_next_event_by_tag,
    get_calendar_service,
)
from backend.utils.formatters import summarize_event_for_speech


def get_next_calendar_summary() -> str:
    event = get_next_event()
    if not event:
        return "You have no upcoming calendar events."
    return f"Your next event is {summarize_event_for_speech(event, include_date=True)}."


def get_next_work_summary() -> str:
    event = get_next_event_by_tag("scheduled to work")
    if not event:
        return "You have no upcoming work events on your calendar."
    return f"Your next work event is {summarize_event_for_speech(event, include_date=True)}."


def get_today_calendar_summary() -> str:
    service = get_calendar_service()

    now = datetime.now(LOCAL_TZ)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0).astimezone(timezone.utc).isoformat()

    event_result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=start_of_day,
            timeMax=end_of_day,
            singleEvents=True,
            orderBy="startTime"
        )
        .execute()
    )

    events = event_result.get("items", [])
    if not events:
        return "You have no events scheduled for today."

    summary_lines = [summarize_event_for_speech(event, include_date=False) for event in events]
    joined = ". ".join(summary_lines)
    return f"You have {len(events)} events today. {joined}."