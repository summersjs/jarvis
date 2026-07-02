from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
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
from backend.services.forge_service import (
    build_forge_dashboard,
    create_forge_file,
    create_forge_note,
    create_forge_project,
    create_forge_spark,
    delete_forge_file,
    delete_forge_note,
    delete_forge_project,
    delete_forge_spark,
    delete_forge_task,
    create_forge_task,
    update_forge_file,
    update_forge_note,
    update_forge_project,
    update_forge_spark,
    update_forge_task,
)

router = APIRouter(
    prefix="/forge",
    tags=["forge"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("")
def forge_dashboard(user_id: str = "john"):
    try:
        return build_forge_dashboard(user_id)
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
