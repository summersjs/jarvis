from datetime import datetime
from backend.core.config import LOCAL_TZ


def parse_google_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    return datetime.fromisoformat(value)


def format_time_local(dt_str: str | None) -> str:
    dt = parse_google_datetime(dt_str)
    if not dt:
        return "unknown time"
    return dt.astimezone(LOCAL_TZ).strftime("%-I:%M %p")


def format_date_local(dt_str: str | None) -> str:
    dt = parse_google_datetime(dt_str)
    if not dt:
        return "unknown date"
    return dt.astimezone(LOCAL_TZ).strftime("%A, %B %-d")


def format_event_time_range(event: dict) -> str:
    start_info = event.get("start", {})
    end_info = event.get("end", {})

    start_dt = start_info.get("dateTime")
    end_dt = end_info.get("dateTime")

    if not start_dt:
        start_date = start_info.get("date")
        if start_date:
            return f"all day on {start_date}"
        return "at an unknown time"

    start_text = format_time_local(start_dt)
    if end_dt:
        end_text = format_time_local(end_dt)
        return f"{start_text} to {end_text}"

    return start_text


def format_event_location(event: dict) -> str:
    location = (event.get("location") or "").strip()
    return f" at {location}" if location else ""


def summarize_event_for_speech(event: dict, include_date: bool = False) -> str:
    summary = event.get("summary", "Unnamed event")
    time_range = format_event_time_range(event)
    location_text = format_event_location(event)

    if include_date:
        start_dt = event.get("start", {}).get("dateTime")
        date_text = format_date_local(start_dt)
        return f"{summary} on {date_text} from {time_range}{location_text}"

    return f"{summary} from {time_range}{location_text}"


def format_lift_name(lift: str) -> str:
    mapping = {
        "overhead_press": "overhead press",
        "deadlift": "deadlift",
        "bench": "bench",
        "bench_press": "bench",
        "squat": "squat",
    }
    return mapping.get(lift, lift.replace("_", " "))


def round_to_nearest_5(weight: float) -> int:
    return int(round(weight / 5.0) * 5)