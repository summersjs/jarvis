"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Coffee,
  Droplets,
  Dumbbell,
  FileText,
  HeartPulse,
  History,
  Moon,
  Plus,
  ShieldCheck,
  Smile,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type EventType = {
  key: string;
  label: string;
  icon?: string | null;
  count_today: number;
};

type HealthEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  event_date: string;
  activity?: string | null;
  duration?: string | null;
  trigger?: string | null;
  relief?: string | null;
  severity?: string | null;
  notes?: string | null;
  context?: Record<string, unknown> | null;
};

type DailyCheckin = {
  energy?: number | null;
  mood?: number | null;
  stress?: number | null;
  sleep_quality?: number | null;
  hours_slept?: number | null;
  water_oz?: number | null;
  caffeine_mg?: number | null;
  workout_completed?: boolean | null;
  meals_planned?: number | null;
  meals_completed?: number | null;
  ate_out?: boolean | null;
  food_spend?: number | null;
  training_notes?: string | null;
  supplements?: string[] | null;
};

type EventSummary = {
  event_type: string;
  label: string;
  occurrences: number;
  average_per_day: number;
  highest_day?: { date: string; count: number } | null;
  most_common_activity?: string | null;
  most_common_trigger?: string | null;
  most_common_relief?: string | null;
  most_common_time?: string | null;
};

type DoctorSummary = {
  days: number;
  start_date: string;
  end_date: string;
  event_summary: {
    total_events: number;
    event_summaries: EventSummary[];
  };
  averages: {
    caffeine_mg_per_day?: number | null;
    sleep_hours?: number | null;
    water_oz_per_day?: number | null;
  };
  workout_adherence: {
    completed_days: number;
    logged_days: number;
  };
  meals_completed: number;
  factual_note: string;
};

type HealthDashboard = {
  status: string;
  date: string;
  snapshot: Record<string, number | string | boolean | null>;
  event_types: EventType[];
  events_today: HealthEvent[];
  timeline: HealthEvent[];
  daily_checkin?: DailyCheckin | null;
  context: Record<string, unknown>;
  supplements: string[];
  weekly_summary: {
    total_events: number;
    event_summaries: EventSummary[];
  };
  doctor_summaries: Record<string, DoctorSummary>;
};

type DetailForm = {
  activity: string;
  duration: string;
  trigger: string;
  relief: string;
  severity: string;
  notes: string;
};

type CheckinForm = {
  energy: string;
  mood: string;
  stress: string;
  sleep_quality: string;
  hours_slept: string;
  water_oz: string;
  caffeine_mg: string;
  meals_completed: string;
  ate_out: boolean;
  food_spend: string;
  supplements: string[];
  notes: string;
};

const ACTIVITY_OPTIONS = [
  "Working",
  "Working at Computer",
  "Driving",
  "Watching TV",
  "Gaming",
  "Walking",
  "Exercising",
  "Eating",
  "Talking",
  "Laying Down",
  "Just Sitting",
  "Sleeping",
  "Other",
];

const TRIGGER_OPTIONS = [
  "Quiet Environment",
  "Stress",
  "After Caffeine",
  "After Meal",
  "Exercise",
  "Poor Sleep",
  "Unknown",
  "Other",
];

const RELIEF_OPTIONS = ["Music", "Movement", "Deep Breaths", "Standing Up", "Walking", "Talking", "Time", "Nothing", "Other"];
const DURATION_OPTIONS = ["<30 seconds", "30 sec-2 min", "2-10 min", "10-30 min", "30+ min", "Unknown"];
const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe"];

type DetailField = keyof DetailForm;

type DetailSection = {
  field: DetailField;
  label: string;
  options: string[];
  prefix?: string;
};

type DetailConfig = {
  title: string;
  prompt: string;
  sections: DetailSection[];
  presets?: {
    label: string;
    values: Partial<DetailForm>;
  }[];
};

const DEFAULT_DETAIL_CONFIG: DetailConfig = {
  title: "Event Detail",
  prompt: "Add optional context using one-tap buttons. Skip is always available.",
  sections: [
    { field: "activity", label: "Activity", options: ACTIVITY_OPTIONS },
    { field: "trigger", label: "Trigger", options: TRIGGER_OPTIONS },
    { field: "duration", label: "Duration", options: DURATION_OPTIONS },
    { field: "severity", label: "Severity", options: SEVERITY_OPTIONS },
    { field: "relief", label: "Relief", options: RELIEF_OPTIONS },
  ],
};

const DETAIL_CONFIG: Record<string, DetailConfig> = {
  deep_breath_awareness: {
    title: "Deep Breath Awareness Context",
    prompt: "What was happening when you noticed it?",
    presets: [
      {
        label: "Quiet + Sitting at Desk",
        values: { activity: "Sitting at Desk", trigger: "Quiet Environment" },
      },
      {
        label: "Working at Computer",
        values: { activity: "Working at Computer", trigger: "Quiet Environment" },
      },
      {
        label: "Driving",
        values: { activity: "Driving", trigger: "Unknown" },
      },
      {
        label: "Gym",
        values: { activity: "Gym", trigger: "Exercise" },
      },
    ],
    sections: [
      {
        field: "activity",
        label: "What were you doing?",
        options: ["Sitting at Desk", "Just Sitting", "Working", "Working at Computer", "Driving", "Gym", "Walking", "Watching TV", "Gaming", "Laying Down"],
      },
      {
        field: "trigger",
        label: "Environment / Trigger",
        options: ["Quiet Environment", "Stress", "After Caffeine", "After Meal", "Exercise", "Poor Sleep", "Unknown"],
      },
      { field: "relief", label: "What helped?", options: ["Music", "Movement", "Deep Breaths", "Standing Up", "Walking", "Time", "Nothing"] },
      { field: "duration", label: "Duration", options: DURATION_OPTIONS },
      { field: "severity", label: "Intensity", options: SEVERITY_OPTIONS },
    ],
  },
  forgetfulness: {
    title: "Forgetfulness Context",
    prompt: "What kind of forgetfulness happened?",
    sections: [
      {
        field: "notes",
        label: "What happened?",
        prefix: "Scenario",
        options: ["Driving", "Walking down the stairs", "Misplaced something", "Forgot a name or word", "Lost train of thought", "Forgot task", "Forgot why I entered a room", "Needed notes to recover"],
      },
      {
        field: "activity",
        label: "Activity",
        options: ["Working", "Working at Computer", "Driving", "Walking", "Talking", "Gaming", "Just Sitting", "Other"],
      },
      { field: "trigger", label: "Context", options: ["Stress", "Quiet Environment", "Poor Sleep", "After Caffeine", "After Meal", "Unknown"] },
      { field: "severity", label: "Severity", options: SEVERITY_OPTIONS },
      { field: "duration", label: "Duration", options: DURATION_OPTIONS },
    ],
  },
  headache: {
    title: "Headache Context",
    prompt: "Where is the headache located?",
    sections: [
      {
        field: "notes",
        label: "Location",
        prefix: "Location",
        options: ["Forehead", "Temples", "Left temple", "Right temple", "Behind eyes", "Back of head", "Top of head", "One side", "Whole head", "Neck-related"],
      },
      { field: "severity", label: "Severity", options: SEVERITY_OPTIONS },
      { field: "trigger", label: "Possible context", options: ["Stress", "After Caffeine", "After Meal", "Poor Sleep", "Exercise", "Unknown"] },
      { field: "relief", label: "What helped?", options: ["Water", "Food", "Rest", "Movement", "Time", "Nothing", "Other"] },
      { field: "duration", label: "Duration", options: DURATION_OPTIONS },
    ],
  },
};

const CAFFEINE_BUTTONS = [
  ["Coffee 12 oz", 140],
  ["Coffee 16 oz", 190],
  ["Coffee 20 oz", 240],
  ["Iced Coffee 12 oz", 120],
  ["Iced Coffee 16 oz", 165],
  ["Iced Coffee 20 oz", 205],
  ["Red Bull 8.4 oz", 80],
  ["Red Bull 12 oz", 114],
  ["Red Bull 16 oz", 151],
  ["Red Bull 20 oz", 189],
  ["Monster", 160],
  ["Celsius", 200],
] as const;

const EVENT_ICONS: Record<string, LucideIcon> = {
  deep_breath_awareness: Activity,
  brain_fog: Brain,
  forgetfulness: Brain,
  lightheaded: Zap,
  heart_flutter: HeartPulse,
  headache: Activity,
  diarrhea: Utensils,
  custom_event: Plus,
};

const emptyDetailForm: DetailForm = {
  activity: "",
  duration: "",
  trigger: "",
  relief: "",
  severity: "",
  notes: "",
};

export default function HealthOpsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dashboard, setDashboard] = useState<HealthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<HealthEvent | null>(null);
  const [detailForm, setDetailForm] = useState<DetailForm>(emptyDetailForm);
  const [doctorRange, setDoctorRange] = useState("7");
  const [checkin, setCheckin] = useState<CheckinForm>({
    energy: "",
    mood: "",
    stress: "",
    sleep_quality: "",
    hours_slept: "",
    water_oz: "",
    caffeine_mg: "",
    meals_completed: "",
    ate_out: false,
    food_spend: "",
    supplements: [],
    notes: "",
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/health-ops/dashboard?user_id=${USER_ID}&date=${today}`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load Health Ops.");
      setDashboard(data);
      setCheckin((prev) => hydrateCheckin(prev, data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Health Ops.");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function logEvent(eventType: EventType) {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/health-ops/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: USER_ID,
          event_type: eventType.key,
          event_date: today,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to log health event.");
      setSelectedEvent(data.event);
      setDetailForm(emptyDetailForm);
      setMessage(`${eventType.label} logged.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log health event.");
    }
  }

  async function saveEventDetails() {
    if (!selectedEvent) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/health-ops/events/${selectedEvent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          activity: detailForm.activity || null,
          duration: detailForm.duration || null,
          trigger: detailForm.trigger || null,
          relief: detailForm.relief || null,
          severity: detailForm.severity || null,
          notes: detailForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save event details.");
      setSelectedEvent(null);
      setMessage("Event detail saved.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event details.");
    }
  }

  function applyDetailPreset(values: Partial<DetailForm>) {
    setDetailForm((prev) => ({ ...prev, ...values }));
  }

  function setDetailField(field: DetailField, value: string, prefix?: string) {
    setDetailForm((prev) => ({
      ...prev,
      [field]: prefix ? `${prefix}: ${value}` : value,
    }));
  }

  async function saveCheckin() {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/health-ops/checkins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: USER_ID,
          checkin_date: today,
          energy: numberOrNull(checkin.energy),
          mood: numberOrNull(checkin.mood),
          stress: numberOrNull(checkin.stress),
          sleep_quality: numberOrNull(checkin.sleep_quality),
          hours_slept: numberOrNull(checkin.hours_slept),
          water_oz: numberOrNull(checkin.water_oz),
          caffeine_mg: numberOrNull(checkin.caffeine_mg),
          workout_completed: Boolean(dashboard?.snapshot.workout_completed),
          meals_planned: Number(dashboard?.snapshot.meals_planned || 0),
          meals_completed: numberOrNull(checkin.meals_completed),
          ate_out: checkin.ate_out,
          food_spend: numberOrNull(checkin.food_spend),
          supplements: checkin.supplements,
          notes: checkin.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save daily check-in.");
      setMessage("Daily health check-in saved.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save daily check-in.");
    }
  }

  const summary = dashboard?.doctor_summaries?.[doctorRange];

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">Jarvis Medical Observation Log</p>
            <h1 className="mt-2 text-4xl font-bold">Health Ops</h1>
            <p className="mt-3 max-w-3xl text-green-300/80">
              Factual health observations, timestamps, frequencies, and trends. No diagnosis. No causation claims.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">Command Center</Link>
            <Link href="/daily-debrief" className="command-nav-link">Daily Debrief</Link>
            <Link href="/workouts" className="command-nav-link">Workouts</Link>
            <Link href="/meal-planner" className="command-nav-link">Meal Planner</Link>
          </nav>
        </header>

        {error && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}
        {message && <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">{message}</div>}
        {loading && <div className="rounded-2xl border border-green-500/25 bg-zinc-950 p-6">Loading Health Ops...</div>}

        {!loading && dashboard && (
          <div className="grid gap-6">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <HudPanel title="Today's Health Snapshot" icon={ShieldCheck}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SnapshotMetric icon={Zap} label="Energy" value={scoreValue(dashboard.snapshot.energy)} />
                  <SnapshotMetric icon={Smile} label="Mood" value={scoreValue(dashboard.snapshot.mood)} />
                  <SnapshotMetric icon={Activity} label="Stress" value={scoreValue(dashboard.snapshot.stress)} />
                  <SnapshotMetric icon={Moon} label="Sleep" value={sleepValue(dashboard.snapshot)} />
                  <SnapshotMetric icon={Droplets} label="Water" value={unitValue(dashboard.snapshot.water_oz, "oz")} />
                  <SnapshotMetric icon={Coffee} label="Caffeine" value={unitValue(dashboard.snapshot.caffeine_mg, "mg")} />
                  <SnapshotMetric icon={Dumbbell} label="Workout Completed" value={dashboard.snapshot.workout_completed ? "Yes" : "No"} />
                  <SnapshotMetric icon={Utensils} label="Meals" value={`${dashboard.snapshot.meals_completed || 0}/${dashboard.snapshot.meals_planned || 0}`} />
                  <SnapshotMetric icon={HeartPulse} label="Current Symptom Count" value={String(dashboard.snapshot.current_symptom_count || 0)} />
                </div>
              </HudPanel>

              <HudPanel title="Daily Check-In" icon={CheckCircle2}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField label="Energy" value={checkin.energy} onChange={(value) => setCheckin((prev) => ({ ...prev, energy: value }))} />
                  <NumberField label="Mood" value={checkin.mood} onChange={(value) => setCheckin((prev) => ({ ...prev, mood: value }))} />
                  <NumberField label="Stress" value={checkin.stress} onChange={(value) => setCheckin((prev) => ({ ...prev, stress: value }))} />
                  <NumberField label="Sleep Quality" value={checkin.sleep_quality} onChange={(value) => setCheckin((prev) => ({ ...prev, sleep_quality: value }))} />
                  <TextField label="Hours Slept" value={checkin.hours_slept} onChange={(value) => setCheckin((prev) => ({ ...prev, hours_slept: value }))} />
                  <TextField label="Water Intake oz" value={checkin.water_oz} onChange={(value) => setCheckin((prev) => ({ ...prev, water_oz: value }))} />
                </div>

                <div className="mt-4 rounded-xl border border-green-500/20 bg-black p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-green-500/65">Caffeine</p>
                  <p className="mt-1 text-lg font-semibold text-green-100">{checkin.caffeine_mg || "0"} mg today</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CAFFEINE_BUTTONS.map(([label, mg]) => (
                      <button
                        key={label}
                        onClick={() => setCheckin((prev) => ({ ...prev, caffeine_mg: String(Number(prev.caffeine_mg || 0) + mg) }))}
                        className="command-action-button border border-green-500/25 px-3 py-2 text-xs text-green-200"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SnapshotMetric icon={Utensils} label="Meals Planned" value={String(dashboard.snapshot.meals_planned || 0)} />
                  <TextField label="Meals Completed" value={checkin.meals_completed} onChange={(value) => setCheckin((prev) => ({ ...prev, meals_completed: value }))} />
                  <ToggleField label="Ate Out?" checked={checkin.ate_out} onChange={(value) => setCheckin((prev) => ({ ...prev, ate_out: value }))} />
                  <TextField label="Food Spend" value={checkin.food_spend} onChange={(value) => setCheckin((prev) => ({ ...prev, food_spend: value }))} />
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-green-500/65">Supplements</p>
                  <div className="flex flex-wrap gap-2">
                    {dashboard.supplements.map((supplement) => (
                      <button
                        key={supplement}
                        onClick={() => setCheckin((prev) => toggleSupplement(prev, supplement))}
                        className={`command-action-button border px-3 py-2 text-xs ${
                          checkin.supplements.includes(supplement)
                            ? "border-green-300/60 bg-green-400/15 text-green-100"
                            : "border-green-500/25 text-green-300"
                        }`}
                      >
                        {supplement}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={saveCheckin} className="command-action-button command-action-green mt-5 w-full border border-green-400/40 bg-green-400/10 px-4 py-3 text-green-100">
                  Save Daily Check-In
                </button>
              </HudPanel>
            </section>

            <HudPanel title="Today's Quick Events" icon={Plus}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {dashboard.event_types.map((eventType) => {
                  const Icon = EVENT_ICONS[eventType.key] || Plus;
                  return (
                    <div key={eventType.key} className="rounded-xl border border-green-500/25 bg-black p-4 transition hover:border-green-300/50 hover:shadow-[0_0_22px_rgba(34,197,94,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-green-100">{eventType.label}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-green-500/65">{eventType.count_today} today</p>
                        </div>
                        <Icon className="h-5 w-5 text-green-300" />
                      </div>
                      <button
                        onClick={() => logEvent(eventType)}
                        className="command-action-button command-action-green mt-4 flex h-14 w-full items-center justify-center border border-green-400/35 bg-green-400/10 text-green-100"
                        aria-label={`Log ${eventType.label}`}
                      >
                        <Plus className="h-7 w-7" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </HudPanel>

            <section className="grid gap-6 lg:grid-cols-2">
              <HudPanel title="Weekly Health Summary" icon={Activity}>
                <SummaryList summaries={dashboard.weekly_summary.event_summaries} />
              </HudPanel>
              <HudPanel title="Timeline" icon={History}>
                <div className="space-y-3">
                  {dashboard.timeline.length === 0 && <p className="text-green-300/65">No health events logged today.</p>}
                  {dashboard.timeline.map((event) => (
                    <div key={event.id} className="rounded-xl border border-green-500/20 bg-black p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-green-100">{labelForEvent(event.event_type, dashboard.event_types)}</p>
                          <p className="mt-1 text-sm text-green-300/65">{formatTime(event.occurred_at)}</p>
                        </div>
                        {event.severity && <span className="rounded-full border border-green-400/35 px-2 py-1 text-xs uppercase tracking-[0.14em]">{event.severity}</span>}
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-green-300/75 sm:grid-cols-2">
                        <TimelineFact label="Activity" value={event.activity} />
                        <TimelineFact label="Trigger" value={event.trigger} />
                        <TimelineFact label="Relief" value={event.relief} />
                        <TimelineFact label="Duration" value={event.duration} />
                      </div>
                      {event.notes && <p className="mt-3 text-sm text-green-300/70">{event.notes}</p>}
                    </div>
                  ))}
                </div>
              </HudPanel>
            </section>

            <HudPanel title="Doctor Mode" icon={FileText}>
              <div className="mb-4 flex flex-wrap gap-2">
                {["7", "30", "90"].map((range) => (
                  <button
                    key={range}
                    onClick={() => setDoctorRange(range)}
                    className={`command-action-button border px-4 py-2 ${doctorRange === range ? "border-green-300/60 bg-green-400/15 text-green-100" : "border-green-500/25 text-green-300"}`}
                  >
                    Past {range} Days
                  </button>
                ))}
              </div>
              {summary && (
                <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <SummaryList summaries={summary.event_summary.event_summaries} />
                  <div className="rounded-xl border border-green-500/20 bg-black p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-green-500/65">Observed Averages</p>
                    <div className="mt-3 grid gap-3">
                      <SnapshotMetric icon={Moon} label="Sleep" value={unitValue(summary.averages.sleep_hours, "hours")} />
                      <SnapshotMetric icon={Coffee} label="Caffeine" value={unitValue(summary.averages.caffeine_mg_per_day, "mg/day")} />
                      <SnapshotMetric icon={Droplets} label="Water" value={unitValue(summary.averages.water_oz_per_day, "oz/day")} />
                      <SnapshotMetric icon={Dumbbell} label="Workout Days" value={`${summary.workout_adherence.completed_days}/${summary.workout_adherence.logged_days}`} />
                      <SnapshotMetric icon={Utensils} label="Meals Completed" value={String(summary.meals_completed || 0)} />
                    </div>
                    <p className="mt-4 text-sm text-green-300/60">{summary.factual_note}</p>
                  </div>
                </div>
              )}
            </HudPanel>
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventDetailPopup
          event={selectedEvent}
          eventLabel={labelForEvent(selectedEvent.event_type, dashboard?.event_types || [])}
          form={detailForm}
          onApplyPreset={applyDetailPreset}
          onSetField={setDetailField}
          onNotesChange={(value) => setDetailForm((prev) => ({ ...prev, notes: value }))}
          onSave={saveEventDetails}
          onSkip={() => setSelectedEvent(null)}
        />
      )}
    </main>
  );
}

function HudPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-5 shadow-[0_0_26px_rgba(34,197,94,0.12)]">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-green-300" />
        <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-green-200">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EventDetailPopup({
  event,
  eventLabel,
  form,
  onApplyPreset,
  onSetField,
  onNotesChange,
  onSave,
  onSkip,
}: {
  event: HealthEvent;
  eventLabel: string;
  form: DetailForm;
  onApplyPreset: (values: Partial<DetailForm>) => void;
  onSetField: (field: DetailField, value: string, prefix?: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const config = DETAIL_CONFIG[event.event_type] || DEFAULT_DETAIL_CONFIG;
  const selectedValues = [
    form.activity && `Activity: ${form.activity}`,
    form.trigger && `Trigger: ${form.trigger}`,
    form.relief && `Relief: ${form.relief}`,
    form.duration && `Duration: ${form.duration}`,
    form.severity && `Severity: ${form.severity}`,
    form.notes,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 px-4 py-6 backdrop-blur-sm sm:items-center">
      <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-green-400/45 bg-zinc-950 p-5 text-green-300 shadow-[0_0_48px_rgba(34,197,94,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-green-500/70">
              Observation Context
            </p>
            <h2 className="mt-2 text-2xl font-bold text-green-100">{config.title}</h2>
            <p className="mt-2 text-sm text-green-300/75">
              {eventLabel} logged at {formatTime(event.occurred_at)}. {config.prompt}
            </p>
          </div>
          <button
            onClick={onSkip}
            className="command-action-button border border-cyan-300/35 px-4 py-2 text-sm uppercase tracking-[0.16em] text-cyan-100"
          >
            Skip
          </button>
        </div>

        {config.presets && config.presets.length > 0 && (
          <div className="mt-5 rounded-xl border border-green-500/20 bg-black p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-green-500/65">Fast Presets</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {config.presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => onApplyPreset(preset.values)}
                  className="command-action-button command-action-green border border-green-400/35 bg-green-400/10 px-4 py-3 text-sm text-green-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4">
          {config.sections.map((section) => (
            <div key={`${section.field}-${section.label}`} className="rounded-xl border border-green-500/20 bg-black p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-500/65">{section.label}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {section.options.map((option) => {
                  const selected = form[section.field] === (section.prefix ? `${section.prefix}: ${option}` : option);
                  return (
                    <button
                      key={option}
                      onClick={() => onSetField(section.field, option, section.prefix)}
                      className={`command-action-button border px-4 py-3 text-sm ${
                        selected
                          ? "border-green-300/65 bg-green-400/15 text-green-100 shadow-[0_0_16px_rgba(34,197,94,0.18)]"
                          : "border-green-500/25 text-green-300"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-xs uppercase tracking-[0.16em] text-green-500/65">Optional note</span>
          <input
            value={form.notes}
            onChange={(event) => onNotesChange(event.target.value)}
            className="rounded-xl border border-green-500/30 bg-black px-4 py-3"
            placeholder="Short factual note"
          />
        </label>

        {selectedValues.length > 0 && (
          <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">Selected</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedValues.map((value) => (
                <span key={value} className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-100">
                  {value}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onSave}
            className="command-action-button command-action-green border border-green-400/45 bg-green-400/10 px-5 py-3 font-semibold uppercase tracking-[0.16em] text-green-100"
          >
            Save Context
          </button>
          <button
            onClick={onSkip}
            className="command-action-button border border-cyan-300/35 px-5 py-3 font-semibold uppercase tracking-[0.16em] text-cyan-100"
          >
            Skip
          </button>
        </div>
      </section>
    </div>
  );
}

function SnapshotMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-black p-3">
      <div className="flex items-center gap-2 text-green-300/65">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-2 text-lg font-semibold text-green-100">{value}</p>
    </div>
  );
}

function NumberField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField {...props} placeholder="1-5" />;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.16em] text-green-500/65">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-xl border border-green-500/30 bg-black px-4 py-3" />
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`command-action-button rounded-xl border px-4 py-3 text-left ${checked ? "border-green-300/60 bg-green-400/15 text-green-100" : "border-green-500/30 text-green-300"}`}>
      <span className="text-xs uppercase tracking-[0.16em] text-green-500/65">{label}</span>
      <span className="mt-1 block font-semibold">{checked ? "Yes" : "No"}</span>
    </button>
  );
}

function TimelineFact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <p><span className="text-green-500/65">{label}: </span>{value}</p>;
}

function SummaryList({ summaries }: { summaries: EventSummary[] }) {
  if (!summaries || summaries.length === 0) {
    return <p className="text-green-300/65">No events in this period.</p>;
  }
  return (
    <div className="grid gap-3">
      {summaries.map((summary) => (
        <div key={summary.event_type} className="rounded-xl border border-green-500/20 bg-black p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-green-100">{summary.label}</p>
              <p className="mt-1 text-sm text-green-300/65">{summary.occurrences} occurrences · Avg {summary.average_per_day}/day</p>
            </div>
            {summary.highest_day && <span className="text-xs uppercase tracking-[0.14em] text-green-300/65">High {summary.highest_day.count}</span>}
          </div>
          <div className="mt-3 grid gap-2 text-sm text-green-300/75 sm:grid-cols-2">
            <TimelineFact label="Most common activity" value={summary.most_common_activity} />
            <TimelineFact label="Most common trigger" value={summary.most_common_trigger} />
            <TimelineFact label="Most common relief" value={summary.most_common_relief} />
            <TimelineFact label="Most common time" value={summary.most_common_time} />
          </div>
        </div>
      ))}
    </div>
  );
}

function hydrateCheckin(previous: CheckinForm, dashboard: HealthDashboard): CheckinForm {
  const saved = dashboard.daily_checkin || {};
  return {
    ...previous,
    energy: valueString(saved.energy ?? dashboard.snapshot.energy),
    mood: valueString(saved.mood ?? dashboard.snapshot.mood),
    stress: valueString(saved.stress ?? dashboard.snapshot.stress),
    sleep_quality: valueString(saved.sleep_quality ?? dashboard.snapshot.sleep_quality),
    hours_slept: valueString(saved.hours_slept ?? dashboard.snapshot.hours_slept),
    water_oz: valueString(saved.water_oz ?? dashboard.snapshot.water_oz),
    caffeine_mg: valueString(saved.caffeine_mg ?? dashboard.snapshot.caffeine_mg),
    meals_completed: valueString(saved.meals_completed ?? dashboard.snapshot.meals_completed),
    ate_out: Boolean(saved.ate_out),
    food_spend: valueString(saved.food_spend ?? dashboard.context.food_spend),
    supplements: saved.supplements || [],
  };
}

function toggleSupplement(checkin: CheckinForm, supplement: string): CheckinForm {
  const exists = checkin.supplements.includes(supplement);
  return {
    ...checkin,
    supplements: exists ? checkin.supplements.filter((item) => item !== supplement) : [...checkin.supplements, supplement],
  };
}

function labelForEvent(eventType: string, eventTypes: EventType[]) {
  return eventTypes.find((item) => item.key === eventType)?.label || eventType.replaceAll("_", " ").toUpperCase();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function valueString(value: unknown) {
  return value == null || value === false ? "" : String(value);
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function scoreValue(value: unknown) {
  return value ? `${value}/5` : "Not logged";
}

function unitValue(value: unknown, unit: string) {
  return value || value === 0 ? `${value} ${unit}` : "Not logged";
}

function sleepValue(snapshot: Record<string, unknown>) {
  const hours = snapshot.hours_slept ? `${snapshot.hours_slept}h` : "No duration";
  const quality = snapshot.sleep_quality ? `${snapshot.sleep_quality}/5` : "No quality";
  return `${hours} · ${quality}`;
}
