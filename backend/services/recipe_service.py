from backend.db.supabase_client import supabase
from backend.schemas.recipe import RecipeCreate, RecipeUpdate


def create_recipe(payload: RecipeCreate):
    recipe_insert = {
        "user_id": payload.user_id,
        "title": payload.title,
        "source_type": payload.source_type,
        "source_url": payload.source_url,
        "description": payload.description,
        "instructions": payload.instructions,
        "servings": payload.servings,
        "prep_minutes": payload.prep_minutes,
        "cook_minutes": payload.cook_minutes,
        "is_favorite": payload.is_favorite,
    }

    recipe_response = supabase.table("recipes").insert(recipe_insert).execute()

    if not recipe_response.data:
        raise Exception("Failed to create recipe.")

    recipe = recipe_response.data[0]
    recipe_id = recipe["id"]

    if payload.ingredients:
        ingredient_rows = []
        for item in payload.ingredients:
            ingredient_rows.append({
                "recipe_id": recipe_id,
                "item_name": item.item_name,
                "quantity": item.quantity,
                "category": item.category,
                "is_optional": item.is_optional,
            })

        supabase.table("recipe_ingredients").insert(ingredient_rows).execute()

    return get_recipe(recipe_id)


def get_recipe(recipe_id: str):
    recipe_response = supabase.table("recipes").select("*").eq("id", recipe_id).limit(1).execute()

    if not recipe_response.data:
        return None

    recipe = recipe_response.data[0]

    ingredients_response = (
        supabase
        .table("recipe_ingredients")
        .select("*")
        .eq("recipe_id", recipe_id)
        .execute()
    )

    recipe["ingredients"] = ingredients_response.data or []
    return recipe


def list_recipes(user_id: str, favorites_only: bool = False):
    query = supabase.table("recipes").select("*").eq("user_id", user_id)

    if favorites_only:
        query = query.eq("is_favorite", True)

    response = query.order("created_at", desc=True).execute()
    return response.data or []


def update_recipe(recipe_id: str, payload: RecipeUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    response = (
        supabase
        .table("recipes")
        .update(update_data)
        .eq("id", recipe_id)
        .execute()
    )

    if not response.data:
        return None

    return get_recipe(recipe_id)


def delete_recipe(recipe_id: str):
    response = supabase.table("recipes").delete().eq("id", recipe_id).execute()
    return response.data or []


def replace_recipe_ingredients(recipe_id: str, ingredients: list[dict]):
    supabase.table("recipe_ingredients").delete().eq("recipe_id", recipe_id).execute()

    if not ingredients:
        return []

    rows = []
    for item in ingredients:
        rows.append({
            "recipe_id": recipe_id,
            "item_name": item.get("item_name"),
            "quantity": item.get("quantity"),
            "category": item.get("category"),
            "is_optional": item.get("is_optional", False),
        })

    response = supabase.table("recipe_ingredients").insert(rows).execute()
    return response.data or []