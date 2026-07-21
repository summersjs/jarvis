from datetime import date, datetime, timezone
from backend.core.config import LOCAL_TZ
from backend.integrations.google_calendar import (
    get_next_event,
    get_next_event_by_tag,
    get_calendar_service,
)
from backend.utils.formatters import summarize_event_for_speech


def _day_bounds_utc(date_obj: date) -> tuple[str, str]:
    start_of_day = datetime.combine(date_obj, datetime.min.time(), LOCAL_TZ).astimezone(timezone.utc).isoformat()
    end_of_day = datetime.combine(date_obj, datetime.max.time(), LOCAL_TZ).astimezone(timezone.utc).isoformat()
    return start_of_day, end_of_day


def _events_for_date(service, calendar_id: str, date_obj: date) -> list[dict]:
    start_of_day, end_of_day = _day_bounds_utc(date_obj)
    event_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=start_of_day,
            timeMax=end_of_day,
            singleEvents=True,
            orderBy="startTime"
        )
        .execute()
    )
    return event_result.get("items", [])


def _is_birthday_text(value: str | None) -> bool:
    text = (value or "").lower()
    return "birthday" in text or "birthdays" in text or "bday" in text


def _birthday_calendar_ids(service) -> dict[str, bool]:
    calendar_ids = {"primary": False}

    try:
        calendars = service.calendarList().list().execute().get("items", [])
    except Exception:
        return calendar_ids

    for calendar in calendars:
        calendar_id = calendar.get("id")
        summary = calendar.get("summary", "")
        search_text = f"{calendar_id} {summary}"

        if not calendar_id:
            continue

        calendar_ids[calendar_id] = _is_birthday_text(search_text) or "contacts" in search_text.lower()

    return calendar_ids


def _is_birthday_event(event: dict, from_birthday_calendar: bool) -> bool:
    summary = event.get("summary") or ""
    description = event.get("description") or ""
    event_type = (event.get("eventType") or "").lower()

    return (
        from_birthday_calendar
        or event_type == "birthday"
        or _is_birthday_text(summary)
        or _is_birthday_text(description)
    )


def _birthday_name(event: dict) -> str:
    summary = (event.get("summary") or "").strip()
    if not summary:
        return "Someone"

    lowered = summary.lower()
    for suffix in ["'s birthday", "'s bday", " birthday", " birthdays", " bday"]:
        if lowered.endswith(suffix):
            return summary[: -len(suffix)].strip() or "Someone"

    for prefix in ["birthday:", "birthdays:", "bday:"]:
        if lowered.startswith(prefix):
            return summary[len(prefix):].strip() or "Someone"

    return summary


def _dedupe_birthday_names(names: list[str]) -> list[str]:
    unique_names = []
    seen_names = set()

    for name in names:
        name_key = name.lower()
        if name_key in seen_names:
            continue

        unique_names.append(name)
        seen_names.add(name_key)

    return [
        name
        for name in unique_names
        if not any(
            other.lower().startswith(f"{name.lower()} ")
            for other in unique_names
            if other != name
        )
    ]


def get_birthday_note_for_date(date_obj: date) -> str | None:
    service = get_calendar_service()
    names = []

    for calendar_id, from_birthday_calendar in _birthday_calendar_ids(service).items():
        for event in _events_for_date(service, calendar_id, date_obj):
            if not _is_birthday_event(event, from_birthday_calendar):
                continue

            names.append(_birthday_name(event))

    names = _dedupe_birthday_names(names)
    if not names:
        return None

    if len(names) == 1:
        return f"Today is {names[0]}'s birthday."

    return f"Birthdays today: {', '.join(names)}."


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


def get_calendar_summary_for_date(date_obj: date, label: str) -> str:
    service = get_calendar_service()
    events = _events_for_date(service, "primary", date_obj)
    if not events:
        return f"You have no events scheduled for {label}."

    summary_lines = [summarize_event_for_speech(event, include_date=False) for event in events]
    joined = ". ".join(summary_lines)
    return f"You have {len(events)} events {label}. {joined}."


def get_calendar_events_for_date(date_obj: date) -> list[dict]:
    service = get_calendar_service()
    events = _events_for_date(service, "primary", date_obj)
    return [
        {
            "summary": event.get("summary") or "Unnamed event",
            "start": event.get("start", {}),
            "end": event.get("end", {}),
            "location": event.get("location"),
            "event_type": event.get("eventType"),
        }
        for event in events
    ]


def get_calendar_events_for_range(start_date: date, end_date: date) -> list[dict]:
    """Return compact primary-calendar events for [start_date, end_date)."""
    service = get_calendar_service()
    time_min, _ = _day_bounds_utc(start_date)
    time_max, _ = _day_bounds_utc(end_date)
    items = (service.events().list(
        calendarId="primary", timeMin=time_min, timeMax=time_max, singleEvents=True, orderBy="startTime"
    ).execute().get("items", []))
    return [
        {
            "summary": event.get("summary") or "Unnamed event", "start": event.get("start", {}),
            "end": event.get("end", {}), "location": event.get("location"), "event_type": event.get("eventType"),
        }
        for event in items
    ]


def get_today_calendar_summary() -> str:
    now = datetime.now(LOCAL_TZ)
    return get_calendar_summary_for_date(now.date(), "today")
