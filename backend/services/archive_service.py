from __future__ import annotations

from datetime import date, datetime

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.schemas.archive import ArchiveChronicleCreate, ArchiveChronicleUpdate, ArchiveDreamCreate, ArchiveDreamUpdate


def list_dreams(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("archive_dreams")
        .select("*")
        .eq("user_id", user_id)
        .order("dream_date", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def create_dream(payload: ArchiveDreamCreate) -> dict:
    data = payload.model_dump()
    if not data.get("dream_date"):
        data["dream_date"] = date.today().isoformat()
    response = supabase.table("archive_dreams").insert(data).execute()
    if not response.data:
        raise Exception("Failed to archive dream.")
    return response.data[0]


def update_dream(dream_id: str, payload: ArchiveDreamUpdate) -> dict | None:
    data = payload.model_dump(exclude_unset=True)
    response = supabase.table("archive_dreams").update(data).eq("id", dream_id).execute()
    return response.data[0] if response.data else None


def delete_dream(dream_id: str) -> dict | None:
    response = supabase.table("archive_dreams").delete().eq("id", dream_id).execute()
    return response.data[0] if response.data else None


def list_chronicles(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("archive_chronicles")
        .select("*")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
        .execute()
    )
    return response.data or []


def get_today_chronicle(user_id: str = "john") -> dict:
    return build_or_update_chronicle_from_debrief(user_id)


def create_chronicle(payload: ArchiveChronicleCreate) -> dict:
    data = payload.model_dump()
    data["entry_date"] = data.get("entry_date") or date.today().isoformat()
    if not data.get("title"):
        data["title"] = _suggest_chronicle_title(data)
    response = supabase.table("archive_chronicles").insert(data).execute()
    if not response.data:
        raise Exception("Failed to create Chronicle.")
    return response.data[0]


def update_chronicle(chronicle_id: str, payload: ArchiveChronicleUpdate) -> dict | None:
    data = payload.model_dump(exclude_unset=True)
    response = supabase.table("archive_chronicles").update(data).eq("id", chronicle_id).execute()
    return response.data[0] if response.data else None


def delete_chronicle(chronicle_id: str) -> dict | None:
    response = supabase.table("archive_chronicles").delete().eq("id", chronicle_id).execute()
    return response.data[0] if response.data else None


def build_or_update_chronicle_from_debrief(user_id: str = "john", debrief_id: str | None = None) -> dict:
    from backend.services.debrief_service import build_daily_debrief_summary
    from backend.services.health_service import build_health_dashboard

    summary = build_daily_debrief_summary(user_id)
    entry_date = summary.get("date") or date.today().isoformat()
    existing = _find_chronicle_by_date(user_id, entry_date)
    health = build_health_dashboard(user_id, entry_date)
    saved_entry = summary.get("saved_entry") or {}
    finalized = bool(saved_entry.get("is_finalized") or saved_entry.get("completed_at"))
    now = datetime.now(LOCAL_TZ).isoformat()
    previous_status = existing.get("status") if existing else None
    next_status = "filed" if finalized else ("in_progress" if existing or saved_entry else "draft")

    operational = _chronicle_operational_fields(summary, health)
    operational.update({
        "user_id": user_id,
        "entry_date": entry_date,
        "status": next_status,
        "source_debrief_id": debrief_id,
    })
    if not (existing and existing.get("title")):
        operational["title"] = _suggest_chronicle_title({**operational, "entry_date": entry_date})
    if next_status == "filed" and (not existing or not existing.get("filed_at") or previous_status != "filed"):
        operational["filed_at"] = now

    if existing:
        response = (
            supabase.table("archive_chronicles")
            .update(operational)
            .eq("id", existing["id"])
            .execute()
        )
    else:
        operational["started_at"] = now
        response = supabase.table("archive_chronicles").insert(operational).execute()

    if not response.data:
        raise Exception("Failed to build Chronicle.")
    return response.data[0]


def _find_chronicle_by_date(user_id: str, entry_date: str) -> dict | None:
    response = (
        supabase.table("archive_chronicles")
        .select("*")
        .eq("user_id", user_id)
        .eq("entry_date", entry_date)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _chronicle_operational_fields(summary: dict, health: dict) -> dict:
    training = summary.get("training") or {}
    nutrition = summary.get("nutrition") or {}
    totals = nutrition.get("nutrition_totals") or {}
    health_snapshot = health.get("snapshot") or {}
    event_cards = health.get("event_types") or []
    deep_breath_count = next(
        (card.get("count_today") for card in event_cards if card.get("key") == "deep_breath_awareness"),
        0,
    )
    next_protocol = summary.get("next_protocol") or {}
    tomorrow_priorities = summary.get("tomorrow_priorities") or []
    top_set = None
    if training.get("top_set_weight") and training.get("top_set_reps"):
        top_set = f"{training.get('top_set_weight')} x {training.get('top_set_reps')}"
    workout_bits = [
        training.get("lift_completed") or summary.get("scheduled_lift_label"),
        top_set,
        training.get("training_notes"),
    ]
    nutrition_calories = totals.get("calories") or totals.get("calories_eaten")
    nutrition_protein = totals.get("protein_g") or totals.get("protein")
    return {
        "daily_score": summary.get("daily_score") or summary.get("mission_score"),
        "weekly_score": summary.get("weekly_score"),
        "mission_rank": summary.get("lifetime_rank") or ((summary.get("mission_scores") or {}).get("lifetime") or {}).get("rank"),
        "overall_status": summary.get("overall_status"),
        "workout_status": training.get("workout_status"),
        "workout_summary": " | ".join(str(bit) for bit in workout_bits if bit) or None,
        "next_protocol": (
            f"{next_protocol.get('lift')} on {next_protocol.get('weekday')}"
            if next_protocol.get("lift")
            else None
        ),
        "calories": nutrition_calories,
        "protein_g": nutrition_protein,
        "water_oz": health_snapshot.get("water_oz"),
        "sleep_hours": health_snapshot.get("hours_slept"),
        "health_event_count": health_snapshot.get("current_symptom_count"),
        "deep_breath_event_count": deep_breath_count,
        "goal_impacts": summary.get("objectives") or [],
        "victory_log": (summary.get("victory") or {}).get("win"),
        "lessons_worked": (summary.get("lessons") or {}).get("worked"),
        "lessons_not_worked": (summary.get("lessons") or {}).get("did_not_work"),
        "lessons_adjust_tomorrow": (summary.get("lessons") or {}).get("adjust_tomorrow"),
        "tomorrow_focus": tomorrow_priorities[0] if tomorrow_priorities else None,
    }


def _suggest_chronicle_title(data: dict) -> str:
    victory = data.get("victory_log")
    if victory:
        short = str(victory).strip().rstrip(".")
        return short[:72]
    status = (data.get("overall_status") or "").lower()
    if "recovery" in status:
        return "A Recovery Day"
    if data.get("daily_score") and float(data["daily_score"]) >= 90:
        return "Small Wins Stacked"
    entry_date = data.get("entry_date") or date.today().isoformat()
    friendly_date = datetime.fromisoformat(f"{entry_date}T12:00:00")
    friendly = f"{friendly_date.strftime('%B')} {friendly_date.day}, {friendly_date.year}"
    return f"Chronicle for {friendly}"
