"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, PackageCheck, Radar, Star } from "lucide-react";

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
            <p className="section-label">Preference Intelligence</p>
            <h1 className="mt-2 text-4xl font-bold">Favorites & Obsessions</h1>
            <p className="mt-3 text-green-300/75">Preferred brands, exact products, sizes, and shopping rules.</p>
          </div>

          <div className="flex gap-3">
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
              <div className="hud-panel-icon"><Radar className="h-5 w-5" /></div>
              <h2 className="hud-panel-title">Add Preference Signal</h2>
            </div>

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
                className="command-action-button command-action-green w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-green-100"
              >
                Save Preference
              </button>
            </div>
          </section>

          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon"><Heart className="h-5 w-5" /></div>
              <h2 className="hud-panel-title">Saved Preference Signals</h2>
            </div>

            <div className="space-y-4">
              {preferences.length === 0 && (
                <div className="hud-row">
                  No favorites or obsessions yet.
                </div>
              )}

              {preferences.map((pref) => (
                <div
                  key={pref.id}
                  className="hud-row items-start gap-4"
                >
                  <div className="hud-row-icon">
                    {pref.preference_type === "obsession" ? <Star className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xl font-semibold text-green-100">{pref.item_keyword}</p>
                      <span className={`rounded-lg border px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                        pref.preference_type === "obsession"
                          ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                          : "border-green-500/30 text-green-200"
                      }`}>
                        {pref.preference_type}
                      </span>
                    </div>

                  <div className="mt-3 grid gap-2 text-green-300/80">
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
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
