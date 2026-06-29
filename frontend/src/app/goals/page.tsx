"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

function getApiBase() {
  if (typeof window === "undefined") return CONFIGURED_API_BASE;

  const configuredUrl = new URL(CONFIGURED_API_BASE);
  const isConfiguredLocal =
    configuredUrl.hostname === "127.0.0.1" || configuredUrl.hostname === "localhost";
  const isPageLocal =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

  if (isConfiguredLocal && !isPageLocal) {
    return `${configuredUrl.protocol}//${window.location.hostname}:${configuredUrl.port || "8000"}`;
  }

  return CONFIGURED_API_BASE;
}

function apiUrl(path: string) {
  return `${getApiBase()}${path}`;
}

type GoalLog = {
  id: string;
  value?: number | null;
  notes?: string | null;
  log_type?: string | null;
  planned_for?: string | null;
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
  status?: string;
  planned_for?: string | null;
  planned_time?: string | null;
  remaining?: number | null;
};

type GoalMilestone = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  target_date?: string | null;
  completed_at?: string | null;
  cost?: number | null;
  notes?: string | null;
  sort_order?: number | null;
  created_at: string;
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
  mission_type?: "objective" | "standard" | "project";
  status?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  planned_date?: string | null;
  planned_time?: string | null;
  metadata?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  logs?: GoalLog[];
  period?: GoalPeriod;
  period_history?: GoalPeriod[];
  standard?: {
    status: string;
    period_start?: string | null;
    period_end?: string | null;
    planned_for?: string | null;
    planned_time?: string | null;
    remaining?: number | null;
    streak_count: number;
    success_count: number;
    miss_count: number;
    success_rate?: number | null;
  };
  milestones?: GoalMilestone[];
  project?: {
    status: string;
    completed_count: number;
    total_count: number;
    remaining_count: number;
    percent: number;
    next_milestone?: GoalMilestone | null;
    monthly_cadence?: string | null;
    recent_milestone_log?: GoalLog | null;
  };
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
  mission_type: "objective" | "standard" | "project";
  title: string;
  description: string;
  category: string;
  goal_type: string;
  target_value: string;
  current_value: string;
  unit: string;
  frequency: string;
  due_date: string;
  planned_date: string;
  planned_time: string;
  monthly_cadence: string;
  milestones: string;
};

const emptyForm: GoalForm = {
  mission_type: "objective",
  title: "",
  description: "",
  category: "fitness",
  goal_type: "metric",
  target_value: "",
  current_value: "0",
  unit: "lbs",
  frequency: "",
  due_date: "",
  planned_date: "",
  planned_time: "",
  monthly_cadence: "",
  milestones: "",
};

export default function GoalsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black px-6 py-10 text-green-400" />}>
      <GoalsPageInner />
    </Suspense>
  );
}

function GoalsPageInner() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [logValues, setLogValues] = useState<Record<string, string>>({});
  const [logNotes, setLogNotes] = useState<Record<string, string>>({});
  const [planDates, setPlanDates] = useState<Record<string, string>>({});
  const [planTimes, setPlanTimes] = useState<Record<string, string>>({});
  const [planNotes, setPlanNotes] = useState<Record<string, string>>({});
  const [milestoneTitles, setMilestoneTitles] = useState<Record<string, string>>({});
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);
  const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);

  async function loadGoals() {
    try {
      const res = await fetch(apiUrl("/goals?user_id=john"), {
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
      const milestones = form.milestones
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((title, index) => ({
          title,
          status: "open",
          sort_order: index,
        }));
      const res = await fetch(apiUrl("/goals"), {
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
          mission_type: form.mission_type,
          status: "active",
          target_value: form.target_value ? Number(form.target_value) : null,
          current_value: form.current_value ? Number(form.current_value) : 0,
          unit: form.unit.trim() || null,
          frequency: form.frequency || null,
          due_date: form.due_date || null,
          planned_date: form.planned_date || null,
          planned_time: form.planned_time || null,
          metadata: form.monthly_cadence
            ? { monthly_cadence: form.monthly_cadence }
            : {},
          milestones,
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
      const res = await fetch(apiUrl(`/goals/${goal.id}/logs`), {
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

  async function planGoal(goal: Goal) {
    setError("");
    setMessage("");

    const plannedFor = planDates[goal.id];
    if (!plannedFor) {
      setError("Choose a planned date first.");
      return;
    }

    try {
      const res = await fetch(apiUrl(`/goals/${goal.id}/plan`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          value: 0,
          planned_for: plannedFor,
          notes: planNotes[goal.id]?.trim() || null,
          metadata: {
            planned_time: planTimes[goal.id] || null,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to plan standard.");

      setMessage("Standard planned.");
      setPlanDates((prev) => ({ ...prev, [goal.id]: "" }));
      setPlanTimes((prev) => ({ ...prev, [goal.id]: "" }));
      setPlanNotes((prev) => ({ ...prev, [goal.id]: "" }));
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to plan standard.");
    }
  }

  async function addMilestone(goal: Goal) {
    setError("");
    setMessage("");

    const title = milestoneTitles[goal.id]?.trim();
    if (!title) {
      setError("Milestone title is required.");
      return;
    }

    try {
      const res = await fetch(apiUrl(`/goals/${goal.id}/milestones`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          title,
          status: "open",
          sort_order: goal.milestones?.length || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add milestone.");

      setMessage("Milestone added.");
      setMilestoneTitles((prev) => ({ ...prev, [goal.id]: "" }));
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add milestone.");
    }
  }

  async function updateMilestone(milestoneId: string, status: string) {
    setError("");
    setMessage("");

    try {
      const res = await fetch(apiUrl(`/goals/milestones/${milestoneId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update milestone.");

      setMessage("Milestone updated.");
      await loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update milestone.");
    }
  }

  async function archiveGoal(goalId: string) {
    setError("");
    setMessage("");

    try {
      const res = await fetch(apiUrl(`/goals/${goalId}`), {
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
            <h2 className="mb-4 text-2xl font-semibold">Add Mission</h2>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-green-500/70">
                  Mission Type
                </span>
                <select
                  value={form.mission_type}
                  onChange={(e) =>
                    setForm((prev) => {
                      const missionType = e.target.value as GoalForm["mission_type"];
                      if (missionType === "standard") {
                        return {
                          ...prev,
                          mission_type: missionType,
                          goal_type: "count",
                          frequency: prev.frequency || "weekly",
                          current_value: "0",
                        };
                      }
                      if (missionType === "project") {
                        return {
                          ...prev,
                          mission_type: missionType,
                          goal_type: "milestone",
                          target_value: "",
                          current_value: "0",
                          unit: "milestone",
                          frequency: "monthly",
                        };
                      }
                      return {
                        ...prev,
                        mission_type: missionType,
                        goal_type: "metric",
                        frequency: "",
                      };
                    })
                  }
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                >
                  <option value="objective">Objective</option>
                  <option value="standard">Standard</option>
                  <option value="project">Project</option>
                </select>
              </label>

              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                placeholder={
                  form.mission_type === "project"
                    ? "Build the Jarvis Workstation"
                    : form.mission_type === "standard"
                      ? "1 Date Weekly"
                      : "Bench 315"
                }
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
                  <option value="jarvis">Jarvis</option>
                  <option value="personal">Personal</option>
                  <option value="finance">Finance</option>
                </select>

                {form.mission_type !== "project" && (
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
                )}
              </div>

              {form.mission_type === "objective" && (
                <>
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                    <FrequencySelect value={form.frequency} onChange={(frequency) => setForm((prev) => ({ ...prev, frequency }))} optional />
                  </div>
                </>
              )}

              {form.mission_type === "standard" && (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FrequencySelect value={form.frequency} onChange={(frequency) => setForm((prev) => ({ ...prev, frequency }))} />
                    <input
                      type="number"
                      value={form.target_value}
                      onChange={(e) => setForm((prev) => ({ ...prev, target_value: e.target.value }))}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                      placeholder="Target per period"
                    />
                    <input
                      value={form.unit}
                      onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                      placeholder="module, feature, date"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      type="date"
                      value={form.planned_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, planned_date: e.target.value }))}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                    <input
                      type="time"
                      value={form.planned_time}
                      onChange={(e) => setForm((prev) => ({ ...prev, planned_time: e.target.value }))}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                  </div>
                </>
              )}

              {form.mission_type === "project" && (
                <>
                  <input
                    value={form.monthly_cadence}
                    onChange={(e) => setForm((prev) => ({ ...prev, monthly_cadence: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    placeholder="Buy approximately 1 part or upgrade per month"
                  />
                  <textarea
                    value={form.milestones}
                    onChange={(e) => setForm((prev) => ({ ...prev, milestones: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    rows={7}
                    placeholder={"GPU\nCPU\nMotherboard\nRAM"}
                  />
                </>
              )}

              <button
                onClick={createGoal}
                className="w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 transition hover:bg-green-500/20"
              >
                Save Mission
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
                focused={goal.id === focusedGoalId}
                logValue={logValues[goal.id] || ""}
                logNote={logNotes[goal.id] || ""}
                onLogValueChange={(value) => setLogValues((prev) => ({ ...prev, [goal.id]: value }))}
                onLogNoteChange={(value) => setLogNotes((prev) => ({ ...prev, [goal.id]: value }))}
                onLog={() => logGoal(goal)}
                planDate={planDates[goal.id] || ""}
                planTime={planTimes[goal.id] || ""}
                planNote={planNotes[goal.id] || ""}
                onPlanDateChange={(value) => setPlanDates((prev) => ({ ...prev, [goal.id]: value }))}
                onPlanTimeChange={(value) => setPlanTimes((prev) => ({ ...prev, [goal.id]: value }))}
                onPlanNoteChange={(value) => setPlanNotes((prev) => ({ ...prev, [goal.id]: value }))}
                onPlan={() => planGoal(goal)}
                milestoneTitle={milestoneTitles[goal.id] || ""}
                onMilestoneTitleChange={(value) => setMilestoneTitles((prev) => ({ ...prev, [goal.id]: value }))}
                onAddMilestone={() => addMilestone(goal)}
                onUpdateMilestone={updateMilestone}
                onArchive={() => archiveGoal(goal.id)}
                onOpenHistory={() => setHistoryGoal(goal)}
              />
            ))}
          </section>
        </div>
      </div>

      <GoalsFocusTracker goals={goals} onFocusGoalId={setFocusedGoalId} />

      {historyGoal && (
        <GoalHistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} />
      )}
    </main>
  );
}

function GoalsFocusTracker({
  goals,
  onFocusGoalId,
}: {
  goals: Goal[];
  onFocusGoalId: (goalId: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const focusGoalId = searchParams.get("goal");

  useEffect(() => {
    onFocusGoalId(focusGoalId);
    if (!focusGoalId || goals.length === 0) return;
    const goal = goals.find((item) => item.id === focusGoalId);
    if (!goal) return;
    const element = document.getElementById(`goal-${goal.id}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusGoalId, goals, onFocusGoalId]);

  return null;
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
  focused,
  logValue,
  logNote,
  onLogValueChange,
  onLogNoteChange,
  onLog,
  planDate,
  planTime,
  planNote,
  onPlanDateChange,
  onPlanTimeChange,
  onPlanNoteChange,
  onPlan,
  milestoneTitle,
  onMilestoneTitleChange,
  onAddMilestone,
  onUpdateMilestone,
  onArchive,
  onOpenHistory,
}: {
  goal: Goal;
  focused: boolean;
  logValue: string;
  logNote: string;
  onLogValueChange: (value: string) => void;
  onLogNoteChange: (value: string) => void;
  onLog: () => void;
  planDate: string;
  planTime: string;
  planNote: string;
  onPlanDateChange: (value: string) => void;
  onPlanTimeChange: (value: string) => void;
  onPlanNoteChange: (value: string) => void;
  onPlan: () => void;
  milestoneTitle: string;
  onMilestoneTitleChange: (value: string) => void;
  onAddMilestone: () => void;
  onUpdateMilestone: (milestoneId: string, status: string) => void;
  onArchive: () => void;
  onOpenHistory: () => void;
}) {
  const missionType = goal.mission_type || (goal.period ? "standard" : "objective");
  if (missionType === "standard") {
    return (
      <StandardCard
        goal={goal}
        focused={focused}
        logValue={logValue}
        logNote={logNote}
        onLogValueChange={onLogValueChange}
        onLogNoteChange={onLogNoteChange}
        onLog={onLog}
        planDate={planDate}
        planTime={planTime}
        planNote={planNote}
        onPlanDateChange={onPlanDateChange}
        onPlanTimeChange={onPlanTimeChange}
        onPlanNoteChange={onPlanNoteChange}
        onPlan={onPlan}
        onArchive={onArchive}
        onOpenHistory={onOpenHistory}
      />
    );
  }

  if (missionType === "project") {
    return (
      <ProjectCard
        goal={goal}
        focused={focused}
        milestoneTitle={milestoneTitle}
        onMilestoneTitleChange={onMilestoneTitleChange}
        onAddMilestone={onAddMilestone}
        onUpdateMilestone={onUpdateMilestone}
        onArchive={onArchive}
      />
    );
  }

  return (
    <ObjectiveCard
      goal={goal}
      focused={focused}
      logValue={logValue}
      logNote={logNote}
      onLogValueChange={onLogValueChange}
      onLogNoteChange={onLogNoteChange}
      onLog={onLog}
      onArchive={onArchive}
      onOpenHistory={onOpenHistory}
    />
  );
}

function ObjectiveCard({
  goal,
  focused,
  logValue,
  logNote,
  onLogValueChange,
  onLogNoteChange,
  onLog,
  onArchive,
  onOpenHistory,
}: {
  goal: Goal;
  focused: boolean;
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
  const cardClass = isLimitBreak
    ? "rounded-2xl border border-yellow-300/70 bg-zinc-950 p-6 shadow-[0_0_38px_rgba(250,204,21,0.35)]"
    : `${getProgressCardClass(percent)} rounded-2xl bg-zinc-950 p-6`;
  const etaDate = goal.eta?.estimated_completion_date
    ? new Date(`${goal.eta.estimated_completion_date}T12:00:00`).toLocaleDateString()
    : null;

  return (
    <article
      id={`goal-${goal.id}`}
      className={`${cardClass} ${goal.period ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(34,211,238,0.22)]" : ""} ${focused ? "ring-2 ring-cyan-300/60 shadow-[0_0_42px_rgba(34,211,238,0.25)]" : ""}`}
      onClick={goal.period ? onOpenHistory : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-green-500/60">
            Objective / {goal.category} / {goal.goal_type}
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

        <GoalProgressBar goal={goal} />
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

function StandardCard({
  goal,
  focused,
  logValue,
  logNote,
  onLogValueChange,
  onLogNoteChange,
  onLog,
  planDate,
  planTime,
  planNote,
  onPlanDateChange,
  onPlanTimeChange,
  onPlanNoteChange,
  onPlan,
  onArchive,
  onOpenHistory,
}: {
  goal: Goal;
  focused: boolean;
  logValue: string;
  logNote: string;
  onLogValueChange: (value: string) => void;
  onLogNoteChange: (value: string) => void;
  onLog: () => void;
  planDate: string;
  planTime: string;
  planNote: string;
  onPlanDateChange: (value: string) => void;
  onPlanTimeChange: (value: string) => void;
  onPlanNoteChange: (value: string) => void;
  onPlan: () => void;
  onArchive: () => void;
  onOpenHistory: () => void;
}) {
  const standard = goal.standard;
  const period = goal.period;
  const percent = period?.percent ?? goal.progress?.percent ?? 0;

  return (
    <article
      id={`goal-${goal.id}`}
      className={`rounded-2xl border border-cyan-300/35 bg-zinc-950 p-6 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(34,211,238,0.22)] ${focused ? "ring-2 ring-cyan-300/60 shadow-[0_0_42px_rgba(34,211,238,0.25)]" : ""}`}
      onClick={onOpenHistory}
    >
      <CardHeader goal={goal} label={`Standard / ${goal.category}`} onArchive={onArchive} />

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricPanel label="Current Period" value={period?.label || "Unknown"} />
        <MetricPanel label="Status" value={standard?.status || "NOT PLANNED"} tone={getStandardTone(standard?.status)} />
        <MetricPanel
          label="Remaining"
          value={`${formatNumber(standard?.remaining)}${goal.unit ? ` ${goal.unit}` : ""}`}
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-green-300/75">
          <span>
            {formatNumber(period?.value || 0)}{goal.unit ? ` ${goal.unit}` : ""} /{" "}
            {goal.target_value ? `${formatNumber(goal.target_value)}${goal.unit ? ` ${goal.unit}` : ""}` : "No target"}
          </span>
          <span>{percent ?? 0}%</span>
        </div>
        <GoalProgressBar goal={goal} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricPanel label="Planned" value={formatPlannedDate(standard?.planned_for, standard?.planned_time)} />
        <MetricPanel label="Streak" value={`${standard?.streak_count ?? 0}`} />
        <MetricPanel label="Success Rate" value={standard?.success_rate == null ? "Pending" : `${standard.success_rate}%`} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[0.8fr_0.6fr_1fr_auto]" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={planDate}
          onChange={(e) => onPlanDateChange(e.target.value)}
          className="rounded-xl border border-cyan-300/30 bg-black px-4 py-3"
        />
        <input
          type="time"
          value={planTime}
          onChange={(e) => onPlanTimeChange(e.target.value)}
          className="rounded-xl border border-cyan-300/30 bg-black px-4 py-3"
        />
        <input
          value={planNote}
          onChange={(e) => onPlanNoteChange(e.target.value)}
          className="rounded-xl border border-cyan-300/30 bg-black px-4 py-3"
          placeholder="Friday date night"
        />
        <button
          onClick={onPlan}
          className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Plan
        </button>
      </div>

      <LogInputs
        goal={goal}
        logValue={logValue}
        logNote={logNote}
        onLogValueChange={onLogValueChange}
        onLogNoteChange={onLogNoteChange}
        onLog={onLog}
      />
      <RecentLogs goal={goal} />
    </article>
  );
}

function ProjectCard({
  goal,
  focused,
  milestoneTitle,
  onMilestoneTitleChange,
  onAddMilestone,
  onUpdateMilestone,
  onArchive,
}: {
  goal: Goal;
  focused: boolean;
  milestoneTitle: string;
  onMilestoneTitleChange: (value: string) => void;
  onAddMilestone: () => void;
  onUpdateMilestone: (milestoneId: string, status: string) => void;
  onArchive: () => void;
}) {
  const project = goal.project;
  const milestones = goal.milestones || [];

  return (
    <article
      id={`goal-${goal.id}`}
      className={`rounded-2xl border border-purple-300/35 bg-zinc-950 p-6 shadow-[0_0_24px_rgba(168,85,247,0.14)] ${focused ? "ring-2 ring-purple-300/60 shadow-[0_0_42px_rgba(168,85,247,0.25)]" : ""}`}
    >
      <CardHeader goal={goal} label={`Project / ${goal.category}`} onArchive={onArchive} />

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricPanel label="Status" value={project?.status || "NOT STARTED"} tone="purple" />
        <MetricPanel label="Milestones" value={`${project?.completed_count ?? 0} / ${project?.total_count ?? 0}`} />
        <MetricPanel label="Remaining" value={`${project?.remaining_count ?? 0}`} />
        <MetricPanel label="Next" value={project?.next_milestone?.title || "No milestone planned"} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-green-300/75">
          <span>{project?.monthly_cadence || "Monthly cadence not set"}</span>
          <span>{project?.percent ?? 0}%</span>
        </div>
        <div className="goal-progress-track">
          <div
            className="goal-progress-fill goal-progress-fill-green"
            style={{ width: `${Math.min(100, Math.max(0, project?.percent || 0))}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-300/20 bg-black px-3 py-2">
            <div>
              <p className="font-semibold text-green-100">{milestone.title}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200/70">{milestone.status}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateMilestone(milestone.id, "planned")}
                className="rounded-lg border border-cyan-300/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
              >
                Plan
              </button>
              <button
                onClick={() => onUpdateMilestone(milestone.id, "complete")}
                className="rounded-lg border border-green-400/30 px-3 py-2 text-sm text-green-100 hover:bg-green-400/10"
              >
                Complete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={milestoneTitle}
          onChange={(e) => onMilestoneTitleChange(e.target.value)}
          className="rounded-xl border border-purple-300/30 bg-black px-4 py-3"
          placeholder="Add workstation milestone"
        />
        <button
          onClick={onAddMilestone}
          className="rounded-xl border border-purple-300/40 bg-purple-300/10 px-4 py-3 text-purple-100 transition hover:bg-purple-300/20"
        >
          Add Milestone
        </button>
      </div>

      <RecentLogs goal={goal} />
    </article>
  );
}

function CardHeader({
  goal,
  label,
  onArchive,
}: {
  goal: Goal;
  label: string;
  onArchive: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-green-500/60">{label}</p>
        <h2 className="mt-1 text-2xl font-semibold text-green-100">{goal.title}</h2>
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
  );
}

function MetricPanel({
  label,
  value,
  tone = "green",
}: {
  label: string;
  value: string;
  tone?: "green" | "cyan" | "purple" | "amber" | "red";
}) {
  const toneClass = {
    green: "border-green-500/20 text-green-300",
    cyan: "border-cyan-300/25 text-cyan-100",
    purple: "border-purple-300/25 text-purple-100",
    amber: "border-amber-300/25 text-amber-100",
    red: "border-red-400/25 text-red-100",
  }[tone];

  return (
    <div className={`rounded-xl border bg-black p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-65">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function LogInputs({
  goal,
  logValue,
  logNote,
  onLogValueChange,
  onLogNoteChange,
  onLog,
}: {
  goal: Goal;
  logValue: string;
  logNote: string;
  onLogValueChange: (value: string) => void;
  onLogNoteChange: (value: string) => void;
  onLog: () => void;
}) {
  return (
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
  );
}

function RecentLogs({ goal }: { goal: Goal }) {
  if (!goal.logs || goal.logs.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="mb-2 text-sm uppercase tracking-wide text-green-500/60">Recent Logs</p>
      <div className="space-y-2">
        {goal.logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-green-500/20 bg-black px-3 py-2 text-sm">
            <span className="font-semibold uppercase tracking-[0.12em] text-green-300">
              {log.log_type || "progress"}
            </span>
            {log.value != null && <span className="text-green-300/75"> · {formatNumber(log.value)}</span>}
            <span className="text-green-300/60"> · {new Date(log.created_at).toLocaleString()}</span>
            {log.notes && <span className="text-green-300/75"> · {log.notes}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FrequencySelect({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
    >
      {optional && <option value="">No frequency</option>}
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </select>
  );
}

function formatPlannedDate(dateValue?: string | null, timeValue?: string | null) {
  if (!dateValue) return "Not planned";
  return `${new Date(`${dateValue}T12:00:00`).toLocaleDateString()}${timeValue ? ` at ${timeValue}` : ""}`;
}

function getStandardTone(status?: string | null): "green" | "cyan" | "purple" | "amber" | "red" {
  if (status === "COMPLETED") return "green";
  if (status === "PLANNED") return "cyan";
  if (status === "IN PROGRESS") return "amber";
  if (status === "MISSED") return "red";
  return "purple";
}

function GoalProgressBar({ goal }: { goal: Goal }) {
  const percent = goal.progress?.percent ?? 0;
  const current = Number(goal.current_value || 0);
  const isComplete = percent >= 100 || !!goal.progress?.is_complete;
  const status = getProgressStatus(percent, isComplete);
  const milestones = getGoalMilestones(goal);
  const upcomingMilestone = milestones.find((milestone) => current < milestone.value);

  return (
    <div className={`goal-progress-shell goal-progress-${status.tone}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`goal-progress-status goal-progress-status-${status.tone}`}>
          {status.label}
        </span>
        {upcomingMilestone && !isComplete && (
          <span className="text-xs uppercase tracking-[0.16em] text-green-300/65">
            Next unlock: {formatNumber(upcomingMilestone.value)}
            {goal.unit ? ` ${goal.unit}` : ""}
          </span>
        )}
      </div>

      <div className={`goal-progress-track ${isComplete ? "goal-progress-track-complete" : ""}`}>
        <div
          className={`goal-progress-fill ${
            isComplete ? "limit-break-bar goal-progress-fill-complete" : `goal-progress-fill-${status.tone}`
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }}
        >
          {(status.tone === "green" || isComplete) && (
            <span className="goal-progress-particles" aria-hidden="true" />
          )}
        </div>

        {milestones.map((milestone) => {
          const crossed = current >= milestone.value || isComplete;
          const upcoming = upcomingMilestone?.value === milestone.value;
          return (
            <div
              key={`${milestone.value}-${milestone.kind}`}
              className={[
                "goal-milestone",
                crossed ? "goal-milestone-crossed" : "",
                upcoming ? "goal-milestone-upcoming" : "",
                milestone.kind === "final" ? "goal-milestone-final" : "",
              ].join(" ")}
              style={{ left: `${milestone.percent}%` }}
              title={milestone.tooltip}
              aria-label={milestone.tooltip}
            >
              <span className="goal-milestone-pin">{crossed ? "✓" : ""}</span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.95)]">
          Limit Break
        </p>
      )}
    </div>
  );
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function getProgressStatus(percent: number, isComplete: boolean) {
  if (isComplete) {
    return {
      tone: "rainbow",
      label: "ACHIEVEMENT UNLOCKED",
    };
  }
  if (percent >= 95) {
    return {
      tone: "green",
      label: "GOAL IMMINENT",
    };
  }
  if (percent >= 85) {
    return {
      tone: "green",
      label: "FINAL STRETCH",
    };
  }
  if (percent >= 70) {
    return {
      tone: "yellow",
      label: "MOMENTUM BUILDING",
    };
  }
  if (percent >= 50) {
    return {
      tone: "yellow",
      label: "PROGRESSING",
    };
  }
  return {
    tone: "red",
    label: "LONG ROAD AHEAD",
  };
}

function getGoalMilestones(goal: Goal) {
  const target = Number(goal.target_value || 0);
  if (target <= 0) return [];

  const current = Number(goal.current_value || 0);
  const values = getStrengthMilestones(goal, target) || getDefaultMilestones(target);

  return values
    .filter((value) => value > 0 && value <= target)
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((value) => ({
      value,
      percent: Math.min(100, Math.max(0, (value / target) * 100)),
      kind: value === target ? "final" : "milestone",
      tooltip:
        value === target
          ? "Final Goal"
          : current >= value
            ? "Reached"
            : "Next Unlock",
    }));
}

function getStrengthMilestones(goal: Goal, target: number) {
  const title = goal.title.toLowerCase();
  const unit = (goal.unit || "").toLowerCase();
  const isStrengthGoal =
    unit.includes("lb") &&
    ["bench", "squat", "deadlift", "press", "ohp"].some((lift) => title.includes(lift));

  if (!isStrengthGoal) return null;

  const ratios = target <= 250
    ? [0.6, 0.8, 0.8888888889, 1]
    : [0.7142857143, 0.873015873, 0.9523809524, 1];

  return ratios.map((ratio) => roundToNearest5(target * ratio));
}

function getDefaultMilestones(target: number) {
  return [0.5, 0.75, 0.9, 1].map((ratio) => Math.round(target * ratio * 100) / 100);
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

function roundToNearest5(value: number) {
  return Math.round(value / 5) * 5;
}
