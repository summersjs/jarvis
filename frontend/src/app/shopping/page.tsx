"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Radar, ShoppingCart } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type ShoppingListItem = {
  id: string;
  item_name: string;
  quantity?: string | null;
  category?: string | null;
  is_checked: boolean;
  source: string;
};

type ShoppingList = {
  id: string;
  title: string;
  week_start?: string | null;
  notes?: string | null;
  items?: ShoppingListItem[];
};

export default function ShoppingPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [newListTitle, setNewListTitle] = useState("");
  const [newListWeekStart, setNewListWeekStart] = useState("");
  const [newListNotes, setNewListNotes] = useState("");

  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");

  async function toggleItemChecked(itemId: string, isChecked: boolean) {
  setError("");
  try {
    const res = await fetch(`${API_BASE}/shopping/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        is_checked: !isChecked,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to update item.");

    if (selectedList) {
      await loadListDetails(selectedList.id);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to update item.");
  }
}
  
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

async function generateFromMealPlan() {
  setError("");
  setMessage("");

  if (!selectedList) {
    setError("Select a shopping list first.");
    return;
  }

  try {
    const { startStr, endStr } = getWeekRange();

    const res = await fetch(
      `${API_BASE}/shopping/lists/${selectedList.id}/generate-from-meal-plan?user_id=john&start_date=${startStr}&end_date=${endStr}&skip_pantry=true`,
      {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to generate shopping list.");

    setMessage("Generated shopping items from meal plan.");
    await loadListDetails(selectedList.id);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to generate shopping list.");
  }
}

  async function loadLists() {
    try {
      const res = await fetch(`${API_BASE}/shopping/lists?user_id=john`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load shopping lists.");

      setLists(data.shopping_lists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shopping lists.");
    }
  }

  async function loadListDetails(listId: string) {
    try {
      const res = await fetch(`${API_BASE}/shopping/lists/${listId}`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load shopping list.");

      setSelectedList(data.shopping_list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shopping list.");
    }
  }

  async function createList() {
    setError("");
    setMessage("");

    if (!newListTitle.trim()) {
      setError("Shopping list title is required.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/shopping/lists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: "john",
          title: newListTitle.trim(),
          week_start: newListWeekStart || null,
          notes: newListNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create shopping list.");

      setMessage("Shopping list created.");
      setNewListTitle("");
      setNewListWeekStart("");
      setNewListNotes("");

      await loadLists();
      await loadListDetails(data.shopping_list.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create shopping list.");
    }
  }

  async function addItem() {
    setError("");
    setMessage("");

    if (!selectedList) {
      setError("Select a shopping list first.");
      return;
    }

    if (!newItemName.trim()) {
      setError("Item name is required.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/shopping/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          shopping_list_id: selectedList.id,
          item_name: newItemName.trim(),
          quantity: newItemQuantity.trim() || null,
          category: newItemCategory.trim() || null,
          source: "manual",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add item.");

      setMessage("Item added.");
      setNewItemName("");
      setNewItemQuantity("");
      setNewItemCategory("");

      await loadListDetails(selectedList.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item.");
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-label">Supply Acquisition Control</p>
            <h1 className="mt-2 text-4xl font-bold">Shopping Lists</h1>
            <p className="mt-3 text-green-300/75">Active supply lists, meal-plan generation, and restock operations.</p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/meal-planner"
              className="command-nav-link"
            >
              Meal Planner
            </Link>
            <Link
              href="/recipes"
              className="command-nav-link"
            >
              Recipe Vault
            </Link>
            <Link
              href="/preferences"
              className="command-nav-link"
            >
              Favorites
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

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon"><Plus className="h-5 w-5" /></div>
              <h2 className="hud-panel-title">Create Supply List</h2>
            </div>

            <div className="space-y-4">
              <input
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Week of April 21"
              />

              <input
                type="date"
                value={newListWeekStart}
                onChange={(e) => setNewListWeekStart(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />

              <textarea
                value={newListNotes}
                onChange={(e) => setNewListNotes(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                rows={3}
                placeholder="Notes..."
              />

              <button
                onClick={createList}
                className="command-action-button command-action-green w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
              >
                Create Shopping List
              </button>
            </div>

            <div className="mt-8">
              <h3 className="hud-panel-title mb-3">Active Lists</h3>

              <div className="space-y-3">
                {lists.length === 0 && (
                  <div className="hud-row">
                    No shopping lists yet.
                  </div>
                )}

                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => loadListDetails(list.id)}
                    className={`hud-row block w-full text-left transition hover:-translate-y-0.5 ${
                      selectedList?.id === list.id
                        ? "border-green-300/55 bg-green-400/10 shadow-[0_0_22px_rgba(34,197,94,0.18)]"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="hud-row-icon"><ClipboardList className="h-4 w-4" /></div>
                      <div>
                    <p className="font-semibold">{list.title}</p>
                    {list.week_start && (
                      <p className="mt-1 text-sm text-green-300/70">
                        Week start: {list.week_start}
                      </p>
                    )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon"><Radar className="h-5 w-5" /></div>
              <h2 className="hud-panel-title">Supply List Details</h2>
            </div>

            <div className="mb-6">
            <button
                onClick={generateFromMealPlan}
                className="command-action-button command-action-green w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
            >
                Generate from Meal Plan
            </button>
            </div>

            {!selectedList && (
              <div className="hud-row">
                Select a shopping list.
              </div>
            )}

            {selectedList && (
              <>
                <div className="hud-row mb-6">
                  <div className="hud-row-icon"><ShoppingCart className="h-4 w-4" /></div>
                  <div>
                  <p className="text-xl font-semibold">{selectedList.title}</p>
                  {selectedList.week_start && (
                    <p className="mt-1 text-sm text-green-300/70">
                      Week start: {selectedList.week_start}
                    </p>
                  )}
                  {selectedList.notes && (
                    <p className="mt-2 text-green-300/80">{selectedList.notes}</p>
                  )}
                  </div>
                </div>

                <div className="hud-row mb-6 flex-col items-stretch space-y-3">
                  <h3 className="hud-panel-title">Add Manual Item</h3>

                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                    placeholder="Bananas"
                  />

                  <input
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(e.target.value)}
                    className="w-full rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                    placeholder="6"
                  />

                  <input
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full rounded-xl border border-green-500/30 bg-zinc-950 px-4 py-3"
                    placeholder="produce"
                  />

                  <button
                    onClick={addItem}
                    className="command-action-button command-action-green w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
                  >
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Items</h3>

                  {(!selectedList.items || selectedList.items.length === 0) && (
                    <div className="hud-row">
                      No items yet.
                    </div>
                  )}

                  {selectedList.items?.map((item) => (
                    <div
                        key={item.id}
                        className={`hud-row ${item.is_checked ? "border-green-300/25 bg-green-400/5" : ""}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                        <div className={item.is_checked ? "opacity-50" : ""}>
                            <p className={`font-semibold ${item.is_checked ? "line-through" : ""}`}>
                            {item.item_name}
                            </p>
                            <p className="mt-1 text-sm text-green-300/70">
                            {item.quantity || "No quantity"} · {item.category || "No category"} · {item.source}
                            </p>
                        </div>

                        <button
                          onClick={() => toggleItemChecked(item.id, item.is_checked)}
                          className={`command-action-button border p-2 ${
                            item.is_checked
                              ? "border-green-300/45 bg-green-400/15 text-green-100"
                              : "border-green-500/30 text-green-300"
                          }`}
                          aria-label={item.is_checked ? "Mark item open" : "Mark item bought"}
                        >
                          <CheckCircle2 className="h-5 w-5" />
                        </button>
                        </div>
                    </div>
                    ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
