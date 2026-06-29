"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type RecipeIngredient = {
  id?: string;
  item_name: string;
  quantity?: string;
  category?: string;
  is_optional?: boolean;
};

type FoodVaultItem = {
  id: string;
  name: string;
  brand?: string | null;
  serving_size?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

type Recipe = {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  servings?: number;
  prep_minutes?: number;
  cook_minutes?: number;
  is_favorite: boolean;
  source_type: string;
  ingredients?: RecipeIngredient[];
};

type NewRecipeForm = {
  title: string;
  description: string;
  instructions: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  is_favorite: boolean;
  ingredients: RecipeIngredient[];
};

const emptyIngredient = (): RecipeIngredient => ({
  item_name: "",
  quantity: "",
  category: "",
  is_optional: false,
});

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [foodItems, setFoodItems] = useState<FoodVaultItem[]>([]);
  const [selectedFoodItemId, setSelectedFoodItemId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<NewRecipeForm>({
    title: "",
    description: "",
    instructions: "",
    servings: "",
    prep_minutes: "",
    cook_minutes: "",
    is_favorite: false,
    ingredients: [emptyIngredient()],
  });

  async function loadRecipes() {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/recipes?user_id=john`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to load recipes.");
      }

      setRecipes(data.recipes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipes.");
    }
  }

  async function loadFoodVault() {
    try {
      const res = await fetch(`${API_BASE}/food-vault/items?user_id=john`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load Food Vault.");
      setFoodItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Food Vault.");
    }
  }

  useEffect(() => {
    loadRecipes();
    loadFoodVault();
  }, []);

  function updateForm<K extends keyof NewRecipeForm>(key: K, value: NewRecipeForm[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateIngredient(index: number, key: keyof RecipeIngredient, value: string | boolean) {
    setForm((prev) => {
      const updated = [...prev.ingredients];
      updated[index] = {
        ...updated[index],
        [key]: value,
      };
      return {
        ...prev,
        ingredients: updated,
      };
    });
  }

  function addIngredientRow() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, emptyIngredient()],
    }));
  }

  function removeIngredientRow(index: number) {
    setForm((prev) => ({
      ...prev,
      ingredients:
        prev.ingredients.length === 1
          ? [emptyIngredient()]
          : prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function addFoodVaultIngredient() {
    const item = foodItems.find((food) => food.id === selectedFoodItemId);
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          item_name: foodDisplayName(item),
          quantity: item.serving_size || "1 serving",
          category: "Food Vault",
          is_optional: false,
        },
      ],
    }));
    setSelectedFoodItemId("");
  }

  const macroTotals = calculateRecipeMacros(form.ingredients, foodItems);

  function resetForm() {
    setForm({
      title: "",
      description: "",
      instructions: "",
      servings: "",
      prep_minutes: "",
      cook_minutes: "",
      is_favorite: false,
      ingredients: [emptyIngredient()],
    });
  }

  async function createRecipe() {
    setError("");
    setMessage("");

    if (!form.title.trim()) {
      setError("Recipe title is required.");
      return;
    }

    const cleanedIngredients = form.ingredients
      .filter((item) => item.item_name.trim() !== "")
      .map((item) => ({
        item_name: item.item_name.trim(),
        quantity: item.quantity?.trim() || null,
        category: item.category?.trim() || null,
        is_optional: !!item.is_optional,
      }));

    setIsSaving(true);

    try {
      const payload = {
        user_id: "john",
        title: form.title.trim(),
        source_type: "manual",
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        servings: form.servings ? Number(form.servings) : null,
        prep_minutes: form.prep_minutes ? Number(form.prep_minutes) : null,
        cook_minutes: form.cook_minutes ? Number(form.cook_minutes) : null,
        is_favorite: form.is_favorite,
        ingredients: cleanedIngredients,
      };

      const res = await fetch(`${API_BASE}/recipes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to create recipe.");
      }

      setMessage(`Recipe created: ${data.recipe.title}`);
      resetForm();
      setShowCreateForm(false);
      await loadRecipes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    setError("");
    setMessage("");
    if (!window.confirm(`Delete ${recipe.title} from Recipe Vault?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/recipes/${recipe.id}`, {
        method: "DELETE",
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete recipe.");
      setMessage(`Recipe deleted: ${recipe.title}`);
      await loadRecipes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipe.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Food Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold">Recipe Vault</h1>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setError("");
                setMessage("");
              }}
              className="command-nav-link"
            >
              {showCreateForm ? "Close Form" : "Create Recipe"}
            </button>
              <Link
                href="/meal-planner"
                className="command-nav-link"
              >
                🗓️ Meal Planner
            </Link>
            <Link
        href="/shopping"
        className="command-nav-link"
        >
        🛒 Shopping Lists
        </Link>
            <Link
              href="/"
              className="command-nav-link"
            >
              Back to HUD
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            {message}
          </div>
        )}

        {showCreateForm && (
          <section className="mb-8 rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Create Recipe</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="Protein Oats"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  rows={2}
                  placeholder="Easy breakfast..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Instructions</label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => updateForm("instructions", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  rows={5}
                  placeholder="Cook oats, add protein..."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Servings</label>
                <input
                  type="number"
                  value={form.servings}
                  onChange={(e) => updateForm("servings", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Prep Minutes</label>
                <input
                  type="number"
                  value={form.prep_minutes}
                  onChange={(e) => updateForm("prep_minutes", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="5"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Cook Minutes</label>
                <input
                  type="number"
                  value={form.cook_minutes}
                  onChange={(e) => updateForm("cook_minutes", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="5"
                />
              </div>

              <div className="flex items-center gap-3 pt-8">
                <input
                  id="favorite"
                  type="checkbox"
                  checked={form.is_favorite}
                  onChange={(e) => updateForm("is_favorite", e.target.checked)}
                  className="h-5 w-5"
                />
                <label htmlFor="favorite" className="text-green-300/80">
                  Mark as favorite
                </label>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-semibold">Ingredients</h3>
                <button
                  onClick={addIngredientRow}
                  className="command-action-button command-action-green rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 text-green-100"
                >
                  Add Ingredient
                </button>
              </div>

              <div className="mb-4 grid gap-3 rounded-xl border border-green-500/20 bg-black p-4 md:grid-cols-[1fr_auto]">
                <select
                  value={selectedFoodItemId}
                  onChange={(e) => setSelectedFoodItemId(e.target.value)}
                  className="rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                >
                  <option value="">Add ingredient from Food Vault</option>
                  {foodItems.map((item) => (
                    <option key={item.id} value={item.id}>{foodDisplayName(item)}</option>
                  ))}
                </select>
                <button
                  onClick={addFoodVaultIngredient}
                  className="command-action-button border border-cyan-300/35 px-4 py-3 text-cyan-100"
                >
                  Add Food Item
                </button>
              </div>

              <div className="mb-4 grid gap-2 md:grid-cols-4">
                <Macro label="Calories" value={macroTotals.calories} unit="cal" />
                <Macro label="Protein" value={macroTotals.protein_g} unit="g" />
                <Macro label="Carbs" value={macroTotals.carbs_g} unit="g" />
                <Macro label="Fat" value={macroTotals.fat_g} unit="g" />
              </div>

              <div className="space-y-4">
                {form.ingredients.map((ingredient, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-xl border border-green-500/20 bg-black p-4 md:grid-cols-4"
                  >
                    <input
                      value={ingredient.item_name}
                      onChange={(e) => updateIngredient(index, "item_name", e.target.value)}
                      className="rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                      placeholder="Ingredient"
                    />

                    <input
                      value={ingredient.quantity || ""}
                      onChange={(e) => updateIngredient(index, "quantity", e.target.value)}
                      className="rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                      placeholder="1 cup"
                    />

                    <input
                      value={ingredient.category || ""}
                      onChange={(e) => updateIngredient(index, "category", e.target.value)}
                      className="rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                      placeholder="pantry"
                    />

                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-green-300/80">
                        <input
                          type="checkbox"
                          checked={!!ingredient.is_optional}
                          onChange={(e) => updateIngredient(index, "is_optional", e.target.checked)}
                          className="h-4 w-4"
                        />
                        Optional
                      </label>

                      <button
                        onClick={() => removeIngredientRow(index)}
                        className="rounded-lg border border-red-500/30 px-3 py-2 text-red-300 hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={createRecipe}
              disabled={isSaving}
              className="command-action-button command-action-green mt-6 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Recipe"}
            </button>
          </section>
        )}

        <div className="space-y-4">
          {recipes.length === 0 && (
            <div className="rounded-xl border border-green-500/20 bg-zinc-950 p-4">
              No recipes yet.
            </div>
          )}

          {recipes.map((recipe) => {
            const totals = calculateRecipeMacros(recipe.ingredients || [], foodItems);
            return (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="block rounded-xl border border-green-500/20 bg-zinc-950 p-4 transition hover:border-green-300/45 hover:bg-green-500/5 hover:shadow-[0_0_22px_rgba(34,197,94,0.16)]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{recipe.title}</h2>
                <div className="flex items-center gap-2">
                  {recipe.is_favorite && (
                    <span className="rounded-lg border border-green-500/30 px-3 py-1 text-sm">
                      Favorite
                    </span>
                  )}
                  <button
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteRecipe(recipe);
                    }}
                    className="command-action-button border border-red-400/30 bg-red-500/10 p-2 text-red-200"
                    aria-label={`Delete ${recipe.title}`}
                    title="Delete recipe"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <p className="mt-2 text-sm text-green-300/70">
                Source: {recipe.source_type}
              </p>

              {recipe.description && (
                <p className="mt-2 text-green-300/80">{recipe.description}</p>
              )}

              {(totals.calories > 0 || totals.protein_g > 0 || totals.carbs_g > 0 || totals.fat_g > 0) && (
                <div className="mt-4 grid gap-2 md:grid-cols-4">
                  <Macro label="Calories" value={totals.calories} unit="cal" />
                  <Macro label="Protein" value={totals.protein_g} unit="g" />
                  <Macro label="Carbs" value={totals.carbs_g} unit="g" />
                  <Macro label="Fat" value={totals.fat_g} unit="g" />
                </div>
              )}

              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm uppercase tracking-wide text-green-500/60">
                    Ingredients
                  </p>
                  <ul className="space-y-1 text-green-300/80">
                    {recipe.ingredients.map((ingredient, index) => (
                      <li key={ingredient.id || index}>
                        • {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                        {ingredient.item_name}
                        {ingredient.category ? ` (${ingredient.category})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function foodDisplayName(item: FoodVaultItem) {
  return [item.brand, item.name].filter(Boolean).join(" ");
}

function calculateRecipeMacros(ingredients: RecipeIngredient[], foodItems: FoodVaultItem[]) {
  return ingredients.reduce(
    (totals, ingredient) => {
      const food = findFoodItemForIngredient(ingredient.item_name, foodItems);
      if (!food) return totals;
      const quantity = parseServingQuantity(ingredient.quantity);
      totals.calories += Number(food.calories || 0) * quantity;
      totals.protein_g += Number(food.protein_g || 0) * quantity;
      totals.carbs_g += Number(food.carbs_g || 0) * quantity;
      totals.fat_g += Number(food.fat_g || 0) * quantity;
      return totals;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function findFoodItemForIngredient(name: string, foodItems: FoodVaultItem[]) {
  const normalized = normalizeFoodName(name);
  return foodItems.find((item) => {
    const display = normalizeFoodName(foodDisplayName(item));
    const itemName = normalizeFoodName(item.name);
    return display === normalized || itemName === normalized || display.includes(normalized) || normalized.includes(itemName);
  });
}

function normalizeFoodName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseServingQuantity(quantity?: string | null) {
  if (!quantity) return 1;
  const match = quantity.match(/^\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 1;
}

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-black px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-green-500/65">{label}</p>
      <p className="mt-1 font-semibold text-green-100">{Math.round(value * 10) / 10} {unit}</p>
    </div>
  );
}
