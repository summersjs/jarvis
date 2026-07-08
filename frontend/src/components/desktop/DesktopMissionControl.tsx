"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  Box,
  Cpu,
  Database,
  Flame,
  Gauge,
  Globe2,
  HardDrive,
  MonitorCog,
  Music2,
  Network,
  Plus,
  Radio,
  Sparkles,
  TerminalSquare,
  Timer,
  Zap,
} from "lucide-react";
import styles from "./DesktopMissionControl.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type ForgeProject = {
  id: string;
  title: string;
  category?: string | null;
  status?: string | null;
  summary?: string | null;
  next_milestone?: string | null;
  progress_percent?: number | null;
  cover_image_url?: string | null;
  updated_at?: string | null;
};

type ForgeGoal = {
  id: string;
  title: string;
  category?: string | null;
  mission_type?: string | null;
  project?: {
    percent?: number | null;
    next_milestone?: { title?: string | null; target_date?: string | null } | null;
  } | null;
};

type ForgeDashboard = {
  projects?: ForgeProject[];
  recently_updated?: ForgeProject[];
  goals?: ForgeGoal[];
  stats?: {
    active_projects?: number;
    building?: number;
    incubating?: number;
    completed?: number;
  };
};

type SystemMetric = {
  label: string;
  value: string;
  detail: string;
  level: number;
  Icon: typeof Cpu;
};

type NativeStats = {
  cpuUsage?: number;
  cpuTemp?: number;
  gpuUsage?: number;
  gpuTemp?: number;
  gpuHotspot?: number;
  ramUsage?: number;
  storageUsage?: number;
  nvmeTemp?: number;
  fanRpm?: number;
  networkUp?: string;
  networkDown?: string;
  uptime?: string;
};

declare global {
  interface Window {
    jarvisDesktop?: {
      getSystemStats?: () => Promise<NativeStats>;
      launchApp?: (appId: string) => Promise<void>;
    };
  }
}

const fallbackProjects: ForgeProject[] = [
  { id: "jarvis", title: "Jarvis Workstation", status: "In Progress", category: "Hardware", progress_percent: 67, summary: "Desktop command center migration.", next_milestone: "Windows mission control shell" },
  { id: "world-walker", title: "World Walker", status: "In Progress", category: "Games", progress_percent: 45, summary: "Core loop and world systems.", next_milestone: "Prototype route map" },
  { id: "billionaire-club", title: "Billionaire Club", status: "Planning", category: "Business", progress_percent: 20, summary: "Offer, audience, and content engine.", next_milestone: "Positioning draft" },
  { id: "lucien", title: "Lucien", status: "Concept", category: "Writing", progress_percent: 10, summary: "Character and story fragments.", next_milestone: "Scene list" },
];

const quickLaunch = [
  { id: "vscode", label: "VS Code", Icon: Box, href: "vscode://file/C:/Users/johnf/OneDrive/Development/jarvis" },
  { id: "chrome", label: "Chrome", Icon: Globe2, href: "https://www.google.com", appId: "chrome" },
  { id: "unreal", label: "Unreal Engine", Icon: AppWindow },
  { id: "terminal", label: "Terminal", Icon: TerminalSquare },
  { id: "youtube-music", label: "YouTube Music", Icon: Music2, href: "https://music.youtube.com", appId: "youtube-music" },
  { id: "add", label: "Add App", Icon: Plus },
];

export default function DesktopMissionControl() {
  const [now, setNow] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<ForgeDashboard>({});
  const [systemStats, setSystemStats] = useState<NativeStats | null>(null);
  const [calendarLine, setCalendarLine] = useState("Calendar link online");
  const [dataState, setDataState] = useState("Synchronizing Forge");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDesktopData() {
      try {
        const [forgeRes, calendarRes] = await Promise.all([
          fetch(`${API_BASE}/forge/desktop?user_id=${USER_ID}`, { headers: { "x-api-key": API_KEY } }),
          fetch(`${API_BASE}/calendar/today`, { headers: { "x-api-key": API_KEY } }),
        ]);

        if (forgeRes.ok) {
          const forgeData = await forgeRes.json();
          if (!cancelled) {
            setDashboard(forgeData);
            setDataState("Forge link online");
          }
        } else if (!cancelled) {
          setDataState("Forge fallback mode");
        }

        if (calendarRes.ok) {
          const calendarData = await calendarRes.json();
          if (!cancelled) setCalendarLine(calendarData.spoken_response || "Calendar link online");
        }
      } catch {
        if (!cancelled) setDataState("Local fallback mode");
      }
    }

    loadDesktopData();
    const timer = window.setInterval(loadDesktopData, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const stats = await window.jarvisDesktop?.getSystemStats?.();
      if (!cancelled && stats) setSystemStats(stats);
    }

    loadStats();
    const timer = window.setInterval(loadStats, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const projects = useMemo(() => {
    const liveProjects = dashboard.recently_updated?.length ? dashboard.recently_updated : dashboard.projects;
    return liveProjects?.length ? liveProjects.slice(0, 6) : fallbackProjects;
  }, [dashboard.projects, dashboard.recently_updated]);

  const activeProject = projects[0] || fallbackProjects[0];
  const goals = dashboard.goals?.length ? dashboard.goals.slice(0, 5) : [];
  const metrics = buildSystemMetrics(systemStats);

  return (
    <main className={styles.shell}>
      <div className={styles.templateGlow} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <DriftingParticles />

      <SystemPanel now={now} metrics={metrics} dataState={systemStats ? "Native telemetry online" : "Telemetry bridge pending"} />

      <section className={styles.stage} aria-label="Jarvis desktop mission control">
        <HudCore tone="blue" title="SYSTEM CORE" primary={formatTime(now)} secondary={formatDate(now)} />
        <SparkBridge />
        <HudCore tone="orange" title="ACTIVE PROJECT" primary={activeProject.title} secondary={`${Math.round(activeProject.progress_percent || 0)}% ${activeProject.status || "In Progress"}`} />
      </section>

      <ProjectPanel
        activeProject={activeProject}
        projects={projects}
        goals={goals}
        calendarLine={calendarLine}
        dataState={dataState}
      />

      <QuickLaunchDock />
      <div className={styles.systemOnline}>
        <Radio size={18} />
        <span>SYSTEM ONLINE</span>
      </div>
    </main>
  );
}

function HudCore({ tone, title, primary, secondary }: { tone: "blue" | "orange"; title: string; primary: string; secondary: string }) {
  const nodeLabels = ["Build", "Develop", "Research", "Collaborate"];

  return (
    <div className={`${styles.coreWrap} ${styles[tone]}`}>
      <div className={styles.coreGlow} />
      <div className={`${styles.ring} ${styles.outerRing}`} />
      <div className={`${styles.ring} ${styles.innerRing}`} />
      <div className={`${styles.ring} ${styles.detailRing}`} />
      <div className={styles.tickRing} />
      <div className={styles.coreContent}>
        <span>{title}</span>
        <strong>{primary}</strong>
        <em>{secondary}</em>
      </div>
      {tone === "orange" && (
        <div className={styles.orbitNodes} aria-hidden="true">
          {nodeLabels.map((label, index) => (
            <span key={label} className={styles[`node${index}`]}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SparkBridge() {
  return (
    <div className={styles.bridge} aria-hidden="true">
      <div className={styles.energyLine} />
      <svg className={styles.lightning} viewBox="0 0 640 180" preserveAspectRatio="none">
        <path className={styles.boltMain} d="M0 92 L100 84 L142 104 L218 72 L284 92 L326 82 L380 102 L450 78 L522 94 L640 86" />
        <path className={styles.boltBranch} d="M190 78 L226 38 L252 84" />
        <path className={styles.boltBranch} d="M302 92 L336 132 L372 100" />
        <path className={styles.boltBranch} d="M402 96 L448 46 L492 84" />
        <path className={styles.boltBranch} d="M255 88 L286 146 L312 98" />
      </svg>
      <div className={styles.collisionCore} />
      <div className={styles.sparkField}>
        {Array.from({ length: 30 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

function SystemPanel({ now, metrics, dataState }: { now: Date; metrics: SystemMetric[]; dataState: string }) {
  return (
    <aside className={`${styles.panel} ${styles.systemPanel}`}>
      <header>
        <span>LEFT CORE</span>
        <strong>{formatTime(now)}</strong>
        <em>{formatDate(now)}</em>
      </header>
      <div className={styles.weather}>
        <CloudGlyph />
        <div>
          <strong>82°F</strong>
          <span>Partly Cloudy</span>
        </div>
      </div>
      <div className={styles.metricStack}>
        {metrics.map(({ label, value, detail, level, Icon }) => (
          <article key={label} className={styles.metric}>
            <Icon size={18} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <em>{detail}</em>
            </div>
            <i style={{ "--level": `${Math.max(4, Math.min(level, 100))}%` } as React.CSSProperties} />
          </article>
        ))}
      </div>
      <footer>{dataState}</footer>
    </aside>
  );
}

function ProjectPanel({
  activeProject,
  projects,
  goals,
  calendarLine,
  dataState,
}: {
  activeProject: ForgeProject;
  projects: ForgeProject[];
  goals: ForgeGoal[];
  calendarLine: string;
  dataState: string;
}) {
  return (
    <aside className={`${styles.panel} ${styles.projectPanel}`}>
      <header>
        <span>RIGHT CORE</span>
        <strong>PROJECTS</strong>
        <em>{dataState}</em>
      </header>
      <section className={styles.activeProject}>
        <span>ACTIVE PROJECT</span>
        <h1>{activeProject.title}</h1>
        <strong>{Math.round(activeProject.progress_percent || 0)}%</strong>
        <em>{activeProject.next_milestone || activeProject.summary || "Next mission packet pending"}</em>
      </section>
      <section className={styles.projectList} aria-label="Forge projects">
        {projects.map((project, index) => (
          <article key={project.id} className={`${styles.projectCard} ${index === 0 ? styles.activeCard : ""}`}>
            <div className={styles.projectThumb}>
              {project.cover_image_url ? <img src={project.cover_image_url} alt="" /> : <Flame size={22} />}
            </div>
            <div>
              <strong>{project.title}</strong>
              <span>{project.status || project.category || "In Progress"}</span>
              <i><b style={{ width: `${Math.max(8, Math.min(project.progress_percent || 0, 100))}%` }} /></i>
            </div>
            <em>{Math.round(project.progress_percent || 0)}%</em>
          </article>
        ))}
      </section>
      <section className={styles.events}>
        <strong>Upcoming Events</strong>
        <p>{calendarLine}</p>
      </section>
      <section className={styles.goalRotation}>
        <strong>Goal Rotation</strong>
        {(goals.length ? goals : [{ id: "fallback", title: "Forge real projects into finished missions", project: { percent: activeProject.progress_percent || 0 } }]).map((goal) => (
          <span key={goal.id}>{goal.title}<em>{Math.round(goal.project?.percent || 0)}%</em></span>
        ))}
      </section>
    </aside>
  );
}

function QuickLaunchDock() {
  async function launch(appId: string, href?: string) {
    const launched = await window.jarvisDesktop?.launchApp?.(appId);
    if (!launched && href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <nav className={styles.dock} aria-label="Quick launch">
      {quickLaunch.map(({ id, label, Icon, href, appId }) => {
        const content = (
          <>
            <Icon size={34} />
            <span>{label}</span>
          </>
        );

        if (href && !appId) {
          return (
            <a key={id} href={href} target="_blank" rel="noreferrer" title={label}>
              {content}
            </a>
          );
        }

        return (
          <button key={id} type="button" title={label} onClick={() => launch(appId || id, href)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}

function DriftingParticles() {
  return (
    <div className={styles.particles} aria-hidden="true">
      {Array.from({ length: 42 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function CloudGlyph() {
  return (
    <svg viewBox="0 0 64 42" aria-hidden="true">
      <path d="M20 35h28c7 0 12-4 12-10s-5-10-11-10h-2C44 8 38 4 31 4c-9 0-16 6-17 15C8 20 4 24 4 29c0 4 4 6 16 6Z" />
    </svg>
  );
}

function buildSystemMetrics(stats: NativeStats | null): SystemMetric[] {
  return [
    { label: "CPU", value: percent(stats?.cpuUsage, 18), detail: tempDetail("CPU temp", stats?.cpuTemp, 58), level: stats?.cpuUsage ?? 18, Icon: Cpu },
    { label: "GPU", value: percent(stats?.gpuUsage, 22), detail: `Hotspot ${stats?.gpuHotspot ?? 68}°C`, level: stats?.gpuUsage ?? 22, Icon: MonitorCog },
    { label: "RAM", value: percent(stats?.ramUsage, 32), detail: "Memory pressure nominal", level: stats?.ramUsage ?? 32, Icon: Activity },
    { label: "Storage", value: percent(stats?.storageUsage, 58), detail: tempDetail("NVMe", stats?.nvmeTemp, 44), level: stats?.storageUsage ?? 58, Icon: HardDrive },
    { label: "Fans", value: `${stats?.fanRpm ?? 1240} RPM`, detail: "Cooling curve stable", level: 42, Icon: Gauge },
    { label: "Network", value: stats?.networkDown || "1.2 GB", detail: `Up ${stats?.networkUp || "128 MB"}`, level: 36, Icon: Network },
    { label: "Uptime", value: stats?.uptime || "06:42:18", detail: "Desktop session", level: 74, Icon: Timer },
    { label: "Bridge", value: stats ? "LIVE" : "PENDING", detail: stats ? "Native system feed" : "Awaiting Electron telemetry", level: stats ? 100 : 12, Icon: Database },
  ];
}

function percent(value: number | undefined, fallback: number) {
  return `${Math.round(value ?? fallback)}%`;
}

function tempDetail(label: string, value: number | undefined, fallback: number) {
  return `${label} ${Math.round(value ?? fallback)}°C`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
