from fastapi import APIRouter, Depends
from backend.core.security import verify_api_key
from backend.services.briefing_service import build_morning_brief

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.get("/briefing/morning")
def morning_brief(user_id: str = "john"):
    return build_morning_brief(user_id)