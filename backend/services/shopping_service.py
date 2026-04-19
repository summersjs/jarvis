from backend.db.supabase_client import supabase
from backend.schemas.shopping import (
    ShoppingListCreate,
    ShoppingListUpdate,
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
)


def create_shopping_list(payload: ShoppingListCreate):
    insert_data = {
        "user_id": payload.user_id,
        "title": payload.title,
        "week_start": payload.week_start,
        "notes": payload.notes,
    }

    response = supabase.table("shopping_lists").insert(insert_data).execute()

    if not response.data:
        raise Exception("Failed to create shopping list.")

    return get_shopping_list(response.data[0]["id"])


def get_shopping_list(shopping_list_id: str):
    list_response = (
        supabase
        .table("shopping_lists")
        .select("*")
        .eq("id", shopping_list_id)
        .limit(1)
        .execute()
    )

    if not list_response.data:
        return None

    shopping_list = list_response.data[0]

    items_response = (
        supabase
        .table("shopping_list_items")
        .select("*")
        .eq("shopping_list_id", shopping_list_id)
        .order("created_at")
        .execute()
    )

    shopping_list["items"] = items_response.data or []
    return shopping_list


def list_shopping_lists(user_id: str):
    response = (
        supabase
        .table("shopping_lists")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    return response.data or []


def update_shopping_list(shopping_list_id: str, payload: ShoppingListUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    response = (
        supabase
        .table("shopping_lists")
        .update(update_data)
        .eq("id", shopping_list_id)
        .execute()
    )

    if not response.data:
        return None

    return get_shopping_list(shopping_list_id)


def delete_shopping_list(shopping_list_id: str):
    response = (
        supabase
        .table("shopping_lists")
        .delete()
        .eq("id", shopping_list_id)
        .execute()
    )

    return response.data or []


def add_shopping_list_item(payload: ShoppingListItemCreate):
    insert_data = {
        "shopping_list_id": payload.shopping_list_id,
        "item_name": payload.item_name,
        "quantity": payload.quantity,
        "category": payload.category,
        "is_checked": payload.is_checked,
        "source": payload.source,
        "recipe_id": payload.recipe_id,
    }

    response = supabase.table("shopping_list_items").insert(insert_data).execute()

    if not response.data:
        raise Exception("Failed to add shopping list item.")

    return response.data[0]


def update_shopping_list_item(item_id: str, payload: ShoppingListItemUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    response = (
        supabase
        .table("shopping_list_items")
        .update(update_data)
        .eq("id", item_id)
        .execute()
    )

    return response.data[0] if response.data else None


def delete_shopping_list_item(item_id: str):
    response = (
        supabase
        .table("shopping_list_items")
        .delete()
        .eq("id", item_id)
        .execute()
    )

    return response.data or []