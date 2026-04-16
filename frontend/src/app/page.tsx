"use client";

import { useState } from "react";

const API_KEY ="superlongsecretJarvisAPIkey12345z0d8dke8dh3f927";

const API_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

type StatusResponse = {
  systems: string;
  brain: string;
  user: string;
  clearance: string;
};

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
  warmups: WarmupSet[];
  today: Record<string, WorkoutSet>;
  pr_prediction: string;
  all_weeks: {
    week_1: Record<string, WorkoutSet>;
    week_2: Record<string, WorkoutSet>;
    week_3: Record<string, WorkoutSet>;
    week_4: Record<string, WorkoutSet>;
  };
};

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
  const API_BASE = "https://api.schoolyardshowdown.com";
  const userId = "john";

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [logMessage, setLogMessage] = useState("");

  const [selectedLift, setSelectedLift] = useState("deadlift");
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse | null>(null);
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

async function loadStatus() {
  setError("");
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
    console.error(err);
    setError(err instanceof Error ? err.message : "Could not reach Jarvis backend.");
  }
}

  async function loadHistory(liftOverride?: string) {
    const liftToLoad = liftOverride ?? selectedLift;

    try {
      const res = await fetch(
        `${API_BASE}/history/${liftToLoad}?user_id=${userId}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        },
      );
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTodayWorkout() {
    setError("");
    setLogMessage("");
    setTodayWorkout(null);
    setCompletedSets({});
    setActualReps({});
    setActualWeights({});

    try {
      const res = await fetch(
        `${API_BASE}/workout/today/${selectedLift}?user_id=${userId}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        },
      );
      if (!res.ok) throw new Error("Failed to load today's workout");

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

      await loadHistory(selectedLift);
    } catch (err) {
      console.error(err);
      setError("Could not load today's workout.");
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

      if (!res.ok) throw new Error("Failed to complete workout");

      const data = await res.json();

      setLogMessage(
        `Workout complete. Next: cycle ${data.next_cycle}, week ${data.next_week}` +
          (data.new_training_max ? `, TM ${data.new_training_max}` : "")
      );

      await loadHistory(selectedLift);
      await loadTodayWorkout();
    } catch (err) {
      console.error(err);
      setError("Could not complete workout.");
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
      if (!res.ok) throw new Error("Failed to load FBI score");
      const data = await res.json();
      setFbiScore(data);
    } catch (err) {
      console.error(err);
      setError("Could not load FBI score.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-green-400 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-2xl border border-green-500/30 bg-green-500/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
            Jarvis Systems
          </p>
          <h1 className="mt-2 text-4xl font-bold">Personal Command HUD</h1>
          <p className="mt-3 text-green-300/80">
            Fitness, FBI prep, project tracking, and assistant controls.
          </p>

          <button
            onClick={loadStatus}
            className="mt-4 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 hover:bg-green-500/20 transition"
          >
            Ping Jarvis
          </button>

          {status && (
            <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm">
              <StatusCard label="Systems" value={status.systems} />
              <StatusCard label="Brain" value={status.brain} />
              <StatusCard label="User" value={status.user} />
              <StatusCard label="Clearance" value={status.clearance} />
            </div>
          )}
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

            <label className="mb-2 block text-sm text-green-300/80">
              Select Lift
            </label>
            <select
              value={selectedLift}
              onChange={(e) => setSelectedLift(e.target.value)}
              className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3 outline-none focus:border-green-400"
            >
              <option value="deadlift">Deadlift</option>
              <option value="squat">Squat</option>
              <option value="bench">Bench Press</option>
              <option value="overhead_press">Overhead Press</option>
            </select>

            <button
              onClick={loadTodayWorkout}
              className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 hover:bg-green-500/20 transition"
            >
              Load Today&apos;s Workout
            </button>

            {todayWorkout && (
              <div className="mt-6">
                <div className="mb-4 rounded-xl border border-green-500/20 bg-black p-4">
                  <p className="text-lg font-semibold">
                    {formatLiftName(todayWorkout.lift)} — Cycle {todayWorkout.cycle}, Week {todayWorkout.week}
                  </p>
                  <p className="mt-2 text-green-300/80">
                    Training Max: {todayWorkout.training_max} lbs
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
            <div>
              <label className="mb-2 block text-sm text-green-300/80">Pull-ups</label>
              <input
                type="number"
                value={pullups}
                onChange={(e) => setPullups(e.target.value)}
                placeholder="10"
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">Push-ups</label>
              <input
                type="number"
                value={pushups}
                onChange={(e) => setPushups(e.target.value)}
                placeholder="45"
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">
                1.5 Mile Run (sec)
              </label>
              <input
                type="number"
                value={runSeconds}
                onChange={(e) => setRunSeconds(e.target.value)}
                placeholder="700"
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-green-300/80">
                300m Sprint (sec)
              </label>
              <input
                type="number"
                step="0.1"
                value={sprintSeconds}
                onChange={(e) => setSprintSeconds(e.target.value)}
                placeholder="45"
                className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
              />
            </div>
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