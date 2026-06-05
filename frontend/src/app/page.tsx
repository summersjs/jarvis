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
  ClipboardList,
  DatabaseZap,
  DollarSign,
  Server,
  ShieldCheck,
  ShoppingCart,
  Utensils,
  UserRound,
  Wifi,
  WifiOff,
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
  return dashboard.today.scheduled_lift || dashboard.next_workout.lift || dashboard.today.day_type;
}

function parseBirthdayName(note?: string | null) {
  if (!note) return null;
  return note
    .replace(/^today is\s+/i, "")
    .replace(/'s birthday\.?$/i, "")
    .replace(/^birthdays today:\s*/i, "")
    .replace(/\.$/, "")
    .trim();
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
              <Link className="command-nav-link" href="/goals">
                Goals
              </Link>
            </nav>
          </div>

          {dashboard?.birthday_note && (
            <div className="mt-6">
              <BirthdayAlert note={dashboard.birthday_note} />
            </div>
          )}
        </header>

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
            <section className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <WorkoutMissionCard dashboard={dashboard} />
              <DailyBriefing dashboard={dashboard} />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <NextWorkoutPanel dashboard={dashboard} />
              <CalendarPanel dashboard={dashboard} />
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
}: {
  title: string;
  Icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`hud-panel ${className}`}>
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

function WorkoutMissionCard({ dashboard }: { dashboard: DashboardResponse }) {
  const lift = getLiftForConfig(dashboard);
  const config = getWorkoutConfig(lift);
  const Icon = config.Icon;
  const title = formatDayType(lift).toUpperCase();
  const statusLabel = dashboard.today.day_type === "completed" ? "Complete" : "Active";

  return (
    <Link href="/workouts" className={`mission-card group ${config.accentClass}`}>
      <div className="mission-scan" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hud-kicker">Today&apos;s Training Objective</p>
          <h2 className="mt-2 text-4xl font-black leading-none text-green-100 md:text-5xl">
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

      <div className="mt-7 grid gap-3 text-sm sm:grid-cols-3">
        <MissionMetric label="Status" value={statusLabel} />
        <MissionMetric label="Focus" value={config.focus} />
        <MissionMetric label="Action" value="Open Protocol" />
      </div>

      <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-green-200/80 transition group-hover:text-green-100">
        Open Workout Protocol <ChevronRight className="h-4 w-4" />
      </p>
    </Link>
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

function DailyBriefing({ dashboard }: { dashboard: DashboardResponse }) {
  const birthdayName = parseBirthdayName(dashboard.birthday_note);
  const lift = getLiftForConfig(dashboard);
  const shoppingCount = dashboard.shopping.unchecked_count;
  const todayEvents = getCalendarCount(dashboard.calendar.today);
  const todayParsedEvents = parseCalendarEvents(dashboard.calendar.today, "today");
  const tomorrowParsedEvents = parseCalendarEvents(dashboard.calendar.tomorrow, "tomorrow");
  const nextScheduleEvent = [
    ...todayParsedEvents.filter((event) => event.type !== "birthday"),
    ...tomorrowParsedEvents,
  ][0];
  const recommendation = [
    `complete ${formatDayType(lift).toLowerCase()}`,
    birthdayName ? `acknowledge ${birthdayName}'s birthday` : null,
    shoppingCount > 0 ? "clear the highest-priority shopping item" : null,
  ].filter(Boolean).join(", ");

  return (
    <HudPanel title="Daily Briefing" Icon={Zap}>
      <p className="text-2xl font-black uppercase text-green-100">Good morning, John.</p>

      <div className="mt-5">
        <p className="hud-kicker">Primary Priorities</p>
        <ol className="mt-3 space-y-2 text-sm text-green-100/90">
          {birthdayName && <li>1. {birthdayName} birthday</li>}
          <li>{birthdayName ? "2" : "1"}. {formatDayType(lift)} training objective</li>
          <li>{birthdayName ? "3" : "2"}. Clear {shoppingCount} shopping item{shoppingCount === 1 ? "" : "s"}</li>
        </ol>
      </div>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <BriefingBlock
          label="Schedule"
          lines={[
            `${todayEvents} event${todayEvents === 1 ? "" : "s"} today`,
            nextScheduleEvent ? `Next event: ${nextScheduleEvent.title} at ${nextScheduleEvent.time}` : "No upcoming event detected",
          ]}
        />
        <BriefingBlock
          label="Nutrition"
          lines={[
            dashboard.meals.length
              ? `${dashboard.meals.length} meal${dashboard.meals.length === 1 ? "" : "s"} planned`
              : "No meals planned today",
          ]}
        />
      </div>

      <div className="mt-5 rounded-lg border border-green-500/20 bg-black/35 p-3">
        <p className="hud-kicker">Recommendation</p>
        <p className="mt-2 text-green-200/85">
          Keep today simple: {recommendation || dashboard.coaching_note}.
        </p>
      </div>
    </HudPanel>
  );
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

function NextWorkoutPanel({ dashboard }: { dashboard: DashboardResponse }) {
  const lift = dashboard.next_workout.lift || dashboard.today.scheduled_lift || dashboard.today.day_type;
  const config = getWorkoutConfig(lift);
  const Icon = config.Icon;

  return (
    <HudPanel title="Next Training Protocol" Icon={ClipboardList}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-3xl font-black uppercase text-green-100">
            {dashboard.next_workout.lift_label || formatDayType(lift)}
          </p>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-green-300/75">
            {config.label}
          </p>
        </div>
        <div className="hud-panel-icon h-12 w-12">
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MissionMetric label="Status" value="Scheduled" />
        <MissionMetric label="Focus" value={config.focus} />
        <MissionMetric label="Action" value="Review Plan" />
      </div>
    </HudPanel>
  );
}

function CalendarPanel({ dashboard }: { dashboard: DashboardResponse }) {
  return (
    <HudPanel title="Calendar / Work" Icon={CalendarDays}>
      <div className="space-y-5">
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
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-500/70">{meal.meal_type}</p>
                <p className="mt-1 font-semibold text-green-100">{meal.name}</p>
                {meal.notes && <p className="mt-1 text-sm text-green-300/60">{meal.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </HudPanel>
  );
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
  // TODO: Replace mock/pending values with real backend health checks.
  const statusItems = [
    { label: "Systems", value: status.systems || "Online", Icon: Server, state: "online" },
    { label: "Brain", value: status.brain || "Gemini 1.5 Flash", Icon: BrainCircuit, state: "online" },
    { label: "User", value: status.user || "John Summers Sr", Icon: UserRound, state: "online" },
    { label: "Clearance", value: status.clearance || "Active", Icon: ShieldCheck, state: "online" },
    { label: "Local API", value: "Online", Icon: Wifi, state: "online" },
    { label: "Ollama", value: "Pending", Icon: WifiOff, state: "pending" },
    {
      label: "Calendar Sync",
      value: dashboard?.calendar.today.status === "ok" ? "Online" : "Offline",
      Icon: CalendarDays,
      state: dashboard?.calendar.today.status === "ok" ? "online" : "pending",
    },
    { label: "Meal Planner", value: "Ready", Icon: DatabaseZap, state: "online" },
    { label: "Shopping List", value: "Ready", Icon: CheckCircle2, state: "online" },
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
          <div key={item.label} className={`system-status-card ${item.state === "pending" ? "is-pending" : ""}`}>
            <item.Icon className="h-5 w-5" />
            <div>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-yellow-300/70">
        <AlertTriangle className="h-4 w-4" />
        Some health checks are mocked pending backend probes.
      </p>
    </section>
  );
}
