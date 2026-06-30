from __future__ import annotations

from datetime import date

from backend.db.supabase_client import supabase
from backend.schemas.archive import ArchiveDreamCreate, ArchiveDreamUpdate


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
