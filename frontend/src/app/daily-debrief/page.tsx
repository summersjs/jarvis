"use client";

import Link from "next/link";
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  ShieldCheck,
  Target,
  Trophy,
  Utensils,
  Zap,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type Objective = {
  id?: string | null;
  title: string;
  completed: boolean;
  notes: string;
  blocker: string;
};

type DailyDebriefSummary = {
  status: string;
  date: string;
  mission_score?: number | null;
  overall_status?: string | null;
  day_type?: string | null;
  scheduled_lift?: string | null;
  scheduled_lift_label?: string | null;
  next_protocol?: {
    date: string;
    lift: string;
    weekday: string;
  } | null;
  tomorrow_day_type?: string | null;
  tomorrow_scheduled_lift?: string | null;
  spoken_response?: string;
  objectives_completed: number;
  objectives_total: number;
  workout_completed: boolean;
  food_spend_today: number;
  daily_spending_status: string;
  victory?: {
    win: string;
    category: string;
  };
  lessons?: {
    worked?: string;
    did_not_work?: string;
    adjust_tomorrow?: string;
  };
  tomorrow_priorities?: string[];
  objectives?: Objective[];
  training?: {
    workout_completed: boolean;
    scheduled_lift?: string | null;
    lift_completed?: string | null;
    top_set_weight?: number | null;
    top_set_reps?: number | null;
    sets_completed?: number | null;
    goal_impact?: string | null;
    energy_level?: number | null;
    pain_notes?: string | null;
    training_notes?: string | null;
  };
  nutrition?: {
    meals_planned_today: number;
    meals_completed: number;
    ate_out_today: boolean;
    estimated_food_spend: number;
    notes?: string | null;
  };
  finance?: {
    money_spent_today: number;
    category?: string | null;
    notes?: string | null;
    unexpected_expense?: boolean | null;
    spending_status?: string | null;
  };
  saved_entry?: SavedDebriefEntry | null;
  calendar?: {
    today?: {
      summary?: string;
      events?: Array<{
        summary?: string;
        start?: Record<string, unknown>;
        end?: Record<string, unknown>;
        location?: string | null;
      }>;
    };
    tomorrow?: {
      summary?: string;
      events?: Array<{
        summary?: string;
        start?: Record<string, unknown>;
        end?: Record<string, unknown>;
        location?: string | null;
      }>;
    };
  };
};

type SavedDebriefEntry = {
  date?: string;
  mission_score?: number | null;
  overall_status?: string;
  summary?: string;
  objectives?: Objective[];
  training?: {
    workout_completed?: boolean;
    lift_completed?: string | null;
    top_set_weight?: number | null;
    top_set_reps?: number | null;
    energy_level?: number | null;
    pain_notes?: string | null;
    training_notes?: string | null;
  };
  nutrition?: {
    meals_planned_today?: number;
    meals_completed?: number;
    ate_out_today?: boolean;
    estimated_food_spend?: number;
    notes?: string | null;
  };
  finance?: {
    money_spent_today?: number;
    category?: string | null;
    notes?: string | null;
    unexpected_expense?: boolean;
    spending_status?: string | null;
  };
  victory?: {
    win?: string;
    category?: string;
  };
  lessons?: {
    worked?: string;
    did_not_work?: string;
    adjust_tomorrow?: string;
  };
  tomorrow?: {
    top_priorities?: string[];
    shopping_items?: string[];
    meal_prep?: string | null;
    reminder?: string | null;
  };
};

type DebriefHistoryEntry = {
  date: string;
  overall_status: string;
  summary?: string | null;
  victory?: {
    win: string;
    category: string;
  };
  objectives?: Objective[];
};

type DebriefForm = {
  date: string;
  mission_score: number | null;
  overall_status: string;
  summary: string;
  objectives: Objective[];
  training: {
    workout_completed: boolean;
    lift_completed: string;
    top_set_weight: string;
    top_set_reps: string;
    energy_level: string;
    pain_notes: string;
    training_notes: string;
  };
  nutrition: {
    meals_planned_today: string;
    meals_completed: string;
    ate_out_today: boolean;
    estimated_food_spend: string;
    notes: string;
  };
  finance: {
    money_spent_today: string;
    category: string;
    notes: string;
    unexpected_expense: boolean;
    spending_status: string;
  };
  victory: {
    win: string;
    category: string;
  };
  lessons: {
    worked: string;
    did_not_work: string;
    adjust_tomorrow: string;
  };
  tomorrow: {
    top_priorities: string[];
    shopping_items: string[];
    meal_prep: string;
    reminder: string;
  };
};

const defaultForm: DebriefForm = {
  date: "",
  overall_status: "PARTIAL",
  mission_score: null,
  summary: "",
  objectives: [],
  training: {
    workout_completed: false,
    lift_completed: "",
    top_set_weight: "",
    top_set_reps: "",
    energy_level: "",
    pain_notes: "",
    training_notes: "",
  },
  nutrition: {
    meals_planned_today: "",
    meals_completed: "",
    ate_out_today: false,
    estimated_food_spend: "",
    notes: "",
  },
  finance: {
    money_spent_today: "",
    category: "Food",
    notes: "",
    unexpected_expense: false,
    spending_status: "WATCH",
  },
  victory: {
    win: "",
    category: "Personal",
  },
  lessons: {
    worked: "",
    did_not_work: "",
    adjust_tomorrow: "",
  },
  tomorrow: {
    top_priorities: ["", "", ""],
    shopping_items: [""],
    meal_prep: "",
    reminder: "",
  },
};

export default function DailyDebriefPage() {
  const [summary, setSummary] = useState<DailyDebriefSummary | null>(null);
  const [history, setHistory] = useState<DebriefHistoryEntry[]>([]);
  const [form, setForm] = useState<DebriefForm>(defaultForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [summaryRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/debrief/daily?user_id=${USER_ID}`, {
          headers: { "x-api-key": API_KEY },
        }),
        fetch(`${API_BASE}/debrief/daily/history?user_id=${USER_ID}`, {
          headers: { "x-api-key": API_KEY },
        }),
      ]);

      const summaryData = await summaryRes.json();
      const historyData = await historyRes.json();

      if (!summaryRes.ok) throw new Error(summaryData.detail || "Failed to load daily debrief.");
      if (!historyRes.ok) throw new Error(historyData.detail || "Failed to load debrief history.");

      setSummary(summaryData);
      setHistory(historyData.entries || []);
      setForm(fromSummary(summaryData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load debrief data.");
    }
  }, []);

  async function saveEntry() {
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const res = await fetch(`${API_BASE}/debrief/daily`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify(toPayload(form, summary)),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save debrief.");

      setMessage("Daily debrief saved.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save debrief.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Tactical Logs
            </p>
            <h1 className="mt-2 text-4xl font-bold">Daily Debrief</h1>
            <p className="mt-3 text-green-300/80">
              End-of-day mission report, training wrap, and tomorrow prep.
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
            <Link href="/finance-ops" className="command-nav-link">
              Finance Ops
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

        {summary?.spoken_response && (
          <section className="hud-panel mb-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="hud-panel-icon">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <p className="hud-panel-title">Evening Brief</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-green-500/60">
                    {summary.day_type ? `Today: ${formatLabel(summary.day_type)}` : "Today"}
                    {summary.next_protocol ? ` · Next: ${formatLabel(summary.next_protocol.lift)}` : ""}
                  </p>
                </div>
              </div>
              <span className="status-pill">
                {(summary.overall_status || summary.status || "OK").toUpperCase()}
              </span>
            </div>
            <p className="text-lg leading-relaxed text-green-100">{summary.spoken_response}</p>
          </section>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <StatCard icon={ClipboardList} label="Objectives" value={`${summary?.objectives_completed ?? 0}/${summary?.objectives_total ?? 0}`} />
          <StatCard icon={CheckCircle2} label="Workout" value={summary?.workout_completed ? "Logged" : "Missing"} />
          <StatCard icon={Utensils} label="Food Spend" value={`$${formatMoney(summary?.food_spend_today ?? 0)}`} />
          <StatCard icon={DollarSign} label="Spend Status" value={summary?.daily_spending_status || "WATCH"} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Panel title="Mission Summary" icon={CalendarDays}>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <SummaryChip label="Today" value={formatLabel(summary?.day_type || "rest")} />
                <SummaryChip
                  label="Next Protocol"
                  value={
                    summary?.next_protocol
                      ? `${formatLabel(summary.next_protocol.lift)} on ${summary.next_protocol.weekday}`
                      : "None"
                  }
                />
                <SummaryChip
                  label="Tomorrow"
                  value={formatLabel(summary?.tomorrow_day_type || "rest")}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Date">
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>

                <Field label="Overall Status">
                  <select
                    value={form.overall_status}
                    onChange={(e) => setForm((prev) => ({ ...prev, overall_status: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  >
                    <option value="COMPLETE">COMPLETE</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="MISSED">MISSED</option>
                    <option value="CHAOTIC">CHAOTIC</option>
                    <option value="RECOVERY">RECOVERY</option>
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Short Summary">
                    <textarea
                      value={form.summary}
                      onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                      placeholder="What kind of day was it?"
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="Objectives Review" icon={Target}>
              <div className="space-y-3">
                {form.objectives.length === 0 && (
                  <p className="text-sm text-green-300/60">No objectives loaded.</p>
                )}
                {form.objectives.map((objective, index) => (
                  <Link
                    key={`${objective.title}-${index}`}
                    href={objective.id ? `/goals?goal=${objective.id}` : "/goals"}
                    className={`hud-row items-start gap-4 transition hover:-translate-y-0.5 ${
                      objective.completed
                        ? "debrief-objective-complete"
                        : "debrief-objective-active"
                    }`}
                  >
                    <div className="hud-row-icon">
                      {objective.completed ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Target className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-green-100">{objective.title}</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-green-300/60">
                            {objective.completed ? "Cleared" : "In progress"}
                          </p>
                        </div>
                        <span
                          className={`status-pill ${
                            objective.completed ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100" : ""
                          }`}
                        >
                          {objective.completed ? "CLEARED" : "OPEN"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-green-300/80">{objective.notes}</p>
                      {!objective.completed && objective.blocker && (
                        <p className="mt-2 text-sm text-amber-200/80">Blocker: {objective.blocker}</p>
                      )}
                      {objective.completed && (
                        <p className="mt-2 text-sm text-cyan-200/80">
                          Cleared objective. Tap to jump to the goal record.
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="Training Debrief" icon={ShieldCheck}>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <SummaryChip label="Workout" value={summary?.workout_completed ? "Logged" : "Missing"} />
                <SummaryChip
                  label="Lift"
                  value={summary?.training?.lift_completed || summary?.scheduled_lift_label || "None"}
                />
                <SummaryChip
                  label="Goal impact"
                  value={summary?.training?.goal_impact || "No active impact note"}
                />
                <SummaryChip
                  label="Top set"
                  value={
                    summary?.training?.top_set_weight && summary?.training?.top_set_reps
                      ? `${summary.training.top_set_weight} x ${summary.training.top_set_reps}`
                      : "No top set"
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Energy level 1-5">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={form.training.energy_level}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        training: { ...prev.training, energy_level: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Pain notes">
                  <input
                    value={form.training.pain_notes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        training: { ...prev.training, pain_notes: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Training notes">
                    <textarea
                      value={form.training.training_notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          training: { ...prev.training, training_notes: e.target.value },
                        }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2 rounded-xl border border-green-500/20 bg-black p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-green-500/70">Training notes preview</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-green-100/90">
                    {summary?.training?.training_notes || form.training.training_notes || "No training notes yet."}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Nutrition Debrief" icon={Utensils}>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <SummaryChip
                  label="Meals planned"
                  value={String(summary?.nutrition?.meals_planned_today ?? 0)}
                />
                <SummaryChip
                  label="Ate out"
                  value={summary?.nutrition?.ate_out_today ? "Yes" : "No"}
                />
                <SummaryChip
                  label="Food spend"
                  value={`$${formatMoney(summary?.nutrition?.estimated_food_spend ?? summary?.food_spend_today ?? 0)}`}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Meals planned today">
                  <input
                    type="number"
                    value={form.nutrition.meals_planned_today}
                    onChange={() => undefined}
                    readOnly
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Meals completed">
                  <input
                    type="number"
                    value={form.nutrition.meals_completed}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        nutrition: { ...prev.nutrition, meals_completed: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <ToggleField
                  label="Ate out today?"
                  checked={form.nutrition.ate_out_today}
                  disabled
                  onChange={() => undefined}
                />
                <Field label="Estimated food spend">
                  <input
                    type="number"
                    step="0.01"
                    value={form.nutrition.estimated_food_spend}
                    onChange={() => undefined}
                    readOnly
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      value={form.nutrition.notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          nutrition: { ...prev.nutrition, notes: e.target.value },
                        }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="Finance Debrief" icon={DollarSign}>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <SummaryChip label="Spend status" value={summary?.daily_spending_status || "WATCH"} />
                <SummaryChip label="Money spent" value={`$${formatMoney(summary?.food_spend_today ?? 0)}`} />
                <SummaryChip label="Category" value={summary?.finance?.category || "Food"} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Money spent today">
                  <input
                    type="number"
                    step="0.01"
                    value={form.finance.money_spent_today}
                    onChange={() => undefined}
                    readOnly
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Category">
                  <input
                    value={form.finance.category}
                    onChange={() => undefined}
                    readOnly
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <ToggleField
                  label="Unexpected expense?"
                  checked={form.finance.unexpected_expense}
                  onChange={() => undefined}
                />
                <Field label="Daily spending status">
                  <select
                    value={form.finance.spending_status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        finance: { ...prev.finance, spending_status: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  >
                    <option value="UNDER CONTROL">UNDER CONTROL</option>
                    <option value="WATCH">WATCH</option>
                    <option value="OVER">OVER</option>
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      value={form.finance.notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          finance: { ...prev.finance, notes: e.target.value },
                        }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                  </Field>
                </div>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Victory Log" icon={Trophy}>
              <div className="space-y-4">
                <Field label="One win from today">
                  <textarea
                    value={form.victory.win}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        victory: { ...prev.victory, win: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={form.victory.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        victory: { ...prev.victory, category: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  >
                    <option>Training</option>
                    <option>Family</option>
                    <option>Work</option>
                    <option>Money</option>
                    <option>Personal</option>
                    <option>App Build</option>
                    <option>Other</option>
                  </select>
                </Field>
              </div>
            </Panel>

            <Panel title="Lessons Learned" icon={BrainCircuit}>
              <div className="space-y-4">
                <Field label="What worked today?">
                  <textarea
                    value={form.lessons.worked}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        lessons: { ...prev.lessons, worked: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="What did not work?">
                  <textarea
                    value={form.lessons.did_not_work}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        lessons: { ...prev.lessons, did_not_work: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="What needs adjusted tomorrow?">
                  <textarea
                    value={form.lessons.adjust_tomorrow}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        lessons: { ...prev.lessons, adjust_tomorrow: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Tomorrow Prep" icon={Zap}>
              <div className="space-y-4">
                <div className="rounded-xl border border-green-500/20 bg-black p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-green-500/70">Tomorrow Calendar</p>
                  <p className="mt-2 text-sm text-green-300/80">
                    {summary?.calendar?.tomorrow?.summary || "No calendar summary loaded."}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(summary?.calendar?.tomorrow?.events || []).length === 0 && (
                      <p className="text-sm text-green-300/60">No calendar events detected.</p>
                    )}
                    {(summary?.calendar?.tomorrow?.events || []).map((event, index) => (
                      <div key={`${event.summary}-${index}`} className="hud-row">
                        <CalendarDays className="h-4 w-4" />
                        <div>
                          <p className="font-semibold text-green-100">{event.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {form.tomorrow.top_priorities.map((priority, index) => (
                    <Field key={`priority-${index}`} label={`Top priority ${index + 1}`}>
                      <input
                        value={priority}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.tomorrow.top_priorities];
                            next[index] = e.target.value;
                            return { ...prev, tomorrow: { ...prev.tomorrow, top_priorities: next } };
                          })
                        }
                        className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                      />
                    </Field>
                  ))}
                </div>

                <Field label="Shopping items needed">
                  <textarea
                    value={form.tomorrow.shopping_items.join("\n")}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tomorrow: {
                          ...prev.tomorrow,
                          shopping_items: splitLines(e.target.value),
                        },
                      }))
                    }
                    rows={4}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    placeholder="One item per line"
                  />
                </Field>

                <Field label="Meal prep needed">
                  <textarea
                    value={form.tomorrow.meal_prep}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tomorrow: { ...prev.tomorrow, meal_prep: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>

                <Field label="Calendar / work reminder">
                  <textarea
                    value={form.tomorrow.reminder}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tomorrow: { ...prev.tomorrow, reminder: e.target.value },
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
              </div>
            </Panel>

            <button
              onClick={saveEntry}
              disabled={isSaving}
              className="w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-4 text-lg font-semibold transition hover:bg-green-500/20 disabled:opacity-50"
            >
              {isSaving ? "Saving Debrief..." : "Save Daily Debrief"}
            </button>

            <Panel title="Recent Entries" icon={ClipboardList}>
              <div className="space-y-3">
                {history.length === 0 && (
                  <p className="text-sm text-green-300/60">No saved debriefs yet.</p>
                )}
                {history.slice(0, 5).map((entry) => (
                  <div key={entry.date} className="rounded-xl border border-green-500/20 bg-black p-4">
                    <p className="font-semibold text-green-100">{entry.date}</p>
                    <p className="mt-1 text-sm text-green-300/70">{entry.overall_status}</p>
                    <p className="mt-2 text-sm text-green-300/80">
                      {entry.victory?.win || entry.summary || "No summary provided."}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}

function fromSummary(summary: DailyDebriefSummary): DebriefForm {
  const saved = summary.saved_entry || {};
  const objectives = (saved.objectives || summary.objectives || []).map((objective: Objective) => ({
    id: objective.id || undefined,
    title: objective.title || "",
    completed: !!objective.completed,
    notes: objective.notes || "",
    blocker: objective.blocker || "",
  }));

  return {
    date: saved.date || summary.date || new Date().toISOString().slice(0, 10),
    overall_status: summary.status || saved.overall_status || "PARTIAL",
    mission_score: summary.mission_score ?? saved.mission_score ?? null,
    summary: saved.summary || summary.spoken_response || "",
    objectives: objectives.length > 0 ? objectives : [],
    training: {
      workout_completed: saved.training?.workout_completed ?? summary.workout_completed ?? false,
      lift_completed: saved.training?.lift_completed || summary.training?.lift_completed || "",
      top_set_weight: toInputValue(saved.training?.top_set_weight ?? summary.training?.top_set_weight ?? ""),
      top_set_reps: toInputValue(saved.training?.top_set_reps ?? summary.training?.top_set_reps ?? ""),
      energy_level: toInputValue(saved.training?.energy_level ?? summary.training?.energy_level ?? ""),
      pain_notes: saved.training?.pain_notes || summary.training?.pain_notes || "",
      training_notes: saved.training?.training_notes || summary.training?.training_notes || "",
    },
    nutrition: {
      meals_planned_today: toInputValue(saved.nutrition?.meals_planned_today ?? summary.nutrition?.meals_planned_today ?? ""),
      meals_completed: toInputValue(saved.nutrition?.meals_completed ?? summary.nutrition?.meals_completed ?? ""),
      ate_out_today: saved.nutrition?.ate_out_today ?? summary.nutrition?.ate_out_today ?? false,
      estimated_food_spend: toInputValue(saved.nutrition?.estimated_food_spend ?? summary.nutrition?.estimated_food_spend ?? summary.food_spend_today ?? ""),
      notes: saved.nutrition?.notes || summary.nutrition?.notes || "",
    },
    finance: {
      money_spent_today: toInputValue(saved.finance?.money_spent_today ?? summary.finance?.money_spent_today ?? summary.food_spend_today ?? ""),
      category: saved.finance?.category || summary.finance?.category || "Food",
      notes: saved.finance?.notes || summary.finance?.notes || "",
      unexpected_expense: saved.finance?.unexpected_expense ?? summary.finance?.unexpected_expense ?? false,
      spending_status: saved.finance?.spending_status || summary.daily_spending_status || "WATCH",
    },
    victory: {
      win: saved.victory?.win || summary.victory?.win || "",
      category: saved.victory?.category || summary.victory?.category || "Personal",
    },
    lessons: {
      worked: saved.lessons?.worked || summary.lessons?.worked || "",
      did_not_work: saved.lessons?.did_not_work || summary.lessons?.did_not_work || "",
      adjust_tomorrow: saved.lessons?.adjust_tomorrow || summary.lessons?.adjust_tomorrow || "",
    },
    tomorrow: {
      top_priorities: normalizeLines(saved.tomorrow?.top_priorities || summary.tomorrow_priorities || []),
      shopping_items: normalizeLines(saved.tomorrow?.shopping_items || []),
      meal_prep: saved.tomorrow?.meal_prep || summary.calendar?.tomorrow?.summary || "",
      reminder:
        saved.tomorrow?.reminder ||
        (summary.next_protocol ? `Next protocol: ${summary.next_protocol.lift}` : ""),
    },
  };
}

function toPayload(form: DebriefForm, summary: DailyDebriefSummary | null) {
  return {
    user_id: USER_ID,
    date: form.date || new Date().toISOString().slice(0, 10),
    overall_status: form.overall_status,
    mission_score: form.mission_score ?? summary?.mission_score ?? null,
    summary: form.summary,
    objectives: form.objectives,
    training: {
      workout_completed: form.training.workout_completed,
      lift_completed: form.training.lift_completed || null,
      top_set_weight: numberOrNull(form.training.top_set_weight),
      top_set_reps: intOrNull(form.training.top_set_reps),
      energy_level: intOrNull(form.training.energy_level),
      pain_notes: form.training.pain_notes || null,
      training_notes: form.training.training_notes || null,
    },
    nutrition: {
      meals_planned_today: intOrNull(form.nutrition.meals_planned_today) ?? 0,
      meals_completed: intOrNull(form.nutrition.meals_completed) ?? 0,
      ate_out_today: form.nutrition.ate_out_today,
      estimated_food_spend: numberOrNull(form.nutrition.estimated_food_spend) ?? 0,
      notes: form.nutrition.notes || null,
    },
    finance: {
      money_spent_today: numberOrNull(form.finance.money_spent_today) ?? 0,
      category: form.finance.category || null,
      notes: form.finance.notes || null,
      unexpected_expense: form.finance.unexpected_expense,
      spending_status: form.finance.spending_status || null,
    },
    victory: form.victory,
    lessons: form.lessons,
    tomorrow: {
      top_priorities: form.tomorrow.top_priorities.filter(Boolean),
      shopping_items: form.tomorrow.shopping_items.filter(Boolean),
      meal_prep: form.tomorrow.meal_prep || null,
      reminder: form.tomorrow.reminder || null,
    },
  };
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeLines(value: string[] | string) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value: string) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function intOrNull(value: string) {
  if (value === "") return null;
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? null : number;
}

function toInputValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="hud-panel">
      <div className="mb-5 flex items-center gap-3">
        <div className="hud-panel-icon">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="hud-panel-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-green-300/80">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-green-500/20 bg-black px-4 py-3">
      <span className="text-green-100">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="hud-row items-start gap-4">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-green-300" />
        <p className="text-xs uppercase tracking-[0.25em] text-green-500/70">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-green-100">{value}</p>
    </div>
  );
}

function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-black px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-green-500/60">{label}</p>
      <p className="mt-2 text-sm font-semibold text-green-100">{value}</p>
    </div>
  );
}
