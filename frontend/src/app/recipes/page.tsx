"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Eye, PlusCircle, Utensils, X } from "lucide-react";

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
  estimated_price?: number | null;
  package_quantity?: number | null;
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

      setRecipes(sortRecipesByTitle(data.recipes || []));
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
      setFoodItems(sortFoodItemsByName(data.items || []));
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
            <p className="section-label">Recipe Intelligence Archive</p>
            <h1 className="mt-2 text-4xl font-bold">Recipe Vault</h1>
            <p className="mt-3 text-green-300/75">Structured meals, ingredients, macros, and repeatable food protocols.</p>
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
              href="/food-vault"
              className="command-nav-link"
            >
              Food Vault
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
              Command Center
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
          <section className="hud-panel mb-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon"><PlusCircle className="h-5 w-5" /></div>
              <h2 className="hud-panel-title">Create Recipe Protocol</h2>
            </div>

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

            <div className="mt-8 rounded-xl border border-green-500/20 bg-black/40 p-4">
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
                  {sortFoodItemsByName(foodItems).map((item) => (
                    <option key={item.id} value={item.id}>{foodDisplayName(item)}</option>
                  ))}
                </select>
                <button
                  onClick={addFoodVaultIngredient}
                  className="command-action-button command-action-cyan border border-cyan-300/35 px-4 py-3 text-cyan-100"
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
                        className="command-action-button border border-red-500/30 px-3 py-2 text-red-300"
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

        {isSaving && <JarvisRecipeSaveOverlay label="Saving Recipe Vault Entry" />}

        <section className="hud-panel">
          <div className="mb-5 flex items-center gap-3">
            <div className="hud-panel-icon"><BookOpen className="h-5 w-5" /></div>
            <h2 className="hud-panel-title">Stored Meal Protocols</h2>
          </div>
          <div className="space-y-4">
          {recipes.length === 0 && (
            <div className="hud-row">
              No recipes yet.
            </div>
          )}

          {sortRecipesByTitle(recipes).map((recipe) => {
            const totals = calculateRecipeMacros(recipe.ingredients || [], foodItems);
            return (
              <article
                key={recipe.id}
                className="jarvis-card jarvis-card-cyan p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold leading-tight text-green-50">{recipe.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-green-300/80">
                      {recipe.description || "Stored meal protocol."}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-cyan-200/75">
                      Source: {recipe.source_type} · {recipe.servings || 1} serving{(recipe.servings || 1) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                  {recipe.is_favorite && (
                    <span className="rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.14em] text-amber-100">
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

              {(totals.calories > 0 || totals.protein_g > 0 || totals.carbs_g > 0 || totals.fat_g > 0) && (
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <Macro label="Calories" value={perServing(totals.calories, recipe.servings)} unit="cal" />
                  <Macro label="Protein" value={perServing(totals.protein_g, recipe.servings)} unit="g" />
                  <Macro label="Carbs" value={perServing(totals.carbs_g, recipe.servings)} unit="g" />
                  <Macro label="Fat" value={perServing(totals.fat_g, recipe.servings)} unit="g" />
                </div>
              )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-green-500/15 pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-green-500/65">
                      {recipe.ingredients?.length || 0} ingredient{(recipe.ingredients?.length || 0) === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-green-200/80">{ingredientPreview(recipe.ingredients || [])}</p>
                    {estimateRecipeCost(recipe.ingredients || [], foodItems) != null && (
                      <p className="mt-1 text-xs text-cyan-200/70">
                        Est. cost: ${estimateRecipeCost(recipe.ingredients || [], foodItems)?.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/recipes/${recipe.id}`} className="command-action-button command-action-cyan border border-cyan-300/35 px-3 py-2 text-xs uppercase tracking-[0.14em] text-cyan-100">
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                    <Link href="/meal-planner" className="command-action-button command-action-green border border-green-400/35 bg-green-400/10 px-3 py-2 text-xs uppercase tracking-[0.14em] text-green-100">
                      <Utensils className="mr-2 h-4 w-4" />
                      Add to Meal Planner
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
          </div>
        </section>
      </div>
    </main>
  );
}

function JarvisRecipeSaveOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
      <div className="grid w-full max-w-md justify-items-center rounded-3xl border border-cyan-300/35 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_35%),linear-gradient(145deg,rgba(3,10,8,0.98),rgba(5,18,15,0.96))] p-8 text-center shadow-[0_0_70px_rgba(34,211,238,0.22)]">
        <span className="h-20 w-20 animate-spin rounded-full border-4 border-green-400/20 border-l-cyan-300 border-t-green-300 shadow-[0_0_34px_rgba(34,211,238,0.24)]" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-cyan-200">{label}</p>
        <strong className="mt-2 text-xl text-green-50">Updating Recipe Vault systems...</strong>
      </div>
    </div>
  );
}

function foodDisplayName(item: FoodVaultItem) {
  return [item.brand, item.name].filter(Boolean).join(" ");
}

function sortRecipesByTitle(items: Recipe[]) {
  return [...items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

function sortFoodItemsByName(items: FoodVaultItem[]) {
  return [...items].sort((a, b) => foodDisplayName(a).localeCompare(foodDisplayName(b), undefined, { sensitivity: "base" }));
}

function ingredientPreview(ingredients: RecipeIngredient[]) {
  if (!ingredients.length) return "No ingredients listed";
  const firstTwo = ingredients.slice(0, 2).map((ingredient) => ingredient.item_name);
  const remaining = ingredients.length - firstTwo.length;
  return `${firstTwo.join(", ")}${remaining > 0 ? ` +${remaining} more` : ""}`;
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

function estimateRecipeCost(ingredients: RecipeIngredient[], foodItems: FoodVaultItem[]) {
  const total = ingredients.reduce((sum, ingredient) => {
    const food = findFoodItemForIngredient(ingredient.item_name, foodItems);
    if (!food?.estimated_price) return sum;
    const packageQuantity = Number(food.package_quantity || 1);
    const quantity = parseServingQuantity(ingredient.quantity);
    return sum + (Number(food.estimated_price) / packageQuantity) * quantity;
  }, 0);
  return total > 0 ? Math.round(total * 100) / 100 : null;
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
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 transition hover:border-cyan-300/45 hover:shadow-[0_0_16px_rgba(34,211,238,0.16)]">
      <p className="text-[0.72rem] uppercase tracking-[0.14em] text-cyan-200/70">{label}</p>
      <p className="mt-1 text-base font-semibold text-green-50">{Math.round(value * 10) / 10} {unit}</p>
    </div>
  );
}

function perServing(value: number, servings?: number | null) {
  return Math.round((value / Number(servings || 1)) * 10) / 10;
}
