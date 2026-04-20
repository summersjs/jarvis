"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type RecipeIngredient = {
  id?: string;
  item_name: string;
  quantity?: string | null;
  category?: string | null;
  is_optional?: boolean;
};

type Recipe = {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  servings?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  is_favorite: boolean;
  source_type: string;
  source_url?: string | null;
  ingredients?: RecipeIngredient[];
};

const emptyIngredient = (): RecipeIngredient => ({
  item_name: "",
  quantity: "",
  category: "",
  is_optional: false,
});

export default function RecipeDetailPage() {
  const params = useParams();
  const recipeId = params.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    servings: "",
    prep_minutes: "",
    cook_minutes: "",
    is_favorite: false,
    ingredients: [emptyIngredient()] as RecipeIngredient[],
  });

  async function loadRecipe() {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/recipes/${recipeId}`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load recipe.");
      }

      const loadedRecipe = data.recipe as Recipe;
      setRecipe(loadedRecipe);

      setForm({
        title: loadedRecipe.title || "",
        description: loadedRecipe.description || "",
        instructions: loadedRecipe.instructions || "",
        servings: loadedRecipe.servings ? String(loadedRecipe.servings) : "",
        prep_minutes: loadedRecipe.prep_minutes ? String(loadedRecipe.prep_minutes) : "",
        cook_minutes: loadedRecipe.cook_minutes ? String(loadedRecipe.cook_minutes) : "",
        is_favorite: !!loadedRecipe.is_favorite,
        ingredients:
          loadedRecipe.ingredients && loadedRecipe.ingredients.length > 0
            ? loadedRecipe.ingredients.map((item) => ({
                item_name: item.item_name || "",
                quantity: item.quantity || "",
                category: item.category || "",
                is_optional: !!item.is_optional,
              }))
            : [emptyIngredient()],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipe.");
    }
  }

  useEffect(() => {
    if (recipeId) {
      loadRecipe();
    }
  }, [recipeId]);

  function updateFormField(
    key: "title" | "description" | "instructions" | "servings" | "prep_minutes" | "cook_minutes" | "is_favorite",
    value: string | boolean
  ) {
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

  async function saveRecipe() {
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
      const res = await fetch(`${API_BASE}/recipes/${recipeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          instructions: form.instructions.trim() || null,
          servings: form.servings ? Number(form.servings) : null,
          prep_minutes: form.prep_minutes ? Number(form.prep_minutes) : null,
          cook_minutes: form.cook_minutes ? Number(form.cook_minutes) : null,
          is_favorite: form.is_favorite,
          ingredients: cleanedIngredients,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update recipe.");
      }

      setMessage("Recipe updated.");
      setIsEditing(false);
      await loadRecipe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Food Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold">Recipe Detail</h1>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsEditing((prev) => !prev);
                setError("");
                setMessage("");
              }}
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
              {isEditing ? "Cancel Edit" : "Edit Recipe"}
            </button>

            <Link
              href="/recipes"
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
              Back to Recipe Vault
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

        {!recipe && !error && (
          <div className="rounded-xl border border-green-500/20 bg-zinc-950 p-4">
            Loading recipe...
          </div>
        )}

        {recipe && !isEditing && (
          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold">{recipe.title}</h2>
                <p className="mt-2 text-green-300/70">Source: {recipe.source_type}</p>
              </div>

              {recipe.is_favorite && (
                <span className="rounded-lg border border-green-500/30 px-3 py-1 text-sm">
                  Favorite
                </span>
              )}
            </div>

            {recipe.description && (
              <p className="mt-4 text-lg text-green-300/90">{recipe.description}</p>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-green-500/20 bg-black p-4">
                <p className="text-sm uppercase tracking-wide text-green-500/60">Servings</p>
                <p className="mt-2 text-xl font-semibold">{recipe.servings ?? "-"}</p>
              </div>

              <div className="rounded-xl border border-green-500/20 bg-black p-4">
                <p className="text-sm uppercase tracking-wide text-green-500/60">Prep</p>
                <p className="mt-2 text-xl font-semibold">
                  {recipe.prep_minutes ? `${recipe.prep_minutes} min` : "-"}
                </p>
              </div>

              <div className="rounded-xl border border-green-500/20 bg-black p-4">
                <p className="text-sm uppercase tracking-wide text-green-500/60">Cook</p>
                <p className="mt-2 text-xl font-semibold">
                  {recipe.cook_minutes ? `${recipe.cook_minutes} min` : "-"}
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-2xl font-semibold">Ingredients</h3>
              <div className="mt-4 space-y-3">
                {recipe.ingredients?.length ? (
                  recipe.ingredients.map((ingredient, index) => (
                    <div
                      key={ingredient.id || index}
                      className="rounded-xl border border-green-500/20 bg-black p-4"
                    >
                      <p className="font-semibold">
                        {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                        {ingredient.item_name}
                      </p>
                      <p className="mt-1 text-sm text-green-300/70">
                        {ingredient.category || "uncategorized"}
                        {ingredient.is_optional ? " · optional" : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-green-500/20 bg-black p-4">
                    No ingredients listed.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-2xl font-semibold">Instructions</h3>
              <div className="mt-4 rounded-xl border border-green-500/20 bg-black p-4 whitespace-pre-wrap text-green-300/90">
                {recipe.instructions || "No instructions yet."}
              </div>
            </div>
          </section>
        )}

        {recipe && isEditing && (
          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Edit Recipe</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => updateFormField("title", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateFormField("description", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  rows={2}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-green-300/80">Instructions</label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => updateFormField("instructions", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  rows={5}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Servings</label>
                <input
                  type="number"
                  value={form.servings}
                  onChange={(e) => updateFormField("servings", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Prep Minutes</label>
                <input
                  type="number"
                  value={form.prep_minutes}
                  onChange={(e) => updateFormField("prep_minutes", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-green-300/80">Cook Minutes</label>
                <input
                  type="number"
                  value={form.cook_minutes}
                  onChange={(e) => updateFormField("cook_minutes", e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </div>

              <div className="flex items-center gap-3 pt-8">
                <input
                  id="favorite"
                  type="checkbox"
                  checked={form.is_favorite}
                  onChange={(e) => updateFormField("is_favorite", e.target.checked)}
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
              onClick={saveRecipe}
              disabled={isSaving}
              className="mt-6 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}