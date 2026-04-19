from fastapi import APIRouter, Depends, HTTPException
from backend.core.security import verify_api_key
from backend.schemas.recipe import RecipeCreate, RecipeUpdate
from backend.services.recipe_service import (
    create_recipe,
    get_recipe,
    list_recipes,
    update_recipe,
    delete_recipe,
)

router = APIRouter(prefix="/recipes", tags=["recipes"], dependencies=[Depends(verify_api_key)])


@router.post("")
def create_recipe_route(payload: RecipeCreate):
    try:
        return {
            "status": "ok",
            "recipe": create_recipe(payload)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def list_recipes_route(user_id: str, favorites_only: bool = False):
    return {
        "status": "ok",
        "recipes": list_recipes(user_id=user_id, favorites_only=favorites_only)
    }


@router.get("/{recipe_id}")
def get_recipe_route(recipe_id: str):
    recipe = get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    return {
        "status": "ok",
        "recipe": recipe
    }


@router.patch("/{recipe_id}")
def update_recipe_route(recipe_id: str, payload: RecipeUpdate):
    recipe = update_recipe(recipe_id, payload)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    return {
        "status": "ok",
        "recipe": recipe
    }


@router.delete("/{recipe_id}")
def delete_recipe_route(recipe_id: str):
    deleted = delete_recipe(recipe_id)
    return {
        "status": "ok",
        "deleted": deleted
    }