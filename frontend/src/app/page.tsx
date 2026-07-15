"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  BriefcaseBusiness,
  Cake,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  DatabaseZap,
  DollarSign,
  Hammer,
  HeartPulse,
  BookOpen,
  ClipboardList,
  Server,
  ShieldCheck,
  ShoppingCart,
  Settings2,
  Target,
  Trophy,
  Utensils,
  UserRound,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import BirthdayAlert from "@/components/BirthdayAlert";
import {
  BenchIcon,
  DeadliftIcon,
  OverheadPressIcon,
  RecoveryIcon,
  SquatIcon,
} from "@/components/WorkoutHudIcons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type MealEntry = {
  id: string;
  meal_type: string;
  name: string;
  notes?: string | null;
  meta?: {
    calories?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    completed?: boolean;
    servings?: number | null;
  } | null;
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
  birthday_note?: string | null;
  today: {
    day_type?: string | null;
    scheduled_lift?: string | null;
    scheduled_lift_label?: string | null;
    spoken_response?: string | null;
  };
  next_workout: {
    lift?: string | null;
    lift_label?: string | null;
    next_scheduled?: {
      date: string;
      lift: string;
      weekday: string;
    } | null;
    spoken_response?: string | null;
  };
  workout_metadata?: {
    lift?: string | null;
    lift_label?: string | null;
    training_max?: number | null;
    cycle?: number | null;
    week?: number | null;
    latest_top_set?: {
      id?: number | string | null;
      lift?: string | null;
      weight?: number | null;
      reps?: number | null;
      notes?: string | null;
      created_at?: string | null;
    } | null;
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
  finance_summary?: {
    dashboard_cards: {
      food_budget_remaining_week: number;
      eating_out_budget_remaining_week: number;
      total_food_over_under: number;
      spending_status: string;
    };
    weekly_food_budget: {
      total_actual_food_spend_this_week: number;
      over_under_amount: number;
    };
  };
  mission_phase?: {
    key: string;
    label: string;
    window: string;
  };
  mission_scores?: {
    daily: {
      score: number;
      label: string;
      class: "online" | "pending" | "offline";
      workout_score?: number;
      goal_score?: number;
      goal_bonus?: number;
      shopping_score?: number;
      budget_score?: number;
      calendar_score?: number;
      debrief_score?: number;
      goals_completed_today?: number;
      goals_impacted_today?: number;
      goals_above_and_beyond_today?: number;
    };
    weekly: {
      score: number;
      label: string;
      class: "online" | "pending" | "offline";
    };
    lifetime: {
      score: number;
      rank: string;
    };
  };
  mission_status?: {
    score: number;
    label: string;
    class: "online" | "pending" | "offline";
    delta?: number | null;
  };
  mission?: {
    phase: string;
    phase_key: string;
    phase_window: string;
    status: string;
    score: number;
    class: "online" | "pending" | "offline";
    daily_score?: number;
    weekly_score?: number;
    lifetime_score?: number;
    lifetime_rank?: string;
    objectives_completed: number;
    objectives_total: number;
    workout_completed: boolean;
    shopping_open: number;
    budget_status: string;
    calendar_today_status?: string | null;
    calendar_tomorrow_status?: string | null;
    title: string;
    items: string[];
    recommendation: string;
    primary_label: string;
    primary_value: string;
    secondary_label: string;
    secondary_value: string;
  };
  highest_priority_remaining_task?: string;
  coaching_note: string;
};

type StatusResponse = {
  systems: string;
  brain: string;
  user: string;
  clearance: string;
  checked_at?: string;
  uptime_seconds?: number;
  llm?: {
    online: boolean;
    modelAvailable: boolean;
    model: string;
    configuredModel?: string | null;
    activeModel?: string | null;
    loadedModels?: string[];
    installedModels?: string[];
    models?: string[];
  };
  checks?: {
    label: string;
    state: "online" | "pending" | "offline";
    detail?: string | null;
    latency_ms?: number | null;
  }[];
};

type CalendarEvent = {
  title: string;
  time: string;
  date?: string;
  location?: string;
  type: "birthday" | "work" | "payday" | "default";
};

type WorkoutConfig = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  missionType: string;
  focus: string;
  accentClass: string;
};

const WORKOUT_CONFIG: Record<string, WorkoutConfig> = {
  squat: {
    label: "LOWER BODY PROTOCOL",
    Icon: SquatIcon,
    missionType: "MISSION ACTIVE",
    focus: "Legs",
    accentClass: "workout-accent-squat",
  },
  bench: {
    label: "CHEST PROTOCOL",
    Icon: BenchIcon,
    missionType: "MISSION ACTIVE",
    focus: "Chest",
    accentClass: "workout-accent-bench",
  },
  deadlift: {
    label: "POWER PROTOCOL",
    Icon: DeadliftIcon,
    missionType: "MISSION ACTIVE",
    focus: "Back",
    accentClass: "workout-accent-deadlift",
  },
  overhead_press: {
    label: "SHOULDER PROTOCOL",
    Icon: OverheadPressIcon,
    missionType: "MISSION ACTIVE",
    focus: "Shoulders",
    accentClass: "workout-accent-overhead",
  },
  overheadPress: {
    label: "SHOULDER PROTOCOL",
    Icon: OverheadPressIcon,
    missionType: "MISSION ACTIVE",
    focus: "Shoulders",
    accentClass: "workout-accent-overhead",
  },
};

const DEFAULT_WORKOUT_CONFIG: WorkoutConfig = {
  label: "RECOVERY PROTOCOL",
  Icon: RecoveryIcon,
  missionType: "STANDBY",
  focus: "Recovery",
  accentClass: "workout-accent-recovery",
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
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

function getWorkoutConfig(lift?: string | null) {
  if (!lift) return DEFAULT_WORKOUT_CONFIG;
  return WORKOUT_CONFIG[lift] || DEFAULT_WORKOUT_CONFIG;
}

function getLiftForConfig(dashboard: DashboardResponse) {
  return dashboard.today.scheduled_lift || null;
}

function getCalendarCount(item?: { spoken_response: string }) {
  const match = item?.spoken_response.match(/You have (\d+) events?/i);
  return match ? Number(match[1]) : 0;
}

function getEventType(title: string): CalendarEvent["type"] {
  const normalized = title.toLowerCase();
  if (normalized.includes("birthday") || normalized.includes("bday")) return "birthday";
  if (normalized.includes("scheduled to work") || normalized.includes("work")) return "work";
  if (normalized.includes("payday") || normalized.includes("pay")) return "payday";
  return "default";
}

function waitForCalendarOAuth(popup: Window): Promise<boolean> {
  return new Promise((resolve) => {
    const apiOrigin = new URL(API_BASE).origin;
    let receivedResult = false;

    const cleanup = (result: boolean) => {
      window.clearInterval(closeWatcher);
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin || event.data?.type !== "jarvis:calendar-auth") return;
      receivedResult = true;
      cleanup(event.data.status === "ok");
    };
    const closeWatcher = window.setInterval(() => {
      if (popup.closed && !receivedResult) cleanup(false);
    }, 500);
    const timeout = window.setTimeout(() => cleanup(false), 10 * 60_000);

    window.addEventListener("message", onMessage);
  });
}

function stripBirthdayTitle(title: string) {
  return title
    .replace(/'s birthday$/i, " Birthday")
    .replace(/\sbday$/i, " Birthday")
    .trim();
}

function parseCalendarEvents(item: { spoken_response: string }, label: string): CalendarEvent[] {
  const response = item.spoken_response;
  const [, eventText = ""] = response.split(/events? (?:today|tomorrow)\.\s*/i);
  if (!eventText || response.toLowerCase().includes("no events scheduled")) return [];

  return eventText
    .split(". ")
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?) from (all day on \d{4}-\d{2}-\d{2}|\d{1,2}:\d{2} [AP]M to \d{1,2}:\d{2} [AP]M)(?: at (.*))?$/i);
      if (!match) {
        return {
          title: part,
          time: label === "today" ? "Today" : "Tomorrow",
          type: getEventType(part),
        };
      }

      const rawTitle = match[1].trim();
      const rawTime = match[2].trim();
      const isAllDay = rawTime.toLowerCase().startsWith("all day");
      const dateMatch = rawTime.match(/\d{4}-\d{2}-\d{2}/);

      return {
        title: stripBirthdayTitle(rawTitle),
        time: isAllDay ? "All day" : rawTime.replace(" to ", " - "),
        date: isAllDay ? dateMatch?.[0] : undefined,
        location: match[3]?.trim(),
        type: getEventType(rawTitle),
      };
    });
}

function getCategoryCounts(items: ShoppingItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const category = item.category || "Other";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
}

export default function CommandCenterPage() {
  const userId = "john";
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState("");

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
      const currentScore = Number(data?.mission_status?.score);
      if (typeof window !== "undefined" && Number.isFinite(currentScore)) {
        const previousScoreRaw = window.localStorage.getItem("jarvis_mission_score");
        const previousScore = previousScoreRaw === null ? null : Number(previousScoreRaw);
        if (previousScore !== null && Number.isFinite(previousScore)) {
          setScoreDelta(currentScore - previousScore);
        } else {
          setScoreDelta(null);
        }
        window.localStorage.setItem("jarvis_mission_score", String(currentScore));
      }
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load command center.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
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

  async function resyncCalendar(allowReauthentication = true) {
    setError("");
    setCalendarSyncMessage("");
    setIsCalendarSyncing(true);

    try {
      const returnOrigin = typeof window === "undefined" ? "" : window.location.origin;
      const res = await fetch(`${API_BASE}/calendar/resync?return_origin=${encodeURIComponent(returnOrigin)}`, {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      if (data.status === "ok") {
        setCalendarSyncMessage(`Calendar synced · ${data.auth?.calendar_summary || "Primary calendar"}`);
        await loadDashboard();
        if (status) {
          const statusRes = await fetch(`${API_BASE}/status`, { headers: { "x-api-key": API_KEY } });
          if (statusRes.ok) {
            setStatus(await statusRes.json());
          }
        }
      } else if (data.status === "auth_required" && data.reauth_url && allowReauthentication) {
        const shouldReconnect = window.confirm("Google Calendar needs to be reauthenticated. Reconnect it now?");
        if (!shouldReconnect) {
          setCalendarSyncMessage("Calendar reconnect cancelled. Click sync when you are ready.");
          return;
        }
        const popup = window.open(data.reauth_url, "jarvis-calendar-auth", "popup=yes,width=560,height=720");
        if (!popup) {
          setCalendarSyncMessage("Calendar authentication popup was blocked. Allow popups for Jarvis and try again.");
          return;
        }
        setCalendarSyncMessage("Finish signing in with Google in the authentication window...");
        const completed = await waitForCalendarOAuth(popup);
        if (completed) {
          await resyncCalendar(false);
        } else {
          setCalendarSyncMessage("Calendar authentication was not completed. Click sync to try again.");
        }
      } else {
        setCalendarSyncMessage(data.message || "Calendar needs re-authentication.");
      }
    } catch (err) {
      setCalendarSyncMessage(err instanceof Error ? err.message : "Calendar resync failed.");
    } finally {
      setIsCalendarSyncing(false);
    }
  }

  const missionDelta = dashboard?.mission_status?.delta ?? scoreDelta;
  const dailyMission = dashboard?.mission_scores?.daily;
  const weeklyMission = dashboard?.mission_scores?.weekly;
  const lifetimeMission = dashboard?.mission_scores?.lifetime;
  const missionScore = dailyMission?.score ?? dashboard?.mission_status?.score ?? 0;
  const missionLabel = dailyMission?.label ?? dashboard?.mission_status?.label ?? "ON TRACK";
  const missionClass = dailyMission?.class ?? dashboard?.mission_status?.class ?? "online";

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="tactical-header mb-6">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.32em] text-green-500/65">
                Jarvis Systems
              </p>
              <h1 className="text-[2.6rem] font-black leading-none text-green-100 md:text-[3.3rem]">
                COMMAND CENTER
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-semibold text-green-200/80">
                  {dashboard ? formatDate(dashboard.date) : "Loading today..."}
                </p>
                <Link href="/jarvis" className="command-nav-link gap-2 px-3 py-2 text-xs font-black uppercase tracking-[0.22em]">
                  <BrainCircuit className="h-4 w-4" />
                  Jarvis
                </Link>
              </div>
              {dashboard?.mission_phase && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="mission-badge">{dashboard.mission_phase.label}</span>
                  <span
                    className={`mission-badge ${
                      dashboard?.mission_status?.class === "offline"
                        ? "mission-badge-danger"
                        : dashboard?.mission_status?.class === "pending"
                          ? "mission-badge-warning"
                          : ""
                    }`}
                  >
                    Mission Status: {dashboard.mission_status?.label || "ON TRACK"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="tactical-score-panel group/mission-score">
            <p className="text-xs uppercase tracking-[0.28em] text-green-500/60">Daily Mission Score</p>
            <div className="mt-2 flex items-end gap-3">
              <div
                className={`text-[3.2rem] font-black leading-none ${
                  missionClass === "offline"
                    ? "text-red-300 drop-shadow-[0_0_14px_rgba(248,113,113,0.55)]"
                    : missionClass === "pending"
                      ? "text-amber-200 drop-shadow-[0_0_14px_rgba(250,204,21,0.45)]"
                      : "text-cyan-200 drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]"
                }`}
              >
                {missionScore}
              </div>
              {typeof missionDelta === "number" && (
                <div
                  className={`mission-delta ${
                    missionDelta > 0
                      ? "mission-delta-up"
                      : missionDelta < 0
                        ? "mission-delta-down"
                        : "mission-delta-flat"
                  }`}
                >
                  <span aria-hidden="true">
                    {missionDelta > 0
                      ? "▲"
                      : missionDelta < 0
                        ? "▼"
                        : "•"}
                  </span>
                  <span>
                    {missionDelta > 0 ? "+" : ""}
                    {missionDelta ?? 0}
                  </span>
                </div>
              )}
            </div>
            <p
              className={`mt-1 text-sm font-bold uppercase tracking-[0.26em] ${
                missionClass === "offline"
                  ? "text-red-300"
                  : missionClass === "pending"
                    ? "text-amber-200"
                    : "text-green-200"
              }`}
            >
              {missionLabel}
            </p>
            <div className="mission-score-breakdown">
              <p className="text-xs uppercase tracking-[0.24em] text-green-500/60">Score Breakdown</p>
              <div className="mt-2 grid gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-green-200/80 sm:grid-cols-2">
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Workout <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.workout_score ?? 0) * 100)}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Goals <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.goal_score ?? 0) * 100)}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Goal bonus <span className="ml-2 text-green-100">{dashboard?.mission_scores?.daily?.goal_bonus ?? 0}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Above & beyond <span className="ml-2 text-green-100">{dashboard?.mission_scores?.daily?.goals_above_and_beyond_today ?? 0}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Shopping <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.shopping_score ?? 0) * 100)}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Budget <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.budget_score ?? 0) * 100)}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Calendar <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.calendar_score ?? 0) * 100)}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Debrief <span className="ml-2 text-green-100">{Math.round((dashboard?.mission_scores?.daily?.debrief_score ?? 0) * 100)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <div className="flex flex-wrap gap-2">
                {dashboard?.mission_phase && (
                  <span className="mission-badge">{dashboard.mission_phase.label}</span>
                )}
                <span
                  className={`mission-badge ${
                    missionClass === "offline"
                      ? "mission-badge-danger"
                      : missionClass === "pending"
                        ? "mission-badge-warning"
                        : ""
                  }`}
                >
                  Mission Status: {missionLabel}
                </span>
                <span className="mission-badge mission-badge-score">Daily Score: {missionScore}</span>
              </div>
              <div className="grid gap-2 text-xs uppercase tracking-[0.24em] text-green-300/75 sm:grid-cols-2">
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Weekly Mission Score <span className="ml-2 text-green-100">{weeklyMission?.score ?? 0}</span>
                </div>
                <div className="rounded-lg border border-green-500/15 bg-black/30 px-3 py-2">
                  Mission Rank <span className="ml-2 text-green-100">{lifetimeMission?.rank || "Recruit"}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <nav className="tactical-nav-grid mb-6">
          <button className="command-nav-link tactical-nav-link" onClick={toggleStatus}>
            <Zap className="h-4 w-4" />
            <span>{status ? "Hide Status" : "Ping Jarvis"}</span>
          </button>
          <Link className="command-nav-link tactical-nav-link" href="/meal-planner">
            <Utensils className="h-4 w-4" />
            <span>Meal Planner</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/food-vault">
            <DatabaseZap className="h-4 w-4" />
            <span>Food Vault</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/shopping">
            <ShoppingCart className="h-4 w-4" />
            <span>Shopping</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/recipes">
            <BookOpen className="h-4 w-4" />
            <span>Recipe Vault</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/preferences">
            <Settings2 className="h-4 w-4" />
            <span>Preferences</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/goals">
            <Target className="h-4 w-4" />
            <span>Goals</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/daily-debrief">
            <ClipboardList className="h-4 w-4" />
            <span>Daily Debrief</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/finance-ops">
            <DollarSign className="h-4 w-4" />
            <span>Finance Ops</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/health-ops">
            <HeartPulse className="h-4 w-4" />
            <span>Health Ops</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/archive">
            <BookOpen className="h-4 w-4" />
            <span>The Archive</span>
          </Link>
          <Link className="command-nav-link tactical-nav-link" href="/forge">
            <Hammer className="h-4 w-4" />
            <span>The Forge</span>
          </Link>
        </nav>

        {dashboard?.birthday_note && (
          <div className="mt-6">
            <BirthdayAlert note={dashboard.birthday_note} />
          </div>
        )}

        {status && (
          <SystemStatusPanel status={status} dashboard={dashboard} />
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
            <section className="mb-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                <p className="section-label">Training Operations</p>
                <WorkoutMissionCard dashboard={dashboard} />
              </div>
              <div className="space-y-3">
                <p className="section-label">Mission Control</p>
                <DailyBriefing dashboard={dashboard} />
              </div>
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={Activity}
                label="Daily Score"
                value={`${dashboard.mission_scores?.daily?.score ?? dashboard.mission_status?.score ?? 0}`}
              />
              <StatCard
                icon={ClipboardList}
                label="Weekly Score"
                value={`${dashboard.mission_scores?.weekly?.score ?? 0}`}
              />
              <StatCard
                icon={Trophy}
                label="Lifetime Rank"
                value={dashboard.mission_scores?.lifetime?.rank || "Recruit"}
              />
              <StatCard
                icon={ShieldCheck}
                label="Workout"
                value={
                  dashboard.today.day_type === "rest"
                    ? "Rest Day"
                    : dashboard.today.scheduled_lift_label || "Pending"
                }
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <CalendarPanel dashboard={dashboard} onResync={resyncCalendar} isSyncing={isCalendarSyncing} syncMessage={calendarSyncMessage} />
              <MealPlanPanel meals={dashboard.meals} />
              <ShoppingPanel shopping={dashboard.shopping} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function HudPanel({
  title,
  Icon,
  children,
  className = "",
  iconLabel,
  onIconClick,
  iconBusy = false,
}: {
  title: string;
  Icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
  iconLabel?: string;
  onIconClick?: () => void;
  iconBusy?: boolean;
}) {
  const icon = (
    <Icon className={`h-5 w-5 ${iconBusy ? "animate-spin" : ""}`} />
  );

  return (
    <section className={`hud-panel ${className}`}>
      <div className="mb-5 flex items-center gap-3">
        {onIconClick ? (
          <button
            type="button"
            className="hud-panel-icon hud-panel-icon-button"
            onClick={onIconClick}
            disabled={iconBusy}
            aria-label={iconLabel || title}
            title={iconLabel || title}
          >
            {icon}
          </button>
        ) : (
          <div className="hud-panel-icon">
            {icon}
          </div>
        )}
        <h2 className="hud-panel-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function WorkoutMissionCard({ dashboard }: { dashboard: DashboardResponse }) {
  const lift = getLiftForConfig(dashboard);
  const config = getWorkoutConfig(lift);
  const Icon = config.Icon;
  const workoutComplete = dashboard.today.day_type === "completed";
  const latestTopSetNotes = dashboard.workout_metadata?.latest_top_set?.notes?.toLowerCase() || "";
  const hasPrSignal = /pr|voice log|new estimated one rep max pr|new weight pr/i.test(latestTopSetNotes);
  const title =
    dashboard.today.day_type === "rest"
      ? "Rest Day"
      : formatDayType(lift).toUpperCase();
  const statusLabel =
    dashboard.today.day_type === "completed"
      ? "Complete"
      : dashboard.today.day_type === "rest"
        ? "Recovery"
        : "Active";
  const nextLift = dashboard.next_workout.next_scheduled?.lift || dashboard.next_workout.lift;
  const nextConfig = getWorkoutConfig(nextLift);
  const NextIcon = nextConfig.Icon;
  const workoutMetadata = dashboard.workout_metadata;

  return (
    <Link
      href="/workouts"
      className={`mission-card group ${config.accentClass} ${workoutComplete ? "mission-card-complete" : ""} ${hasPrSignal ? "mission-card-pr" : ""}`}
    >
      <div className="mission-scan" />
      {(workoutComplete || hasPrSignal) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="workout-victory-badge">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Workout Complete
          </span>
          {hasPrSignal && (
            <span className="workout-victory-badge workout-victory-badge-pr">
              <Trophy className="h-3.5 w-3.5" />
              PR Detected
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="hud-kicker">Today&apos;s Training Objective</p>
          <h2 className="mt-2 text-3xl font-black leading-none text-green-100 md:text-[2.5rem]">
            {title}
          </h2>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.24em] text-green-300">
            {config.label}
          </p>
        </div>
        <div className="mission-icon-shell">
          <Icon className="h-12 w-12" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <MissionMetric label="Status" value={statusLabel} />
        <MissionMetric label="Focus" value={config.focus} />
        <MissionMetric label="Action" value="Open Protocol" />
      </div>

      <div className="mt-5 rounded-lg border border-green-500/18 bg-black/28 p-3">
        <p className="hud-kicker">Next Training Protocol</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-2xl font-black leading-none text-green-100 md:text-[2rem]">
              {formatDayType(nextLift)}
            </h3>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.24em] text-green-300">
              {nextConfig.label}
            </p>
          </div>
          <div className="mission-icon-shell mission-icon-shell-compact">
            <NextIcon className="h-10 w-10" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <MissionMetric label="Status" value="Scheduled" />
          <MissionMetric label="Focus" value={nextConfig.focus} />
          <MissionMetric label="Action" value="Review Plan" />
        </div>
      </div>

      {workoutMetadata && (
        <div className="mt-5 grid gap-3 rounded-lg border border-green-500/18 bg-black/24 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {workoutMetadata.training_max ? (
            <MiniInfo label="Training Max" value={`${workoutMetadata.training_max} lbs`} />
          ) : null}
          {workoutMetadata.cycle ? <MiniInfo label="Cycle" value={`Cycle ${workoutMetadata.cycle}`} /> : null}
          {workoutMetadata.week ? <MiniInfo label="Week" value={`Week ${workoutMetadata.week}`} /> : null}
          {workoutMetadata.latest_top_set ? (
            <MiniInfo
              label="Latest Top Set"
              value={`${workoutMetadata.latest_top_set.weight || 0} x ${workoutMetadata.latest_top_set.reps || 0}`}
              note={workoutMetadata.latest_top_set.notes || ""}
            />
          ) : null}
        </div>
      )}

      <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-green-200/80 transition group-hover:text-green-100">
        Open Workout Protocol <ChevronRight className="h-4 w-4" />
      </p>
    </Link>
  );
}

function MiniInfo({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-green-500/16 bg-black/28 p-3">
      <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.22em] text-green-500/65">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-green-100">{value}</p>
      {note && <p className="mt-1 text-xs text-green-300/65">{note}</p>}
    </div>
  );
}

function MissionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="hud-panel">
      <div className="flex items-center gap-3">
        <div className="hud-panel-icon">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="hud-kicker">{label}</p>
          <p className="mt-2 text-2xl font-black leading-none text-green-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DailyBriefing({ dashboard }: { dashboard: DashboardResponse }) {
  const mission = dashboard.mission;
  const phaseKey = mission?.phase_key || dashboard.mission_phase?.key || "briefing";
  const todayEvents = getCalendarCount(dashboard.calendar.today);
  const tomorrowEvents = getCalendarCount(dashboard.calendar.tomorrow);
  const topPriority = dashboard.highest_priority_remaining_task || mission?.secondary_value || "Hold the line";
  const phaseCopy = getMissionPhaseCopy(phaseKey, dashboard);
  const missionItems = dedupePhaseLines(mission?.items || phaseCopy.items);
  const recommendation = mission?.recommendation || phaseCopy.recommendation;
  const title = mission?.title || phaseCopy.title;
  const primaryLabel = mission?.primary_label || phaseCopy.primaryLabel;
  const primaryValue = mission?.primary_value || phaseCopy.primaryValue;
  const secondaryLabel = mission?.secondary_label || phaseCopy.secondaryLabel;
  const secondaryValue = mission?.secondary_value || phaseCopy.secondaryValue;
  const statusLabel = dashboard.mission_status?.label || "ON TRACK";
  const statusToneClass =
    dashboard.mission_status?.class === "offline"
      ? "text-red-300"
      : dashboard.mission_status?.class === "pending"
        ? "text-amber-200"
        : "text-green-200";
  const showSecondaryCard = normalizePhaseText(primaryValue) !== normalizePhaseText(secondaryValue);

  return (
    <HudPanel title={title} Icon={Zap}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black uppercase text-green-100">
            {getMissionPhaseGreeting(phaseKey)}
          </p>
          <p className={`mt-1 text-sm uppercase tracking-[0.22em] ${statusToneClass}`}>
            Mission Status: {statusLabel}
          </p>
        </div>
        <span className="status-pill">{phaseCopy.badge}</span>
      </div>

      <div className="mt-5">
        <p className="hud-kicker">{phaseCopy.kicker}</p>
        <ol className="mt-3 space-y-2 text-sm text-green-100/90">
          {missionItems.map((item, index) => (
            <li key={`${item}-${index}`}>{index + 1}. {item}</li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <BriefingBlock
          label={primaryLabel}
          lines={dedupePhaseLines([primaryValue, phaseCopy.secondaryLineA, phaseCopy.secondaryLineB].filter(Boolean) as string[])}
        />
        {showSecondaryCard && (
          <BriefingBlock
            label={secondaryLabel}
            lines={dedupePhaseLines([secondaryValue, `Today events: ${todayEvents}`, `Tomorrow events: ${tomorrowEvents}`])}
          />
        )}
      </div>

      <div className="mt-5 rounded-lg border border-green-500/20 bg-black/35 p-3">
        <p className="hud-kicker">{phaseCopy.recommendationLabel}</p>
        <p className="mt-2 text-green-200/85">{recommendation || dashboard.coaching_note}</p>
        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-green-400/60">
          Highest priority: {topPriority}
        </p>
      </div>
    </HudPanel>
  );
}

function getMissionPhaseGreeting(phaseKey: string) {
  switch (phaseKey) {
    case "execution":
      return "Execute with intent.";
    case "debrief":
      return "Close the day cleanly.";
    case "recovery":
      return "Recover and reset.";
    default:
      return "Set the day in motion.";
  }
}

function dedupePhaseLines(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const normalized = line.toLowerCase().replace(/^[^:]+:\s*/, "").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizePhaseText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getMissionPhaseCopy(phaseKey: string, dashboard: DashboardResponse) {
  const mealCount = dashboard.meals.length;
  const shoppingCount = dashboard.shopping.unchecked_count;
  const mission = dashboard.mission;
  const weeklyFoodSpend = dashboard.finance_summary?.weekly_food_budget?.total_actual_food_spend_this_week ?? 0;
  const budgetStatus = dashboard.finance_summary?.dashboard_cards?.spending_status || dashboard.mission_status?.label || "ON TRACK";

  switch (phaseKey) {
    case "execution":
      return {
        badge: "EXECUTION",
        title: mission?.title || "Mission Control",
        kicker: "Execution priorities",
        recommendationLabel: "Execution recommendation",
        primaryLabel: "Objectives completed",
        primaryValue: `${mission?.objectives_completed ?? 0}/${mission?.objectives_total ?? 0}`,
        secondaryLabel: "Highest priority remaining task",
        secondaryValue: dashboard.highest_priority_remaining_task || mission?.secondary_value || "Keep pushing the plan.",
        items: mission?.items || [
          `Objectives completed: ${mission?.objectives_completed ?? 0}/${mission?.objectives_total ?? 0}`,
          `Workout progress: ${mission?.workout_completed ? "Workout covered" : "Workout pending"}`,
          `Shopping progress: ${shoppingCount} open item${shoppingCount === 1 ? "" : "s"}`,
          `Budget status: ${budgetStatus}`,
        ],
        recommendation: mission?.recommendation || dashboard.highest_priority_remaining_task || dashboard.coaching_note,
        secondaryLineA: `${mealCount} meal${mealCount === 1 ? "" : "s"} planned`,
        secondaryLineB: `Mission score ${dashboard.mission_status?.score ?? mission?.score ?? 0}`,
      };
    case "debrief":
      return {
        badge: "DEBRIEF",
        title: mission?.title || "End-of-Day Wrap",
        kicker: "Debrief priorities",
        recommendationLabel: "Debrief recommendation",
        primaryLabel: "Workout completion",
        primaryValue: mission?.workout_completed ? "Completed" : dashboard.today.day_type === "rest" ? "Recovery day" : "Missing",
        secondaryLabel: "Tomorrow's focus",
        secondaryValue: dashboard.next_workout.next_scheduled ? formatDayType(dashboard.next_workout.next_scheduled.lift) : "Rest day",
        items: mission?.items || [
          `Objectives completed: ${mission?.objectives_completed ?? 0}/${mission?.objectives_total ?? 0}`,
          `Workout completion status: ${mission?.workout_completed ? "Done" : "Not logged"}`,
          `Food spending: $${weeklyFoodSpend.toFixed(2)} this week`,
          `Tomorrow's focus: ${dashboard.next_workout.next_scheduled ? formatDayType(dashboard.next_workout.next_scheduled.lift) : "Rest"}`,
        ],
        recommendation: mission?.recommendation || dashboard.coaching_note,
        secondaryLineA: `${(dashboard.finance_summary?.weekly_food_budget?.total_actual_food_spend_this_week ?? 0).toFixed(2)} food spend`,
        secondaryLineB: dashboard.calendar.tomorrow.spoken_response,
      };
    case "recovery":
      return {
        badge: "RECOVERY",
        title: mission?.title || "Recovery Protocol",
        kicker: "Recovery priorities",
        recommendationLabel: "Recovery recommendation",
        primaryLabel: "Tomorrow's workout",
        primaryValue: dashboard.next_workout.lift_label || "Rest day",
        secondaryLabel: "Tomorrow's calendar",
        secondaryValue: dashboard.calendar.tomorrow.spoken_response,
        items: mission?.items || [
          `Tomorrow's workout: ${dashboard.next_workout.lift_label || "Rest day"}`,
          `Tomorrow's calendar: ${dashboard.calendar.tomorrow.spoken_response}`,
          `Meal prep status: ${mealCount} meal${mealCount === 1 ? "" : "s"} planned`,
          `Recovery recommendation: ${dashboard.coaching_note}`,
        ],
        recommendation: mission?.recommendation || dashboard.coaching_note,
        secondaryLineA: `Shopping: ${shoppingCount} open item${shoppingCount === 1 ? "" : "s"}`,
        secondaryLineB: `Budget: ${budgetStatus}`,
      };
    default:
      return {
        badge: "BRIEFING",
        title: mission?.title || "Daily Briefing",
        kicker: "Briefing priorities",
        recommendationLabel: "Daily recommendation",
        primaryLabel: "Today's priorities",
        primaryValue: dashboard.today.scheduled_lift_label || "Recovery",
        secondaryLabel: "Today's schedule",
        secondaryValue: dashboard.calendar.today.spoken_response,
        items: mission?.items || [
          `Today's priorities: ${dashboard.today.scheduled_lift_label || "Recovery day"}`,
          `Today's workout: ${dashboard.today.scheduled_lift_label || "Recovery"}`,
          `Today's schedule: ${dashboard.calendar.today.spoken_response}`,
          `Nutrition plan: ${mealCount ? `${mealCount} meal${mealCount === 1 ? "" : "s"} planned` : "No meals planned"}`,
        ],
        recommendation: mission?.recommendation || dashboard.coaching_note,
        secondaryLineA: `Shopping: ${shoppingCount} open item${shoppingCount === 1 ? "" : "s"}`,
        secondaryLineB: `Mission status: ${budgetStatus}`,
      };
  }
}

function BriefingBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-black/30 p-3">
      <p className="hud-kicker">{label}</p>
      <div className="mt-2 space-y-1 text-green-200/80">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function CalendarPanel({
  dashboard,
  onResync,
  isSyncing,
  syncMessage,
}: {
  dashboard: DashboardResponse;
  onResync: () => void;
  isSyncing: boolean;
  syncMessage: string;
}) {
  return (
    <HudPanel
      title="Calendar / Work"
      Icon={CalendarDays}
      onIconClick={onResync}
      iconBusy={isSyncing}
      iconLabel="Re-sync Google Calendar"
    >
      <div className="space-y-5">
        {syncMessage && (
          <p className={`calendar-sync-message ${syncMessage.toLowerCase().includes("failed") || syncMessage.toLowerCase().includes("auth") ? "calendar-sync-warning" : ""}`}>
            {syncMessage}
          </p>
        )}
        <CalendarDay label="Today" item={dashboard.calendar.today} />
        <CalendarDay label="Tomorrow" item={dashboard.calendar.tomorrow} />
      </div>
    </HudPanel>
  );
}

function CalendarDay({
  label,
  item,
}: {
  label: string;
  item: {
    status: string;
    spoken_response: string;
  };
}) {
  const events = parseCalendarEvents(item, label.toLowerCase());

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="hud-kicker">{label}</p>
        {item.status === "fallback" && (
          <span className="status-pill status-pill-warning">Fallback</span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border border-green-500/15 bg-black/30 p-3 text-sm text-green-300/70">
          No calendar events detected.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((event, index) => (
            <CalendarEventRow key={`${event.title}-${index}`} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarEventRow({ event }: { event: CalendarEvent }) {
  return (
    <div className="hud-row">
      <div className="hud-row-icon">
        <CalendarEventIcon type={event.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-green-100">{event.title}</p>
          <p className="text-sm text-green-300/75">{event.time}</p>
        </div>
        {(event.date || event.location) && (
          <p className="mt-1 text-xs text-green-300/55">
            {event.date ? event.date : ""}
            {event.date && event.location ? " · " : ""}
            {event.location ? `Location: ${event.location}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function CalendarEventIcon({ type }: { type: CalendarEvent["type"] }) {
  switch (type) {
    case "birthday":
      return <Cake className="h-4 w-4" />;
    case "work":
      return <BriefcaseBusiness className="h-4 w-4" />;
    case "payday":
      return <DollarSign className="h-4 w-4" />;
    default:
      return <CalendarDays className="h-4 w-4" />;
  }
}

function MealPlanPanel({ meals }: { meals: MealEntry[] }) {
  return (
    <HudPanel title="Meal Plan Today" Icon={Utensils}>
      {meals.length === 0 ? (
        <p className="rounded-lg border border-green-500/15 bg-black/30 p-3 text-green-300/70">
          No meals planned today.
        </p>
      ) : (
        <div className="space-y-2">
          {meals.map((meal) => (
            <div key={meal.id} className="hud-row">
              <div className="hud-row-icon">
                <Utensils className="h-4 w-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-500/70">{meal.meal_type}</p>
                  {meal.meta?.completed && (
                    <span className="rounded-full border border-green-300/35 bg-green-400/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-green-100">
                      Eaten
                    </span>
                  )}
                </div>
                <p className="mt-1 font-semibold text-green-100">{meal.name}</p>
                {meal.meta && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <MealMacro label="Cal" value={macroValue(meal.meta.calories, meal.meta.servings)} unit="" />
                    <MealMacro label="Protein" value={macroValue(meal.meta.protein_g, meal.meta.servings)} unit="g" />
                    <MealMacro label="Carbs" value={macroValue(meal.meta.carbs_g, meal.meta.servings)} unit="g" />
                    <MealMacro label="Fat" value={macroValue(meal.meta.fat_g, meal.meta.servings)} unit="g" />
                  </div>
                )}
                {meal.notes && <p className="mt-1 text-sm text-green-300/60">{meal.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </HudPanel>
  );
}

function MealMacro({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null;
  return (
    <span className="rounded-md border border-green-500/20 bg-black/40 px-2 py-1 text-[0.7rem] uppercase tracking-[0.12em] text-green-300/75">
      {label}: {value}{unit}
    </span>
  );
}

function macroValue(value?: number | null, servings?: number | null) {
  if (value == null) return null;
  return Math.round(Number(value) * Number(servings || 1) * 10) / 10;
}

function ShoppingPanel({ shopping }: { shopping: DashboardResponse["shopping"] }) {
  const categoryCounts = getCategoryCounts(shopping.unchecked_items);

  return (
    <HudPanel title="Supply Status" Icon={ShoppingCart}>
      {!shopping.list ? (
        <p className="text-green-300/70">No shopping list found.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-black text-green-100">
                {shopping.unchecked_count} OPEN ITEM{shopping.unchecked_count === 1 ? "" : "S"}
              </p>
              <p className="mt-1 text-sm text-green-300/60">{shopping.list.title}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-green-300/70" />
          </div>

          {Object.keys(categoryCounts).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(categoryCounts).map(([category, count]) => (
                <span key={category} className="status-pill">
                  {category}: {count}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-2">
            {shopping.unchecked_items.slice(0, 8).map((item) => (
              <div key={item.id} className="hud-row hoverable-row">
                <Circle className="h-4 w-4 text-green-500/70" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-green-100">{item.item_name}</p>
                  <p className="text-sm text-green-300/60">
                    {[item.quantity, item.category].filter(Boolean).join(" · ") || "No details"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </HudPanel>
  );
}

function SystemStatusPanel({
  status,
  dashboard,
}: {
  status: StatusResponse;
  dashboard: DashboardResponse | null;
}) {
  const realChecks = status.checks || [];
  const llmCheck = realChecks.find((check) => check.label === "Jarvis Local LLM");
  const llmOnline = status.llm?.online ?? llmCheck?.state === "online";
  const installedModels = status.llm?.installedModels || status.llm?.models || [];
  const loadedModels = status.llm?.loadedModels || [];
  const activeModel = status.llm?.activeModel || status.llm?.configuredModel || status.llm?.model || "Unavailable";
  const llmDetail = installedModels.length
    ? `Installed: ${installedModels.join(" · ")}${loadedModels.length ? ` · Loaded: ${loadedModels.join(" · ")}` : " · Ready on demand"}`
    : llmCheck?.detail || "No installed model information returned";
  const checkIcon = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("api")) return Server;
    if (normalized.includes("environment")) return ShieldCheck;
    if (normalized.includes("database") || normalized.includes("supabase")) return DatabaseZap;
    if (normalized.includes("goal")) return Target;
    if (normalized.includes("forge")) return Hammer;
    if (normalized.includes("calendar")) return CalendarDays;
    if (normalized.includes("meal")) return Utensils;
    if (normalized.includes("health")) return HeartPulse;
    if (normalized.includes("food")) return DatabaseZap;
    if (normalized.includes("shopping")) return ShoppingCart;
    if (normalized.includes("llm") || normalized.includes("ollama")) return BrainCircuit;
    return Wifi;
  };
  const statusItems = realChecks.length
    ? [
        { label: "Systems", value: status.systems || "Online", Icon: Server, state: status.systems === "Online" ? "online" : "pending", detail: `${realChecks.filter((check) => check.state === "online").length}/${realChecks.length} checks online` },
        { label: "LLM Layer", value: activeModel, Icon: BrainCircuit, state: llmOnline ? "online" : "offline", detail: llmDetail },
        { label: "Clearance", value: status.clearance || "Active", Icon: ShieldCheck, state: "online", detail: status.user || "John Summers Sr" },
        ...realChecks.filter((check) => check.label !== "Jarvis Local LLM").map((check) => ({
          label: check.label,
          value: check.state === "online" ? "Online" : check.state === "pending" ? "Pending" : "Offline",
          Icon: checkIcon(check.label),
          state: check.state,
          detail: `${check.detail || "No detail"}${check.latency_ms != null ? ` · ${check.latency_ms}ms` : ""}`,
        })),
      ]
    : [
        { label: "Systems", value: status.systems || "Online", Icon: Server, state: "online", detail: "Backend online" },
        { label: "LLM Layer", value: activeModel, Icon: BrainCircuit, state: llmOnline ? "online" : "offline", detail: llmDetail },
        { label: "User", value: status.user || "John Summers Sr", Icon: UserRound, state: "online", detail: "Profile loaded" },
        { label: "Clearance", value: status.clearance || "Active", Icon: ShieldCheck, state: "online", detail: "API key accepted" },
        {
          label: "Calendar Sync",
          value: dashboard?.calendar.today.status === "ok" ? "Online" : "Offline",
          Icon: CalendarDays,
          state: dashboard?.calendar.today.status === "ok" ? "online" : "pending",
          detail: dashboard?.calendar.today.spoken_response || "Calendar status unavailable",
        },
      ];

  return (
    <section className="hud-panel mb-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="hud-panel-icon">
          <Activity className="h-5 w-5" />
        </div>
        <h2 className="hud-panel-title">Jarvis System Status</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statusItems.map((item) => (
          <div key={item.label} className={`system-status-card ${item.state === "pending" ? "is-pending" : ""} ${item.state === "offline" ? "is-offline" : ""}`}>
            <item.Icon className="h-5 w-5" />
            <div>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              {item.detail && <span>{item.detail}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className={`mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] ${llmOnline ? "text-green-300/70" : "text-red-300/75"}`}>
        {llmOnline ? <BrainCircuit className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {llmOnline ? `${activeModel} is available to Jarvis.` : "The Jarvis LLM is currently unavailable."}
        {status.checked_at ? ` Last check: ${new Date(status.checked_at).toLocaleTimeString()}.` : ""}
      </p>
    </section>
  );
}
