"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type GoalLog = {
  id: string;
  value?: number | null;
  notes?: string | null;
  created_at: string;
};

type GoalPeriod = {
  frequency: string;
  label: string;
  period_start: string;
  period_end: string;
  value: number;
  target_value?: number | null;
  percent?: number | null;
  hit_goal: boolean;
  missed_goal: boolean;
  is_current: boolean;
};

type Goal = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  goal_type: string;
  target_value?: number | null;
  current_value?: number | null;
  unit?: string | null;
  frequency?: string | null;
  is_active: boolean;
  created_at: string;
  logs?: GoalLog[];
  period?: GoalPeriod;
  period_history?: GoalPeriod[];
  progress?: {
    percent?: number | null;
    remaining?: number | null;
    is_complete: boolean;
  };
  eta?: {
    estimated_completion_date?: string | null;
    summary: string;
    method: string;
  };
};

type GoalForm = {
  title: string;
  description: string;
  category: string;
  goal_type: string;
  target_value: string;
  current_value: string;
  unit: string;
  frequency: string;
};

const emptyForm: GoalForm = {
  title: "",
  description: "",
  category: "fitness",
  goal_type: "metric",
  target_value: "",
  current_value: "0",
  unit: "lbs",
  frequency: "",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [logValues, setLogValues] = useState<Record<string, string>>({});
  const [logNotes, setLogNotes] = useState<Record<string, string>>({});
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);

  async function loadGoals() {
    try {
      const res = await fetch(`${API_BASE}/goals?user_id=john`, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load goals.");

      setGoals(data.goals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goals.");
    }
  }

  async function createGoal() {
    setError("");
    setMessage("");

    if (!form.title.trim()) {
      setError("Goal title is required.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/goals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: "john",
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          goal_type: form.goal_type,
          target_value: form.target_value ? Number(form.target_value) : null,
          current_value: form.current_value ? Number(form.current_value) : 0,
          unit: form.unit.trim() || null,
          frequency: form.frequency || null,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create goal.");

      setMessage("Goal created.");
      setForm(emptyForm);
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    }
  }

  async function logGoal(goal: Goal) {
    setError("");
    setMessage("");

    const rawValue = logValues[goal.id];
    const value = rawValue ? Number(rawValue) : 1;

    if (Number.isNaN(value)) {
      setError("Log value must be a number.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/goals/${goal.id}/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          value,
          notes: logNotes[goal.id]?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to log goal progress.");

      setMessage("Progress logged.");
      setLogValues((prev) => ({ ...prev, [goal.id]: "" }));
      setLogNotes((prev) => ({ ...prev, [goal.id]: "" }));
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log goal progress.");
    }
  }

  async function archiveGoal(goalId: string) {
    setError("");
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/goals/${goalId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          is_active: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to archive goal.");

      setMessage("Goal archived.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive goal.");
    }
  }

  useEffect(() => {
    loadGoals();
  }, []);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Progress Systems
            </p>
            <h1 className="mt-2 text-4xl font-bold">Goals</h1>
            <p className="mt-3 text-green-300/80">
              Track targets, log progress, and estimate completion.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">
              Command Center
            </Link>
            <Link href="/workouts" className="command-nav-link">
              Workouts
            </Link>
            <Link href="/meal-planner" className="command-nav-link">
              Meal Planner
            </Link>
            <Link href="/shopping" className="command-nav-link">
              Shopping
            </Link>
          </nav>
        </header>

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

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Add Goal</h2>

            <div className="space-y-4">
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder="Bench 315"
              />

              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                rows={3}
                placeholder="Why this matters..."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                >
                  <option value="fitness">Fitness</option>
                  <option value="career">Career</option>
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="finance">Finance</option>
                </select>

                <select
                  value={form.goal_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, goal_type: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                >
                  <option value="metric">Metric</option>
                  <option value="habit">Habit</option>
                  <option value="count">Count</option>
                  <option value="binary">Binary</option>
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <input
                  type="number"
                  value={form.current_value}
                  onChange={(e) => setForm((prev) => ({ ...prev, current_value: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="Current"
                />

                <input
                  type="number"
                  value={form.target_value}
                  onChange={(e) => setForm((prev) => ({ ...prev, target_value: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="Target"
                />

                <input
                  value={form.unit}
                  onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  placeholder="lbs"
                />
              </div>

              <select
                value={form.frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value }))}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              >
                <option value="">No frequency</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              <button
                onClick={createGoal}
                className="w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 transition hover:bg-green-500/20"
              >
                Save Goal
              </button>
            </div>
          </section>

          <section className="space-y-4">
            {goals.length === 0 && (
              <div className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
                No active goals yet.
              </div>
            )}

            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                logValue={logValues[goal.id] || ""}
                logNote={logNotes[goal.id] || ""}
                onLogValueChange={(value) => setLogValues((prev) => ({ ...prev, [goal.id]: value }))}
                onLogNoteChange={(value) => setLogNotes((prev) => ({ ...prev, [goal.id]: value }))}
                onLog={() => logGoal(goal)}
                onArchive={() => archiveGoal(goal.id)}
                onOpenHistory={() => setHistoryGoal(goal)}
              />
            ))}
          </section>
        </div>
      </div>

      {historyGoal && (
        <GoalHistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} />
      )}
    </main>
  );
}

function GoalHistoryModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const periodHistory = goal.period_history || [];
  const completedPeriods = periodHistory.filter((period) => !period.is_current);
  const hitCount = completedPeriods.filter((period) => period.hit_goal).length;
  const missedCount = completedPeriods.filter((period) => period.missed_goal).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-300/40 bg-zinc-950 p-6 text-green-300 shadow-[0_0_45px_rgba(34,211,238,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-cyan-200/70">
              Goal History
            </p>
            <h2 className="mt-2 text-3xl font-bold text-green-300">{goal.title}</h2>
            <p className="mt-2 text-green-300/70">
              {goal.frequency ? `${goal.frequency} goal` : "Goal"} · Hit {hitCount} · Missed {missedCount}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-cyan-300/40 px-4 py-2 text-cyan-100 transition hover:bg-cyan-300/10"
          >
            Close
          </button>
        </div>

        {periodHistory.length === 0 ? (
          <div className="mt-6 rounded-xl border border-green-500/20 bg-black p-4">
            No history has been logged yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {periodHistory.map((period) => (
              <div
                key={`${period.period_start}-${period.period_end}`}
                className="rounded-xl border border-green-500/20 bg-black p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-green-300">{period.label}</p>
                    <p className="mt-1 text-sm text-green-300/60">
                      {formatNumber(period.value)}
                      {goal.unit ? ` ${goal.unit}` : ""} /{" "}
                      {period.target_value ? formatNumber(period.target_value) : "No target"}
                    </p>
                  </div>
                  <span className={getPeriodStatusClass(period)}>
                    {period.is_current ? "Current" : period.hit_goal ? "Hit" : "Miss"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GoalCard({
  goal,
  logValue,
  logNote,
  onLogValueChange,
  onLogNoteChange,
  onLog,
  onArchive,
  onOpenHistory,
}: {
  goal: Goal;
  logValue: string;
  logNote: string;
  onLogValueChange: (value: string) => void;
  onLogNoteChange: (value: string) => void;
  onLog: () => void;
  onArchive: () => void;
  onOpenHistory: () => void;
}) {
  const percent = goal.progress?.percent ?? 0;
  const isLimitBreak = percent >= 100 || !!goal.progress?.is_complete;
  const progressBarClass = isLimitBreak
    ? "limit-break-bar h-full rounded-full transition-all"
    : `${getProgressColorClass(percent)} h-full rounded-full transition-all`;
  const cardClass = isLimitBreak
    ? "rounded-2xl border border-yellow-300/70 bg-zinc-950 p-6 shadow-[0_0_38px_rgba(250,204,21,0.35)]"
    : `${getProgressCardClass(percent)} rounded-2xl bg-zinc-950 p-6`;
  const etaDate = goal.eta?.estimated_completion_date
    ? new Date(`${goal.eta.estimated_completion_date}T12:00:00`).toLocaleDateString()
    : null;

  return (
    <article
      className={`${cardClass} ${goal.period ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(34,211,238,0.22)]" : ""}`}
      onClick={goal.period ? onOpenHistory : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-green-500/60">
            {goal.category} / {goal.goal_type}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{goal.title}</h2>
          {goal.description && (
            <p className="mt-2 text-green-300/75">{goal.description}</p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          Archive
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-green-300/75">
          <span>
            {formatNumber(goal.current_value)}{goal.unit ? ` ${goal.unit}` : ""} /{" "}
            {goal.target_value ? `${formatNumber(goal.target_value)}${goal.unit ? ` ${goal.unit}` : ""}` : "No target"}
          </span>
          <span className={isLimitBreak ? "font-bold text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]" : ""}>
            {goal.progress?.percent ?? 0}%
          </span>
        </div>

        <div
          className={
            isLimitBreak
              ? "h-5 overflow-hidden rounded-full border border-yellow-200/80 bg-black shadow-[0_0_22px_rgba(250,204,21,0.45)]"
              : "h-4 overflow-hidden rounded-full border border-green-500/30 bg-black"
          }
        >
          <div
            className={progressBarClass}
            style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }}
          />
        </div>
        {isLimitBreak && (
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.95)]">
            Limit Break
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-green-500/20 bg-black p-4">
          <p className="text-xs uppercase tracking-wide text-green-500/60">Estimated Completion</p>
          <p className="mt-2 font-semibold text-green-300">{etaDate || "Unknown"}</p>
          <p className="mt-1 text-sm text-green-300/65">{goal.eta?.summary || "No estimate yet."}</p>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-black p-4">
          <p className="text-xs uppercase tracking-wide text-green-500/60">Remaining</p>
          <p className="mt-2 font-semibold text-green-300">
            {goal.progress?.remaining ?? "?"}{goal.unit ? ` ${goal.unit}` : ""}
          </p>
          {goal.frequency && (
            <p className="mt-1 text-sm text-green-300/65">Frequency: {goal.frequency}</p>
          )}
        </div>
      </div>

      {goal.period && (
        <div className="mt-4 rounded-xl border border-green-500/20 bg-black p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-green-500/60">
                Current {goal.period.frequency}
              </p>
              <p className="mt-1 font-semibold text-green-300">{goal.period.label}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-green-300">
                {formatNumber(goal.period.value)}{goal.unit ? ` ${goal.unit}` : ""}
              </p>
              <p className="text-sm text-green-300/65">
                {goal.period.hit_goal ? "Goal hit" : "In progress"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-[0.45fr_1fr_auto]" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          value={logValue}
          onChange={(e) => onLogValueChange(e.target.value)}
          className="rounded-xl border border-green-500/30 bg-black px-4 py-3"
          placeholder={goal.goal_type === "metric" || goal.goal_type === "binary" ? "New value" : "Add amount"}
        />
        <input
          value={logNote}
          onChange={(e) => onLogNoteChange(e.target.value)}
          className="rounded-xl border border-green-500/30 bg-black px-4 py-3"
          placeholder="Progress note"
        />
        <button
          onClick={onLog}
          className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 transition hover:bg-green-500/20"
        >
          Log
        </button>
      </div>

      {goal.logs && goal.logs.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm uppercase tracking-wide text-green-500/60">Recent Logs</p>
          <div className="space-y-2">
            {goal.logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-green-500/20 bg-black px-3 py-2 text-sm">
                <span className="font-semibold text-green-300">{formatNumber(log.value)}</span>
                <span className="text-green-300/60"> · {new Date(log.created_at).toLocaleString()}</span>
                {log.notes && <span className="text-green-300/75"> · {log.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function getProgressColorClass(percent: number) {
  if (percent < 25) {
    return "bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.7)]";
  }
  if (percent < 60) {
    return "bg-orange-400 shadow-[0_0_16px_rgba(251,146,60,0.7)]";
  }
  if (percent < 90) {
    return "bg-yellow-300 shadow-[0_0_16px_rgba(253,224,71,0.75)]";
  }
  return "bg-green-400 shadow-[0_0_18px_rgba(74,222,128,0.8)]";
}

function getProgressCardClass(percent: number) {
  if (percent < 25) {
    return "border border-red-500/50 shadow-[0_0_22px_rgba(239,68,68,0.22)]";
  }
  if (percent < 60) {
    return "border border-orange-400/50 shadow-[0_0_22px_rgba(251,146,60,0.22)]";
  }
  if (percent < 90) {
    return "border border-yellow-300/55 shadow-[0_0_22px_rgba(253,224,71,0.24)]";
  }
  return "border border-green-400/55 shadow-[0_0_24px_rgba(74,222,128,0.28)]";
}

function getPeriodStatusClass(period: GoalPeriod) {
  if (period.is_current) {
    return "rounded-full border border-cyan-300/40 px-2 py-0.5 text-xs uppercase tracking-wide text-cyan-200";
  }
  if (period.hit_goal) {
    return "rounded-full border border-green-400/40 px-2 py-0.5 text-xs uppercase tracking-wide text-green-200";
  }
  return "rounded-full border border-red-400/40 px-2 py-0.5 text-xs uppercase tracking-wide text-red-200";
}
