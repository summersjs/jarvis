from __future__ import annotations

from datetime import date

from backend.db.supabase_client import supabase
from backend.schemas.food_vault import (
    FoodVaultConsume,
    FoodVaultItemCreate,
    FoodVaultItemUpdate,
    NutritionTargetsUpsert,
)
from backend.schemas.shopping import ShoppingListCreate, ShoppingListItemCreate
from backend.services.shopping_service import add_shopping_list_item, create_shopping_list, list_shopping_lists


def list_food_vault_items(user_id: str = "john") -> list[dict]:
    response = (
        supabase.table("food_vault_items")
        .select("*")
        .eq("user_id", user_id)
        .order("is_favorite", desc=True)
        .order("name")
        .execute()
    )
    return response.data or []


def get_food_vault_item(item_id: str) -> dict | None:
    response = supabase.table("food_vault_items").select("*").eq("id", item_id).limit(1).execute()
    return response.data[0] if response.data else None


def create_food_vault_item(payload: FoodVaultItemCreate) -> dict:
    response = supabase.table("food_vault_items").insert(payload.model_dump()).execute()
    if not response.data:
        raise Exception("Failed to create food vault item.")
    return response.data[0]


def update_food_vault_item(item_id: str, payload: FoodVaultItemUpdate) -> dict | None:
    update_data = payload.model_dump(exclude_unset=True)
    response = supabase.table("food_vault_items").update(update_data).eq("id", item_id).execute()
    return response.data[0] if response.data else None


def consume_food_vault_item(item_id: str, payload: FoodVaultConsume) -> dict:
    item = get_food_vault_item(item_id)
    if not item:
        raise ValueError("Food vault item not found.")

    current_quantity = float(item.get("current_quantity") or 0)
    consumed = max(0, float(payload.quantity or 0))
    next_quantity = max(0, current_quantity - consumed)

    updated = update_food_vault_item(item_id, FoodVaultItemUpdate(current_quantity=next_quantity))
    shopping_item = None
    threshold = float(item.get("low_stock_threshold") or 0)
    if next_quantity <= threshold:
        shopping_item = add_food_vault_restock_item(updated or item, payload.shopping_list_id)

    return {
        "item": updated,
        "consumed": consumed,
        "shopping_item": shopping_item,
    }


def add_food_vault_restock_item(item: dict, shopping_list_id: str | None = None) -> dict | None:
    list_id = shopping_list_id or get_or_create_food_vault_shopping_list(item.get("user_id") or "john")
    quantity = f"1 package"
    package_quantity = item.get("package_quantity")
    if package_quantity:
        quantity = f"1 package ({float(package_quantity):g} servings)"

    try:
        return add_shopping_list_item(
            ShoppingListItemCreate(
                shopping_list_id=list_id,
                item_name=food_display_name(item),
                quantity=quantity,
                category=item.get("shopping_category") or "Food Vault",
                source="food_vault",
                recipe_id=None,
            )
        )
    except Exception as exc:
        print(f"Food Vault restock item unavailable: {exc}")
        return None


def get_or_create_food_vault_shopping_list(user_id: str) -> str:
    lists = list_shopping_lists(user_id)
    for shopping_list in lists:
        if shopping_list.get("title") == "Food Vault Restock":
            return shopping_list["id"]

    created = create_shopping_list(
        ShoppingListCreate(
            user_id=user_id,
            title="Food Vault Restock",
            week_start=date.today().isoformat(),
            notes="Automatically generated low-stock Food Vault items.",
        )
    )
    return created["id"]


def food_display_name(item: dict) -> str:
    brand = item.get("brand")
    name = item.get("name") or "Food Vault Item"
    return f"{brand} {name}".strip() if brand else name


def get_nutrition_targets(user_id: str = "john") -> dict | None:
    response = (
        supabase.table("nutrition_targets")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def upsert_nutrition_targets(payload: NutritionTargetsUpsert) -> dict:
    existing = get_nutrition_targets(payload.user_id)
    data = payload.model_dump(exclude_unset=True)
    if existing:
        response = supabase.table("nutrition_targets").update(data).eq("id", existing["id"]).execute()
    else:
        response = supabase.table("nutrition_targets").insert(data).execute()
    if not response.data:
        raise Exception("Failed to save nutrition targets.")
    return response.data[0]
