"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type RecipeIngredient = {
  id: string;
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

export default function RecipeDetailPage() {
  const params = useParams();
  const recipeId = params.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");

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

      setRecipe(data.recipe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipe.");
    }
  }

  useEffect(() => {
    if (recipeId) {
      loadRecipe();
    }
  }, [recipeId]);

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

        {!recipe && !error && (
          <div className="rounded-xl border border-green-500/20 bg-zinc-950 p-4">
            Loading recipe...
          </div>
        )}

        {recipe && (
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
                  recipe.ingredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
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

            <div className="mt-6 flex gap-3">
              <button
                className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 opacity-60"
                disabled
              >
                Edit Recipe (next)
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}