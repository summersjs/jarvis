from fastapi import APIRouter, Depends, HTTPException
from backend.core.security import verify_api_key
from backend.schemas.meal_planner import MealPlanEntryCreate, MealPlanEntryUpdate
from backend.services.meal_planner_service import (
    create_meal_plan_entry,
    get_meal_plan_entry,
    list_meal_plan_entries,
    update_meal_plan_entry,
    delete_meal_plan_entry,
)

router = APIRouter(
    prefix="/meal-planner",
    tags=["meal-planner"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("")
def create_meal_plan_entry_route(payload: MealPlanEntryCreate):
    try:
        return {
            "status": "ok",
            "entry": create_meal_plan_entry(payload)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def list_meal_plan_entries_route(user_id: str, start_date: str, end_date: str):
    return {
        "status": "ok",
        "entries": list_meal_plan_entries(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
        )
    }


@router.get("/{entry_id}")
def get_meal_plan_entry_route(entry_id: str):
    entry = get_meal_plan_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Meal plan entry not found.")
    return {
        "status": "ok",
        "entry": entry
    }


@router.patch("/{entry_id}")
def update_meal_plan_entry_route(entry_id: str, payload: MealPlanEntryUpdate):
    entry = update_meal_plan_entry(entry_id, payload)
    if not entry:
        raise HTTPException(status_code=404, detail="Meal plan entry not found.")
    return {
        "status": "ok",
        "entry": entry
    }


@router.delete("/{entry_id}")
def delete_meal_plan_entry_route(entry_id: str):
    deleted = delete_meal_plan_entry(entry_id)
    return {
        "status": "ok",
        "deleted": deleted
    }