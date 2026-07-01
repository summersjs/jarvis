from __future__ import annotations

from collections import defaultdict

from backend.db.supabase_client import supabase
from backend.schemas.forge import ForgeFileCreate, ForgeNoteCreate, ForgeProjectCreate, ForgeProjectUpdate, ForgeSparkCreate
from backend.services.goal_service import get_goal, list_goals

FORGE_CATEGORIES = ["Games", "Jarvis", "Business", "Hardware", "Writing", "Life"]
FORGE_STATUSES = ["Active", "Building", "Experiment", "Incubating", "Archived", "Completed"]
WORKSTATION_TITLE = "Build the Jarvis Workstation"
WORKSTATION_SUMMARY = "Investing consistently turns Jarvis from an idea into a permanent tool. One component at a time builds the command center."
WORKSTATION_TAGS = ["jarvis", "hardware", "workstation", "command-center", "build"]


def build_forge_dashboard(user_id: str = "john") -> dict:
    ensure_workstation_project_link(user_id)
    projects = list_forge_projects(user_id)
    sparks = list_forge_sparks(user_id)
    notes = list_forge_notes(user_id)
    files = list_forge_files(user_id)
    goals = list_goals(user_id, active_only=False)

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
        "goals": goals,
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
    return [enrich_forge_project(project) for project in response.data or []]


def create_forge_project(payload: ForgeProjectCreate) -> dict:
    insert_data = prepare_project_payload(payload.model_dump())
    response = supabase.table("forge_projects").insert(insert_data).execute()
    if not response.data:
        raise Exception("Failed to create Forge project.")
    return enrich_forge_project(response.data[0])


def update_forge_project(project_id: str, payload: ForgeProjectUpdate) -> dict | None:
    update_data = prepare_project_payload(payload.model_dump(exclude_unset=True))
    response = (
        supabase.table("forge_projects")
        .update(update_data)
        .eq("id", project_id)
        .execute()
    )
    return enrich_forge_project(response.data[0]) if response.data else None


def prepare_project_payload(data: dict) -> dict:
    data = {key: value for key, value in data.items() if value is not None}
    goal_id = data.get("goal_id")
    if goal_id:
        goal = get_goal(goal_id)
        if goal:
            project = goal.get("project") or {}
            next_milestone = project.get("next_milestone") or {}
            data["progress_percent"] = project.get("percent") or data.get("progress_percent") or 0
            data["next_milestone"] = next_milestone.get("title") or data.get("next_milestone")
            data.setdefault("title", goal.get("title"))
    return data


def enrich_forge_project(project: dict) -> dict:
    enriched = dict(project)
    goal_id = enriched.get("goal_id")
    if not goal_id:
        return enriched

    goal = get_goal(goal_id)
    if not goal:
        return enriched

    project_snapshot = goal.get("project") or {}
    next_milestone = project_snapshot.get("next_milestone") or {}
    enriched["linked_goal"] = {
        "id": goal.get("id"),
        "title": goal.get("title"),
        "category": goal.get("category"),
        "mission_type": goal.get("mission_type"),
        "project": project_snapshot,
        "milestones": goal.get("milestones") or [],
        "logs": goal.get("logs") or [],
    }
    enriched["progress_percent"] = project_snapshot.get("percent") or enriched.get("progress_percent") or 0
    enriched["next_milestone"] = next_milestone.get("title") or enriched.get("next_milestone")
    return enriched


def ensure_workstation_project_link(user_id: str = "john") -> None:
    try:
        goals = [
            goal for goal in list_goals(user_id, active_only=False)
            if (goal.get("title") or "").strip().lower() == WORKSTATION_TITLE.lower()
        ]
        if not goals:
            return

        goal = goals[0]
        project_snapshot = goal.get("project") or {}
        next_milestone = project_snapshot.get("next_milestone") or {}
        project_data = {
            "user_id": user_id,
            "goal_id": goal["id"],
            "title": WORKSTATION_TITLE,
            "category": "Hardware",
            "status": "Active",
            "summary": WORKSTATION_SUMMARY,
            "tags": WORKSTATION_TAGS,
            "next_milestone": next_milestone.get("title") or "Storage",
            "progress_percent": project_snapshot.get("percent") or 0,
            "project_type": "Hardware Build / Jarvis System Build",
        }

        existing = (
            supabase.table("forge_projects")
            .select("*")
            .eq("user_id", user_id)
            .eq("goal_id", goal["id"])
            .limit(1)
            .execute()
        )
        if existing.data:
            supabase.table("forge_projects").update(project_data).eq("id", existing.data[0]["id"]).execute()
            return

        title_match = (
            supabase.table("forge_projects")
            .select("*")
            .eq("user_id", user_id)
            .eq("title", WORKSTATION_TITLE)
            .limit(1)
            .execute()
        )
        if title_match.data:
            supabase.table("forge_projects").update(project_data).eq("id", title_match.data[0]["id"]).execute()
            return

        supabase.table("forge_projects").insert(project_data).execute()
    except Exception:
        return


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
