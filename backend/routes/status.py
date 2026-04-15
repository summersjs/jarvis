from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
def get_status():
    return {
        "systems": "Online",
        "brain": "Gemini 1.5 Flash",
        "user": "John Summers Sr",
        "clearance": "Active"
    }