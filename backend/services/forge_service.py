from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from backend.core.config import LOCAL_TZ
from backend.db.supabase_client import supabase
from backend.schemas.forge import (
    ForgeFileCreate,
    ForgeFileUpdate,
    ForgeNoteCreate,
    ForgeNoteUpdate,
    ForgeProjectCreate,
    ForgeProjectUpdate,
    ForgeSparkCreate,
    ForgeSparkUpdate,
    ForgeTaskCreate,
    ForgeTaskUpdate,
)
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
    tasks = list_forge_tasks(user_id)
    goals = list_goals(user_id, active_only=False)
    apply_task_progress(projects, tasks)
    attach_task_goals(projects, goals)

    by_category = defaultdict(list)
    for project in projects:
        by_category[project.get("category")].append(project)

    category_counts = {category: len(by_category[category]) for category in FORGE_CATEGORIES}
    recently_updated = []
    for category in FORGE_CATEGORIES:
        category_projects = sorted(
            [
                project for project in by_category[category]
                if project.get("status") not in {"Incubating", "Archived", "Completed"}
            ],
            key=lambda item: item.get("updated_at") or item.get("created_at") or "",
            reverse=True,
        )
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
        "tasks": tasks,
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


def apply_task_progress(projects: list[dict], tasks: list[dict]) -> None:
    by_project: dict[str, list[dict]] = defaultdict(list)
    for task in tasks:
        project_id = task.get("project_id")
        if project_id:
            by_project[project_id].append(task)

    for project in projects:
        project_tasks = by_project.get(project.get("id"), [])
        if not project_tasks:
            continue

        complete = [task for task in project_tasks if is_task_complete(task)]
        incomplete = [task for task in project_tasks if not is_task_complete(task)]
        total = len(project_tasks)
        percent = round((len(complete) / total) * 100, 1) if total else 0
        sorted_incomplete = sorted(incomplete, key=lambda item: (item.get("sort_order") or 0, item.get("created_at") or ""))
        recently_unlocked = sorted(complete, key=lambda item: item.get("completed_at") or item.get("updated_at") or "", reverse=True)[:1]

        project["task_summary"] = {
            "completed": len(complete),
            "total": total,
            "remaining": len(incomplete),
            "current_mission": sorted_incomplete[0].get("title") if sorted_incomplete else None,
            "next_suggested_task": sorted_incomplete[1].get("title") if len(sorted_incomplete) > 1 else None,
            "recently_unlocked": recently_unlocked[0].get("title") if recently_unlocked else None,
        }
        if not project.get("goal_id"):
            project["progress_percent"] = percent
            project["next_milestone"] = sorted_incomplete[0].get("title") if sorted_incomplete else project.get("next_milestone")


def attach_task_goals(projects: list[dict], goals: list[dict]) -> None:
    task_goals_by_project = {}
    for goal in goals:
        metadata = goal.get("metadata") or {}
        project_id = metadata.get("forge_project_id")
        if metadata.get("forge_goal_type") == "task_completion" and project_id:
            task_goals_by_project[project_id] = {
                "id": goal.get("id"),
                "title": goal.get("title"),
                "frequency": goal.get("frequency"),
                "target_value": goal.get("target_value"),
                "unit": goal.get("unit"),
                "standard": goal.get("standard"),
                "period": goal.get("period"),
            }

    for project in projects:
        task_goal = task_goals_by_project.get(project.get("id"))
        if task_goal:
            project["task_goal"] = task_goal


def is_task_complete(task: dict) -> bool:
    return (task.get("status") or "").lower() in {"done", "complete", "completed"} or bool(task.get("completed_at"))


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


def delete_forge_project(project_id: str) -> list[dict]:
    response = supabase.table("forge_projects").delete().eq("id", project_id).execute()
    return response.data or []


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


def update_forge_spark(spark_id: str, payload: ForgeSparkUpdate) -> dict | None:
    response = (
        supabase.table("forge_sparks")
        .update(payload.model_dump(exclude_unset=True))
        .eq("id", spark_id)
        .execute()
    )
    return response.data[0] if response.data else None


def delete_forge_spark(spark_id: str) -> list[dict]:
    response = supabase.table("forge_sparks").delete().eq("id", spark_id).execute()
    return response.data or []


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


def update_forge_note(note_id: str, payload: ForgeNoteUpdate) -> dict | None:
    response = (
        supabase.table("forge_notes")
        .update(payload.model_dump(exclude_unset=True))
        .eq("id", note_id)
        .execute()
    )
    return response.data[0] if response.data else None


def delete_forge_note(note_id: str) -> list[dict]:
    response = supabase.table("forge_notes").delete().eq("id", note_id).execute()
    return response.data or []


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


def update_forge_file(file_id: str, payload: ForgeFileUpdate) -> dict | None:
    response = (
        supabase.table("forge_files")
        .update(payload.model_dump(exclude_unset=True))
        .eq("id", file_id)
        .execute()
    )
    return response.data[0] if response.data else None


def delete_forge_file(file_id: str) -> list[dict]:
    response = supabase.table("forge_files").delete().eq("id", file_id).execute()
    return response.data or []


def list_forge_tasks(user_id: str = "john") -> list[dict]:
    try:
        response = (
            supabase.table("forge_tasks")
            .select("*")
            .eq("user_id", user_id)
            .order("sort_order", desc=False)
            .order("created_at", desc=False)
            .execute()
        )
        return response.data or []
    except Exception:
        return []


def create_forge_task(payload: ForgeTaskCreate) -> dict:
    response = supabase.table("forge_tasks").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to create Forge task.")
    return response.data[0]


def update_forge_task(task_id: str, payload: ForgeTaskUpdate) -> dict | None:
    update_data = payload.model_dump(exclude_unset=True)
    response = (
        supabase.table("forge_tasks")
        .update(update_data)
        .eq("id", task_id)
        .execute()
    )
    if not response.data:
        return None

    task = response.data[0]
    if is_task_complete(task):
        sync_task_completion_goal(task)
    else:
        remove_task_completion_goal_logs(task)
    return task


def delete_forge_task(task_id: str) -> list[dict]:
    response = supabase.table("forge_tasks").delete().eq("id", task_id).execute()
    return response.data or []


def sync_task_completion_goal(task: dict) -> None:
    project_id = task.get("project_id")
    if not project_id:
        return

    try:
        goals = list_goals(task.get("user_id") or "john", active_only=True)
        task_goals = [
            goal for goal in goals
            if (goal.get("metadata") or {}).get("forge_goal_type") == "task_completion"
            and (goal.get("metadata") or {}).get("forge_project_id") == project_id
        ]
        if not task_goals:
            return

        for goal in task_goals:
            if task.get("linked_goal_id") and task.get("linked_goal_id") != goal.get("id"):
                continue
            if task.get("counts_toward_goal") is False:
                continue

            existing = (
                supabase.table("goal_logs")
                .select("id, metadata")
                .eq("goal_id", goal["id"])
                .eq("log_type", "progress")
                .execute()
            )
            duplicate = any(
                (row.get("metadata") or {}).get("forge_task_id") == task.get("id")
                for row in existing.data or []
            )
            if duplicate:
                continue

            goal_event = create_goal_progress_event({
                "goal_id": goal["id"],
                "amount": 1,
                "unit": goal.get("unit") or "update",
                "note": f"Forge task completed: {task.get('title')}",
                "source_type": "forge_task",
                "source_id": task.get("id"),
                "source_project_id": project_id,
                "counts_toward_goal": True,
                "event_source": "automatic",
                "created_by": task.get("user_id") or "john",
                "metadata": {
                    "forge_task_title": task.get("title"),
                    "milestone_group": task.get("milestone_group"),
                    "task_type": task.get("task_type"),
                },
            })
            log_response = supabase.table("goal_logs").insert({
                "goal_id": goal["id"],
                "value": 1,
                "notes": f"Forge task completed: {task.get('title')}",
                "log_type": "progress",
                "planned_for": datetime.now(LOCAL_TZ).date().isoformat(),
                "metadata": {
                    "forge_task_id": task.get("id"),
                    "forge_task_title": task.get("title"),
                    "forge_project_id": project_id,
                    "milestone_group": task.get("milestone_group"),
                    "goal_progress_event_id": (goal_event or {}).get("id"),
                    "source": "forge_task_completion",
                },
            }).execute()
            if goal_event and log_response.data:
                safe_table_update(
                    "forge_tasks",
                    {
                        "linked_goal_id": goal["id"],
                        "goal_event_id": goal_event.get("id"),
                    },
                    "id",
                    task.get("id"),
                )
    except Exception:
        return


def remove_task_completion_goal_logs(task: dict) -> None:
    task_id = task.get("id")
    project_id = task.get("project_id")
    if not task_id or not project_id:
        return

    try:
        goals = list_goals(task.get("user_id") or "john", active_only=True)
        for goal in goals:
            metadata = goal.get("metadata") or {}
            if metadata.get("forge_goal_type") != "task_completion" or metadata.get("forge_project_id") != project_id:
                continue

            existing = (
                supabase.table("goal_logs")
                .select("id, metadata")
                .eq("goal_id", goal["id"])
                .eq("log_type", "progress")
                .execute()
            )
            for row in existing.data or []:
                if (row.get("metadata") or {}).get("forge_task_id") == task_id:
                    event_id = (row.get("metadata") or {}).get("goal_progress_event_id")
                    supabase.table("goal_logs").delete().eq("id", row["id"]).execute()
                    if event_id:
                        safe_table_update(
                            "goal_progress_events",
                            {"counts_toward_goal": False},
                            "id",
                            event_id,
                        )
    except Exception:
        return


def create_goal_progress_event(payload: dict) -> dict | None:
    try:
        existing = (
            supabase.table("goal_progress_events")
            .select("*")
            .eq("goal_id", payload.get("goal_id"))
            .eq("source_type", payload.get("source_type"))
            .eq("source_id", payload.get("source_id"))
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]
        response = supabase.table("goal_progress_events").insert(payload).execute()
        return response.data[0] if response.data else None
    except Exception:
        return None


def safe_table_update(table: str, values: dict, key: str, value: str | None) -> None:
    if not value:
        return
    try:
        supabase.table(table).update(values).eq(key, value).execute()
    except Exception:
        return
