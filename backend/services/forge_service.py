from __future__ import annotations

from collections import defaultdict

from backend.db.supabase_client import supabase
from backend.schemas.forge import ForgeFileCreate, ForgeNoteCreate, ForgeProjectCreate, ForgeProjectUpdate, ForgeSparkCreate

FORGE_CATEGORIES = ["Games", "Jarvis", "Business", "Hardware", "Writing", "Life"]
FORGE_STATUSES = ["Active", "Building", "Experiment", "Incubating", "Archived", "Completed"]


def build_forge_dashboard(user_id: str = "john") -> dict:
    projects = list_forge_projects(user_id)
    sparks = list_forge_sparks(user_id)
    notes = list_forge_notes(user_id)
    files = list_forge_files(user_id)

    by_category = defaultdict(list)
    for project in projects:
        by_category[project.get("category")].append(project)

    category_counts = {category: len(by_category[category]) for category in FORGE_CATEGORIES}
    recently_updated = []
    for category in FORGE_CATEGORIES:
        category_projects = sorted(by_category[category], key=lambda item: item.get("updated_at") or item.get("created_at") or "", reverse=True)
        if category_projects:
            recently_updated.append(category_projects[0])

    incubating = [
        project for project in sorted(projects, key=lambda item: item.get("updated_at") or item.get("created_at") or "", reverse=True)
        if project.get("status") == "Incubating"
    ][:3]

    return {
        "status": "ok",
        "projects": projects,
        "sparks": sparks,
        "notes": notes,
        "files": files,
        "category_counts": category_counts,
        "recently_updated": recently_updated[:6],
        "incubating": incubating,
        "stats": {
            "active_projects": len([project for project in projects if project.get("status") not in {"Archived", "Completed"}]),
            "building": len([project for project in projects if project.get("status") == "Building"]),
            "incubating": len([project for project in projects if project.get("status") == "Incubating"]),
            "archived": len([project for project in projects if project.get("status") == "Archived"]),
            "recently_updated": len(recently_updated[:6]),
        },
    }


def list_forge_projects(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("forge_projects")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return response.data or []


def create_forge_project(payload: ForgeProjectCreate) -> dict:
    response = supabase.table("forge_projects").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to create Forge project.")
    return response.data[0]


def update_forge_project(project_id: str, payload: ForgeProjectUpdate) -> dict | None:
    response = (
        supabase.table("forge_projects")
        .update(payload.model_dump(exclude_unset=True))
        .eq("id", project_id)
        .execute()
    )
    return response.data[0] if response.data else None


def list_forge_sparks(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("forge_sparks")
        .select("*, forge_projects(id, title)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def create_forge_spark(payload: ForgeSparkCreate) -> dict:
    response = supabase.table("forge_sparks").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to capture Forge spark.")
    return response.data[0]


def list_forge_notes(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("forge_notes")
        .select("*, forge_projects(id, title)")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return response.data or []


def create_forge_note(payload: ForgeNoteCreate) -> dict:
    response = supabase.table("forge_notes").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to save Forge note.")
    return response.data[0]


def list_forge_files(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("forge_files")
        .select("*, forge_projects(id, title)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def create_forge_file(payload: ForgeFileCreate) -> dict:
    response = supabase.table("forge_files").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to save Forge file metadata.")
    return response.data[0]
