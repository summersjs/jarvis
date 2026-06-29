"use client";

import Link from "next/link";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { ClipboardList, DollarSign, ShoppingCart, Utensils, Wallet, X } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type Recipe = {
  id: string;
  title: string;
  ingredients?: RecipeIngredient[];
};

type RecipeIngredient = {
  id?: string;
  item_name: string;
  quantity?: string | null;
  category?: string | null;
  is_optional?: boolean;
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

type FoodVaultItem = {
  id: string;
  name: string;
  brand?: string | null;
  serving_size?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  package_quantity?: number | null;
  current_quantity?: number | null;
  low_stock_threshold?: number | null;
  estimated_price?: number | null;
  default_store?: string | null;
  shopping_category?: string | null;
  notes?: string | null;
  is_favorite?: boolean;
};

type NutritionTargets = {
  daily_calorie_target?: number | null;
  daily_protein_target?: number | null;
  daily_carb_target?: number | null;
  daily_fat_target?: number | null;
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
  food_vault_item_id?: string | null;
  servings?: number | null;
  save_to_food_vault?: boolean;
};

export default function MealPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [foodItems, setFoodItems] = useState<FoodVaultItem[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [nutritionTargets, setNutritionTargets] = useState<NutritionTargets | null>(null);
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
  const [foodVaultItemId, setFoodVaultItemId] = useState("");
  const [servings, setServings] = useState("1");
  const [saveToFoodVault, setSaveToFoodVault] = useState(false);

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

  const loadFoodVault = useCallback(async () => {
    try {
      const [itemsRes, targetsRes] = await Promise.all([
        fetch(`${API_BASE}/food-vault/items?user_id=john`, { headers: { "x-api-key": API_KEY } }),
        fetch(`${API_BASE}/food-vault/nutrition-targets?user_id=john`, { headers: { "x-api-key": API_KEY } }),
      ]);
      const itemsData = await itemsRes.json();
      const targetsData = await targetsRes.json();
      if (!itemsRes.ok) throw new Error(itemsData.detail || "Failed to load Food Vault.");
      if (!targetsRes.ok) throw new Error(targetsData.detail || "Failed to load nutrition targets.");
      setFoodItems(itemsData.items || []);
      setNutritionTargets(targetsData.targets || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Food Vault.");
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
    if (mealSource === "food_vault" && !foodVaultItemId) {
      setError("Choose a Food Vault item.");
      return;
    }

    try {
      const selectedFood = foodItems.find((item) => item.id === foodVaultItemId);
      const mealName =
        customMealName.trim() ||
        (selectedFood ? foodDisplayName(selectedFood) : "") ||
        recipes.find((recipe) => recipe.id === recipeId)?.title ||
        getMealSourceLabel(mealSource);
      const servingCount = numberOrNull(servings) || 1;
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
        food_vault_item_id: selectedFood?.id || null,
        servings: servingCount,
        save_to_food_vault: saveToFoodVault,
      };

      if (saveToFoodVault && mealSource === "custom" && customMealName.trim()) {
        await createFoodVaultFromCustom(mealName);
      }

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
      setFoodVaultItemId("");
      setServings("1");
      setSaveToFoodVault(false);

      await loadWeekPlan();
      await loadFoodVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry.");
    }
  }

  async function markMealCompleted(entry: MealPlanEntry) {
    setError("");
    setMessage("");
    const meta = getMealMeta(entry);
    try {
      if (meta.source === "food_vault" && meta.food_vault_item_id && !meta.completed) {
        await consumeFoodVaultItem(meta.food_vault_item_id, meta.servings || 1);
      }
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
      await loadFoodVault();
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

  async function deleteMeal(entry: MealPlanEntry) {
    setError("");
    setMessage("");
    const mealName = entry.recipes?.title || entry.custom_meal_name || "this meal";
    if (!window.confirm(`Delete ${mealName} from the meal planner?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/meal-planner/${entry.id}`, {
        method: "DELETE",
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete meal.");
      setMessage("Meal plan entry deleted.");
      await loadWeekPlan();
      await loadFinanceSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete meal.");
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

  async function consumeFoodVaultItem(itemId: string, quantity: number) {
    const res = await fetch(`${API_BASE}/food-vault/items/${itemId}/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ quantity }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to update Food Vault inventory.");
  }

  async function createFoodVaultFromCustom(mealName: string) {
    const res = await fetch(`${API_BASE}/food-vault/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: "john",
        name: mealName,
        serving_size: "1 serving",
        calories: numberOrNull(calories),
        protein_g: numberOrNull(protein),
        carbs_g: numberOrNull(carbs),
        fat_g: numberOrNull(fat),
        package_quantity: 1,
        current_quantity: 0,
        low_stock_threshold: 0,
        estimated_price: numberOrNull(estimatedCost),
        shopping_category: "Food Vault",
        notes: notes.trim() || null,
        is_favorite: false,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to save custom food to Food Vault.");
  }

  function selectFoodVaultItem(itemId: string) {
    setFoodVaultItemId(itemId);
    const item = foodItems.find((food) => food.id === itemId);
    if (!item) return;
    setCustomMealName(foodDisplayName(item));
    setEstimatedCost(item.estimated_price ? String(item.estimated_price) : "");
    setCalories(item.calories ? String(item.calories) : "");
    setProtein(item.protein_g ? String(item.protein_g) : "");
    setCarbs(item.carbs_g ? String(item.carbs_g) : "");
    setFat(item.fat_g ? String(item.fat_g) : "");
  }

  function selectRecipe(recipeIdValue: string) {
    setRecipeId(recipeIdValue);
    const recipe = recipes.find((item) => item.id === recipeIdValue);
    if (!recipe) return;
    const totals = calculateRecipeMacros(recipe.ingredients || [], foodItems);
    setCustomMealName(recipe.title);
    setCalories(totals.calories ? String(totals.calories) : "");
    setProtein(totals.protein_g ? String(totals.protein_g) : "");
    setCarbs(totals.carbs_g ? String(totals.carbs_g) : "");
    setFat(totals.fat_g ? String(totals.fat_g) : "");
    setServings("1");
  }

  useEffect(() => {
    loadRecipes();
    loadFoodVault();
    loadWeekPlan();
    loadFinanceSummary();
  }, [loadFinanceSummary, loadFoodVault, loadRecipes, loadWeekPlan]);

  const estimatedCosts = calculateEstimatedFoodCosts(entries);
  const weeklyTarget = financeSummary?.weekly_food_budget.weekly_total_food_target || 0;
  const estimatedTotal = estimatedCosts.groceries + estimatedCosts.eatingOut;
  const estimatedOverUnder = weeklyTarget - estimatedTotal;
  const todayNutrition = calculateTodayNutrition(entries);

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
            <Link href="/food-vault" className="command-nav-link">
              Food Vault
            </Link>
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

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <SummaryCard icon={Utensils} label="Calories today" value={`${todayNutrition.calories} / ${targetValue(nutritionTargets?.daily_calorie_target)}`} />
          <SummaryCard icon={Utensils} label="Protein today" value={`${todayNutrition.protein_g}g / ${targetValue(nutritionTargets?.daily_protein_target, "g")}`} />
          <SummaryCard icon={Utensils} label="Carbs today" value={`${todayNutrition.carbs_g}g / ${targetValue(nutritionTargets?.daily_carb_target, "g")}`} />
          <SummaryCard icon={Utensils} label="Fat today" value={`${todayNutrition.fat_g}g / ${targetValue(nutritionTargets?.daily_fat_target, "g")}`} />
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
                <option value="food_vault">Food Vault Item</option>
                <option value="leftovers">Leftovers</option>
                <option value="eat_out">Eat Out</option>
                <option value="skip">Skip</option>
                <option value="event_family_meal">Event / Family Meal</option>
                <option value="custom">Custom Meal</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Recipe</label>
              <select
                value={recipeId}
                onChange={(e) => selectRecipe(e.target.value)}
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

            {mealSource === "food_vault" && (
              <>
                <div>
                  <label className="mb-2 block text-sm text-green-300/80">Food Vault Item</label>
                  <select
                    value={foodVaultItemId}
                    onChange={(e) => selectFoodVaultItem(e.target.value)}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  >
                    <option value="">-- Choose Food --</option>
                    {foodItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {foodDisplayName(item)} ({item.current_quantity ?? 0} left)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-green-300/80">Servings / Quantity Eaten</label>
                  <input
                    type="number"
                    step="0.25"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Custom Meal Name</label>
              <input
                value={customMealName}
                onChange={(e) => setCustomMealName(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Optional if not using a recipe"
              />
            </div>

            {mealSource === "custom" && (
              <button
                onClick={() => setSaveToFoodVault((prev) => !prev)}
                className={`command-action-button rounded-xl border px-4 py-3 text-left ${
                  saveToFoodVault ? "border-green-300/60 bg-green-400/15 text-green-100" : "border-green-500/30 text-green-300"
                }`}
              >
                Save to Food Vault: {saveToFoodVault ? "Yes" : "No"}
              </button>
            )}

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
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                      meta.completed ? "border-green-300/45 bg-green-300/10 text-green-100" : "border-cyan-300/30 text-cyan-100"
                    }`}>
                      {meta.completed ? "Eaten" : "Planned"}
                    </span>
                    <button
                      onClick={() => deleteMeal(entry)}
                      className="command-action-button border border-red-400/30 bg-red-500/10 p-2 text-red-200"
                      aria-label={`Delete ${entry.recipes?.title || entry.custom_meal_name || "meal"}`}
                      title="Delete meal"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-1 text-sm text-green-300/65">
                  {entry.estimated_cost ? `$${formatMoney(entry.estimated_cost)}` : meta.estimated_cost ? `$${formatMoney(meta.estimated_cost || 0)}` : "No cost set"}
                  {entry.vendor || meta.vendor ? ` · ${entry.vendor || meta.vendor}` : ""}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <MacroChip label="Calories" value={macroTotal(meta.calories, meta.servings)} unit="cal" />
                  <MacroChip label="Protein" value={macroTotal(meta.protein_g, meta.servings)} unit="g" />
                  <MacroChip label="Carbs" value={macroTotal(meta.carbs_g, meta.servings)} unit="g" />
                  <MacroChip label="Fat" value={macroTotal(meta.fat_g, meta.servings)} unit="g" />
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
    food_vault_item_id: null,
    servings: 1,
    save_to_food_vault: false,
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
  if (source === "food_vault") return "Food Vault Item";
  if (source === "leftovers") return "Leftovers";
  if (source === "eat_out") return "Eat Out";
  if (source === "skip") return "Skip";
  if (source === "event_family_meal") return "Event / Family Meal";
  if (source === "custom") return "Custom Meal";
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

function foodDisplayName(item: FoodVaultItem) {
  return [item.brand, item.name].filter(Boolean).join(" ");
}

function calculateRecipeMacros(ingredients: RecipeIngredient[], foodItems: FoodVaultItem[]) {
  const totals = ingredients.reduce(
    (acc, ingredient) => {
      const food = findFoodItemForIngredient(ingredient.item_name, foodItems);
      if (!food) return acc;
      const quantity = parseServingQuantity(ingredient.quantity);
      acc.calories += Number(food.calories || 0) * quantity;
      acc.protein_g += Number(food.protein_g || 0) * quantity;
      acc.carbs_g += Number(food.carbs_g || 0) * quantity;
      acc.fat_g += Number(food.fat_g || 0) * quantity;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  return {
    calories: roundMacro(totals.calories),
    protein_g: roundMacro(totals.protein_g),
    carbs_g: roundMacro(totals.carbs_g),
    fat_g: roundMacro(totals.fat_g),
  };
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

function macroTotal(value?: number | null, servings?: number | null) {
  if (value == null) return null;
  return Math.round(value * (servings || 1) * 10) / 10;
}

function parseServingQuantity(quantity?: string | null) {
  if (!quantity) return 1;
  const match = quantity.match(/^\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 1;
}

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}

function calculateTodayNutrition(entries: MealPlanEntry[]) {
  const today = new Date().toISOString().split("T")[0];
  return entries.reduce(
    (totals, entry) => {
      const meta = getMealMeta(entry);
      if (!meta.completed || entry.meal_date !== today) return totals;
      const servingCount = meta.servings || 1;
      totals.calories += Number(meta.calories || 0) * servingCount;
      totals.protein_g += Number(meta.protein_g || 0) * servingCount;
      totals.carbs_g += Number(meta.carbs_g || 0) * servingCount;
      totals.fat_g += Number(meta.fat_g || 0) * servingCount;
      return totals;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function targetValue(value?: number | null, unit = "") {
  return value || value === 0 ? `${value}${unit}` : "Not set";
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
      } else if (source === "recipe" || source === "leftovers" || source === "event_family_meal" || source === "food_vault" || source === "custom") {
        totals.groceries += cost;
      }
      return totals;
    },
    { groceries: 0, eatingOut: 0 }
  );
}
