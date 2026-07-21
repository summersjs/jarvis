from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.core.config import LOCAL_TZ
from backend.core.security import verify_api_key
from backend.db.supabase_client import supabase
from backend.schemas.forge import (
    ForgeFileCreate,
    ForgeFileUpdate,
    ForgeLedgerEntryCreate,
    ForgeLedgerEntryUpdate,
    ForgeNoteCreate,
    ForgeNoteUpdate,
    ForgeProjectCreate,
    ForgeProjectUpdate,
    ForgeSessionCreate,
    ForgeSessionUpdate,
    ForgeSparkCreate,
    ForgeSparkUpdate,
    ForgeTaskCreate,
    ForgeTaskUpdate,
)
from backend.services.forge_service import (
    FORGE_CATEGORIES,
    build_forge_dashboard,
    create_forge_file,
    get_project_activity_at,
    is_project_active,
    is_project_complete,
    create_forge_ledger_entry,
    create_forge_note,
    create_forge_project,
    create_forge_session,
    create_forge_spark,
    delete_forge_file,
    delete_forge_ledger_entry,
    delete_forge_note,
    delete_forge_project,
    delete_forge_session,
    delete_forge_spark,
    delete_forge_task,
    create_forge_task,
    update_forge_file,
    update_forge_ledger_entry,
    update_forge_note,
    update_forge_project,
    update_forge_session,
    update_forge_spark,
    update_forge_task,
    enrich_forge_project,
    apply_task_progress,
)

router = APIRouter(
    prefix="/forge",
    tags=["forge"],
    dependencies=[Depends(verify_api_key)],
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
FORGE_PAGE_SIZE = 25
PROJECT_LIST_COLUMNS = "id,goal_id,title,category,status,summary,next_milestone,progress_percent,archived_at,created_at,updated_at"
PROJECT_DETAIL_COLUMNS = PROJECT_LIST_COLUMNS + ",tags,project_type"
FORGE_MEDIA_ROOT = Path(os.getenv("FORGE_MEDIA_ROOT", Path(__file__).resolve().parents[2] / ".local" / "forge-media"))
FORGE_MEDIA_MAX_BYTES = 25 * 1024 * 1024


def _forge_query_log(name: str, rows: list[dict]) -> None:
    """Temporary development telemetry; deliberately excludes row contents."""
    if os.getenv("ENVIRONMENT", "development").lower() != "production":
        logger.info("[forge-query] %s returned %d records", name, len(rows))


def _page(query, page: int, page_size: int = FORGE_PAGE_SIZE):
    safe_page = max(page, 1)
    safe_size = min(max(page_size, 1), FORGE_PAGE_SIZE)
    start = (safe_page - 1) * safe_size
    return query.range(start, start + safe_size - 1), safe_page, safe_size


@router.post("/media")
async def upload_forge_media(request: Request, project_id: str, filename: str, variant: str = "original"):
    """Store raw media locally. Database rows retain only the returned URL."""
    content_type = (request.headers.get("content-type") or "application/octet-stream").split(";", 1)[0]
    if variant not in {"original", "thumbnail"}:
        raise HTTPException(status_code=400, detail="Unsupported Forge media variant.")
    body = await request.body()
    if not body or len(body) > FORGE_MEDIA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Forge media must be between 1 byte and 25 MB.")
    suffix = Path(filename).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
        suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}.get(content_type, ".bin")
    safe_project = re.sub(r"[^a-zA-Z0-9_-]", "", project_id)[:80]
    if not safe_project:
        raise HTTPException(status_code=400, detail="Invalid project id.")
    directory = FORGE_MEDIA_ROOT / safe_project
    directory.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}-{variant}{suffix}"
    target = directory / stored_name
    target.write_bytes(body)
    relative_url = f"/forge-media/{safe_project}/{stored_name}"
    return {"status": "ok", "path": relative_url, "url": f"{request.base_url.scheme}://{request.base_url.netloc}{relative_url}", "bytes": len(body)}


@router.get("")
def forge_dashboard(user_id: str = "john"):
    try:
        return build_forge_dashboard(user_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/desktop")
def forge_desktop_dashboard(user_id: str = "john", include_goals: bool = True, page: int = 1, page_size: int = FORGE_PAGE_SIZE):
    try:
        projects_query, page, page_size = _page(
            supabase.table("forge_projects")
            .select(PROJECT_LIST_COLUMNS, count="exact")
            .eq("user_id", user_id)
            .order("updated_at", desc=True), page, page_size
        )
        projects_response = projects_query.execute()
        projects = projects_response.data or []
        _forge_query_log("desktop.projects", projects)
        goals = []
        if include_goals:
            goals_response = (
                supabase.table("goals")
                .select("id,title,category,mission_type,current_value,target_value,unit,status,is_active,created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(8)
                .execute()
            )
            goals = goals_response.data or []
            _forge_query_log("desktop.goals", goals)
        active_projects = [project for project in projects if is_project_active(project)]
        building_cutoff = datetime.now(LOCAL_TZ) - timedelta(days=14)
        building_projects = [
            project for project in active_projects
            if get_project_activity_at(project) >= building_cutoff
        ]
        recently_updated = sorted(
            active_projects,
            key=lambda project: project.get("updated_at") or project.get("created_at") or "",
            reverse=True,
        )[:6]
        incubating = [
            project for project in projects
            if str(project.get("status") or "").strip().lower() == "incubating"
        ][:3]
        category_counts = {
            category: len([project for project in projects if project.get("category") == category])
            for category in FORGE_CATEGORIES
        }
        return {
            "status": "ok",
            "projects": projects,
            "pagination": {"page": page, "page_size": page_size, "total": projects_response.count, "has_more": bool(projects_response.count and page * page_size < projects_response.count)},
            "recently_updated": recently_updated,
            "incubating": incubating,
            "goals": goals,
            "category_counts": category_counts,
            "stats": {
                "active_projects": len(active_projects),
                "building": len(building_projects),
                "incubating": len(incubating),
                "completed": len([project for project in projects if is_project_complete(project)]),
                "archived": len([project for project in projects if is_project_complete(project)]),
                "recently_updated": len(recently_updated),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/projects")
def forge_project_list(user_id: str = "john", page: int = 1, page_size: int = FORGE_PAGE_SIZE):
    try:
        query, page, page_size = _page(
            supabase.table("forge_projects")
            .select(PROJECT_LIST_COLUMNS, count="exact")
            .eq("user_id", user_id)
            .order("updated_at", desc=True), page, page_size
        )
        response = query.execute()
        rows = response.data or []
        _forge_query_log("projects.list", rows)
        return {"status": "ok", "projects": rows, "pagination": {"page": page, "page_size": page_size, "total": response.count, "has_more": bool(response.count and page * page_size < response.count)}}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/inbox")
def forge_inbox(user_id: str = "john", page_size: int = FORGE_PAGE_SIZE):
    size = min(max(page_size, 1), FORGE_PAGE_SIZE)
    try:
        specs = {
            "sparks": ("forge_sparks", "id,spark_text,category,project_id,tags,folder_path,created_at,updated_at"),
            "notes": ("forge_notes", "id,title,body,category,project_id,tags,folder_path,note_type,status,is_pinned,linked_milestone,linked_tasks,sort_order,created_at,updated_at"),
            "files": ("forge_files", "id,file_name,file_type,file_size,file_url,caption,category,project_id,tags,metadata,created_at,updated_at"),
        }
        result = {}
        for key, (table, columns) in specs.items():
            query = (supabase.table(table).select(columns, count="exact").eq("user_id", user_id)
                .is_("project_id", "null").order("created_at", desc=True).range(0, size - 1))
            if key == "files":
                query = query.not_.like("file_url", "data:%").not_.like("file_url", "blob:%")
            response = query.execute()
            result[key] = response.data or []
            result[f"{key}_pagination"] = {"page": 1, "page_size": size, "total": response.count, "has_more": bool(response.count and size < response.count)}
            _forge_query_log(f"inbox.{key}", result[key])
        projects = (supabase.table("forge_projects").select("id,title,category,status")
            .eq("user_id", user_id).order("updated_at", desc=True).limit(size).execute()).data or []
        _forge_query_log("inbox.project_options", projects)
        return {"status": "ok", "projects": projects, "tasks": [], "sessions": [], "ledger_entries": [], **result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/projects/{project_id}/detail")
def forge_project_detail(project_id: str, user_id: str = "john", page_size: int = FORGE_PAGE_SIZE):
    """Load one workspace. Large child collections are capped and use explicit columns."""
    size = min(max(page_size, 1), FORGE_PAGE_SIZE)
    try:
        project_response = (supabase.table("forge_projects").select(PROJECT_DETAIL_COLUMNS)
            .eq("user_id", user_id).eq("id", project_id).limit(1).execute())
        if not project_response.data:
            raise HTTPException(status_code=404, detail="Forge project not found.")
        project = enrich_forge_project(project_response.data[0])
        cover_response = (supabase.table("forge_projects").select("cover_image_url")
            .eq("user_id", user_id).eq("id", project_id)
            .not_.like("cover_image_url", "data:%").not_.like("cover_image_url", "blob:%").limit(1).execute())
        project["cover_image_url"] = cover_response.data[0].get("cover_image_url") if cover_response.data else None
        specs = {
            "sparks": ("forge_sparks", "id,spark_text,category,project_id,tags,folder_path,created_at,updated_at", "created_at"),
            "notes": ("forge_notes", "id,title,body,category,project_id,tags,folder_path,note_type,status,is_pinned,linked_milestone,linked_tasks,sort_order,created_at,updated_at", "updated_at"),
            "files": ("forge_files", "id,file_name,file_type,file_size,file_url,caption,category,project_id,tags,metadata,created_at,updated_at", "created_at"),
            "tasks": ("forge_tasks", "id,project_id,title,description,status,priority,due_date,milestone_group,sort_order,completed_at,task_type,linked_goal_id,counts_toward_goal,goal_event_id,metadata,created_at,updated_at", "sort_order"),
            "sessions": ("forge_sessions", "id,project_id,task_id,linked_goal_id,session_type,title,scratchpad,decisions,follow_up_task,status,started_at,completed_at,created_at", "completed_at"),
            "ledger_entries": ("forge_note_ledger_entries", "id,project_id,note_id,entry_type,title,body,tags,folder,subfolder,linked_task_id,linked_milestone,is_pinned,status,resolved,resolution_text,resolved_into_entry_id,resolved_at,created_at,updated_at", "updated_at"),
        }
        result = {}
        for key, (table, columns, order_column) in specs.items():
            query = (supabase.table(table).select(columns, count="exact").eq("user_id", user_id)
                .eq("project_id", project_id).order(order_column, desc=key != "tasks").range(0, size - 1))
            if key == "files":
                query = query.not_.like("file_url", "data:%").not_.like("file_url", "blob:%")
            try:
                response = query.execute()
                rows = response.data or []
                result[key] = rows
                result[f"{key}_pagination"] = {"page": 1, "page_size": size, "total": response.count, "has_more": bool(response.count and size < response.count)}
                _forge_query_log(f"project_detail.{key}", rows)
            except Exception:
                result[key] = []
        apply_task_progress([project], result["tasks"])
        projects_response = (supabase.table("forge_projects").select("id,title,category,status")
            .eq("user_id", user_id).order("updated_at", desc=True).limit(size).execute())
        result["projects"] = projects_response.data or []
        _forge_query_log("project_detail.project_options", result["projects"])
        return {"status": "ok", "project": project, **result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/projects")
def create_project(payload: ForgeProjectCreate):
    try:
        return {"status": "ok", "project": create_forge_project(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/projects/{project_id}")
def update_project(project_id: str, payload: ForgeProjectUpdate):
    project = update_forge_project(project_id, payload)
    if not project:
        raise HTTPException(status_code=404, detail="Forge project not found.")
    return {"status": "ok", "project": project}


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    return {"status": "ok", "deleted": delete_forge_project(project_id)}


@router.post("/sparks")
def create_spark(payload: ForgeSparkCreate):
    try:
        return {"status": "ok", "spark": create_forge_spark(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/sparks/{spark_id}")
def update_spark(spark_id: str, payload: ForgeSparkUpdate):
    spark = update_forge_spark(spark_id, payload)
    if not spark:
        raise HTTPException(status_code=404, detail="Forge spark not found.")
    return {"status": "ok", "spark": spark}


@router.delete("/sparks/{spark_id}")
def delete_spark(spark_id: str):
    return {"status": "ok", "deleted": delete_forge_spark(spark_id)}


@router.post("/notes")
def create_note(payload: ForgeNoteCreate):
    try:
        return {"status": "ok", "note": create_forge_note(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/notes/{note_id}")
def update_note(note_id: str, payload: ForgeNoteUpdate):
    note = update_forge_note(note_id, payload)
    if not note:
        raise HTTPException(status_code=404, detail="Forge note not found.")
    return {"status": "ok", "note": note}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str):
    return {"status": "ok", "deleted": delete_forge_note(note_id)}


@router.post("/files")
def create_file(payload: ForgeFileCreate):
    try:
        return {"status": "ok", "file": create_forge_file(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/files/{file_id}")
def update_file(file_id: str, payload: ForgeFileUpdate):
    file = update_forge_file(file_id, payload)
    if not file:
        raise HTTPException(status_code=404, detail="Forge file not found.")
    return {"status": "ok", "file": file}


@router.delete("/files/{file_id}")
def delete_file(file_id: str):
    return {"status": "ok", "deleted": delete_forge_file(file_id)}


@router.post("/ledger-entries")
def create_ledger_entry(payload: ForgeLedgerEntryCreate):
    try:
        return {"status": "ok", "entry": create_forge_ledger_entry(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/ledger-entries/{entry_id}")
def update_ledger_entry(entry_id: str, payload: ForgeLedgerEntryUpdate):
    entry = update_forge_ledger_entry(entry_id, payload)
    if not entry:
        raise HTTPException(status_code=404, detail="Forge ledger entry not found.")
    return {"status": "ok", "entry": entry}


@router.delete("/ledger-entries/{entry_id}")
def delete_ledger_entry(entry_id: str):
    return {"status": "ok", "deleted": delete_forge_ledger_entry(entry_id)}


@router.post("/sessions")
def create_session(payload: ForgeSessionCreate):
    try:
        return {"status": "ok", "session": create_forge_session(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/sessions/{session_id}")
def update_session(session_id: str, payload: ForgeSessionUpdate):
    session = update_forge_session(session_id, payload)
    if not session:
        raise HTTPException(status_code=404, detail="Forge session not found.")
    return {"status": "ok", "session": session}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    return {"status": "ok", "deleted": delete_forge_session(session_id)}


@router.post("/tasks")
def create_task(payload: ForgeTaskCreate):
    try:
        return {"status": "ok", "task": create_forge_task(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, payload: ForgeTaskUpdate):
    task = update_forge_task(task_id, payload)
    if not task:
        raise HTTPException(status_code=404, detail="Forge task not found.")
    return {"status": "ok", "task": task}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    return {"status": "ok", "deleted": delete_forge_task(task_id)}
