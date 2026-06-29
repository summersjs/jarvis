from fastapi import APIRouter, Depends, HTTPException

from backend.core.security import verify_api_key
from backend.schemas.food_vault import (
    FoodVaultConsume,
    FoodVaultItemCreate,
    FoodVaultItemUpdate,
    NutritionTargetsUpsert,
)
from backend.services.food_vault_service import (
    consume_food_vault_item,
    create_food_vault_item,
    get_nutrition_targets,
    list_food_vault_items,
    update_food_vault_item,
    upsert_nutrition_targets,
)

router = APIRouter(
    prefix="/food-vault",
    tags=["food-vault"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("/items")
def list_items(user_id: str = "john"):
    return {"status": "ok", "items": list_food_vault_items(user_id)}


@router.post("/items")
def create_item(payload: FoodVaultItemCreate):
    try:
        return {"status": "ok", "item": create_food_vault_item(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/items/{item_id}")
def update_item(item_id: str, payload: FoodVaultItemUpdate):
    item = update_food_vault_item(item_id, payload)
    if not item:
        raise HTTPException(status_code=404, detail="Food vault item not found.")
    return {"status": "ok", "item": item}


@router.post("/items/{item_id}/consume")
def consume_item(item_id: str, payload: FoodVaultConsume):
    try:
        return {"status": "ok", **consume_food_vault_item(item_id, payload)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/nutrition-targets")
def targets(user_id: str = "john"):
    return {"status": "ok", "targets": get_nutrition_targets(user_id)}


@router.put("/nutrition-targets")
def save_targets(payload: NutritionTargetsUpsert):
    try:
        return {"status": "ok", "targets": upsert_nutrition_targets(payload)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
