import re
from collections import defaultdict
from backend.db.supabase_client import supabase
from backend.schemas.shopping import (
    ShoppingListCreate,
    ShoppingListUpdate,
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
)


PANTRY_STAPLES = {
    "salt",
    "black pepper",
    "pepper",
    "garlic powder",
    "onion powder",
    "paprika",
    "cinnamon",
    "olive oil",
    "vegetable oil",
    "cooking spray",
    "sugar",
    "brown sugar",
    "flour",
    "smoked paprika"
}


def normalize_item_name(name: str) -> str:
    cleaned = name.strip().lower()
    cleaned = re.sub(r"[^a-z0-9\s]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def should_skip_pantry_staple(item_name: str, skip_pantry: bool) -> bool:
    if not skip_pantry:
        return False
    return normalize_item_name(item_name) in PANTRY_STAPLES


def try_parse_quantity(quantity: str | None):
    """
    Very small v1 parser.
    Supports things like:
    '1 cup'
    '2 tbsp'
    '3'
    Returns (amount: float | None, unit: str | None)
    """
    if not quantity:
        return None, None

    text = quantity.strip().lower()
    match = re.match(r"^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$", text)
    if not match:
        return None, None

    amount = float(match.group(1))
    unit = match.group(2) or None
    return amount, unit


def format_quantity(amount: float, unit: str | None) -> str:
    if amount.is_integer():
        amount_str = str(int(amount))
    else:
        amount_str = str(round(amount, 2))

    return f"{amount_str} {unit}".strip()

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

def generate_shopping_list_from_meal_plan(
    shopping_list_id: str,
    user_id: str,
    start_date: str,
    end_date: str,
    skip_pantry: bool = True,
):
    # 1. Get meal plan entries for the range
    meal_entries_response = (
        supabase
        .table("meal_plan_entries")
        .select("*, recipes(id, title)")
        .eq("user_id", user_id)
        .gte("meal_date", start_date)
        .lte("meal_date", end_date)
        .execute()
    )

    meal_entries = meal_entries_response.data or []

    recipe_ids = [entry["recipe_id"] for entry in meal_entries if entry.get("recipe_id")]
    if not recipe_ids:
        return []

    # 2. Get ingredients for all recipes in the plan
    ingredients_response = (
        supabase
        .table("recipe_ingredients")
        .select("*")
        .in_("recipe_id", recipe_ids)
        .execute()
    )

    ingredients = ingredients_response.data or []

    # 3. Build recipe title lookup
    recipe_response = (
        supabase
        .table("recipes")
        .select("id,title")
        .in_("id", recipe_ids)
        .execute()
    )

    recipe_lookup = {row["id"]: row["title"] for row in (recipe_response.data or [])}

    # 4. Merge duplicates
    merged = {}

    for ingredient in ingredients:
        item_name = ingredient.get("item_name", "").strip()
        if not item_name:
            continue

        if should_skip_pantry_staple(item_name, skip_pantry):
            continue

        normalized = normalize_item_name(item_name)
        quantity = ingredient.get("quantity")
        category = ingredient.get("category")
        recipe_id = ingredient.get("recipe_id")
        recipe_title = recipe_lookup.get(recipe_id)

        if normalized not in merged:
            merged[normalized] = {
                "item_name": item_name,
                "normalized_name": normalized,
                "quantity": quantity,
                "category": category,
                "is_checked": False,
                "source": "planner",
                "recipe_id": None,
                "occurrence_count": 1,
                "source_recipe_titles": [recipe_title] if recipe_title else [],
            }
            continue

        existing = merged[normalized]
        existing["occurrence_count"] += 1

        if recipe_title and recipe_title not in existing["source_recipe_titles"]:
            existing["source_recipe_titles"].append(recipe_title)

        # Try to combine quantities if units match
        old_amount, old_unit = try_parse_quantity(existing.get("quantity"))
        new_amount, new_unit = try_parse_quantity(quantity)

        if old_amount is not None and new_amount is not None and old_unit == new_unit:
            existing["quantity"] = format_quantity(old_amount + new_amount, old_unit)
        else:
            # If we cannot combine reliably, keep one merged line and mark it
            if existing.get("quantity"):
                if "multiple recipe uses" not in existing["quantity"]:
                    existing["quantity"] = f"{existing['quantity']} (multiple recipe uses)"
            else:
                existing["quantity"] = "multiple recipe uses"

        # Prefer keeping a category if missing
        if not existing.get("category") and category:
            existing["category"] = category

    # 5. Clear prior planner-generated items for this list
    supabase.table("shopping_list_items").delete().eq("shopping_list_id", shopping_list_id).eq("source", "planner").execute()

    # 6. Insert merged items
    rows = []
    for item in merged.values():
        rows.append({
            "shopping_list_id": shopping_list_id,
            "item_name": item["item_name"],
            "normalized_name": item["normalized_name"],
            "quantity": item["quantity"],
            "category": item["category"],
            "is_checked": item["is_checked"],
            "source": item["source"],
            "recipe_id": item["recipe_id"],
            "occurrence_count": item["occurrence_count"],
            "source_recipe_titles": item["source_recipe_titles"],
        })

    if not rows:
        return []

    insert_response = supabase.table("shopping_list_items").insert(rows).execute()
    return insert_response.data or []
