"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type MealEntry = {
  id: string;
  meal_type: string;
  name: string;
  notes?: string | null;
};

type ShoppingItem = {
  id: string;
  item_name: string;
  quantity?: string | null;
  category?: string | null;
};

type DashboardResponse = {
  status: string;
  date: string;
  today: {
    day_type?: string | null;
    scheduled_lift?: string | null;
    scheduled_lift_label?: string | null;
    spoken_response?: string | null;
  };
  next_workout: {
    lift?: string | null;
    lift_label?: string | null;
    spoken_response?: string | null;
  };
  meals: MealEntry[];
  shopping: {
    list?: {
      id: string;
      title: string;
      week_start?: string | null;
    } | null;
    unchecked_count: number;
    unchecked_items: ShoppingItem[];
  };
  calendar: {
    today: {
      status: string;
      spoken_response: string;
      fallback_shift?: string;
    };
    tomorrow: {
      status: string;
      spoken_response: string;
      fallback_shift?: string;
    };
  };
  coaching_note: string;
};

type StatusResponse = {
  systems: string;
  brain: string;
  user: string;
  clearance: string;
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

function getWorkoutIcon(dayType?: string | null) {
  switch (dayType) {
    case "bench":
      return "/icons/bench-press.png";
    case "squat":
      return "/icons/squat.png";
    case "deadlift":
      return "/icons/deadlift.png";
    case "overhead_press":
      return "/icons/overhead-press.png";
    case "completed":
      return "/icons/complete.png";
    case "rest":
    default:
      return "/icons/rest.png";
  }
}

function formatDayType(dayType?: string | null) {
  if (!dayType) return "Loading";
  if (dayType === "overhead_press") return "Overhead Press";
  if (dayType === "completed") return "Training Complete";
  if (dayType === "rest") return "Rest Day";
  return dayType.charAt(0).toUpperCase() + dayType.slice(1);
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function CommandCenterPage() {
  const userId = "john";
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadDashboard() {
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/dashboard/daily?user_id=${userId}`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load command center.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function toggleStatus() {
    setError("");

    if (status) {
      setStatus(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/status`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Jarvis backend.");
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-green-500/20 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
                Jarvis Systems
              </p>
              <h1 className="mt-2 text-4xl font-bold">Daily Command Center</h1>
              <p className="mt-3 text-green-300/80">
                {dashboard ? formatDate(dashboard.date) : "Loading today..."}
              </p>
            </div>

            <nav className="flex flex-wrap gap-2">
              <button className="command-nav-link" onClick={toggleStatus}>
                {status ? "Hide Status" : "Ping Jarvis"}
              </button>
              <Link className="command-nav-link" href="/meal-planner">
                Meal Planner
              </Link>
              <Link className="command-nav-link" href="/shopping">
                Shopping
              </Link>
              <Link className="command-nav-link" href="/recipes">
                Recipes
              </Link>
              <Link className="command-nav-link" href="/preferences">
                Preferences
              </Link>
            </nav>
          </div>
        </header>

        {status && (
          <div className="mb-6 grid gap-3 text-sm md:grid-cols-4">
            <StatusCard label="Systems" value={status.systems} />
            <StatusCard label="Brain" value={status.brain} />
            <StatusCard label="User" value={status.user} />
            <StatusCard label="Clearance" value={status.clearance} />
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {isLoading && !dashboard && (
          <div className="rounded-xl border border-green-500/20 bg-zinc-950 p-6">
            Loading command center...
          </div>
        )}

        {dashboard && (
          <>
            <section className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Link
                href="/workouts"
                className="group relative block overflow-hidden rounded-2xl border border-green-500/30 bg-zinc-950 p-6 transition duration-300 hover:-translate-y-1 hover:border-green-300 hover:bg-green-500/10 hover:shadow-[0_0_45px_rgba(34,197,94,0.45)]"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
                  <div className="absolute inset-x-0 top-0 h-px bg-green-200" />
                  <div className="absolute -left-24 top-0 h-full w-24 rotate-12 bg-green-200/20 blur-xl transition duration-700 group-hover:translate-x-[42rem]" />
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <img
                    src={getWorkoutIcon(dashboard.today.day_type)}
                    alt={formatDayType(dashboard.today.day_type)}
                    className="h-24 w-24 object-contain transition duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_22px_rgba(134,239,172,0.9)]"
                  />
                  <div>
                    <p className="text-sm uppercase tracking-wide text-green-500/60">Today</p>
                    <h2 className="mt-1 text-3xl font-bold transition duration-300 group-hover:text-green-200 group-hover:drop-shadow-[0_0_12px_rgba(134,239,172,0.8)]">
                      {formatDayType(dashboard.today.day_type)}
                    </h2>
                    <p className="mt-2 text-green-300/80">
                      {dashboard.today.spoken_response || "No workout status available."}
                    </p>
                  </div>
                </div>
              </Link>

              <div className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
                <p className="text-sm uppercase tracking-wide text-green-500/60">Jarvis Note</p>
                <p className="mt-3 text-xl font-semibold text-green-300">
                  {dashboard.coaching_note}
                </p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <DashboardPanel title="Next Workout">
                <p className="text-2xl font-semibold">
                  {dashboard.next_workout.lift_label || "No lift queued"}
                </p>
                <p className="mt-2 text-green-300/75">
                  {dashboard.next_workout.spoken_response || "No next workout found."}
                </p>
              </DashboardPanel>

              <DashboardPanel title="Calendar / Work">
                <div className="space-y-4">
                  <CalendarLine label="Today" item={dashboard.calendar.today} />
                  <CalendarLine label="Tomorrow" item={dashboard.calendar.tomorrow} />
                </div>
              </DashboardPanel>

              <DashboardPanel title="Meal Plan Today">
                {dashboard.meals.length === 0 ? (
                  <p className="text-green-300/70">No meals planned today.</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.meals.map((meal) => (
                      <div key={meal.id} className="rounded-xl border border-green-500/20 bg-black p-4">
                        <p className="font-semibold capitalize">{meal.meal_type}</p>
                        <p className="mt-1 text-green-300/80">{meal.name}</p>
                        {meal.notes && <p className="mt-1 text-sm text-green-300/60">{meal.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </DashboardPanel>

              <DashboardPanel title="Unchecked Shopping">
                {!dashboard.shopping.list ? (
                  <p className="text-green-300/70">No shopping list found.</p>
                ) : dashboard.shopping.unchecked_count === 0 ? (
                  <div>
                    <p className="text-xl font-semibold">{dashboard.shopping.list.title}</p>
                    <p className="mt-2 text-green-300/70">Everything is checked off.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xl font-semibold">
                      {dashboard.shopping.unchecked_count} open item{dashboard.shopping.unchecked_count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-green-300/60">{dashboard.shopping.list.title}</p>
                    <div className="mt-4 space-y-2">
                      {dashboard.shopping.unchecked_items.slice(0, 8).map((item) => (
                        <div key={item.id} className="rounded-lg border border-green-500/20 bg-black px-3 py-2">
                          <span className="font-semibold">{item.item_name}</span>
                          <span className="text-green-300/60">
                            {item.quantity ? ` · ${item.quantity}` : ""}
                            {item.category ? ` · ${item.category}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </DashboardPanel>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DashboardPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-zinc-950 p-4">
      <p className="text-xs uppercase tracking-wide text-green-500/60">{label}</p>
      <p className="mt-2 text-lg font-semibold text-green-300">{value}</p>
    </div>
  );
}

function CalendarLine({
  label,
  item,
}: {
  label: string;
  item: {
    status: string;
    spoken_response: string;
  };
}) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-black p-4">
      <p className="text-sm uppercase tracking-wide text-green-500/60">{label}</p>
      <p className="mt-2 text-green-300/85">{item.spoken_response}</p>
      {item.status === "fallback" && (
        <p className="mt-2 text-sm text-yellow-300/80">
          Calendar unavailable or empty. Showing shift fallback.
        </p>
      )}
    </div>
  );
}
