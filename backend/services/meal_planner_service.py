from backend.db.supabase_client import supabase
from backend.schemas.meal_planner import MealPlanEntryCreate, MealPlanEntryUpdate


def create_meal_plan_entry(payload: MealPlanEntryCreate):
    insert_data = {
        "user_id": payload.user_id,
        "meal_date": payload.meal_date,
        "meal_type": payload.meal_type,
        "recipe_id": payload.recipe_id,
        "custom_meal_name": payload.custom_meal_name,
        "notes": payload.notes,
    }

    response = supabase.table("meal_plan_entries").insert(insert_data).execute()

    if not response.data:
        raise Exception("Failed to create meal plan entry.")

    return get_meal_plan_entry(response.data[0]["id"])


def get_meal_plan_entry(entry_id: str):
    response = (
        supabase
        .table("meal_plan_entries")
        .select("*, recipes(id, title, description, is_favorite)")
        .eq("id", entry_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def list_meal_plan_entries(user_id: str, start_date: str, end_date: str):
    response = (
        supabase
        .table("meal_plan_entries")
        .select("*, recipes(id, title, description, is_favorite)")
        .eq("user_id", user_id)
        .gte("meal_date", start_date)
        .lte("meal_date", end_date)
        .order("meal_date")
        .order("meal_type")
        .execute()
    )

    return response.data or []


def update_meal_plan_entry(entry_id: str, payload: MealPlanEntryUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    response = (
        supabase
        .table("meal_plan_entries")
        .update(update_data)
        .eq("id", entry_id)
        .execute()
    )

    if not response.data:
        return None

    return get_meal_plan_entry(entry_id)


def delete_meal_plan_entry(entry_id: str):
    response = (
        supabase
        .table("meal_plan_entries")
        .delete()
        .eq("id", entry_id)
        .execute()
    )

    return response.data or []