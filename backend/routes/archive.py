from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.archive import ArchiveDreamCreate, ArchiveDreamUpdate
from backend.services.archive_service import create_dream, delete_dream, list_dreams, update_dream

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
