"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type Recipe = {
  id: string;
  title: string;
  description?: string;
  is_favorite: boolean;
  source_type: string;
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");

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

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Food Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold">Recipe Vault</h1>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
          >
            Back to HUD
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
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
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}