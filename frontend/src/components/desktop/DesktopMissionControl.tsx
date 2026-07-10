"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Box,
  CalendarDays,
  Cloud,
  Cpu,
  Flame,
  Globe2,
  HardDrive,
  MemoryStick,
  MonitorCog,
  Music2,
  Pause,
  Play,
  Network,
  Plus,
  Radio,
  SkipBack,
  SkipForward,
  TerminalSquare,
  Timer,
  Wifi,
  Zap,
  type LucideIcon,
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

type TelemetryMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  level: number;
  Icon: LucideIcon;
  position: string;
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

type CalendarEvent = {
  title: string;
  date?: string;
  detail?: string;
};

type MediaStatus = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  artworkUrl?: string | null;
  isPlaying?: boolean;
  source?: string | null;
};

declare global {
  interface Window {
    jarvisDesktop?: {
      getSystemStats?: () => Promise<NativeStats>;
      launchApp?: (appId: string) => Promise<void>;
      getMediaStatus?: () => Promise<MediaStatus | null>;
      controlMedia?: (action: "previous" | "playPause" | "next") => Promise<void>;
    };
  }
}

const fallbackProjects: ForgeProject[] = [
  { id: "jarvis", title: "Jarvis Workstation", status: "In Progress", category: "Hardware", progress_percent: 67, summary: "Desktop command center migration.", next_milestone: "Windows mission control shell" },
  { id: "world-walker", title: "World Walker", status: "In Progress", category: "Games", progress_percent: 45, summary: "Core loop and world systems.", next_milestone: "Prototype route map" },
  { id: "billionaire-club", title: "Billionaire Club", status: "Planning", category: "Business", progress_percent: 20, summary: "Offer, audience, and content engine.", next_milestone: "Positioning draft" },
  { id: "lucien", title: "Lucien", status: "Concept", category: "Writing", progress_percent: 10, summary: "Character and story fragments." },
];

const quickLaunch = [
  { id: "vscode", label: "VS Code", Icon: Box, href: "vscode://file/C:/Users/johnf/OneDrive/Development/jarvis" },
  { id: "chrome", label: "Browser", Icon: Globe2, href: "https://www.google.com", appId: "chrome" },
  { id: "unreal", label: "Unreal Engine", Icon: AppWindow },
  { id: "terminal", label: "Terminal", Icon: TerminalSquare },
  { id: "youtube-music", label: "Music", Icon: Music2, href: "https://music.youtube.com", appId: "youtube-music" },
  { id: "discord", label: "Discord", Icon: Radio, appId: "discord" },
  { id: "add", label: "Add App", Icon: Plus },
];

export default function DesktopMissionControl() {
  const [now, setNow] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<ForgeDashboard>({});
  const [systemStats, setSystemStats] = useState<NativeStats | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
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

    async function loadMediaStatus() {
      const bridgeStatus = await window.jarvisDesktop?.getMediaStatus?.();
      if (!cancelled) setMediaStatus(bridgeStatus || readBrowserMediaSession());
    }

    loadMediaStatus();
    const timer = window.setInterval(loadMediaStatus, 2_500);
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
    return liveProjects?.length ? liveProjects.slice(0, 5) : fallbackProjects;
  }, [dashboard.projects, dashboard.recently_updated]);

  const activeProject = projects[0] || fallbackProjects[0];
  const goals = dashboard.goals?.length ? dashboard.goals.slice(0, 4) : [];
  const metrics = buildTelemetryMetrics(systemStats);
  const events = useMemo(() => parseCalendarEvents(calendarLine), [calendarLine]);

  return (
    <main className={styles.shell}>
      <HudBackground />
      <EnergyCollisionLayer />

      <div className={styles.brandBlock}>
        <strong>JARVIS</strong>
        <span>System Dashboard</span>
      </div>

      <div className={styles.topStatus}>
        <Wifi size={18} />
        <span>{systemStats ? "LIVE" : "STANDBY"}</span>
        <strong>{formatTime(now)}</strong>
      </div>

      <section className={styles.systemZone} aria-label="System core telemetry">
        <SystemCore now={now} />
        <TelemetryOrbit metrics={metrics} />
      </section>

      <section className={styles.projectZone} aria-label="Active Forge project">
        <ProjectCore project={activeProject} />
      </section>

      <RightRail
        projects={projects}
        goals={goals}
        events={events}
        activeProject={activeProject}
        dataState={dataState}
      />

      <QuickLaunchDock />
      <NowPlayingBar media={mediaStatus} />
      <SystemOnline dataState={dataState} />
    </main>
  );
}

function HudBackground() {
  return (
    <>
      <div className={styles.templateGlow} aria-hidden="true" />
      <div className={styles.circuitFrame} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <DriftingParticles />
    </>
  );
}

function SystemCore({ now }: { now: Date }) {
  return (
    <div className={`${styles.coreWrap} ${styles.blue}`}>
      <CoreRings />
      <div className={styles.coreContent}>
        <span>System Core</span>
        <strong>{formatTime(now)}</strong>
        <em>{formatDate(now)}</em>
      </div>
    </div>
  );
}

function ProjectCore({ project }: { project: ForgeProject }) {
  const percent = Math.round(project.progress_percent || 0);
  return (
    <div className={`${styles.coreWrap} ${styles.orange}`}>
      <CoreRings />
      <div className={styles.coreContent}>
        <span>Active Project</span>
        <h1>{project.title || "No Active Project"}</h1>
        <strong>{percent}%</strong>
        <em>{project.status || "In Progress"}</em>
      </div>
    </div>
  );
}

function CoreRings() {
  return (
    <>
      <div className={styles.coreGlow} />
      <div className={`${styles.ring} ${styles.outerRing}`} />
      <div className={`${styles.ring} ${styles.innerRing}`} />
      <div className={`${styles.ring} ${styles.detailRing}`} />
      <div className={styles.tickRing} />
      <div className={styles.radarSweep} />
    </>
  );
}

function TelemetryOrbit({ metrics }: { metrics: TelemetryMetric[] }) {
  return (
    <div className={styles.telemetryOrbit} aria-label="System telemetry">
      {metrics.map(({ id, label, value, detail, level, Icon, position }) => (
        <article
          key={id}
          className={`${styles.telemetryNode} ${styles[position]}`}
          style={{ "--level": `${Math.max(4, Math.min(level, 100))}%` } as React.CSSProperties}
        >
          <div className={styles.nodeRing}>
            <Icon size={18} />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
          <em>{detail}</em>
        </article>
      ))}
    </div>
  );
}

function EnergyCollisionLayer() {
  return (
    <div className={styles.energyLayer} aria-hidden="true">
      <div className={styles.blueBeam} />
      <div className={styles.orangeBeam} />
      <svg className={styles.lightning} viewBox="0 0 760 220" preserveAspectRatio="none">
        <path className={styles.boltMain} d="M0 112 L96 94 L156 118 L238 82 L318 110 L380 96 L454 126 L540 92 L620 116 L760 104" />
        <path className={styles.boltBranch} d="M220 88 L260 38 L290 104" />
        <path className={styles.boltBranch} d="M344 108 L386 166 L430 112" />
        <path className={styles.boltBranch} d="M486 118 L538 52 L588 98" />
      </svg>
      <div className={styles.collisionCore} />
      <div className={styles.sparkField}>
        {Array.from({ length: 34 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

function RightRail({
  projects,
  goals,
  events,
  activeProject,
  dataState,
}: {
  projects: ForgeProject[];
  goals: ForgeGoal[];
  events: CalendarEvent[];
  activeProject: ForgeProject;
  dataState: string;
}) {
  return (
    <aside className={styles.rightRail}>
      <header>
        <span>Projects</span>
        <em>{dataState}</em>
      </header>

      <section className={styles.projectList} aria-label="Forge projects">
        {projects.map((project, index) => (
          <ProjectRow key={project.id} project={project} active={project.id === activeProject.id || index === 0} />
        ))}
      </section>

      <section className={styles.compactSection}>
        <h2>Upcoming Events</h2>
        {events.length ? (
          <div className={styles.eventList}>
            {events.slice(0, 4).map((event, index) => (
              <article key={`${event.title}-${index}`} className={styles.eventRow}>
                <CalendarDays size={15} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.detail || event.date || "Scheduled"}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>No upcoming events detected.</p>
        )}
      </section>

      <section className={styles.compactSection}>
        <h2>Goal Rotation</h2>
        {(goals.length ? goals : [{ id: "fallback", title: "Forge real projects into finished missions", project: { percent: activeProject.progress_percent || 0 } }]).map((goal) => (
          <span key={goal.id} className={styles.goalRow}>
            {goal.title}
            <em>{Math.round(goal.project?.percent || 0)}%</em>
          </span>
        ))}
      </section>
    </aside>
  );
}

function ProjectRow({ project, active }: { project: ForgeProject; active: boolean }) {
  const percent = Math.round(project.progress_percent || 0);
  return (
    <article className={`${styles.projectCard} ${active ? styles.activeCard : ""}`}>
      <div className={styles.projectGlyph}>
        {project.cover_image_url ? (
          <Image src={project.cover_image_url} alt="" width={44} height={44} unoptimized />
        ) : (
          <Flame size={18} />
        )}
      </div>
      <div className={styles.projectBody}>
        <strong>{project.title}</strong>
        <span>{project.status || project.category || "In Progress"}</span>
        <i><b style={{ width: `${Math.max(6, Math.min(percent, 100))}%` }} /></i>
      </div>
      <em>{percent}%</em>
    </article>
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
            <Icon size={32} />
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

function NowPlayingBar({ media }: { media: MediaStatus | null }) {
  const isPlaying = media?.isPlaying ?? false;
  const title = media?.title || "YouTube Music";
  const artist = media?.artist || (media ? "Now playing" : "No track detected");
  const source = media?.source || "YouTube Music";

  async function control(action: "previous" | "playPause" | "next") {
    if (window.jarvisDesktop?.controlMedia) {
      await window.jarvisDesktop.controlMedia(action);
      return;
    }

    if (action === "playPause") {
      await window.jarvisDesktop?.launchApp?.("youtube-music");
      window.open("https://music.youtube.com", "_blank", "noopener,noreferrer");
    }
  }

  return (
    <aside className={styles.nowPlaying} aria-label="Now playing">
      <div className={styles.albumArt}>
        {media?.artworkUrl ? (
          <Image src={media.artworkUrl} alt="" width={58} height={58} unoptimized />
        ) : (
          <Music2 size={26} />
        )}
      </div>
      <div className={styles.trackInfo}>
        <span>{source}</span>
        <strong>{title}</strong>
        <em>{artist}</em>
      </div>
      <div className={styles.mediaControls}>
        <button type="button" aria-label="Previous track" onClick={() => control("previous")}>
          <SkipBack size={17} />
        </button>
        <button type="button" className={styles.playPause} aria-label={isPlaying ? "Pause" : "Play"} onClick={() => control("playPause")}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" aria-label="Next track" onClick={() => control("next")}>
          <SkipForward size={17} />
        </button>
      </div>
    </aside>
  );
}

function SystemOnline({ dataState }: { dataState: string }) {
  return (
    <div className={styles.systemOnline}>
      <Radio size={18} />
      <div>
        <strong>System Online</strong>
        <span>{dataState}</span>
      </div>
    </div>
  );
}

function readBrowserMediaSession(): MediaStatus | null {
  const mediaSession = navigator.mediaSession as MediaSession & {
    metadata?: {
      title?: string;
      artist?: string;
      album?: string;
      artwork?: Array<{ src?: string }>;
    } | null;
    playbackState?: MediaSessionPlaybackState;
  };

  if (!mediaSession?.metadata) return null;

  return {
    title: mediaSession.metadata.title,
    artist: mediaSession.metadata.artist,
    album: mediaSession.metadata.album,
    artworkUrl: mediaSession.metadata.artwork?.at(-1)?.src || mediaSession.metadata.artwork?.[0]?.src,
    isPlaying: mediaSession.playbackState === "playing",
    source: "YouTube Music",
  };
}

function DriftingParticles() {
  return (
    <div className={styles.particles} aria-hidden="true">
      {Array.from({ length: 48 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function buildTelemetryMetrics(stats: NativeStats | null): TelemetryMetric[] {
  return [
    { id: "cpu", label: "CPU", value: percent(stats?.cpuUsage, 18), detail: tempDetail(stats?.cpuTemp, 58), level: stats?.cpuUsage ?? 18, Icon: Cpu, position: "nodeCpu" },
    { id: "gpu", label: "GPU", value: percent(stats?.gpuUsage, 22), detail: `Hotspot ${stats?.gpuHotspot ?? 68}C`, level: stats?.gpuUsage ?? 22, Icon: MonitorCog, position: "nodeGpu" },
    { id: "ram", label: "RAM", value: percent(stats?.ramUsage, 32), detail: "Memory", level: stats?.ramUsage ?? 32, Icon: MemoryStick, position: "nodeRam" },
    { id: "storage", label: "Storage", value: percent(stats?.storageUsage, 58), detail: tempDetail(stats?.nvmeTemp, 44), level: stats?.storageUsage ?? 58, Icon: HardDrive, position: "nodeStorage" },
    { id: "network", label: "Net", value: stats?.networkDown || "1.2 GB", detail: `Up ${stats?.networkUp || "128 MB"}`, level: 36, Icon: Network, position: "nodeNetwork" },
    { id: "weather", label: "Weather", value: "82F", detail: "Partly cloudy", level: 82, Icon: Cloud, position: "nodeWeather" },
    { id: "uptime", label: "Uptime", value: stats?.uptime || "06:42", detail: "Session", level: 74, Icon: Timer, position: "nodeUptime" },
    { id: "bridge", label: "Bridge", value: stats ? "Live" : "Wait", detail: stats ? "Native feed" : "Telemetry pending", level: stats ? 100 : 12, Icon: Zap, position: "nodeBridge" },
  ];
}

function parseCalendarEvents(line: string): CalendarEvent[] {
  if (!line || /no events scheduled/i.test(line)) return [];
  const [, eventText = line] = line.split(/events? (?:today|tomorrow)\.\s*/i);
  return eventText
    .split(". ")
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => {
      const match = part.match(/^(.*?) from (all day on \d{4}-\d{2}-\d{2}|\d{1,2}:\d{2} [AP]M to \d{1,2}:\d{2} [AP]M)(?: at (.*))?$/i);
      if (!match) return { title: part, detail: "Today" };
      return {
        title: match[1].replace(/'s birthday$/i, " Birthday").trim(),
        detail: match[2].replace(" to ", " - "),
        date: match[3]?.trim(),
      };
    });
}

function percent(value: number | undefined, fallback: number) {
  return `${Math.round(value ?? fallback)}%`;
}

function tempDetail(value: number | undefined, fallback: number) {
  return `${Math.round(value ?? fallback)}C`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
