from fastapi import APIRouter
from backend.services.briefing_service import build_morning_brief

router = APIRouter()


@router.get("/briefing/morning")
def morning_brief(user_id: str = "john"):
    return build_morning_brief(user_id)