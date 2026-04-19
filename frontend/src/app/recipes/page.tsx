"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    loadRecipes();
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
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
              {showCreateForm ? "Close Form" : "Create Recipe"}
            </button>
              <Link
                href="/meal-planner"
                className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
              >
                🗓️ Meal Planner
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
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
                  className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
                >
                  Add Ingredient
                </button>
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
              className="mt-6 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition disabled:opacity-50"
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

          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-xl border border-green-500/20 bg-zinc-950 p-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{recipe.title}</h2>
                {recipe.is_favorite && (
                  <span className="rounded-lg border border-green-500/30 px-3 py-1 text-sm">
                    Favorite
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-green-300/70">
                Source: {recipe.source_type}
              </p>

              {recipe.description && (
                <p className="mt-2 text-green-300/80">{recipe.description}</p>
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
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}