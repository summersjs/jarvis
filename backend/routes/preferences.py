from fastapi import APIRouter, Depends, HTTPException
from backend.core.security import verify_api_key
from backend.schemas.preferences import ProductPreferenceCreate, ProductPreferenceUpdate
from backend.services.preferences_service import (
    create_preference,
    list_preferences,
    get_preference,
    update_preference,
    delete_preference,
    find_preference_for_keyword,
)

router = APIRouter(
    prefix="/preferences",
    tags=["preferences"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("")
def create_preference_route(payload: ProductPreferenceCreate):
    try:
        return {
            "status": "ok",
            "preference": create_preference(payload)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def list_preferences_route(user_id: str, preference_type: str | None = None):
    return {
        "status": "ok",
        "preferences": list_preferences(user_id, preference_type)
    }


@router.get("/{preference_id}")
def get_preference_route(preference_id: str):
    preference = get_preference(preference_id)
    if not preference:
        raise HTTPException(status_code=404, detail="Preference not found.")
    return {
        "status": "ok",
        "preference": preference
    }


@router.patch("/{preference_id}")
def update_preference_route(preference_id: str, payload: ProductPreferenceUpdate):
    preference = update_preference(preference_id, payload)
    if not preference:
        raise HTTPException(status_code=404, detail="Preference not found.")
    return {
        "status": "ok",
        "preference": preference
    }


@router.delete("/{preference_id}")
def delete_preference_route(preference_id: str):
    deleted = delete_preference(preference_id)
    return {
        "status": "ok",
        "deleted": deleted
    }


@router.get("/lookup/by-keyword")
def lookup_preference_by_keyword_route(user_id: str, item_keyword: str):
    return {
        "status": "ok",
        "matches": find_preference_for_keyword(user_id, item_keyword)
    }