from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.forge import ForgeFileCreate, ForgeNoteCreate, ForgeProjectCreate, ForgeProjectUpdate, ForgeSparkCreate
from backend.services.forge_service import (
    build_forge_dashboard,
    create_forge_file,
    create_forge_note,
    create_forge_project,
    create_forge_spark,
    update_forge_project,
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


@router.post("/sparks")
def create_spark(payload: ForgeSparkCreate):
    try:
        return {"status": "ok", "spark": create_forge_spark(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/notes")
def create_note(payload: ForgeNoteCreate):
    try:
        return {"status": "ok", "note": create_forge_note(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/files")
def create_file(payload: ForgeFileCreate):
    try:
        return {"status": "ok", "file": create_forge_file(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
