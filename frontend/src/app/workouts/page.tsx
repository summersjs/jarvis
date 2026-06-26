"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronDown,
  ClipboardList,
  LineChart,
  Settings,
  Target,
  TrendingDown,
  Trophy,
  Equal,
  Moon,
  Waves,
} from "lucide-react";
import {
  BenchIcon,
  DeadliftIcon,
  OverheadPressIcon,
  RecoveryIcon,
  SquatIcon,
} from "@/components/WorkoutHudIcons";

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const LIFTS = ["deadlift", "squat", "bench", "overhead_press"];
const WORKOUT_SCHEDULE: Record<number, string | null> = {
  0: "overhead_press", // Sunday
  1: "deadlift",       // Monday
  2: null,             // Tuesday
  3: null,             // Wednesday
  4: "bench",          // Thursday
  5: "squat",          // Friday
  6: null,             // Saturday
};

const LIFT_CONFIG: Record<string, {
  label: string;
  focus: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  deadlift: {
    label: "POWER PROTOCOL",
    focus: "Back",
    Icon: DeadliftIcon,
  },
  squat: {
    label: "LOWER BODY PROTOCOL",
    focus: "Legs",
    Icon: SquatIcon,
  },
  bench: {
    label: "CHEST PROTOCOL",
    focus: "Chest",
    Icon: BenchIcon,
  },
  overhead_press: {
    label: "SHOULDER PROTOCOL",
    focus: "Shoulders",
    Icon: OverheadPressIcon,
  },
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

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

type PlateBreakdown = {
  total_weight: number;
  bar_weight: number;
  per_side: Record<string, number>;
  note?: string;
};

type WorkoutSet = {
  reps: string;
  weight: number;
  plates: PlateBreakdown;
};

type WarmupSet = {
  label: string;
  percent: number;
  reps: number;
  weight: number;
  plates: PlateBreakdown;
};

type TodayWorkoutResponse = {
  lift: string;
  user_id: string;
  cycle: number;
  week: number;
  training_max: number;
  estimated_pr?: {
    estimated_1rm: number;
    weight: number;
    reps: number;
    created_at?: string | null;
  } | null;
  warmups: WarmupSet[];
  today: Record<string, WorkoutSet>;
  pr_prediction: string;
};

type LiftSummary = TodayWorkoutResponse;

type FBIScoreResponse = {
  pullups: number;
  run: number;
  sprint: number;
  pushups?: number;
};

type WorkoutHistoryItem = {
  id: number;
  user_id: string;
  lift: string;
  weight: number;
  reps: number;
  notes?: string;
  created_at: string;
};

type CompletionResult = {
  pr_result?: {
    is_weight_pr: boolean;
    is_est_1rm_pr: boolean;
    current_est_1rm: number;
    best_weight: number;
    best_est_1rm: number;
  };
  spoken_response?: string;
  next_week?: number;
  next_cycle?: number;
};

type Goal = {
  id: string;
  title: string;
  target_value?: number | null;
  current_value?: number | null;
  unit?: string | null;
  progress?: {
    percent?: number | null;
    remaining?: number | null;
    is_complete: boolean;
  };
};

function getTodaysWorkout(): string {
  return WORKOUT_SCHEDULE[new Date().getDay()] || "rest";
}

function getNextScheduledWorkout() {
  const today = new Date();
  for (let offset = 1; offset <= 7; offset += 1) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + offset);
    const lift = WORKOUT_SCHEDULE[checkDate.getDay()];
    if (lift) {
      return {
        lift,
        label: offset === 1 ? "Tomorrow" : checkDate.toLocaleDateString(undefined, { weekday: "long" }),
      };
    }
  }
  return {
    lift: "deadlift",
    label: "Next cycle",
  };
}

function resolveInitialWorkout() {
  const todaysWorkout = getTodaysWorkout();
  if (todaysWorkout !== "rest") {
    return {
      lift: todaysWorkout,
      isRestDay: false,
      nextLabel: "Today",
    };
  }

  const next = getNextScheduledWorkout();
  return {
    lift: next.lift,
    isRestDay: true,
    nextLabel: next.label,
  };
}

function estimateOneRepMax(weight: number, reps: number) {
  return Math.round(weight * (1 + reps / 30));
}

function formatHistoryDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function Home() {
  const userId = "john";

  const [error, setError] = useState("");
  const [logMessage, setLogMessage] = useState("");

  const [selectedLift, setSelectedLift] = useState("");
  const [isRecoveryDay, setIsRecoveryDay] = useState(false);
  const [nextWorkoutLabel, setNextWorkoutLabel] = useState("");
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse | null>(null);
  const [liftSummaries, setLiftSummaries] = useState<Record<string, LiftSummary>>({});
  const [trainingMaxInputs, setTrainingMaxInputs] = useState<Record<string, string>>({});
  const [savingLift, setSavingLift] = useState("");
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [trainingMaxOpen, setTrainingMaxOpen] = useState(false);

  const [pullups, setPullups] = useState("");
  const [runSeconds, setRunSeconds] = useState("");
  const [sprintSeconds, setSprintSeconds] = useState("");
  const [pushups, setPushups] = useState("");
  const [fbiScore, setFbiScore] = useState<FBIScoreResponse | null>(null);

  const [selectedPlateBreakdown, setSelectedPlateBreakdown] =
    useState<PlateBreakdown | null>(null);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);

  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [actualReps, setActualReps] = useState<Record<string, string>>({});
  const [actualWeights, setActualWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialWorkout = resolveInitialWorkout();
    setSelectedLift(initialWorkout.lift);
    setIsRecoveryDay(initialWorkout.isRestDay);
    setNextWorkoutLabel(initialWorkout.nextLabel);
    loadLiftSummaries();
    loadGoals();
    loadTodayWorkout(initialWorkout.lift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadGoals() {
    try {
      const res = await fetch(apiUrl(`/goals?user_id=${userId}`), {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

    const data = await res.json();
      setGoals(data.goals || []);
    } catch {
      setGoals([]);
    }
  }

  async function loadLiftSummaries() {
    try {
      const results = await Promise.all(
        LIFTS.map(async (lift) => {
          try {
            const res = await fetch(apiUrl(`/workout/today/${lift}?user_id=${userId}`), {
              headers: {
                "x-api-key": API_KEY,
              },
            });

            if (!res.ok) {
              throw new Error(await parseApiError(res));
            }

            const data: LiftSummary = await res.json();
            return [lift, data] as const;
          } catch {
            return [lift, null] as const;
          }
        })
      );

      const summaries = Object.fromEntries(
        results.filter((entry): entry is readonly [string, LiftSummary] => entry[1] !== null)
      );
      setLiftSummaries(summaries);
      setTrainingMaxInputs(
        Object.fromEntries(
          results
            .filter((entry): entry is readonly [string, LiftSummary] => entry[1] !== null)
            .map(([lift, data]) => [lift, String(data.training_max)])
        )
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load lift summaries.");
    }
  }

  async function loadHistory(liftOverride?: string) {
    const liftToLoad = liftOverride ?? selectedLift;

    try {
      const res = await fetch(apiUrl(`/history/${liftToLoad}?user_id=${userId}`), {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTodayWorkout(liftOverride?: string) {
    const liftToLoad = liftOverride ?? selectedLift;

    setError("");
    setLogMessage("");
    setTodayWorkout(null);
    setSelectedLift(liftToLoad);
    setCompletedSets({});
    setActualReps({});
    setActualWeights({});

    try {
      const res = await fetch(
        apiUrl(`/workout/today/${liftToLoad}?user_id=${userId}`),
        {
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data: TodayWorkoutResponse = await res.json();
      setTodayWorkout(data);

      const initialWeights: Record<string, string> = {};
      const initialReps: Record<string, string> = {};

      Object.entries(data.today).forEach(([setName, setData]) => {
        initialWeights[setName] = String(setData.weight);
        initialReps[setName] = "";
      });

      setActualWeights(initialWeights);
      setActualReps(initialReps);

      await loadHistory(liftToLoad);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load today's workout.");
    }
  }

  async function saveTrainingMax(lift: string) {
    const value = Number(trainingMaxInputs[lift]);
    if (!value || value <= 0) {
      setError("Enter a valid training max.");
      return;
    }

    setSavingLift(lift);
    setError("");
    setLogMessage("");

    try {
      const res = await fetch(apiUrl(`/lifts/${lift}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: userId,
          training_max: value,
        }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setLogMessage(`${formatLiftName(lift)} training max updated to ${value} lbs.`);
      await loadLiftSummaries();
      if (todayWorkout?.lift === lift) {
        await loadTodayWorkout(lift);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not update training max.");
    } finally {
      setSavingLift("");
    }
  }

  function toggleSetDone(setName: string) {
    setCompletedSets((prev) => ({
      ...prev,
      [setName]: !prev[setName],
    }));
  }

  function updateActualReps(setName: string, value: string) {
    setActualReps((prev) => ({
      ...prev,
      [setName]: value,
    }));
  }

  function updateActualWeights(setName: string, value: string) {
    setActualWeights((prev) => ({
      ...prev,
      [setName]: value,
    }));
  }

  async function completeWorkout() {
    if (!todayWorkout) return;

    setError("");
    setLogMessage("");

    const setNames = Object.keys(todayWorkout.today);

    const incompleteChecked = setNames.some((setName) => !completedSets[setName]);
    if (incompleteChecked) {
      setError("Check off all three sets before completing the workout.");
      return;
    }

    const setsPayload = setNames.map((setName) => ({
      set_name: setName,
      weight: Number(actualWeights[setName] || 0),
      reps: Number(actualReps[setName] || 0),
    }));

    const missingData = setsPayload.some((s) => !s.weight || !s.reps);
    if (missingData) {
      setError("Fill in actual reps and weights for all sets before completing workout.");
      return;
    }

    try {
      const res = await fetch(apiUrl("/log/workout/complete"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: userId,
          lift: selectedLift,
          cycle: todayWorkout.cycle,
          week: todayWorkout.week,
          sets: setsPayload,
        }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setCompletionResult(data);

      setLogMessage(
        data.spoken_response ||
          `Workout complete. Next: cycle ${data.next_cycle}, week ${data.next_week}` +
            (data.new_training_max ? `, TM ${data.new_training_max}` : "")
      );

      await loadHistory(selectedLift);
      await loadGoals();
      await loadLiftSummaries();
      await loadTodayWorkout(selectedLift);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not complete workout.");
    }
  }

  async function loadFBIScore() {
    setError("");
    setFbiScore(null);

    if (
      !pullups ||
      !runSeconds ||
      !sprintSeconds ||
      !pushups ||
      isNaN(Number(pullups)) ||
      isNaN(Number(runSeconds)) ||
      isNaN(Number(sprintSeconds)) ||
      isNaN(Number(pushups))
    ) {
      setError("Enter valid FBI PFT values.");
      return;
    }

    try {
      const url = apiUrl(`/fbi-score?pullups=${pullups}&run_seconds=${runSeconds}&sprint_seconds=${sprintSeconds}&pushups=${pushups}`);
      const res = await fetch(url, {
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setFbiScore(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load FBI score.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Training
            </p>
            <h1 className="mt-2 text-4xl font-bold">Workouts</h1>
            <p className="mt-3 text-green-300/80">
              Load today&apos;s workout, log main sets, review history, and score FBI PFT work.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">
              Command Center
            </Link>
            <Link href="/recipes" className="command-nav-link">
              Recipe Vault
            </Link>
            <Link href="/meal-planner" className="command-nav-link">
              Meal Planner
            </Link>
            <Link href="/shopping" className="command-nav-link">
              Shopping Lists
            </Link>
            <Link href="/preferences" className="command-nav-link">
              Favorites
            </Link>
          </nav>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {logMessage && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            {logMessage}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon">
                <Target className="h-5 w-5" />
              </div>
              <h2 className="hud-panel-title">Training Objective</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {LIFTS.map((lift) => (
                <LiftCard
                  key={lift}
                  lift={lift}
                  active={selectedLift === lift}
                  summary={liftSummaries[lift]}
                  onSelect={() => loadTodayWorkout(lift)}
                />
              ))}
            </div>

            {isRecoveryDay && (
              <RecoveryBriefing nextLift={selectedLift} nextWorkoutLabel={nextWorkoutLabel} />
            )}

            {todayWorkout && (
              <div className="mt-6">
                <TrainingBriefing workout={todayWorkout} />

                <div className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Waves className="h-4 w-4 text-green-300" />
                    <h3 className="hud-panel-title">Warmup Sequence</h3>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {todayWorkout.warmups.map((warmup) => (
                      <div key={warmup.label} className="hud-row">
                        <div className="flex w-full items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-green-100">{warmup.label}</p>
                            <p className="text-sm text-green-300/70">
                              {warmup.percent}% × {warmup.reps}
                            </p>
                          </div>

                          <button
                            onClick={() => setSelectedPlateBreakdown(warmup.plates)}
                            className="rounded-lg border border-green-500/30 px-3 py-2 text-green-300 hover:bg-green-500/10"
                          >
                            {warmup.weight} lbs
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-green-300" />
                    <h3 className="hud-panel-title">Working Sets</h3>
                  </div>

                  <WorkingSets
                    workout={todayWorkout}
                    completedSets={completedSets}
                    actualReps={actualReps}
                    actualWeights={actualWeights}
                    onToggleSet={toggleSetDone}
                    onActualRepsChange={updateActualReps}
                    onActualWeightsChange={updateActualWeights}
                    onPlateSelect={setSelectedPlateBreakdown}
                  />

                  <button
                    onClick={completeWorkout}
                    className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
                  >
                    Complete Workout
                  </button>
                </div>

                <ProgressTracker workout={todayWorkout} history={history} goals={goals} />

                <section className="mt-6 rounded-xl border border-green-500/20 bg-black/35">
                  <button
                    type="button"
                    onClick={() => setTrainingMaxOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="inline-flex items-center gap-2 hud-panel-title">
                      <Settings className="h-4 w-4" />
                      Training Max Settings
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition ${trainingMaxOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {trainingMaxOpen && (
                    <div className="grid gap-3 border-t border-green-500/15 p-4 sm:grid-cols-2">
                      {LIFTS.map((lift) => (
                        <TrainingMaxEditor
                          key={lift}
                          lift={lift}
                          value={trainingMaxInputs[lift] || ""}
                          saving={savingLift === lift}
                          onChange={(value) =>
                            setTrainingMaxInputs((prev) => ({
                              ...prev,
                              [lift]: value,
                            }))
                          }
                          onSave={() => saveTrainingMax(lift)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>

          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="hud-panel-icon">
                <LineChart className="h-5 w-5" />
              </div>
              <h2 className="hud-panel-title">Training History</h2>
            </div>

            <div className="space-y-3">
              {history.length === 0 && (
                <p className="text-sm text-green-300/60">No history loaded yet.</p>
              )}

              {history.slice(0, 8).map((item) => (
                <HistoryCard key={item.id} item={item} history={history} />
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
          <h2 className="mb-4 text-2xl font-semibold">FBI PFT Scoring</h2>

          <div className="grid gap-4 md:grid-cols-4">
            <InputBox label="Pull-ups" value={pullups} setValue={setPullups} placeholder="10" />
            <InputBox label="Push-ups" value={pushups} setValue={setPushups} placeholder="45" />
            <InputBox
              label="1.5 Mile Run (sec)"
              value={runSeconds}
              setValue={setRunSeconds}
              placeholder="700"
            />
            <InputBox
              label="300m Sprint (sec)"
              value={sprintSeconds}
              setValue={setSprintSeconds}
              placeholder="45"
              step="0.1"
            />
          </div>

          <button
            onClick={loadFBIScore}
            className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
          >
            Score PFT
          </button>

          {fbiScore && (
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <StatusCard label="Pull-ups" value={String(fbiScore.pullups)} />
              <StatusCard label="Push-ups" value={String(fbiScore.pushups ?? 0)} />
              <StatusCard label="Run" value={String(fbiScore.run)} />
              <StatusCard label="Sprint" value={String(fbiScore.sprint)} />
            </div>
          )}
        </section>
      </div>

      {selectedPlateBreakdown && (
        <PlateModal
          data={selectedPlateBreakdown}
          onClose={() => setSelectedPlateBreakdown(null)}
        />
      )}

      {completionResult && (
        <CompletionOverlay
          result={completionResult}
          onClose={() => setCompletionResult(null)}
          onViewHistory={() => {
            setCompletionResult(null);
            loadHistory(selectedLift);
          }}
        />
      )}
    </main>
  );
}

function LiftCard({
  lift,
  active,
  summary,
  onSelect,
}: {
  lift: string;
  active: boolean;
  summary?: LiftSummary;
  onSelect: () => void;
}) {
  const config = getLiftConfig(lift);
  const Icon = config.Icon;
  const estimatedPr = summary?.estimated_pr
    ? `${summary.estimated_pr.estimated_1rm} lbs`
    : "No PR";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-xl border bg-black/55 p-4 text-left transition ${
        active
          ? "border-green-200 shadow-[0_0_28px_rgba(74,222,128,0.28)]"
          : "border-green-500/20 opacity-75 hover:opacity-100"
      }`}
    >
      {active && (
        <span className="absolute right-3 top-3 rounded-full border border-green-300/40 bg-green-500/10 px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-green-100">
          Active Mission
        </span>
      )}

      <span className="flex w-full items-center gap-4">
        <span className="mission-icon-shell h-16 w-16 shrink-0">
          <Icon className="h-12 w-12" />
        </span>
        <span className="min-w-0">
          <span className="block pr-28 text-lg font-semibold text-green-100">
            {formatLiftName(lift)}
          </span>
          <span className="mt-1 block text-xs font-bold uppercase tracking-[0.18em] text-green-500/70">
            {config.label}
          </span>
          <span className="mt-1 block text-sm text-green-300/70">
            PR: {estimatedPr}
          </span>
          <span className="block text-sm text-green-300/70">
            Training Max: {summary ? `${summary.training_max} lbs` : "Loading"}
          </span>
        </span>
      </span>
    </button>
  );
}

function TrainingBriefing({ workout }: { workout: TodayWorkoutResponse }) {
  return (
    <section className="mb-6 rounded-xl border border-green-500/20 bg-black/35 p-4">
      <p className="hud-panel-title">Training Briefing</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <h3 className="text-4xl font-black uppercase leading-none text-green-100">
            {formatLiftName(workout.lift)} Day
          </h3>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-green-300/75">
            Cycle {workout.cycle} • Week {workout.week}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:min-w-64 md:grid-cols-1">
          <BriefMetric label="Training Max" value={`${workout.training_max} lbs`} />
          <BriefMetric
            label="Current Estimated PR"
            value={workout.estimated_pr ? `${workout.estimated_pr.estimated_1rm} lbs` : "No history"}
          />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-green-500/15 bg-black/40 p-3">
        <p className="hud-panel-title">Goal</p>
        <p className="mt-2 text-green-200/85">
          Hit all prescribed reps and push the final AMRAP set.
        </p>
        <p className="mt-2 text-sm text-green-300/70">
          Target: Beat previous performance. {workout.pr_prediction}
        </p>
      </div>
    </section>
  );
}

function BriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function WorkingSets({
  workout,
  completedSets,
  actualReps,
  actualWeights,
  onToggleSet,
  onActualRepsChange,
  onActualWeightsChange,
  onPlateSelect,
}: {
  workout: TodayWorkoutResponse;
  completedSets: Record<string, boolean>;
  actualReps: Record<string, string>;
  actualWeights: Record<string, string>;
  onToggleSet: (setName: string) => void;
  onActualRepsChange: (setName: string, value: string) => void;
  onActualWeightsChange: (setName: string, value: string) => void;
  onPlateSelect: (plates: PlateBreakdown) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Object.entries(workout.today).map(([setName, setData], index) => (
        <div key={setName} className="rounded-xl border border-green-500/20 bg-black/45 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="hud-panel-title">{setName}</p>
              <p className="mt-2 text-3xl font-black text-green-100">
                {setData.weight} lbs
              </p>
              <p className="mt-1 text-lg font-semibold text-green-300">
                {index === 2 ? "AMRAP" : `${setData.reps} reps`}
              </p>
            </div>
            <input
              type="checkbox"
              checked={!!completedSets[setName]}
              onChange={() => onToggleSet(setName)}
              className="h-6 w-6"
              aria-label={`${setName} complete`}
            />
          </div>

          <button
            onClick={() => onPlateSelect(setData.plates)}
            className="mb-3 w-full rounded-lg border border-green-500/30 px-3 py-2 text-green-300 hover:bg-green-500/10"
          >
            View plate protocol
          </button>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            <InputMini
              label="Actual Reps"
              value={actualReps[setName] || ""}
              onChange={(value) => onActualRepsChange(setName, value)}
            />
            <InputMini
              label="Actual Weight"
              value={actualWeights[setName] || ""}
              onChange={(value) => onActualWeightsChange(setName, value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InputMini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-green-500/70">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-green-500/30 bg-zinc-950 px-3 py-2"
      />
    </label>
  );
}

function ProgressTracker({
  workout,
  history,
  goals,
}: {
  workout: TodayWorkoutResponse;
  history: WorkoutHistoryItem[];
  goals: Goal[];
}) {
  const goal = findLiftGoal(workout.lift, goals);
  const current = workout.estimated_pr?.estimated_1rm || 0;
  const previous = history[1] ? estimateOneRepMax(history[1].weight, history[1].reps) : 0;
  const difference = current && previous ? current - previous : 0;
  const goalCurrent = Number(goal?.current_value || current || 0);
  const goalTarget = Number(goal?.target_value || 0);
  const goalRemaining = Math.max(goalTarget - goalCurrent, 0);
  const progressPercent = goalTarget > 0
    ? Math.min(100, Math.max(0, (goalCurrent / goalTarget) * 100))
    : current && previous
      ? Math.min(100, Math.max(0, (current / Math.max(current, previous)) * 100))
      : 35;
  const isLimitBreak = !!goal && (progressPercent >= 100 || !!goal.progress?.is_complete);
  const progressStatus = getProgressStatus(progressPercent, isLimitBreak);
  const milestones = goal
    ? getStrengthMilestones(goal.title, goalTarget, goalCurrent, goal.unit || "lbs")
    : [];
  const upcomingMilestone = milestones.find((milestone) => goalCurrent < milestone.value);
  const trackerClass = isLimitBreak
    ? "mt-6 rounded-xl border border-yellow-300/70 bg-black/35 p-4 shadow-[0_0_38px_rgba(250,204,21,0.35)]"
    : `mt-6 rounded-xl bg-black/35 p-4 ${getProgressCardClass(progressPercent)}`;

  return (
    <section className={trackerClass}>
      <div className="mb-4 flex items-center gap-2">
        <Activity className={isLimitBreak ? "h-4 w-4 text-yellow-200" : "h-4 w-4 text-green-300"} />
        <h3 className="hud-panel-title">Progress Tracker</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <BriefMetric
          label={goal ? "Goal Progress" : "Current Estimated PR"}
          value={goal ? `${formatNumber(goalCurrent)} / ${formatNumber(goalTarget)} ${goal.unit || "lbs"}` : current ? `${current} lbs` : "No data"}
        />
        <BriefMetric
          label={goal ? "Goal Target" : "Previous Estimated PR"}
          value={goal ? `${formatNumber(goalTarget)} ${goal.unit || "lbs"}` : previous ? `${previous} lbs` : "No data"}
        />
        <BriefMetric
          label={goal ? "Remaining" : "Difference"}
          value={goal ? `${formatNumber(goalRemaining)} ${goal.unit || "lbs"}` : difference ? `${difference > 0 ? "+" : ""}${difference} lbs` : "Pending"}
        />
      </div>
      {goal && (
        <p className="mt-3 text-sm text-green-300/70">
          Tracking active goal: {goal.title}
        </p>
      )}
      <div className="mb-2 mt-4 flex items-center justify-between gap-3 text-sm text-green-300/75">
        <span>
          {goal ? `${formatNumber(goalCurrent)}${goal.unit ? ` ${goal.unit}` : ""} / ${formatNumber(goalTarget)}${goal.unit ? ` ${goal.unit}` : ""}` : "Estimated PR trend"}
        </span>
        <span className={isLimitBreak ? "font-bold text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]" : ""}>
          {Math.round(progressPercent)}%
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`goal-progress-status goal-progress-status-${progressStatus.tone}`}>
          {progressStatus.label}
        </span>
        {upcomingMilestone && !isLimitBreak && (
          <span className="text-xs uppercase tracking-[0.16em] text-green-300/65">
            Next unlock: {formatNumber(upcomingMilestone.value)}
            {goal?.unit ? ` ${goal.unit}` : " lbs"}
          </span>
        )}
      </div>

      <div className={`goal-progress-track ${isLimitBreak ? "goal-progress-track-complete" : ""}`}>
        <div
          className={`goal-progress-fill ${
            isLimitBreak ? "limit-break-bar goal-progress-fill-complete" : `goal-progress-fill-${progressStatus.tone}`
          }`}
          style={{ width: `${progressPercent}%` }}
        >
          {(progressStatus.tone === "green" || isLimitBreak) && (
            <span className="goal-progress-particles" aria-hidden="true" />
          )}
        </div>

        {milestones.map((milestone) => {
          const crossed = goalCurrent >= milestone.value || isLimitBreak;
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
      {isLimitBreak && (
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.95)]">
          Limit Break
        </p>
      )}
    </section>
  );
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

function getStrengthMilestones(title: string, target: number, current: number, unit: string) {
  if (target <= 0) return [];

  const normalizedTitle = title.toLowerCase();
  const normalizedUnit = unit.toLowerCase();
  const isStrengthGoal =
    normalizedUnit.includes("lb") &&
    ["bench", "squat", "deadlift", "press", "ohp"].some((lift) =>
      normalizedTitle.includes(lift)
    );

  const values = isStrengthGoal
    ? getPlateMilestones(target)
    : [0.5, 0.75, 0.9, 1].map((ratio) => Math.round(target * ratio * 100) / 100);

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

function getPlateMilestones(target: number) {
  const ratios = target <= 250
    ? [0.6, 0.8, 0.8888888889, 1]
    : [0.7142857143, 0.873015873, 0.9523809524, 1];

  return ratios.map((ratio) => roundToNearest5(target * ratio));
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

function roundToNearest5(value: number) {
  return Math.round(value / 5) * 5;
}

function RecoveryBriefing({
  nextLift,
  nextWorkoutLabel,
}: {
  nextLift: string;
  nextWorkoutLabel: string;
}) {
  const Icon = getLiftConfig(nextLift).Icon;
  return (
    <section className="mt-5 rounded-xl border border-green-500/20 bg-black/35 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="hud-panel-title">Recovery Day</p>
          <h3 className="mt-2 text-3xl font-black uppercase text-green-100">Mission Status: Recovery</h3>
          <p className="mt-2 text-green-300/80">
            Next Workout: {formatLiftName(nextLift)} • Scheduled: {nextWorkoutLabel}
          </p>
        </div>
        <div className="mission-icon-shell h-16 w-16">
          <Icon className="h-12 w-12" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {["Stretch", "Walk", "Meal prep", "Review next workout"].map((action) => (
          <div key={action} className="hud-metric">
            <p>Recommended</p>
            <strong>{action}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrainingMaxEditor({
  lift,
  value,
  saving,
  onChange,
  onSave,
}: {
  lift: string;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-black/35 p-3">
      <label className="mb-2 block text-sm font-semibold text-green-100">
        {formatLiftName(lift)}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-green-500/30 bg-zinc-950 px-3 py-2 text-green-300 outline-none focus:border-green-300"
          aria-label={`${formatLiftName(lift)} training max`}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300 transition hover:bg-green-500/20 disabled:opacity-50"
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </div>
  );
}

function HistoryCard({
  item,
  history,
}: {
  item: WorkoutHistoryItem;
  history: WorkoutHistoryItem[];
}) {
  const index = history.findIndex((entry) => entry.id === item.id);
  const estimated = estimateOneRepMax(item.weight, item.reps);
  const next = history[index + 1];
  const previousEstimated = next ? estimateOneRepMax(next.weight, next.reps) : estimated;
  const isDeload = /week\s+4/i.test(item.notes || "");
  const trend = isDeload ? "deload" : estimated > previousEstimated ? "up" : estimated < previousEstimated ? "down" : "match";

  return (
    <div className="rounded-xl border border-green-500/20 bg-black/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-green-100">
            {item.weight} × {item.reps}
          </p>
          <p className="mt-1 text-sm text-green-300/70">{formatHistoryDate(item.created_at)}</p>
        </div>
        <TrendBadge trend={trend} />
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <BriefMetric label="Estimated 1RM" value={`${estimated} lbs`} />
        <BriefMetric label="Cycle / Week" value={parseCycleWeek(item.notes)} />
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "match" | "deload" }) {
  if (trend === "deload") {
    return (
      <span
        className="history-badge history-badge-deload"
        title="Deload week: reduced loading for recovery and progression."
      >
        <Moon className="h-3.5 w-3.5" /> Deload Week
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span
        className="history-badge history-badge-pr"
        title="Personal record: this estimated 1RM beats the previous top result."
      >
        <Trophy className="h-3.5 w-3.5" /> Personal Record
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span
        className="history-badge history-badge-lower"
        title="Below record: this result is lower than the previous comparable top set."
      >
        <TrendingDown className="h-3.5 w-3.5" /> Below Record
      </span>
    );
  }
  return (
    <span
      className="history-badge history-badge-match"
      title="Matched record: this result equals the previous comparable top set."
    >
      <Equal className="h-3.5 w-3.5" /> Matched Record
    </span>
  );
}

function InputBox({
  label,
  value,
  setValue,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-green-300/80">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
      />
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-black p-4">
      <p className="text-xs uppercase tracking-wide text-green-500/60">{label}</p>
      <p className="mt-2 text-lg font-semibold text-green-300">{value}</p>
    </div>
  );
}

function PlateModal({
  data,
  onClose,
}: {
  data: PlateBreakdown;
  onClose: () => void;
}) {
  const sortedPlates = Object.entries(data.per_side).sort(([a], [b]) => Number(b) - Number(a));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-green-500/30 bg-zinc-950 p-6 shadow-2xl">
        <h3 className="text-2xl font-semibold">Plates per side</h3>

        <p className="mt-2 text-green-300/70">
          Total: {data.total_weight} lbs · Bar: {data.bar_weight} lbs
        </p>

        <div className="mt-6 space-y-2 text-lg">
          {Object.keys(data.per_side).length === 0 ? (
            <p className="text-green-300/70">{data.note || "No plates needed."}</p>
          ) : (
            sortedPlates.map(([plate, count]) => (
              <p key={plate}>
                {count} × {plate}
              </p>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function CompletionOverlay({
  result,
  onClose,
  onViewHistory,
}: {
  result: CompletionResult;
  onClose: () => void;
  onViewHistory: () => void;
}) {
  const pr = result.pr_result;
  const isPr = !!(pr?.is_est_1rm_pr || pr?.is_weight_pr);
  const previous = pr?.best_est_1rm || 0;
  const current = pr?.current_est_1rm || 0;
  const improvement = current && previous ? current - previous : 0;

  if (!isPr) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
        <div className="completion-card">
          <p className="hud-panel-title">Mission Complete</p>
          <h3 className="mt-3 text-3xl font-black uppercase text-green-100">
            Workout successfully logged.
          </h3>
          <p className="mt-3 text-green-300/80">Cycle progress updated.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={onClose} className="command-nav-link">Continue</button>
            <button onClick={onViewHistory} className="command-nav-link">View History</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="achievement-overlay">
      <div className="achievement-particles" aria-hidden="true" />
      <div className="achievement-card">
        <p className="hud-panel-title text-yellow-200">Personal Record Detected</p>
        <div className="achievement-trophy">
          <Trophy className="h-16 w-16" />
        </div>
        <h3 className="mt-4 text-4xl font-black uppercase text-yellow-100 md:text-6xl">
          Personal Record Detected
        </h3>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <BriefMetric label="Previous" value={previous ? `${previous} lbs` : "Baseline"} />
          <BriefMetric label="New" value={current ? `${current} lbs` : "Recorded"} />
          <BriefMetric
            label="Improvement"
            value={improvement > 0 ? `+${improvement} lbs` : "New mark"}
          />
        </div>
        <p className="mt-6 text-xl font-black uppercase tracking-[0.2em] text-green-100">
          Mission Complete
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={onClose} className="command-nav-link">Continue</button>
          <button onClick={onViewHistory} className="command-nav-link">View History</button>
        </div>
      </div>
    </div>
  );
}

function formatLiftName(lift: string) {
  if (lift === "overhead_press") return "Overhead Press";
  if (lift === "deadlift") return "Deadlift";
  if (lift === "bench") return "Bench Press";
  if (lift === "squat") return "Squat";
  return lift;
}

function getLiftConfig(lift: string) {
  return LIFT_CONFIG[lift] || {
    label: "RECOVERY PROTOCOL",
    focus: "Recovery",
    Icon: RecoveryIcon,
  };
}

function findLiftGoal(lift: string, goals: Goal[]) {
  const liftTerms: Record<string, string[]> = {
    squat: ["squat"],
    deadlift: ["deadlift"],
    bench: ["bench"],
    overhead_press: ["overhead", "overhead press", "ohp"],
  };

  const terms = liftTerms[lift] || [lift];
  return goals.find((goal) => {
    const title = goal.title.toLowerCase();
    return terms.some((term) => title.includes(term));
  });
}

function parseCycleWeek(notes?: string) {
  const cycle = notes?.match(/cycle\s+(\d+)/i)?.[1];
  const week = notes?.match(/week\s+(\d+)/i)?.[1];

  if (cycle && week) return `Cycle ${cycle} • Week ${week}`;
  if (week) return `Week ${week}`;
  return "Not tagged";
}
