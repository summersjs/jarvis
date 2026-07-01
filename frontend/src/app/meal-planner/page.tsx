"use client";

import Link from "next/link";
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from "react";
import { ChevronDown, ClipboardList, DollarSign, ShoppingCart, Utensils, Wallet, X } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type Recipe = {
  id: string;
  title: string;
  servings?: number | null;
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
  recipe_id?: string | null;
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
  package_quantity?: number | null;
  unit_cost?: number | null;
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

const MEAL_TYPE_OPTIONS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack1", label: "Snack 1" },
  { value: "snack2", label: "Snack 2" },
  { value: "snack3", label: "Snack 3" },
  { value: "preworkout", label: "Preworkout" },
  { value: "postworkout", label: "Postworkout" },
];

const MEAL_GROUPS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack1", label: "Snack 1" },
  { value: "snack2", label: "Snack 2" },
  { value: "snack3", label: "Snack 3" },
  { value: "preworkout", label: "Preworkout" },
  { value: "postworkout", label: "Postworkout" },
  { value: "other", label: "Other" },
];

const MEAL_SOURCE_OPTIONS = [
  { value: "custom", label: "Custom Meal" },
  { value: "eat_out", label: "Eat Out" },
  { value: "event_family_meal", label: "Event / Family Meal" },
  { value: "food_vault", label: "Food Vault Item" },
  { value: "leftovers", label: "Leftovers" },
  { value: "recipe", label: "Recipe Vault Meal" },
  { value: "skip", label: "Skip" },
];

export default function MealPlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [foodItems, setFoodItems] = useState<FoodVaultItem[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [nutritionTargets, setNutritionTargets] = useState<NutritionTargets | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

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
    return getStaticWeekRange();
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

      setRecipes(sortRecipesByTitle(data.recipes || []));
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
      setFoodItems(sortFoodItemsByName(itemsData.items || []));
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
      const enteredCost = numberOrNull(estimatedCost);
      const meta: MealMeta = {
        source: mealSource,
        estimated_cost: mealSource === "food_vault" && selectedFood
          ? calculateFoodVaultUnitCost(selectedFood, servingCount)
          : enteredCost == null ? null : roundMoney(enteredCost * servingCount),
        package_quantity: selectedFood?.package_quantity ?? null,
        unit_cost: selectedFood ? calculateFoodVaultUnitCost(selectedFood, 1) : enteredCost,
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
      if (meta.source === "recipe" && !meta.completed) {
        await consumeRecipeIngredients(entry, meta);
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

  async function consumeFoodVaultItem(itemId: string, quantity: number) {
    const res = await fetch(`${API_BASE}/food-vault/items/${itemId}/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ quantity }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to update Food Vault inventory.");
  }

  async function consumeRecipeIngredients(entry: MealPlanEntry, meta: MealMeta) {
    const recipe = findRecipeForEntry(entry);
    if (!recipe?.ingredients?.length) return;

    const mealQuantity = Number(meta.servings || 1);
    const consumptions = recipe.ingredients
      .map((ingredient) => {
        const food = findFoodItemForIngredient(ingredient.item_name, foodItems);
        if (!food) return null;
        const ingredientQuantity = parseServingQuantity(ingredient.quantity);
        return {
          food,
          quantity: ingredientQuantity * mealQuantity,
        };
      })
      .filter((item): item is { food: FoodVaultItem; quantity: number } => !!item && item.quantity > 0);

    for (const item of consumptions) {
      await consumeFoodVaultItem(item.food.id, item.quantity);
    }
  }

  function findRecipeForEntry(entry: MealPlanEntry) {
    if (entry.recipe_id) {
      const recipe = recipes.find((item) => item.id === entry.recipe_id);
      if (recipe) return recipe;
    }
    const title = entry.recipes?.title || entry.custom_meal_name;
    if (!title) return null;
    return recipes.find((item) => item.title.toLowerCase() === title.toLowerCase()) || null;
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
    setEstimatedCost(calculateFoodVaultUnitCost(item, 1)?.toFixed(2) || "");
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
    const cost = estimateRecipeCost(recipe.ingredients || [], foodItems);
    const recipeServings = Number(recipe.servings || 1);
    setCustomMealName(recipe.title);
    setEstimatedCost(cost ? formatNumber(roundMoney(cost / recipeServings)) : "");
    setCalories(totals.calories ? String(perServing(totals.calories, recipeServings)) : "");
    setProtein(totals.protein_g ? String(perServing(totals.protein_g, recipeServings)) : "");
    setCarbs(totals.carbs_g ? String(perServing(totals.carbs_g, recipeServings)) : "");
    setFat(totals.fat_g ? String(perServing(totals.fat_g, recipeServings)) : "");
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
  const weeklyBoard = buildWeeklyMealBoard(entries);

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
              Shopping Lists
            </Link>
            <Link
              href="/"
              className="command-nav-link"
            >
              Command Center
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
            status="Budget allocation"
          />
          <SummaryCard
            icon={ShoppingCart}
            label="Weekly eating out budget"
            value={`$${formatMoney(financeSummary?.weekly_food_budget.weekly_eating_out_target || 0)}`}
            status="Dining allowance"
          />
          <SummaryCard
            icon={Utensils}
            label="Estimated grocery cost"
            value={`$${formatMoney(estimatedCosts.groceries)}`}
            status={budgetStatusLine(estimatedCosts.groceries, financeSummary?.weekly_food_budget.weekly_grocery_target || 0)}
          />
          <SummaryCard
            icon={DollarSign}
            label="Estimated eat out cost"
            value={`$${formatMoney(estimatedCosts.eatingOut)}`}
            status={budgetStatusLine(estimatedCosts.eatingOut, financeSummary?.weekly_food_budget.weekly_eating_out_target || 0)}
          />
          <SummaryCard
            icon={ClipboardList}
            label="Over / under"
            value={`$${formatMoney(estimatedOverUnder)}`}
            status={estimatedOverUnder >= 0 ? "Within weekly food budget" : "Budget breach detected"}
          />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <SummaryCard
            icon={Utensils}
            label="Calories today"
            value={`${todayNutrition.calories} / ${targetValue(nutritionTargets?.daily_calorie_target)}`}
            progress={{ current: todayNutrition.calories, target: nutritionTargets?.daily_calorie_target || 0, kind: "calories", unit: "cal" }}
          />
          <SummaryCard
            icon={Utensils}
            label="Protein today"
            value={`${todayNutrition.protein_g}g / ${targetValue(nutritionTargets?.daily_protein_target, "g")}`}
            progress={{ current: todayNutrition.protein_g, target: nutritionTargets?.daily_protein_target || 0, kind: "protein", unit: "g" }}
          />
          <SummaryCard
            icon={Utensils}
            label="Carbs today"
            value={`${todayNutrition.carbs_g}g / ${targetValue(nutritionTargets?.daily_carb_target, "g")}`}
            progress={{ current: todayNutrition.carbs_g, target: nutritionTargets?.daily_carb_target || 0, kind: "carbs", unit: "g" }}
          />
          <SummaryCard
            icon={Utensils}
            label="Fat today"
            value={`${todayNutrition.fat_g}g / ${targetValue(nutritionTargets?.daily_fat_target, "g")}`}
            progress={{ current: todayNutrition.fat_g, target: nutritionTargets?.daily_fat_target || 0, kind: "fat", unit: "g" }}
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

        <section className="jarvis-card jarvis-card-cyan mb-8 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="jarvis-section-header food-ops-accent">Food Intake</p>
              <h2 className="mt-1 text-2xl font-semibold">Add Meal</h2>
              <p className="mt-2 text-sm text-green-300/70">Log food, recipe, or eating out event.</p>
            </div>
          </div>

          <div className="grid gap-5">
            <MealFormSection title="Meal Timing">
              <FormField label="Meal Date">
                <input
                  type="date"
                  value={mealDate}
                  onChange={(e) => setMealDate(e.target.value)}
                  className="food-ops-input"
                />
              </FormField>

              <FormField label="Meal Type">
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value)}
                  className="food-ops-input"
                >
                  {MEAL_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
            </MealFormSection>

            <MealFormSection title="Meal Source">
              <FormField label="Source">
                <select
                  value={mealSource}
                  onChange={(e) => setMealSource(e.target.value)}
                  className="food-ops-input"
                >
                  {MEAL_SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Recipe">
                <select
                  value={recipeId}
                  onChange={(e) => selectRecipe(e.target.value)}
                  className="food-ops-input"
                  disabled={mealSource !== "recipe"}
                >
                  <option value="">-- Choose Recipe --</option>
                  {sortRecipesByTitle(recipes).map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.title}
                    </option>
                  ))}
                </select>
              </FormField>

              {mealSource === "food_vault" && (
                <FormField label="Food Vault Item">
                  <select
                    value={foodVaultItemId}
                    onChange={(e) => selectFoodVaultItem(e.target.value)}
                    className="food-ops-input"
                  >
                    <option value="">-- Choose Food --</option>
                    {sortFoodItemsByName(foodItems).map((item) => (
                      <option key={item.id} value={item.id}>
                        {foodDisplayName(item)} ({item.current_quantity ?? 0} left)
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              <FormField label="Custom Meal Name">
                <input
                  value={customMealName}
                  onChange={(e) => setCustomMealName(e.target.value)}
                  className="food-ops-input"
                  placeholder="Optional if not using a recipe"
                />
              </FormField>

              <FormField label="Quantity / Servings">
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  className="food-ops-input"
                />
              </FormField>

              {mealSource === "custom" && (
                <button
                  onClick={() => setSaveToFoodVault((prev) => !prev)}
                  className={`command-action-button rounded-xl border px-4 py-3 text-left ${
                    saveToFoodVault ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100" : "border-green-500/30 text-green-300"
                  }`}
                >
                  Save to Food Vault: {saveToFoodVault ? "Yes" : "No"}
                </button>
              )}
            </MealFormSection>

            <MealFormSection title="Cost / Vendor">
              <FormField label="Estimated Cost Per Serving / Item">
                <input
                  type="number"
                  step="0.01"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="food-ops-input"
                  placeholder="12.50"
                />
              </FormField>

              <FormField label="Restaurant / Vendor">
                <input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="food-ops-input"
                  placeholder="Chipotle"
                />
              </FormField>
            </MealFormSection>

            <MealFormSection title="Nutrition">
              <FormField label="Calories">
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="food-ops-input"
                  placeholder="320"
                />
              </FormField>

              <FormField label="Protein g">
                <input
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="food-ops-input"
                  placeholder="42"
                />
              </FormField>

              <FormField label="Carbs g">
                <input
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="food-ops-input"
                  placeholder="32"
                />
              </FormField>

              <FormField label="Fat g">
                <input
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="food-ops-input"
                  placeholder="4"
                />
              </FormField>
            </MealFormSection>

            <MealFormSection title="Notes" columns="single">
              <FormField label="Operational Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="food-ops-input"
                  rows={3}
                  placeholder="Prep ahead, post-workout meal, etc."
                />
              </FormField>
            </MealFormSection>
          </div>

          <button
            onClick={createEntry}
            className="command-action-button command-action-green mt-4 w-full border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
          >
            Save Meal Plan Entry
          </button>
        </section>

        <section className="hud-panel food-ops-accent">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-label text-cyan-200/75">Weekly Intake Board</p>
              <h2 className="mt-1 text-2xl font-semibold text-green-100">Weekly Meal Board</h2>
            </div>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/5 px-3 py-1 text-xs uppercase tracking-[0.16em] text-cyan-100">
              {entries.length} planned entries
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCollapsedDays(Object.fromEntries(weeklyBoard.map((day) => [day.date, false])))}
                className="command-action-button command-action-cyan border border-cyan-300/35 px-3 py-2 text-xs uppercase tracking-[0.14em] text-cyan-100"
              >
                Expand All
              </button>
              <button
                onClick={() => setCollapsedDays(Object.fromEntries(weeklyBoard.map((day) => [day.date, true])))}
                className="command-action-button border border-green-500/25 px-3 py-2 text-xs uppercase tracking-[0.14em] text-green-200"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            {entries.length === 0 && (
              <div className="hud-row">
                No meals planned yet.
              </div>
            )}

            {weeklyBoard.map((day) => {
              const collapsed = collapsedDays[day.date] ?? day.date !== todayString();
              return (
                <article key={day.date} className="jarvis-card jarvis-card-cyan p-4">
                  <button
                    onClick={() => setCollapsedDays((prev) => ({ ...prev, [day.date]: !collapsed }))}
                    className="flex w-full flex-wrap items-center justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/75">{day.weekday}</p>
                      <h3 className="mt-1 text-xl font-semibold text-green-50">{formatBoardDate(day.date)}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DayStat label="Cal" value={`${day.totals.calories} cal`} />
                      <DayStat label="Protein" value={`${day.totals.protein_g}g`} />
                      <DayStat label="Carbs" value={`${day.totals.carbs_g}g`} />
                      <DayStat label="Fat" value={`${day.totals.fat_g}g`} />
                      <DayStat label="Cost" value={`$${formatMoney(day.totals.cost)}`} />
                      <DayStat label="Meals" value={`${day.eatenCount}/${day.entries.length}`} />
                      <ChevronDown className={`h-5 w-5 text-cyan-100 transition ${collapsed ? "" : "rotate-180"}`} />
                    </div>
                  </button>

                  {!collapsed && (
                    <div className="mt-4 grid gap-4 border-t border-green-500/15 pt-4">
                      {MEAL_GROUPS.map((group) => {
                        const groupEntries = day.groups[group.value] || [];
                        if (groupEntries.length === 0) return null;
                        return (
                          <div key={`${day.date}-${group.value}`} className="rounded-xl border border-green-500/15 bg-black/30 p-3">
                            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-green-500/70">{group.label}</p>
                            <div className="grid gap-3">
                              {groupEntries.map((entry) => {
                                const meta = getMealMeta(entry);
                                return (
                                  <div
                                    key={entry.id}
                                    className={`hoverable-row rounded-xl border p-4 transition ${
                                      meta.completed
                                        ? "border-green-300/45 bg-green-400/10 shadow-[0_0_18px_rgba(34,197,94,0.14)]"
                                        : "border-green-500/20 bg-black"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/75">
                                          {getMealTypeLabel(entry.meal_type)} · {getMealSourceLabel(meta.source)}
                                        </p>
                                        <p className="mt-2 font-semibold text-green-100">
                                          {entry.recipes?.title || entry.custom_meal_name || "Unnamed meal"}
                                        </p>
                                        <p className="mt-1 text-sm text-green-300/65">
                                          {mealCostLabel(entry, meta)}
                                          {entry.vendor || meta.vendor ? ` · ${entry.vendor || meta.vendor}` : ""}
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
                                          className="command-action-button command-action-cyan border border-cyan-300/35 px-4 py-2 text-sm text-cyan-100"
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
                          </div>
                        );
                      })}
                      {day.entries.length === 0 && (
                        <div className="hud-row">No meals planned for this day.</div>
                      )}
                    </div>
                  )}
                </article>
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
  status,
  progress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  status?: string;
  progress?: {
    current: number;
    target: number;
    kind: "calories" | "protein" | "carbs" | "fat";
    unit: string;
  };
}) {
  return (
    <div className="jarvis-card jarvis-card-cyan food-ops-status-card p-5">
      <div className="flex items-start gap-3">
        <div className="food-ops-icon-badge">
          <Icon className="h-5 w-5 text-cyan-100" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/70">{label}</p>
          <p className="mt-3 text-2xl font-bold text-green-50">{value}</p>
        </div>
      </div>
      {progress ? (
        <MacroProgressBar {...progress} />
      ) : (
        <p className="mt-4 border-t border-cyan-300/10 pt-3 text-xs uppercase tracking-[0.16em] text-green-300/60">
          {status || "Status nominal"}
        </p>
      )}
    </div>
  );
}

function MealFormSection({
  title,
  children,
  columns = "double",
}: {
  title: string;
  children: ReactNode;
  columns?: "single" | "double";
}) {
  return (
    <div className="food-ops-form-section">
      <p className="food-ops-form-section-title">{title}</p>
      <div className={columns === "single" ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-green-300/72">{label}</span>
      {children}
    </label>
  );
}

function MacroProgressBar({
  current,
  target,
  kind,
  unit,
}: {
  current: number;
  target: number;
  kind: "calories" | "protein" | "carbs" | "fat";
  unit: string;
}) {
  if (!target || target <= 0) {
    return (
      <p className="mt-4 border-t border-cyan-300/10 pt-3 text-xs uppercase tracking-[0.16em] text-green-300/60">
        Target not configured
      </p>
    );
  }

  const percent = (current / target) * 100;
  const overTarget = percent > 100;
  const sadLimitBreak = overTarget && (kind === "calories" || kind === "fat");
  const happyLimitBreak = overTarget && kind === "protein";
  const neutralLimitBreak = overTarget && kind === "carbs";
  const cappedPercent = Math.min(100, Math.max(0, percent));
  const status = getMacroProgressStatus(percent, kind);
  const completeClass = happyLimitBreak || neutralLimitBreak ? "goal-progress-track-complete" : "";
  const fillClass = sadLimitBreak
    ? "sad-limit-break-bar goal-progress-fill-red"
    : happyLimitBreak || neutralLimitBreak
      ? "limit-break-bar goal-progress-fill-complete"
      : `goal-progress-fill-${status.tone}`;

  return (
    <div className="goal-progress-shell mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`goal-progress-status goal-progress-status-${sadLimitBreak ? "red" : status.tone}`}>
          {status.label}
        </span>
        <span className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">
          {formatNumber(current)}{unit} / {formatNumber(target)}{unit}
        </span>
      </div>
      <div className={`goal-progress-track ${completeClass} ${sadLimitBreak ? "goal-progress-track-sad" : ""}`}>
        <div
          className={`goal-progress-fill ${fillClass}`}
          style={{ width: `${cappedPercent}%` }}
        >
          {(status.tone === "green" || happyLimitBreak || neutralLimitBreak) && !sadLimitBreak && (
            <span className="goal-progress-particles" aria-hidden="true" />
          )}
        </div>
      </div>
      {overTarget && (
        <p className={`mt-3 text-xs font-bold uppercase tracking-[0.2em] ${sadLimitBreak ? "text-red-200" : "text-yellow-200"}`}>
          {sadLimitBreak ? "Limit break: over target" : "Limit break"}
        </p>
      )}
    </div>
  );
}

function getMacroProgressStatus(percent: number, kind: "calories" | "protein" | "carbs" | "fat") {
  if (percent > 100) {
    if (kind === "calories" || kind === "fat") {
      return { tone: "red", label: "OVER TARGET" };
    }
    return { tone: "rainbow", label: "LIMIT BREAK" };
  }
  if (percent >= 95) return { tone: "green", label: "TARGET LOCKED" };
  if (percent >= 70) return { tone: "green", label: "ON TRACK" };
  if (percent >= 45) return { tone: "yellow", label: "BUILDING" };
  return { tone: "red", label: kind === "fat" ? "TOO LOW" : "LOW INTAKE" };
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
    package_quantity: null,
    unit_cost: null,
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
  if (source === "caffeine") return "Added from Caffeine";
  return "Recipe Vault Meal";
}

function getMealTypeLabel(mealType?: string | null) {
  const normalized = normalizeMealType(mealType);
  return MEAL_GROUPS.find((group) => group.value === normalized)?.label || "Other";
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function budgetStatusLine(current: number, target: number) {
  if (!target || target <= 0) return "Target not configured";
  const remaining = target - current;
  if (remaining >= 0) return `$${formatMoney(remaining)} remaining`;
  return `$${formatMoney(Math.abs(remaining))} over target`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
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

function calculateFoodVaultUnitCost(item: FoodVaultItem, servings = 1) {
  const packagePrice = Number(item.estimated_price || 0);
  const packageQuantity = Number(item.package_quantity || 1);
  if (!packagePrice || !packageQuantity) return null;
  return roundMoney((packagePrice / packageQuantity) * servings);
}

function mealCostLabel(entry: MealPlanEntry, meta: MealMeta) {
  const cost = Number(meta.estimated_cost || entry.estimated_cost || 0);
  if (!cost) return "No cost set";
  const servingCount = Number(meta.servings || 1);
  if (servingCount > 1) {
    const unitCost = Number(meta.unit_cost || 0);
    return unitCost
      ? `$${formatMoney(cost)} total · ${formatNumber(servingCount)} x $${formatMoney(unitCost)}`
      : `$${formatMoney(cost)} total`;
  }
  return `$${formatMoney(cost)}`;
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

function estimateRecipeCost(ingredients: RecipeIngredient[], foodItems: FoodVaultItem[]) {
  const total = ingredients.reduce((sum, ingredient) => {
    const food = findFoodItemForIngredient(ingredient.item_name, foodItems);
    if (!food?.estimated_price) return sum;
    const packageQuantity = Number(food.package_quantity || 1);
    const quantity = parseServingQuantity(ingredient.quantity);
    return sum + (Number(food.estimated_price) / packageQuantity) * quantity;
  }, 0);
  return total > 0 ? roundMoney(total) : null;
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

function perServing(value: number, servings?: number | null) {
  return roundMacro(value / Number(servings || 1));
}

function DayStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1 text-xs text-cyan-50">
      <span className="mr-1 uppercase tracking-[0.12em] text-cyan-200/65">{label}</span>
      {value}
    </span>
  );
}

function buildWeeklyMealBoard(entries: MealPlanEntry[]) {
  const { startStr } = getStaticWeekRange();
  const start = parseLocalDate(startStr);
  return Array.from({ length: 7 }, (_unused, index) => {
    const date = addDays(start, index);
    const dateStr = formatDateInput(date);
    const dayEntries = entries.filter((entry) => entry.meal_date === dateStr);
    const groups = dayEntries.reduce<Record<string, MealPlanEntry[]>>((acc, entry) => {
      const mealType = normalizeMealType(entry.meal_type);
      const groupKey = MEAL_GROUPS.some((group) => group.value === mealType) ? mealType : "other";
      acc[groupKey] = [...(acc[groupKey] || []), entry];
      return acc;
    }, {});
    const totals = dayEntries.reduce(
      (acc, entry) => {
        const meta = getMealMeta(entry);
        const servings = Number(meta.servings || 1);
        acc.calories += Number(meta.calories || 0) * servings;
        acc.protein_g += Number(meta.protein_g || 0) * servings;
        acc.carbs_g += Number(meta.carbs_g || 0) * servings;
        acc.fat_g += Number(meta.fat_g || 0) * servings;
        acc.cost += Number(meta.estimated_cost || entry.estimated_cost || 0);
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, cost: 0 }
    );
    return {
      date: dateStr,
      weekday: date.toLocaleDateString(undefined, { weekday: "long" }),
      entries: dayEntries,
      groups,
      eatenCount: dayEntries.filter((entry) => getMealMeta(entry).completed).length,
      totals: {
        calories: roundMacro(totals.calories),
        protein_g: roundMacro(totals.protein_g),
        carbs_g: roundMacro(totals.carbs_g),
        fat_g: roundMacro(totals.fat_g),
        cost: roundMoney(totals.cost),
      },
    };
  });
}

function normalizeMealType(mealType?: string | null) {
  if (!mealType) return "other";
  const normalized = mealType.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "snack") return "snack1";
  return normalized;
}

function getStaticWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + diffToMonday);
  const end = addDays(start, 6);
  return { startStr: formatDateInput(start), endStr: formatDateInput(end) };
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayString() {
  return formatDateInput(new Date());
}

function formatBoardDate(value: string) {
  return parseLocalDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
