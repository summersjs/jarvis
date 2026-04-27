from backend.db.supabase_client import supabase
from backend.schemas.preferences import ProductPreferenceCreate, ProductPreferenceUpdate


def create_preference(payload: ProductPreferenceCreate):
    insert_data = {
        "user_id": payload.user_id,
        "item_keyword": payload.item_keyword.strip().lower(),
        "preference_type": payload.preference_type.strip().lower(),
        "preferred_brand": payload.preferred_brand,
        "preferred_product_name": payload.preferred_product_name,
        "preferred_size": payload.preferred_size,
        "preferred_unit": payload.preferred_unit,
        "notes": payload.notes,
        "is_active": payload.is_active,
    }

    response = supabase.table("product_preferences").insert(insert_data).execute()

    if not response.data:
        raise Exception("Failed to create preference.")

    return response.data[0]


def list_preferences(user_id: str, preference_type: str | None = None):
    query = (
        supabase
        .table("product_preferences")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )

    if preference_type:
        query = query.eq("preference_type", preference_type.strip().lower())

    response = query.execute()
    return response.data or []


def get_preference(preference_id: str):
    response = (
        supabase
        .table("product_preferences")
        .select("*")
        .eq("id", preference_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def update_preference(preference_id: str, payload: ProductPreferenceUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    if "item_keyword" in update_data and update_data["item_keyword"]:
        update_data["item_keyword"] = update_data["item_keyword"].strip().lower()

    if "preference_type" in update_data and update_data["preference_type"]:
        update_data["preference_type"] = update_data["preference_type"].strip().lower()

    response = (
        supabase
        .table("product_preferences")
        .update(update_data)
        .eq("id", preference_id)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def delete_preference(preference_id: str):
    response = (
        supabase
        .table("product_preferences")
        .delete()
        .eq("id", preference_id)
        .execute()
    )

    return response.data or []


def find_preference_for_keyword(user_id: str, item_keyword: str):
    normalized = item_keyword.strip().lower()

    response = (
        supabase
        .table("product_preferences")
        .select("*")
        .eq("user_id", user_id)
        .eq("item_keyword", normalized)
        .eq("is_active", True)
        .execute()
    )

    return response.data or []