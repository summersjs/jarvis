from fastapi import APIRouter, Depends, HTTPException
from backend.core.security import verify_api_key
from backend.schemas.shopping import (
    ShoppingListCreate,
    ShoppingListUpdate,
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
)
from backend.services.shopping_service import (
    create_shopping_list,
    get_shopping_list,
    list_shopping_lists,
    update_shopping_list,
    delete_shopping_list,
    add_shopping_list_item,
    update_shopping_list_item,
    delete_shopping_list_item,
    generate_shopping_list_from_meal_plan,
)

router = APIRouter(
    prefix="/shopping",
    tags=["shopping"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("/lists")
def create_shopping_list_route(payload: ShoppingListCreate):
    try:
        return {
            "status": "ok",
            "shopping_list": create_shopping_list(payload)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lists")
def list_shopping_lists_route(user_id: str):
    return {
        "status": "ok",
        "shopping_lists": list_shopping_lists(user_id)
    }


@router.get("/lists/{shopping_list_id}")
def get_shopping_list_route(shopping_list_id: str):
    shopping_list = get_shopping_list(shopping_list_id)
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Shopping list not found.")
    return {
        "status": "ok",
        "shopping_list": shopping_list
    }


@router.patch("/lists/{shopping_list_id}")
def update_shopping_list_route(shopping_list_id: str, payload: ShoppingListUpdate):
    shopping_list = update_shopping_list(shopping_list_id, payload)
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Shopping list not found.")
    return {
        "status": "ok",
        "shopping_list": shopping_list
    }


@router.delete("/lists/{shopping_list_id}")
def delete_shopping_list_route(shopping_list_id: str):
    deleted = delete_shopping_list(shopping_list_id)
    return {
        "status": "ok",
        "deleted": deleted
    }


@router.post("/items")
def add_shopping_list_item_route(payload: ShoppingListItemCreate):
    try:
        return {
            "status": "ok",
            "item": add_shopping_list_item(payload)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/items/{item_id}")
def update_shopping_list_item_route(item_id: str, payload: ShoppingListItemUpdate):
    item = update_shopping_list_item(item_id, payload)
    if not item:
        raise HTTPException(status_code=404, detail="Shopping list item not found.")
    return {
        "status": "ok",
        "item": item
    }


@router.delete("/items/{item_id}")
def delete_shopping_list_item_route(item_id: str):
    deleted = delete_shopping_list_item(item_id)
    return {
        "status": "ok",
        "deleted": deleted
    }

@router.post("/lists/{shopping_list_id}/generate-from-meal-plan")
def generate_from_meal_plan_route(
    shopping_list_id: str,
    user_id: str,
    start_date: str,
    end_date: str,
    skip_pantry: bool = True,
):
    try:
        items = generate_shopping_list_from_meal_plan(
            shopping_list_id=shopping_list_id,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            skip_pantry=skip_pantry,
        )
        return {
            "status": "ok",
            "generated_items": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))