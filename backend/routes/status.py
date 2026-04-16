from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key

router = APIRouter()


@router.get("/status", dependencies=[Depends(verify_api_key)])
def get_status():
    return {
        "systems": "Online",
        "brain": "Gemini 1.5 Flash",
        "user": "John Summers Sr",
        "clearance": "Active"
    }