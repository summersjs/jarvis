from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.schemas.health import HealthDailyCheckinUpsert, HealthEventCreate, HealthEventUpdate
from backend.services.debrief_service import build_finance_ops_summary
from backend.services.meal_planner_service import list_meal_plan_entries
from backend.services.workout_service import get_todays_workout_summary


DEFAULT_EVENT_TYPES = [
    {"key": "deep_breath_awareness", "label": "Deep Breath Awareness", "icon": "lungs", "sort_order": 10},
    {"key": "brain_fog", "label": "Brain Fog", "icon": "brain", "sort_order": 20},
    {"key": "forgetfulness", "label": "Forgetfulness", "icon": "thought", "sort_order": 30},
    {"key": "lightheaded", "label": "Lightheaded", "icon": "dizzy", "sort_order": 40},
    {"key": "heart_flutter", "label": "Heart Flutter", "icon": "heart", "sort_order": 50},
    {"key": "headache", "label": "Headache", "icon": "headache", "sort_order": 60},
    {"key": "diarrhea", "label": "Diarrhea", "icon": "meal", "sort_order": 70},
    {"key": "custom_event", "label": "Custom Event", "icon": "plus", "sort_order": 999},
]

SUPPLEMENTS = ["Creatine", "C4", "Vitamin D", "Magnesium Glycinate"]


def _now() -> datetime:
    return datetime.now(LOCAL_TZ)


def _today() -> date:
    return _now().date()


def _safe_table(table: str, fallback):
    try:
        return supabase.table(table)
    except Exception:
        return fallback


def _safe_execute(operation, default):
    try:
        response = operation()
        return response.data or default
    except Exception as exc:
        print(f"Health Ops data unavailable: {exc}")
        return default


def _safe_call(operation, default):
    try:
        return operation() or default
    except Exception as exc:
        print(f"Health Ops integration unavailable: {exc}")
        return default


def _event_types() -> list[dict]:
    rows = _safe_execute(
        lambda: supabase.table("health_event_types").select("*").eq("is_active", True).order("sort_order").execute(),
        [],
    )
    return rows or DEFAULT_EVENT_TYPES


def _health_events(user_id: str, start_date: str, end_date: str) -> list[dict]:
    return _safe_execute(
        lambda: (
            supabase.table("health_events")
            .select("*")
            .eq("user_id", user_id)
            .gte("event_date", start_date)
            .lte("event_date", end_date)
            .order("occurred_at", desc=True)
            .execute()
        ),
        [],
    )


def _daily_checkin(user_id: str, checkin_date: str) -> dict | None:
    rows = _safe_execute(
        lambda: (
            supabase.table("health_daily_checkins")
            .select("*")
            .eq("user_id", user_id)
            .eq("checkin_date", checkin_date)
            .limit(1)
            .execute()
        ),
        [],
    )
    return rows[0] if rows else None


def _context_snapshot(user_id: str, target_date: date) -> dict:
    date_str = target_date.isoformat()
    workout_summary = _safe_call(lambda: get_todays_workout_summary(user_id, target_date), None)
    meals = _safe_call(lambda: list_meal_plan_entries(user_id, date_str, date_str), [])
    month = target_date.strftime("%Y-%m")
    finance = _safe_call(lambda: build_finance_ops_summary(user_id, month), {})
    checkin = _daily_checkin(user_id, date_str) or {}

    food_spend = (
        (finance.get("daily_cards") or {}).get("food_spend_today")
        or finance.get("food_spend_today")
        or (finance.get("dashboard_cards") or {}).get("food_spend_today")
        or 0
    )
    completed_meals = completed_meal_count(meals)
    nutrition_totals = merge_nutrition(
        completed_meal_nutrition(meals),
        (checkin.get("source_data") or {}).get("caffeine_nutrition") or {},
    )
    workout_completed = bool(workout_summary)
    training_notes = None
    if workout_summary:
        top_set = workout_summary.get("top_set") or {}
        if top_set:
            training_notes = top_set.get("notes")

    return {
        "workout_completed": workout_completed,
        "workout": workout_summary,
        "meals_planned": len(meals),
        "meals_completed": completed_meals,
        "nutrition_totals": nutrition_totals,
        "meals": meals,
        "food_spend": food_spend,
        "training_notes": training_notes,
        "water_oz": checkin.get("water_oz"),
        "caffeine_mg": checkin.get("caffeine_mg"),
        "hours_slept": checkin.get("hours_slept"),
        "sleep_quality": checkin.get("sleep_quality"),
        "energy": checkin.get("energy"),
        "mood": checkin.get("mood"),
        "stress": checkin.get("stress"),
        "supplements": checkin.get("supplements") or [],
    }


def build_health_dashboard(user_id: str = "john", date_str: str | None = None) -> dict:
    target_date = date.fromisoformat(date_str) if date_str else _today()
    today_str = target_date.isoformat()
    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=6)

    event_types = _event_types()
    events_today = _health_events(user_id, today_str, today_str)
    week_events = _health_events(user_id, week_start.isoformat(), week_end.isoformat())
    checkin = _daily_checkin(user_id, today_str)
    context = _context_snapshot(user_id, target_date)

    counts = Counter(event.get("event_type") for event in events_today)
    event_cards = [
        {
            **event_type,
            "count_today": counts.get(event_type["key"], 0),
        }
        for event_type in event_types
    ]

    return {
        "status": "ok",
        "date": today_str,
        "snapshot": {
            "energy": checkin.get("energy") if checkin else context.get("energy"),
            "mood": checkin.get("mood") if checkin else context.get("mood"),
            "stress": checkin.get("stress") if checkin else context.get("stress"),
            "sleep_quality": checkin.get("sleep_quality") if checkin else context.get("sleep_quality"),
            "hours_slept": checkin.get("hours_slept") if checkin else context.get("hours_slept"),
            "water_oz": checkin.get("water_oz") if checkin else context.get("water_oz"),
            "caffeine_mg": checkin.get("caffeine_mg") if checkin else context.get("caffeine_mg"),
            "workout_completed": context.get("workout_completed"),
            "meals_planned": context.get("meals_planned"),
            "meals_completed": context.get("meals_completed"),
            "nutrition_totals": context.get("nutrition_totals"),
            "current_symptom_count": sum(1 for event in events_today if event.get("event_type") != "custom_event"),
        },
        "event_types": event_cards,
        "events_today": events_today,
        "timeline": events_today,
        "daily_checkin": checkin,
        "context": context,
        "supplements": SUPPLEMENTS,
        "weekly_summary": summarize_health_events(week_events, 7),
        "doctor_summaries": {
            "7": build_doctor_summary(user_id, 7),
            "30": build_doctor_summary(user_id, 30),
            "90": build_doctor_summary(user_id, 90),
        },
    }


def create_health_event(payload: HealthEventCreate) -> dict:
    occurred_at = datetime.fromisoformat(payload.occurred_at) if payload.occurred_at else _now()
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=LOCAL_TZ)
    event_date = payload.event_date or occurred_at.date().isoformat()
    context = {
        **_context_snapshot(payload.user_id, date.fromisoformat(event_date)),
        **(payload.context or {}),
    }
    insert_data = payload.model_dump(exclude_unset=True)
    insert_data.update({
        "occurred_at": occurred_at.isoformat(),
        "event_date": event_date,
        "context": context,
    })
    response = supabase.table("health_events").insert(insert_data).execute()
    if not response.data:
        raise Exception("Failed to create health event.")
    return response.data[0]


def update_health_event(event_id: str, payload: HealthEventUpdate) -> dict | None:
    update_data = payload.model_dump(exclude_unset=True)
    response = supabase.table("health_events").update(update_data).eq("id", event_id).execute()
    return response.data[0] if response.data else None


def delete_health_event(event_id: str) -> dict | None:
    response = supabase.table("health_events").delete().eq("id", event_id).execute()
    return response.data[0] if response.data else None


def upsert_daily_checkin(payload: HealthDailyCheckinUpsert) -> dict:
    context = _context_snapshot(payload.user_id, date.fromisoformat(payload.checkin_date))
    data = payload.model_dump(exclude_unset=True)
    source_data = {**context, **(payload.source_data or {})}
    for key in (
        "energy",
        "mood",
        "stress",
        "sleep_quality",
        "hours_slept",
        "water_oz",
        "caffeine_mg",
        "workout_completed",
        "meals_planned",
        "meals_completed",
        "ate_out",
        "food_spend",
        "training_notes",
        "supplements",
    ):
        if data.get(key) is not None:
            source_data[key] = data[key]
    data["source_data"] = source_data

    existing = _daily_checkin(payload.user_id, payload.checkin_date)
    if existing:
        data = {
            key: existing.get(key) if value is None else value
            for key, value in data.items()
        }
        data["source_data"] = {**(existing.get("source_data") or {}), **data.get("source_data", {})}
        response = (
            supabase.table("health_daily_checkins")
            .update(data)
            .eq("id", existing["id"])
            .execute()
        )
    else:
        response = supabase.table("health_daily_checkins").insert(data).execute()

    if not response.data:
        raise Exception("Failed to save health check-in.")
    return response.data[0]


def summarize_health_events(events: list[dict], days: int) -> dict:
    by_type: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        by_type[event.get("event_type") or "unknown"].append(event)

    summaries = []
    for event_type, items in sorted(by_type.items()):
        activity = Counter(item.get("activity") for item in items if item.get("activity")).most_common(1)
        trigger = Counter(item.get("trigger") for item in items if item.get("trigger")).most_common(1)
        relief = Counter(item.get("relief") for item in items if item.get("relief")).most_common(1)
        notes = Counter(item.get("notes") for item in items if item.get("notes")).most_common(3)
        dates = Counter(item.get("event_date") for item in items if item.get("event_date"))
        highest_day = dates.most_common(1)[0] if dates else None
        summaries.append({
            "event_type": event_type,
            "label": label_for_event_type(event_type),
            "occurrences": len(items),
            "average_per_day": round(len(items) / max(days, 1), 2),
            "highest_day": {"date": highest_day[0], "count": highest_day[1]} if highest_day else None,
            "most_common_activity": activity[0][0] if activity else None,
            "most_common_trigger": trigger[0][0] if trigger else None,
            "most_common_relief": relief[0][0] if relief else None,
            "most_common_time": most_common_hour(items),
            "common_observations": [note for note, _count in notes],
        })

    return {
        "days": days,
        "total_events": len(events),
        "event_summaries": summaries,
    }


def build_doctor_summary(user_id: str, days: int) -> dict:
    end_date = _today()
    start_date = end_date - timedelta(days=days - 1)
    events = _health_events(user_id, start_date.isoformat(), end_date.isoformat())
    checkins = _safe_execute(
        lambda: (
            supabase.table("health_daily_checkins")
            .select("*")
            .eq("user_id", user_id)
            .gte("checkin_date", start_date.isoformat())
            .lte("checkin_date", end_date.isoformat())
            .order("checkin_date", desc=True)
            .execute()
        ),
        [],
    )
    event_summary = summarize_health_events(events, days)
    caffeine_values = [float(row.get("caffeine_mg") or 0) for row in checkins if row.get("caffeine_mg") is not None]
    sleep_values = [float(row.get("hours_slept") or 0) for row in checkins if row.get("hours_slept") is not None]
    water_values = [float(row.get("water_oz") or 0) for row in checkins if row.get("water_oz") is not None]
    workout_days = sum(1 for row in checkins if row.get("workout_completed"))
    meals_completed = sum(int(row.get("meals_completed") or 0) for row in checkins)

    return {
        "days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "event_summary": event_summary,
        "averages": {
            "caffeine_mg_per_day": round(sum(caffeine_values) / len(caffeine_values), 1) if caffeine_values else None,
            "sleep_hours": round(sum(sleep_values) / len(sleep_values), 1) if sleep_values else None,
            "water_oz_per_day": round(sum(water_values) / len(water_values), 1) if water_values else None,
        },
        "workout_adherence": {
            "completed_days": workout_days,
            "logged_days": len(checkins),
        },
        "meals_completed": meals_completed,
        "factual_note": "This summary contains observed logs only. It does not diagnose, interpret symptoms, or infer causation.",
    }


def label_for_event_type(event_type: str) -> str:
    for item in DEFAULT_EVENT_TYPES:
        if item["key"] == event_type:
            return item["label"]
    return event_type.replace("_", " ").title()


def most_common_hour(events: list[dict]) -> str | None:
    hours = []
    for event in events:
        occurred_at = event.get("occurred_at")
        if not occurred_at:
            continue
        try:
            parsed = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
            hours.append(parsed.astimezone(LOCAL_TZ).strftime("%I %p").lstrip("0"))
        except ValueError:
            continue
    if not hours:
        return None
    return Counter(hours).most_common(1)[0][0]


def meal_meta(entry: dict) -> dict:
    notes = entry.get("notes") or ""
    if not notes.startswith("JARVIS_META:"):
        return {}
    try:
        return json.loads(notes.replace("JARVIS_META:", "", 1))
    except json.JSONDecodeError:
        return {}


def completed_meal_count(meals: list[dict]) -> int:
    return sum(1 for meal in meals if meal_meta(meal).get("completed"))


def completed_meal_nutrition(meals: list[dict]) -> dict:
    totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
    }
    for meal in meals:
        meta = meal_meta(meal)
        if not meta.get("completed"):
            continue
        servings = float(meta.get("servings") or 1)
        for key in totals:
            value = meta.get(key)
            if value is not None:
                totals[key] += float(value or 0) * servings
    return {key: round(value, 1) for key, value in totals.items()}


def merge_nutrition(base: dict, extra: dict) -> dict:
    totals = {}
    for key in ("calories", "protein_g", "carbs_g", "fat_g"):
        totals[key] = round(float(base.get(key) or 0) + float(extra.get(key) or 0), 1)
    return totals
