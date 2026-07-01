from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.archive import ArchiveChronicleCreate, ArchiveChronicleUpdate, ArchiveDreamCreate, ArchiveDreamUpdate
from backend.services.archive_service import (
    build_or_update_chronicle_from_debrief,
    create_chronicle,
    create_dream,
    delete_chronicle,
    delete_dream,
    get_today_chronicle,
    list_chronicles,
    list_dreams,
    update_chronicle,
    update_dream,
)

router = APIRouter(
    prefix="/archive",
    tags=["archive"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/dreams")
def list_dreams_route(user_id: str = "john"):
    return {"status": "ok", "dreams": list_dreams(user_id)}


@router.post("/dreams")
def create_dream_route(payload: ArchiveDreamCreate):
    try:
        return {"status": "ok", "dream": create_dream(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/dreams/{dream_id}")
def update_dream_route(dream_id: str, payload: ArchiveDreamUpdate):
    dream = update_dream(dream_id, payload)
    if not dream:
        raise HTTPException(status_code=404, detail="Dream not found.")
    return {"status": "ok", "dream": dream}


@router.delete("/dreams/{dream_id}")
def delete_dream_route(dream_id: str):
    deleted = delete_dream(dream_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dream not found.")
    return {"status": "ok", "deleted": deleted}


@router.get("/chronicles")
def list_chronicles_route(user_id: str = "john"):
    return {"status": "ok", "chronicles": list_chronicles(user_id)}


@router.get("/chronicles/today")
def today_chronicle_route(user_id: str = "john"):
    try:
        return {"status": "ok", "chronicle": get_today_chronicle(user_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/chronicles")
def create_chronicle_route(payload: ArchiveChronicleCreate):
    try:
        return {"status": "ok", "chronicle": create_chronicle(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/chronicles/build")
def build_chronicle_route(user_id: str = "john", debrief_id: str | None = None):
    try:
        return {"status": "ok", "chronicle": build_or_update_chronicle_from_debrief(user_id, debrief_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/chronicles/{chronicle_id}")
def update_chronicle_route(chronicle_id: str, payload: ArchiveChronicleUpdate):
    chronicle = update_chronicle(chronicle_id, payload)
    if not chronicle:
        raise HTTPException(status_code=404, detail="Chronicle not found.")
    return {"status": "ok", "chronicle": chronicle}


@router.delete("/chronicles/{chronicle_id}")
def delete_chronicle_route(chronicle_id: str):
    deleted = delete_chronicle(chronicle_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chronicle not found.")
    return {"status": "ok", "deleted": deleted}
