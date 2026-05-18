"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const LIFTS = ["deadlift", "squat", "bench", "overhead_press"];

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
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

export default function Home() {
  const userId = "john";

  const [error, setError] = useState("");
  const [logMessage, setLogMessage] = useState("");

  const [selectedLift, setSelectedLift] = useState("deadlift");
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse | null>(null);
  const [liftSummaries, setLiftSummaries] = useState<Record<string, LiftSummary>>({});
  const [trainingMaxInputs, setTrainingMaxInputs] = useState<Record<string, string>>({});
  const [savingLift, setSavingLift] = useState("");
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);

  const [pullups, setPullups] = useState("");
  const [runSeconds, setRunSeconds] = useState("");
  const [sprintSeconds, setSprintSeconds] = useState("");
  const [pushups, setPushups] = useState("");
  const [fbiScore, setFbiScore] = useState<FBIScoreResponse | null>(null);

  const [selectedPlateBreakdown, setSelectedPlateBreakdown] =
    useState<PlateBreakdown | null>(null);

  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [actualReps, setActualReps] = useState<Record<string, string>>({});
  const [actualWeights, setActualWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    loadLiftSummaries();
    loadTodayWorkout(selectedLift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLiftSummaries() {
    try {
      const results = await Promise.all(
        LIFTS.map(async (lift) => {
          const res = await fetch(`${API_BASE}/workout/today/${lift}?user_id=${userId}`, {
            headers: {
              "x-api-key": API_KEY,
            },
          });

          if (!res.ok) {
            throw new Error(await parseApiError(res));
          }

          const data: LiftSummary = await res.json();
          return [lift, data] as const;
        })
      );

      const summaries = Object.fromEntries(results);
      setLiftSummaries(summaries);
      setTrainingMaxInputs(
        Object.fromEntries(
          results.map(([lift, data]) => [lift, String(data.training_max)])
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
      const res = await fetch(`${API_BASE}/history/${liftToLoad}?user_id=${userId}`, {
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
        `${API_BASE}/workout/today/${liftToLoad}?user_id=${userId}`,
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
      const res = await fetch(`${API_BASE}/lifts/${lift}`, {
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
      const res = await fetch(`${API_BASE}/log/workout/complete`, {
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

      setLogMessage(
        data.spoken_response ||
          `Workout complete. Next: cycle ${data.next_cycle}, week ${data.next_week}` +
            (data.new_training_max ? `, TM ${data.new_training_max}` : "")
      );

      await loadHistory(selectedLift);
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
      const url = `${API_BASE}/fbi-score?pullups=${pullups}&run_seconds=${runSeconds}&sprint_seconds=${sprintSeconds}&pushups=${pushups}`;
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

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Main Sets</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {LIFTS.map((lift) => {
                const summary = liftSummaries[lift];
                return (
                  <LiftCard
                    key={lift}
                    lift={lift}
                    active={selectedLift === lift}
                    summary={summary}
                    trainingMaxValue={trainingMaxInputs[lift] || ""}
                    saving={savingLift === lift}
                    onSelect={() => loadTodayWorkout(lift)}
                    onTrainingMaxChange={(value) =>
                      setTrainingMaxInputs((prev) => ({
                        ...prev,
                        [lift]: value,
                      }))
                    }
                    onSave={() => saveTrainingMax(lift)}
                  />
                );
              })}
            </div>

            {todayWorkout && (
              <div className="mt-6">
                <div className="mb-4 rounded-xl border border-green-500/20 bg-black p-4">
                  <p className="text-lg font-semibold">
                    {formatLiftName(todayWorkout.lift)} — Cycle {todayWorkout.cycle}, Week{" "}
                    {todayWorkout.week}
                  </p>
                  <p className="mt-2 text-green-300/80">
                    Training Max: {todayWorkout.training_max} lbs
                  </p>
                  <p className="mt-1 text-green-300/80">
                    ⭐ Estimated PR:{" "}
                    {todayWorkout.estimated_pr
                      ? `${todayWorkout.estimated_pr.estimated_1rm} lbs (${todayWorkout.estimated_pr.weight} × ${todayWorkout.estimated_pr.reps})`
                      : "No PR history yet"}
                  </p>
                  <p className="mt-2 text-sm text-green-300/70">
                    {todayWorkout.pr_prediction}
                  </p>
                </div>

                <div className="mb-6">
                  <h3 className="mb-3 text-lg font-semibold">Warm-ups</h3>
                  <div className="space-y-3">
                    {todayWorkout.warmups.map((warmup) => (
                      <div
                        key={warmup.label}
                        className="rounded-xl border border-green-500/20 bg-black p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold">{warmup.label}</p>
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
                  <h3 className="mb-3 text-lg font-semibold">Main Sets</h3>

                  <div className="overflow-x-auto rounded-xl border border-green-500/20">
                    <table className="w-full border-collapse bg-black text-left">
                      <thead>
                        <tr className="border-b border-green-500/20 text-green-300/70">
                          <th className="p-3">Done</th>
                          <th className="p-3">Set</th>
                          <th className="p-3">Target Reps</th>
                          <th className="p-3">Weight</th>
                          <th className="p-3">Actual Reps</th>
                          <th className="p-3">Actual Weight</th>
                        </tr>
                      </thead>

                      <tbody>
                        {Object.entries(todayWorkout.today).map(([setName, setData]) => (
                          <tr key={setName} className="border-b border-green-500/10">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={!!completedSets[setName]}
                                onChange={() => toggleSetDone(setName)}
                                className="h-5 w-5"
                              />
                            </td>

                            <td className="p-3 font-semibold">{setName}</td>
                            <td className="p-3">{setData.reps}</td>

                            <td className="p-3">
                              <button
                                onClick={() => setSelectedPlateBreakdown(setData.plates)}
                                className="rounded-lg border border-green-500/30 px-3 py-2 hover:bg-green-500/10"
                              >
                                {setData.weight}
                              </button>
                            </td>

                            <td className="p-3">
                              <input
                                type="number"
                                value={actualReps[setName] || ""}
                                onChange={(e) => updateActualReps(setName, e.target.value)}
                                placeholder="0"
                                className="w-24 rounded-lg border border-green-500/30 bg-zinc-950 px-3 py-2"
                              />
                            </td>

                            <td className="p-3">
                              <input
                                type="number"
                                value={actualWeights[setName] || ""}
                                onChange={(e) => updateActualWeights(setName, e.target.value)}
                                className="w-28 rounded-lg border border-green-500/30 bg-zinc-950 px-3 py-2"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={completeWorkout}
                    className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
                  >
                    Complete Workout
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-green-500/30 bg-zinc-950 p-6">
            <h2 className="mb-4 text-2xl font-semibold">Recent History</h2>

            <div className="space-y-3">
              {history.length === 0 && (
                <p className="text-sm text-green-300/60">No history loaded yet.</p>
              )}

              {history.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-green-500/20 bg-black p-4"
                >
                  <p className="font-semibold text-green-300">
                    {formatLiftName(item.lift)} — {item.weight} lbs × {item.reps}
                  </p>
                  <p className="mt-1 text-sm text-green-300/70">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                  {item.notes && (
                    <p className="mt-1 text-sm text-green-300/80">{item.notes}</p>
                  )}
                </div>
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
    </main>
  );
}

function LiftCard({
  lift,
  active,
  summary,
  trainingMaxValue,
  saving,
  onSelect,
  onTrainingMaxChange,
  onSave,
}: {
  lift: string;
  active: boolean;
  summary?: LiftSummary;
  trainingMaxValue: string;
  saving: boolean;
  onSelect: () => void;
  onTrainingMaxChange: (value: string) => void;
  onSave: () => void;
}) {
  const estimatedPr = summary?.estimated_pr
    ? `${summary.estimated_pr.estimated_1rm} lbs`
    : "No PR";

  return (
    <div
      className={`rounded-xl border bg-black p-4 transition ${
        active
          ? "border-green-300 shadow-[0_0_22px_rgba(74,222,128,0.18)]"
          : "border-green-500/20"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-4 text-left"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-green-500/20 bg-zinc-950">
          <Image
            src={getLiftIcon(lift)}
            alt=""
            width={38}
            height={38}
            className="h-10 w-10 object-contain"
          />
        </span>

        <span className="min-w-0">
          <span className="block text-lg font-semibold text-green-300">
            {formatLiftName(lift)}
          </span>
          <span className="mt-1 block text-sm text-green-300/70">
            PR: {estimatedPr}
          </span>
          <span className="block text-sm text-green-300/70">
            Training Max: {summary ? `${summary.training_max} lbs` : "Loading"}
          </span>
        </span>
      </button>

      <div className="mt-4 flex items-center gap-2">
        <input
          type="number"
          value={trainingMaxValue}
          onChange={(e) => onTrainingMaxChange(e.target.value)}
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
            Object.entries(data.per_side).map(([plate, count]) => (
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

function formatLiftName(lift: string) {
  if (lift === "overhead_press") return "Overhead Press";
  if (lift === "deadlift") return "Deadlift";
  if (lift === "bench") return "Bench Press";
  if (lift === "squat") return "Squat";
  return lift;
}

function getLiftIcon(lift: string) {
  if (lift === "overhead_press") return "/icons/overhead-press.png";
  if (lift === "deadlift") return "/icons/deadlift.png";
  if (lift === "bench") return "/icons/bench-press.png";
  if (lift === "squat") return "/icons/squat.png";
  return "/icons/complete.png";
}
