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
};

type MealPlanEntry = {
  id: string;
  meal_date: string;
  meal_type: string;
  custom_meal_name?: string | null;
  notes?: string | null;
  recipes?: {
    id: string;
    title: string;
    description?: string;
    is_favorite?: boolean;
  } | null;
};

export default function MealPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [mealDate, setMealDate] = useState("");
  const [mealType, setMealType] = useState("breakfast");
  const [recipeId, setRecipeId] = useState("");
  const [customMealName, setCustomMealName] = useState("");
  const [notes, setNotes] = useState("");

  function getWeekRange() {
    const today = new Date();
    const day = today.getDay(); // Sun=0
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const start = new Date(today);
    start.setDate(today.getDate() + diffToMonday);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    return { startStr, endStr };
  }

  async function loadRecipes() {
    try {
      const res = await fetch(`${API_BASE}/recipes?user_id=john`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load recipes.");

      setRecipes(data.recipes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipes.");
    }
  }

  async function loadWeekPlan() {
    try {
      const { startStr, endStr } = getWeekRange();

      const res = await fetch(
        `${API_BASE}/meal-planner?user_id=john&start_date=${startStr}&end_date=${endStr}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load meal plan.");

      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meal plan.");
    }
  }

  async function createEntry() {
    setError("");
    setMessage("");

    if (!mealDate) {
      setError("Pick a meal date.");
      return;
    }

    if (!recipeId && !customMealName.trim()) {
      setError("Choose a recipe or enter a custom meal name.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/meal-planner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: "john",
          meal_date: mealDate,
          meal_type: mealType,
          recipe_id: recipeId || null,
          custom_meal_name: customMealName.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create meal plan entry.");

      setMessage("Meal plan entry created.");
      setMealDate("");
      setMealType("breakfast");
      setRecipeId("");
      setCustomMealName("");
      setNotes("");

      await loadWeekPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry.");
    }
  }

  useEffect(() => {
    loadRecipes();
    loadWeekPlan();
  }, []);

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Food Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold">Meal Planner</h1>
          </div>

          <div className="flex gap-3">
            <Link
              href="/recipes"
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
              Recipe Vault
            </Link>
            <Link
            href="/shopping"
            className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
            🛒 Shopping Lists
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

        <section className="mb-8 rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Add Meal</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-green-300/80">Meal Date</label>
              <input
                type="date"
                value={mealDate}
                onChange={(e) => setMealDate(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Meal Type</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Recipe</label>
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              >
                <option value="">-- Choose Recipe --</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Custom Meal Name</label>
              <input
                value={customMealName}
                onChange={(e) => setCustomMealName(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Optional if not using a recipe"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-green-300/80">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                rows={3}
                placeholder="Prep ahead, post-workout meal, etc."
              />
            </div>
          </div>

          <button
            onClick={createEntry}
            className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
          >
            Save Meal Plan Entry
          </button>
        </section>

        <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
          <h2 className="mb-4 text-2xl font-semibold">This Week</h2>

          <div className="space-y-4">
            {entries.length === 0 && (
              <div className="rounded-xl border border-green-500/20 bg-black p-4">
                No meals planned yet.
              </div>
            )}

            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-green-500/20 bg-black p-4"
              >
                <p className="font-semibold">
                  {entry.meal_date} — {entry.meal_type}
                </p>

                <p className="mt-2 text-green-300/80">
                  {entry.recipes?.title || entry.custom_meal_name || "Unnamed meal"}
                </p>

                {entry.notes && (
                  <p className="mt-2 text-sm text-green-300/70">{entry.notes}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}