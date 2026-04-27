"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type Preference = {
  id: string;
  item_keyword: string;
  preference_type: string;
  preferred_brand?: string | null;
  preferred_product_name?: string | null;
  preferred_size?: string | null;
  preferred_unit?: string | null;
  notes?: string | null;
  is_active: boolean;
};

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [itemKeyword, setItemKeyword] = useState("");
  const [preferenceType, setPreferenceType] = useState("favorite");
  const [preferredBrand, setPreferredBrand] = useState("");
  const [preferredProductName, setPreferredProductName] = useState("");
  const [preferredSize, setPreferredSize] = useState("");
  const [preferredUnit, setPreferredUnit] = useState("");
  const [notes, setNotes] = useState("");

  async function loadPreferences() {
    try {
      const res = await fetch(`${API_BASE}/preferences?user_id=john`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load preferences.");

      setPreferences(data.preferences || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preferences.");
    }
  }

  async function createPreference() {
    setError("");
    setMessage("");

    if (!itemKeyword.trim()) {
      setError("Item keyword is required.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: "john",
          item_keyword: itemKeyword.trim(),
          preference_type: preferenceType,
          preferred_brand: preferredBrand.trim() || null,
          preferred_product_name: preferredProductName.trim() || null,
          preferred_size: preferredSize.trim() || null,
          preferred_unit: preferredUnit.trim() || null,
          notes: notes.trim() || null,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create preference.");

      setMessage("Preference saved.");
      setItemKeyword("");
      setPreferenceType("favorite");
      setPreferredBrand("");
      setPreferredProductName("");
      setPreferredSize("");
      setPreferredUnit("");
      setNotes("");

      await loadPreferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create preference.");
    }
  }

  useEffect(() => {
    loadPreferences();
  }, []);

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Shopping Intelligence
            </p>
            <h1 className="mt-2 text-4xl font-bold">Favorites & Obsessions</h1>
          </div>

          <div className="flex gap-3">
            <Link
              href="/shopping"
              className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
            >
              Shopping Lists
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

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Add Preference</h2>

            <div className="space-y-4">
              <input
                value={itemKeyword}
                onChange={(e) => setItemKeyword(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="toothpaste"
              />

              <select
                value={preferenceType}
                onChange={(e) => setPreferenceType(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              >
                <option value="favorite">Favorite</option>
                <option value="obsession">Obsession</option>
              </select>

              <input
                value={preferredBrand}
                onChange={(e) => setPreferredBrand(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Colgate"
              />

              <input
                value={preferredProductName}
                onChange={(e) => setPreferredProductName(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Total Whitening"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={preferredSize}
                  onChange={(e) => setPreferredSize(e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="20"
                />

                <input
                  value={preferredUnit}
                  onChange={(e) => setPreferredUnit(e.target.value)}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="oz"
                />
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                rows={3}
                placeholder="Extra rules or notes..."
              />

              <button
                onClick={createPreference}
                className="w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
              >
                Save Preference
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Saved Preferences</h2>

            <div className="space-y-4">
              {preferences.length === 0 && (
                <div className="rounded-xl border border-green-500/20 bg-black p-4">
                  No favorites or obsessions yet.
                </div>
              )}

              {preferences.map((pref) => (
                <div
                  key={pref.id}
                  className="rounded-xl border border-green-500/20 bg-black p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-semibold">{pref.item_keyword}</p>
                    <span className="rounded-lg border border-green-500/30 px-3 py-1 text-sm">
                      {pref.preference_type}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-green-300/80">
                    {pref.preferred_brand && <p>Brand: {pref.preferred_brand}</p>}
                    {pref.preferred_product_name && <p>Product: {pref.preferred_product_name}</p>}
                    {(pref.preferred_size || pref.preferred_unit) && (
                      <p>
                        Size: {pref.preferred_size || "?"} {pref.preferred_unit || ""}
                      </p>
                    )}
                    {pref.notes && <p>Notes: {pref.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}