"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Package, Plus, Target, Utensils, X } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type FoodItem = {
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

const emptyItem = {
  name: "",
  brand: "",
  serving_size: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  package_quantity: "1",
  current_quantity: "0",
  low_stock_threshold: "0",
  estimated_price: "",
  default_store: "",
  shopping_category: "",
  notes: "",
  is_favorite: false,
};

export default function FoodVaultPage() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState({
    daily_calorie_target: "",
    daily_protein_target: "",
    daily_carb_target: "",
    daily_fat_target: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [itemsRes, targetsRes] = await Promise.all([
        fetch(`${API_BASE}/food-vault/items?user_id=${USER_ID}`, { headers: { "x-api-key": API_KEY } }),
        fetch(`${API_BASE}/food-vault/nutrition-targets?user_id=${USER_ID}`, { headers: { "x-api-key": API_KEY } }),
      ]);
      const itemsData = await itemsRes.json();
      const targetsData = await targetsRes.json();
      if (!itemsRes.ok) throw new Error(itemsData.detail || "Failed to load Food Vault.");
      if (!targetsRes.ok) throw new Error(targetsData.detail || "Failed to load nutrition targets.");
      setItems(sortFoodItemsByName(itemsData.items || []));
      const loadedTargets = targetsData.targets || {};
      setTargets(loadedTargets);
      setTargetForm({
        daily_calorie_target: valueString(loadedTargets.daily_calorie_target),
        daily_protein_target: valueString(loadedTargets.daily_protein_target),
        daily_carb_target: valueString(loadedTargets.daily_carb_target),
        daily_fat_target: valueString(loadedTargets.daily_fat_target),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Food Vault.");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveItem() {
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Food item name is required.");
      return;
    }
    try {
      const payload = {
        user_id: USER_ID,
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        serving_size: form.serving_size.trim() || null,
        calories: numberOrNull(form.calories),
        protein_g: numberOrNull(form.protein_g),
        carbs_g: numberOrNull(form.carbs_g),
        fat_g: numberOrNull(form.fat_g),
        package_quantity: numberOrNull(form.package_quantity) ?? 1,
        current_quantity: numberOrNull(form.current_quantity) ?? 0,
        low_stock_threshold: numberOrNull(form.low_stock_threshold) ?? 0,
        estimated_price: numberOrNull(form.estimated_price),
        default_store: form.default_store.trim() || null,
        shopping_category: form.shopping_category.trim() || null,
        notes: form.notes.trim() || null,
        is_favorite: form.is_favorite,
      };
      const res = await fetch(editingItemId ? `${API_BASE}/food-vault/items/${editingItemId}` : `${API_BASE}/food-vault/items`, {
        method: editingItemId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save food item.");
      setForm(emptyItem);
      setEditingItemId(null);
      setMessage(editingItemId ? "Food Vault item updated." : "Food Vault item saved.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save food item.");
    }
  }

  function editItem(item: FoodItem) {
    setEditingItemId(item.id);
    setForm({
      name: item.name || "",
      brand: item.brand || "",
      serving_size: item.serving_size || "",
      calories: valueString(item.calories),
      protein_g: valueString(item.protein_g),
      carbs_g: valueString(item.carbs_g),
      fat_g: valueString(item.fat_g),
      package_quantity: valueString(item.package_quantity ?? 1),
      current_quantity: valueString(item.current_quantity ?? 0),
      low_stock_threshold: valueString(item.low_stock_threshold ?? 0),
      estimated_price: valueString(item.estimated_price),
      default_store: item.default_store || "",
      shopping_category: item.shopping_category || "",
      notes: item.notes || "",
      is_favorite: Boolean(item.is_favorite),
    });
    setMessage("Food item loaded for editing.");
  }

  async function deleteItem(item: FoodItem) {
    setError("");
    setMessage("");
    if (!window.confirm(`Delete ${[item.brand, item.name].filter(Boolean).join(" ")} from Food Vault?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/food-vault/items/${item.id}`, {
        method: "DELETE",
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete food item.");
      if (editingItemId === item.id) {
        setEditingItemId(null);
        setForm(emptyItem);
      }
      setMessage("Food Vault item deleted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete food item.");
    }
  }

  async function saveTargets() {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/food-vault/nutrition-targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          user_id: USER_ID,
          daily_calorie_target: numberOrNull(targetForm.daily_calorie_target),
          daily_protein_target: numberOrNull(targetForm.daily_protein_target),
          daily_carb_target: numberOrNull(targetForm.daily_carb_target),
          daily_fat_target: numberOrNull(targetForm.daily_fat_target),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save nutrition targets.");
      setTargets(data.targets);
      setMessage("Nutrition targets saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save nutrition targets.");
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">Jarvis Nutrition Inventory</p>
            <h1 className="mt-2 text-4xl font-bold">Food Vault</h1>
            <p className="mt-3 text-green-300/80">Packaged foods, macros, inventory, and low-stock tracking.</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">Command Center</Link>
            <Link href="/meal-planner" className="command-nav-link">Meal Planner</Link>
            <Link href="/shopping" className="command-nav-link">Shopping</Link>
          </nav>
        </header>

        {error && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}
        {message && <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">{message}</div>}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <TargetCard label="Calories" value={targets?.daily_calorie_target} unit="cal" />
          <TargetCard label="Protein" value={targets?.daily_protein_target} unit="g" />
          <TargetCard label="Carbs" value={targets?.daily_carb_target} unit="g" />
          <TargetCard label="Fat" value={targets?.daily_fat_target} unit="g" />
        </section>

        <section className="mb-6 rounded-2xl border border-green-500/30 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-3">
            <Target className="h-5 w-5 text-green-300" />
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-green-200">Daily Nutrition Targets</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Input label="Calories" value={targetForm.daily_calorie_target} onChange={(value) => setTargetForm((prev) => ({ ...prev, daily_calorie_target: value }))} />
            <Input label="Protein g" value={targetForm.daily_protein_target} onChange={(value) => setTargetForm((prev) => ({ ...prev, daily_protein_target: value }))} />
            <Input label="Carbs g" value={targetForm.daily_carb_target} onChange={(value) => setTargetForm((prev) => ({ ...prev, daily_carb_target: value }))} />
            <Input label="Fat g" value={targetForm.daily_fat_target} onChange={(value) => setTargetForm((prev) => ({ ...prev, daily_fat_target: value }))} />
            <button onClick={saveTargets} className="command-action-button command-action-green border border-green-400/40 bg-green-400/10 px-4 py-3 text-green-100">Save Targets</button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-green-500/30 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-3">
            <Plus className="h-5 w-5 text-green-300" />
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-green-200">{editingItemId ? "Edit Food Item" : "Add Food Item"}</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries({
              name: "Name",
              brand: "Brand",
              serving_size: "Serving Size",
              calories: "Calories",
              protein_g: "Protein g",
              carbs_g: "Carbs g",
              fat_g: "Fat g",
              package_quantity: "Package Qty",
              current_quantity: "Current Qty",
              low_stock_threshold: "Low Stock",
              estimated_price: "Price",
              default_store: "Store",
              shopping_category: "Category",
              notes: "Notes",
            }).map(([key, label]) => (
              <Input key={key} label={label} value={String(form[key as keyof typeof form])} onChange={(value) => setForm((prev) => ({ ...prev, [key]: value }))} />
            ))}
            <button onClick={() => setForm((prev) => ({ ...prev, is_favorite: !prev.is_favorite }))} className={`command-action-button border px-4 py-3 ${form.is_favorite ? "border-green-300/60 bg-green-400/15 text-green-100" : "border-green-500/25 text-green-300"}`}>Favorite: {form.is_favorite ? "Yes" : "No"}</button>
            <button onClick={saveItem} className="command-action-button command-action-green border border-green-400/40 bg-green-400/10 px-4 py-3 text-green-100">{editingItemId ? "Update Food" : "Save Food"}</button>
            {editingItemId && (
              <button
                onClick={() => {
                  setEditingItemId(null);
                  setForm(emptyItem);
                  setMessage("");
                }}
                className="command-action-button border border-cyan-300/35 px-4 py-3 text-cyan-100"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center gap-3">
            <Package className="h-5 w-5 text-green-300" />
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-green-200">Inventory</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sortFoodItemsByName(items).map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => editItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    editItem(item);
                  }
                }}
                className={`rounded-xl border bg-black p-4 text-left transition hover:border-green-300/50 hover:shadow-[0_0_22px_rgba(34,197,94,0.18)] ${Number(item.current_quantity || 0) <= Number(item.low_stock_threshold || 0) ? "border-amber-300/45" : "border-green-500/20"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-green-100">{[item.brand, item.name].filter(Boolean).join(" ")}</p>
                    <p className="mt-1 text-sm text-green-300/65">{item.serving_size || "Serving not set"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-green-400/30 px-3 py-1 text-xs uppercase tracking-[0.14em]">
                      {item.current_quantity ?? 0} left
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItem(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteItem(item);
                        }
                      }}
                      className="command-action-button border border-red-400/30 bg-red-500/10 p-2 text-red-200"
                      aria-label={`Delete ${item.name}`}
                    >
                      <X className="h-4 w-4" />
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <Mini label="Cal" value={item.calories} />
                  <Mini label="Protein" value={item.protein_g} unit="g" />
                  <Mini label="Carbs" value={item.carbs_g} unit="g" />
                  <Mini label="Fat" value={item.fat_g} unit="g" />
                </div>
                <p className="mt-3 text-sm text-green-300/65">
                  Package {item.package_quantity || 1} · Threshold {item.low_stock_threshold || 0}
                  {item.estimated_price ? ` · $${Number(item.estimated_price).toFixed(2)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.16em] text-green-500/65">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-green-500/30 bg-black px-4 py-3" />
    </label>
  );
}

function TargetCard({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  return (
    <div className="rounded-2xl border border-green-500/20 bg-zinc-950 p-5">
      <div className="flex items-center gap-3">
        <Utensils className="h-5 w-5 text-green-300" />
        <p className="text-xs uppercase tracking-[0.2em] text-green-500/70">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-green-100">{value || value === 0 ? `${value} ${unit}` : "Not set"}</p>
    </div>
  );
}

function Mini({ label, value, unit = "" }: { label: string; value?: number | null; unit?: string }) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-zinc-950 px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-green-500/65">{label}</p>
      <p className="mt-1 font-semibold text-green-100">{value || value === 0 ? `${value}${unit}` : "-"}</p>
    </div>
  );
}

function foodDisplayName(item: FoodItem) {
  return [item.brand, item.name].filter(Boolean).join(" ");
}

function sortFoodItemsByName(items: FoodItem[]) {
  return [...items].sort((a, b) => foodDisplayName(a).localeCompare(foodDisplayName(b), undefined, { sensitivity: "base" }));
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function valueString(value: unknown) {
  return value == null ? "" : String(value);
}
