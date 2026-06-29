"use client";

import Link from "next/link";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { ClipboardList, DollarSign, ShoppingCart, Utensils, Wallet } from "lucide-react";

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
  meal_source?: string | null;
  estimated_cost?: number | null;
  vendor?: string | null;
  recipes?: {
    id: string;
    title: string;
    description?: string;
    is_favorite?: boolean;
  } | null;
};

type FinanceSummary = {
  weekly_food_budget: {
    monthly_grocery_budget: number;
    monthly_eating_out_budget: number;
    weekly_grocery_target: number;
    weekly_eating_out_target: number;
    weekly_total_food_target: number;
    actual_grocery_spend_this_week: number;
    actual_eating_out_spend_this_week: number;
    total_actual_food_spend_this_week: number;
    over_under_amount: number;
  };
  dashboard_cards: {
    food_budget_remaining_week: number;
    eating_out_budget_remaining_week: number;
    total_food_over_under: number;
    spending_status: string;
  };
};

type MealMeta = {
  source: string;
  estimated_cost: number | null;
  vendor: string | null;
  note: string | null;
  count_toward_eating_out: boolean;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  completed?: boolean;
  completed_at?: string | null;
};

export default function MealPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [mealDate, setMealDate] = useState("");
  const [mealType, setMealType] = useState("breakfast");
  const [mealSource, setMealSource] = useState("recipe");
  const [recipeId, setRecipeId] = useState("");
  const [customMealName, setCustomMealName] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

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

  const loadRecipes = useCallback(async () => {
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
  }, []);

  const loadWeekPlan = useCallback(async () => {
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
  }, []);

  const loadFinanceSummary = useCallback(async () => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const res = await fetch(`${API_BASE}/finance/ops?user_id=john&month=${month}`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load finance summary.");
      setFinanceSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance summary.");
    }
  }, []);

  async function createEntry() {
    setError("");
    setMessage("");

    if (!mealDate) {
      setError("Pick a meal date.");
      return;
    }

    if (mealSource === "recipe" && !recipeId && !customMealName.trim()) {
      setError("Choose a recipe or enter a custom meal name.");
      return;
    }

    try {
      const mealName =
        customMealName.trim() ||
        recipes.find((recipe) => recipe.id === recipeId)?.title ||
        getMealSourceLabel(mealSource);
      const meta: MealMeta = {
        source: mealSource,
        estimated_cost: estimatedCost ? Number(estimatedCost) : null,
        vendor: vendor.trim() || null,
        note: notes.trim() || null,
        count_toward_eating_out: mealSource === "eat_out",
        calories: numberOrNull(calories),
        protein_g: numberOrNull(protein),
        carbs_g: numberOrNull(carbs),
        fat_g: numberOrNull(fat),
        completed: false,
        completed_at: null,
      };

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
          recipe_id: mealSource === "recipe" ? recipeId || null : null,
          custom_meal_name: mealName,
          notes: buildMealNotes(meta),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create meal plan entry.");

      setMessage("Meal plan entry created.");
      setMealDate("");
      setMealType("breakfast");
      setMealSource("recipe");
      setRecipeId("");
      setCustomMealName("");
      setEstimatedCost("");
      setVendor("");
      setNotes("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");

      await loadWeekPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry.");
    }
  }

  async function markMealCompleted(entry: MealPlanEntry) {
    setError("");
    setMessage("");
    const meta = getMealMeta(entry);
    try {
      const res = await fetch(`${API_BASE}/meal-planner/${entry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          notes: buildMealNotes({
            ...meta,
            completed: true,
            completed_at: new Date().toISOString(),
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to mark meal completed.");
      setMessage("Meal marked eaten. Health Ops will pick this up automatically.");
      await loadWeekPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark meal completed.");
    }
  }

  async function reopenMeal(entry: MealPlanEntry) {
    setError("");
    setMessage("");
    const meta = getMealMeta(entry);
    try {
      const res = await fetch(`${API_BASE}/meal-planner/${entry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          notes: buildMealNotes({
            ...meta,
            completed: false,
            completed_at: null,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to reopen meal.");
      setMessage("Meal reopened.");
      await loadWeekPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen meal.");
    }
  }

  function useYogurtCorePowerPreset() {
    const today = new Date().toISOString().split("T")[0];
    setMealDate(today);
    setMealType("snack");
    setMealSource("leftovers");
    setRecipeId("");
    setCustomMealName("Yogurt + Core Power");
    setCalories("320");
    setProtein("42");
    setCarbs("32");
    setFat("4");
    setNotes("Quick logged food. Macro estimates are editable.");
  }

  useEffect(() => {
    loadRecipes();
    loadWeekPlan();
    loadFinanceSummary();
  }, [loadFinanceSummary, loadRecipes, loadWeekPlan]);

  const estimatedCosts = calculateEstimatedFoodCosts(entries);
  const weeklyTarget = financeSummary?.weekly_food_budget.weekly_total_food_target || 0;
  const estimatedTotal = estimatedCosts.groceries + estimatedCosts.eatingOut;
  const estimatedOverUnder = weeklyTarget - estimatedTotal;

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
              className="command-nav-link"
            >
              Recipe Vault
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
            <Link href="/finance-ops" className="command-nav-link">
              Finance Ops
            </Link>
          </div>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-5">
          <SummaryCard
            icon={Wallet}
            label="Weekly grocery budget"
            value={`$${formatMoney(financeSummary?.weekly_food_budget.weekly_grocery_target || 0)}`}
          />
          <SummaryCard
            icon={ShoppingCart}
            label="Weekly eating out budget"
            value={`$${formatMoney(financeSummary?.weekly_food_budget.weekly_eating_out_target || 0)}`}
          />
          <SummaryCard
            icon={Utensils}
            label="Estimated grocery cost"
            value={`$${formatMoney(estimatedCosts.groceries)}`}
          />
          <SummaryCard
            icon={DollarSign}
            label="Estimated eat out cost"
            value={`$${formatMoney(estimatedCosts.eatingOut)}`}
          />
          <SummaryCard
            icon={ClipboardList}
            label="Over / under"
            value={`$${formatMoney(estimatedOverUnder)}`}
          />
        </section>

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-green-500/65">Food Intake</p>
              <h2 className="mt-1 text-2xl font-semibold">Add Meal</h2>
            </div>
            <button
              onClick={useYogurtCorePowerPreset}
              className="command-action-button command-action-green border border-green-400/40 bg-green-400/10 px-4 py-3 text-green-100"
            >
              Yogurt + Core Power
            </button>
          </div>

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
              <label className="mb-2 block text-sm text-green-300/80">Meal Source</label>
              <select
                value={mealSource}
                onChange={(e) => setMealSource(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              >
                <option value="recipe">Recipe Vault Meal</option>
                <option value="leftovers">Leftovers</option>
                <option value="eat_out">Eat Out</option>
                <option value="skip">Skip</option>
                <option value="event_family_meal">Event / Family Meal</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Recipe</label>
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                disabled={mealSource !== "recipe"}
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

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Estimated Cost</label>
              <input
                type="number"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="12.50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Restaurant / Vendor</label>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Chipotle"
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

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Calories</label>
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="320"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Protein g</label>
              <input
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="42"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Carbs g</label>
              <input
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="32"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Fat g</label>
              <input
                type="number"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="4"
              />
            </div>
          </div>

          <button
            onClick={createEntry}
            className="command-action-button command-action-green mt-4 w-full border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
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

            {entries.map((entry) => {
              const meta = getMealMeta(entry);
              return (
              <div
                key={entry.id}
                className={`rounded-xl border p-4 transition ${
                  meta.completed
                    ? "border-green-300/45 bg-green-400/10 shadow-[0_0_18px_rgba(34,197,94,0.14)]"
                    : "border-green-500/20 bg-black"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {entry.meal_date} — {entry.meal_type} — {getMealSourceLabel(meta.source)}
                    </p>

                    <p className="mt-2 text-green-300/80">
                      {entry.recipes?.title || entry.custom_meal_name || "Unnamed meal"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                    meta.completed ? "border-green-300/45 bg-green-300/10 text-green-100" : "border-cyan-300/30 text-cyan-100"
                  }`}>
                    {meta.completed ? "Eaten" : "Planned"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-green-300/65">
                  {entry.estimated_cost ? `$${formatMoney(entry.estimated_cost)}` : meta.estimated_cost ? `$${formatMoney(meta.estimated_cost || 0)}` : "No cost set"}
                  {entry.vendor || meta.vendor ? ` · ${entry.vendor || meta.vendor}` : ""}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <MacroChip label="Calories" value={meta.calories} unit="cal" />
                  <MacroChip label="Protein" value={meta.protein_g} unit="g" />
                  <MacroChip label="Carbs" value={meta.carbs_g} unit="g" />
                  <MacroChip label="Fat" value={meta.fat_g} unit="g" />
                </div>

                {entry.notes && (
                  <p className="mt-2 text-sm text-green-300/70">{parseMealNote(entry.notes)}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {meta.completed ? (
                    <button
                      onClick={() => reopenMeal(entry)}
                      className="command-action-button border border-cyan-300/35 px-4 py-2 text-sm text-cyan-100"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => markMealCompleted(entry)}
                      className="command-action-button command-action-green border border-green-400/40 bg-green-400/10 px-4 py-2 text-sm text-green-100"
                    >
                      I Ate This
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-green-500/20 bg-zinc-950 p-5">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-green-300" />
        <p className="text-xs uppercase tracking-[0.25em] text-green-500/70">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-green-100">{value}</p>
    </div>
  );
}

function buildMealNotes(meta: MealMeta) {
  return `JARVIS_META:${JSON.stringify(meta)}`;
}

function parseMealMeta(notes?: string | null) {
  if (!notes || !notes.startsWith("JARVIS_META:")) return null;
  try {
    return JSON.parse(notes.replace("JARVIS_META:", "")) as MealMeta;
  } catch {
    return null;
  }
}

function parseMealNote(notes?: string | null) {
  const meta = parseMealMeta(notes);
  if (!meta) return notes || "";
  return [
    meta.note,
    meta.source === "eat_out" ? "Counts toward eating out budget." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getMealMeta(entry: MealPlanEntry): MealMeta {
  return parseMealMeta(entry.notes) || {
    source: entry.meal_source || "recipe",
    estimated_cost: entry.estimated_cost ?? null,
    vendor: entry.vendor ?? null,
    note: entry.notes || null,
    count_toward_eating_out: (entry.meal_source || "recipe") === "eat_out",
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    completed: false,
    completed_at: null,
  };
}

function MacroChip({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-zinc-950 px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-green-500/65">{label}</p>
      <p className="mt-1 font-semibold text-green-100">{value || value === 0 ? `${value} ${unit}` : "Not set"}</p>
    </div>
  );
}

function getMealSourceLabel(source?: string) {
  if (source === "recipe") return "Recipe Vault Meal";
  if (source === "leftovers") return "Leftovers";
  if (source === "eat_out") return "Eat Out";
  if (source === "skip") return "Skip";
  if (source === "event_family_meal") return "Event / Family Meal";
  return "Recipe Vault Meal";
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function calculateEstimatedFoodCosts(entries: MealPlanEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      const meta = parseMealMeta(entry.notes) || {
        source: entry.meal_source || "recipe",
        estimated_cost: entry.estimated_cost ?? null,
        vendor: entry.vendor ?? null,
        note: null,
        count_toward_eating_out: (entry.meal_source || "recipe") === "eat_out",
      };
      const cost = Number(meta.estimated_cost || entry.estimated_cost || 0);
      const source = meta.source || entry.meal_source || "recipe";
      if (source === "eat_out") {
        totals.eatingOut += cost;
      } else if (source === "recipe" || source === "leftovers" || source === "event_family_meal") {
        totals.groceries += cost;
      }
      return totals;
    },
    { groceries: 0, eatingOut: 0 }
  );
}
