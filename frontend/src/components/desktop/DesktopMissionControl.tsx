"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Bot,
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
  SlidersHorizontal,
  TerminalSquare,
  Timer,
  Wifi,
  Volume1,
  Volume2,
  VolumeX,
  X,
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
  ramUsage?: number;
  uptime?: string;
};

type GpuTelemetry = { available: boolean; reason?: string; provider?: string; name?: string; utilizationPercent?: number; memoryUsedMb?: number; memoryTotalMb?: number; temperatureC?: number | null; powerWatts?: number | null; driverVersion?: string | null; collectedAt?: string };
type StorageTelemetry = { available: boolean; reason?: string; provider?: string; drive?: string; filesystem?: string | null; volumeLabel?: string | null; totalBytes?: number; usedBytes?: number; freeBytes?: number; usedPercent?: number; collectedAt?: string };
type NetworkTelemetry = { available: boolean; reason?: string; provider?: string; connected?: boolean; status?: "connected" | "localOnly" | "offline" | "unavailable"; interfaceType?: "wifi" | "ethernet" | "other" | null; interfaceName?: string | null; ssid?: string | null; ssidPermissionStatus?: string; linkSpeedMbps?: number | null; ipv4Address?: string | null; internetReachable?: boolean; collectedAt?: string };
type SpeedTestResult = { available: boolean; status?: "success" | "running" | "notTested" | "failed"; estimated?: boolean; downloadMbps?: number; uploadMbps?: number; latencyMs?: number; jitterMs?: number; provider?: string; testedAt?: string; running?: boolean; refreshFailed?: boolean; reason?: string };
type NativeHealth = { available: boolean; electronDetected?: boolean; platform?: string; collectors?: Record<string, { provider?: string | null; lastAttempt?: string; lastSuccess?: string | null; error?: string | null; timeoutCount?: number }>; ssidPermissionStatus?: string; activeMediaSource?: string | null; speedTestProvider?: string };

type CalendarEvent = {
  title: string;
  date?: string;
  detail?: string;
};

type MediaStatus = {
  available?: boolean;
  reason?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  artworkUrl?: string | null;
  isPlaying?: boolean;
  source?: string | null;
  playbackStatus?: string;
  collectedAt?: string;
  stale?: boolean;
};

type WeatherStatus = {
  available: boolean;
  reason?: string;
  provider?: string;
  location?: string;
  temperature?: number;
  apparentTemperature?: number;
  conditions?: string;
  precipitationProbability?: number;
  forecast?: string;
  unit?: "fahrenheit" | "celsius";
  providerTimestamp?: string;
  fetchedAt?: string;
};

type DesktopPreferences = {
  jarvisResponseMode?: "text" | "voice" | "both";
  jarvisAlwaysOnTop?: boolean;
  ttsMuted?: boolean;
  weatherLocation: string;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherUnit: "fahrenheit" | "celsius";
  musicUrl: string;
  mediaControlEnabled: boolean;
  automaticSpeedTest: boolean;
};

declare global {
  interface Window {
    jarvisDesktop?: {
      getSystemStats?: () => Promise<NativeStats>;
      getGpuTelemetry?: () => Promise<GpuTelemetry>;
      getStorageTelemetry?: () => Promise<StorageTelemetry>;
      getNetworkTelemetry?: () => Promise<NetworkTelemetry>;
      getInternetSpeedResult?: () => Promise<SpeedTestResult>;
      runInternetSpeedTest?: () => Promise<SpeedTestResult>;
      getMediaSession?: () => Promise<MediaStatus>;
      executeMediaAction?: (action: "playPause" | "play" | "pause" | "next" | "previous" | "volumeUp" | "volumeDown" | "mute") => Promise<{ available: boolean }>;
      openYouTubeMusic?: () => Promise<{ available: boolean }>;
      getNativeHealth?: () => Promise<NativeHealth>;
      launchApp?: (appId: string) => Promise<void>;
      openJarvisAssistant?: () => Promise<boolean>;
      hideJarvisAssistant?: () => Promise<boolean>;
      openFullJarvis?: () => Promise<boolean>;
      getDesktopPreferences?: () => Promise<Partial<DesktopPreferences>>;
      setDesktopPreference?: (key: string, value: unknown) => Promise<Partial<DesktopPreferences>>;
      resetJarvisPosition?: () => Promise<boolean>;
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
  { id: "jarvis", label: "Jarvis", Icon: Bot, href: "/jarvis", appId: "jarvis" },
  { id: "vscode", label: "VS Code", Icon: Box, href: "vscode://file/C:/Development/jarvis" },
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
  const [gpu, setGpu] = useState<GpuTelemetry | null>(null);
  const [storage, setStorage] = useState<StorageTelemetry | null>(null);
  const [network, setNetwork] = useState<NetworkTelemetry | null>(null);
  const [speedResult, setSpeedResult] = useState<SpeedTestResult | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
  const [weather, setWeather] = useState<WeatherStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<DesktopPreferences>(() => loadBrowserPreferences());
  const [calendarLine, setCalendarLine] = useState("Calendar link online");
  const [dataState, setDataState] = useState("Synchronizing Forge");
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    void window.jarvisDesktop?.getDesktopPreferences?.().then((saved) => setPreferences((current) => ({ ...current, ...saved })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ unit: preferences.weatherUnit });
      if (preferences.weatherLatitude !== null && preferences.weatherLongitude !== null) {
        params.set("latitude", String(preferences.weatherLatitude));
        params.set("longitude", String(preferences.weatherLongitude));
      } else if (preferences.weatherLocation) params.set("location", preferences.weatherLocation);
      fetch(`${API_BASE}/weather/current?${params}`, { headers: { "x-api-key": API_KEY } })
        .then((response) => response.json())
        .then((data) => { if (!cancelled) setWeather(data); })
        .catch(() => { if (!cancelled) setWeather({ available: false, reason: "Live weather is unavailable." }); });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [preferences.weatherLatitude, preferences.weatherLocation, preferences.weatherLongitude, preferences.weatherUnit]);

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
    let loading = false;

    async function loadMediaStatus() {
      if (loading) return;
      loading = true;
      try {
        const bridgeStatus = await window.jarvisDesktop?.getMediaSession?.();
        if (!cancelled) setMediaStatus(bridgeStatus || readBrowserMediaSession());
      } finally {
        loading = false;
      }
    }

    if (documentVisible) loadMediaStatus();
    const timer = documentVisible ? window.setInterval(loadMediaStatus, 5_000) : null;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [documentVisible]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;

    async function loadStats() {
      if (loading) return;
      loading = true;
      try {
        const stats = await window.jarvisDesktop?.getSystemStats?.();
        if (!cancelled && stats) setSystemStats(stats);
      } finally {
        loading = false;
      }
    }

    if (documentVisible) loadStats();
    const timer = documentVisible ? window.setInterval(loadStats, 5_000) : null;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [documentVisible]);

  useEffect(() => nativePoll(window.jarvisDesktop?.getGpuTelemetry, setGpu, documentVisible, 4_000), [documentVisible]);
  useEffect(() => nativePoll(window.jarvisDesktop?.getStorageTelemetry, setStorage, documentVisible, 60_000), [documentVisible]);
  useEffect(() => nativePoll(window.jarvisDesktop?.getNetworkTelemetry, setNetwork, documentVisible, 20_000), [documentVisible]);
  useEffect(() => nativePoll(window.jarvisDesktop?.getInternetSpeedResult, setSpeedResult, documentVisible, 30_000), [documentVisible]);

  const projects = useMemo(() => {
    const liveProjects = dashboard.recently_updated?.length ? dashboard.recently_updated : dashboard.projects;
    return liveProjects?.length ? liveProjects.slice(0, 5) : fallbackProjects;
  }, [dashboard.projects, dashboard.recently_updated]);

  const activeProject = projects[0] || fallbackProjects[0];
  const goals = dashboard.goals?.length ? dashboard.goals.slice(0, 4) : [];
  const metrics = buildTelemetryMetrics(systemStats, gpu, storage, network, speedResult, weather);
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
        <button type="button" aria-label="Desktop settings" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={17} /></button>
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
      {settingsOpen && <DesktopSettings preferences={preferences} speedResult={speedResult} onSpeedResult={setSpeedResult} onChange={setPreferences} onClose={() => setSettingsOpen(false)} />}
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
          title={`${label}: ${value}. ${detail}`}
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
    if (appId === "jarvis") {
      if (window.jarvisDesktop?.openJarvisAssistant) await window.jarvisDesktop.openJarvisAssistant();
      else window.location.assign("/jarvis");
      return;
    }
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
  const title = media?.available ? (media.title || "Active session") : "Not playing";
  const artist = media?.available ? (media.artist || "Metadata unavailable") : "Open YouTube Music to begin";
  const source = media?.available ? friendlyMediaSource(media.source) : "YouTube Music";

  async function control(action: "previous" | "playPause" | "next" | "volumeDown" | "volumeUp" | "mute") {
    if (window.jarvisDesktop?.executeMediaAction) await window.jarvisDesktop.executeMediaAction(action);
    else if (action === "playPause") window.open("https://music.youtube.com", "_blank", "noopener,noreferrer");
  }

  async function openMusic() {
    if (window.jarvisDesktop?.openYouTubeMusic) await window.jarvisDesktop.openYouTubeMusic();
    else window.open("https://music.youtube.com", "_blank", "noopener,noreferrer");
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
        <span>{source}{media?.stale ? " · stale" : ""}</span>
        <strong>{title}</strong>
        <em>{artist}</em>
      </div>
      <div className={styles.mediaControls}>
        {!media?.available ? <button className={styles.openMusic} type="button" onClick={openMusic}>Open YouTube Music</button> : <>
          <button type="button" aria-label="Previous track" onClick={() => control("previous")}><SkipBack size={17} /></button>
          <button type="button" className={styles.playPause} aria-label={isPlaying ? "Pause" : "Play"} onClick={() => control("playPause")}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
          <button type="button" aria-label="Next track" onClick={() => control("next")}><SkipForward size={17} /></button>
          <button type="button" aria-label="Volume down" onClick={() => control("volumeDown")}><Volume1 size={16} /></button>
          <button type="button" aria-label="Volume up" onClick={() => control("volumeUp")}><Volume2 size={16} /></button>
          <button type="button" aria-label="Mute" onClick={() => control("mute")}><VolumeX size={16} /></button>
        </>}
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
    available: true,
    title: mediaSession.metadata.title,
    artist: mediaSession.metadata.artist,
    album: mediaSession.metadata.album,
    artworkUrl: mediaSession.metadata.artwork?.at(-1)?.src || mediaSession.metadata.artwork?.[0]?.src,
    isPlaying: mediaSession.playbackState === "playing",
    source: "YouTube Music",
    playbackStatus: mediaSession.playbackState,
    collectedAt: new Date().toISOString(),
  };
}

function friendlyMediaSource(source?: string | null) {
  if (!source) return "Windows Media";
  if (/youtube|cinhimbnkkghhklpknlkffjgod/i.test(source)) return "YouTube Music";
  return source;
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

function buildTelemetryMetrics(stats: NativeStats | null, gpu: GpuTelemetry | null, storage: StorageTelemetry | null, network: NetworkTelemetry | null, speed: SpeedTestResult | null, weather: WeatherStatus | null): TelemetryMetric[] {
  const weatherUnit = weather?.unit === "celsius" ? "C" : "F";
  const gpuDetail = gpu?.available
    ? `${gpu.temperatureC === null || gpu.temperatureC === undefined ? "Temp —" : `${Math.round(gpu.temperatureC)}°C`} · ${formatGigabytes(gpu.memoryUsedMb)} / ${formatGigabytes(gpu.memoryTotalMb)} VRAM`
    : "NVIDIA telemetry unavailable";
  const storageDetail = storage?.available
    ? `${formatBinaryBytes(storage.usedBytes)} / ${formatBinaryBytes(storage.totalBytes)} · ${formatBinaryBytes(storage.freeBytes)} free · ${storage.drive}`
    : "Windows C: unavailable";
  const networkName = network?.interfaceType === "wifi" ? (network.ssid || (network.ssidPermissionStatus === "hiddenByWindows" ? "SSID hidden by Windows" : "Wi-Fi")) : network?.interfaceType === "ethernet" ? "Ethernet" : network?.interfaceName || "No connection";
  const networkSpeed = speed?.available ? ` · ${Math.round(speed.downloadMbps || 0)} Mbps estimated` : " · Speed not tested";
  const networkDetail = network?.connected ? `${networkName}${network.linkSpeedMbps ? ` · ${network.linkSpeedMbps} Mbps link` : ""}${networkSpeed}` : network?.status === "offline" ? "Offline" : "Network unavailable";
  return [
    { id: "cpu", label: "CPU", value: percent(stats?.cpuUsage), detail: "Windows host usage", level: stats?.cpuUsage ?? 4, Icon: Cpu, position: "nodeCpu" },
    { id: "gpu", label: "GPU", value: gpu?.available ? percent(gpu.utilizationPercent) : "—", detail: gpuDetail, level: gpu?.available ? gpu.utilizationPercent || 4 : 4, Icon: MonitorCog, position: "nodeGpu" },
    { id: "ram", label: "RAM", value: percent(stats?.ramUsage), detail: "Memory", level: stats?.ramUsage ?? 4, Icon: MemoryStick, position: "nodeRam" },
    { id: "storage", label: "Storage", value: storage?.available ? percent(storage.usedPercent) : "—", detail: storageDetail, level: storage?.available ? storage.usedPercent || 4 : 4, Icon: HardDrive, position: "nodeStorage" },
    { id: "network", label: "Net", value: network?.status === "connected" ? "Connected" : network?.status === "localOnly" ? "Local only" : network?.status === "offline" ? "Offline" : "—", detail: networkDetail, level: network?.status === "connected" ? 100 : network?.status === "localOnly" ? 55 : 4, Icon: Network, position: "nodeNetwork" },
    { id: "weather", label: "Weather", value: weather?.available ? `${Math.round(weather.temperature || 0)}°${weatherUnit}` : "—", detail: weather?.available ? `${weather.conditions} · Feels ${Math.round(weather.apparentTemperature || 0)}° · Rain ${weather.precipitationProbability}% · ${formatUpdated(weather.fetchedAt)}` : (weather?.reason || "Weather unavailable"), level: weather?.available ? 70 : 4, Icon: Cloud, position: "nodeWeather" },
    { id: "uptime", label: "Uptime", value: stats?.uptime || "—", detail: stats?.uptime ? "Session" : "Unavailable", level: stats?.uptime ? 74 : 4, Icon: Timer, position: "nodeUptime" },
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

function percent(value: number | undefined) {
  return value === undefined ? "—" : `${Math.round(value)}%`;
}

function formatGigabytes(value?: number) {
  return value === undefined ? "—" : `${(value / 1024).toFixed(value >= 10_240 ? 0 : 1)} GB`;
}

function formatBinaryBytes(value?: number) {
  if (value === undefined) return "—";
  const gib = value / 1024 ** 3;
  return gib >= 1024 ? `${(gib / 1024).toFixed(2)} TiB` : `${gib.toFixed(gib >= 100 ? 0 : 1)} GiB`;
}

function formatUpdated(value?: string) {
  if (!value) return "Update unavailable";
  return `Updated ${new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function loadBrowserPreferences(): DesktopPreferences {
  const defaults: DesktopPreferences = { weatherLocation: process.env.NEXT_PUBLIC_JARVIS_WEATHER_LOCATION || "", weatherLatitude: null, weatherLongitude: null, weatherUnit: "fahrenheit", musicUrl: "https://music.youtube.com/", mediaControlEnabled: true, automaticSpeedTest: true };
  if (typeof window === "undefined") return defaults;
  try { return { ...defaults, ...JSON.parse(window.localStorage.getItem("jarvis.desktop.preferences") || "{}") }; } catch { return defaults; }
}

function DesktopSettings({ preferences, speedResult, onSpeedResult, onChange, onClose }: { preferences: DesktopPreferences; speedResult: SpeedTestResult | null; onSpeedResult: (value: SpeedTestResult) => void; onChange: (value: DesktopPreferences) => void; onClose: () => void }) {
  const [nativeHealth, setNativeHealth] = useState<NativeHealth | null>(null);
  const [testingSpeed, setTestingSpeed] = useState(false);
  useEffect(() => { void window.jarvisDesktop?.getNativeHealth?.().then(setNativeHealth); }, []);
  function update<K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]) {
    const next = { ...preferences, [key]: value };
    onChange(next);
    window.localStorage.setItem("jarvis.desktop.preferences", JSON.stringify(next));
    void window.jarvisDesktop?.setDesktopPreference?.(key, value);
  }
  function updateMany(values: Partial<DesktopPreferences>) {
    const next = { ...preferences, ...values };
    onChange(next);
    window.localStorage.setItem("jarvis.desktop.preferences", JSON.stringify(next));
    for (const [key, value] of Object.entries(values)) void window.jarvisDesktop?.setDesktopPreference?.(key, value);
  }
  function useLocation() {
    navigator.geolocation?.getCurrentPosition((position) => {
      updateMany({ weatherLatitude: position.coords.latitude, weatherLongitude: position.coords.longitude });
    });
  }
  async function runSpeedTest() {
    if (testingSpeed || !window.jarvisDesktop?.runInternetSpeedTest) return;
    setTestingSpeed(true);
    try { onSpeedResult(await window.jarvisDesktop.runInternetSpeedTest()); }
    finally { setTestingSpeed(false); }
  }
  return <aside className={styles.settingsPanel}>
    <header><strong>Desktop Settings</strong><button type="button" onClick={onClose}><X size={17} /></button></header>
    <label>Weather city/state<input value={preferences.weatherLocation} onChange={(event) => updateMany({ weatherLocation: event.target.value, weatherLatitude: null, weatherLongitude: null })} placeholder="City, State" /></label>
    <button type="button" onClick={useLocation}>Use current location</button>
    <label>Units<select value={preferences.weatherUnit} onChange={(event) => update("weatherUnit", event.target.value as DesktopPreferences["weatherUnit"])}><option value="fahrenheit">Fahrenheit</option><option value="celsius">Celsius</option></select></label>
    <label>Music URL<input value={preferences.musicUrl} onChange={(event) => update("musicUrl", event.target.value)} /></label>
    <label><input type="checkbox" checked={preferences.mediaControlEnabled} onChange={(event) => update("mediaControlEnabled", event.target.checked)} /> Windows media controls enabled</label>
    <label><input type="checkbox" checked={preferences.automaticSpeedTest} onChange={(event) => update("automaticSpeedTest", event.target.checked)} /> Daily estimated internet speed test</label>
    <p>Uses approximately 20 MB per test. Results are cached for 24 hours.</p>
    <button type="button" onClick={runSpeedTest} disabled={testingSpeed}>{testingSpeed ? "Testing…" : "Test internet speed now"}</button>
    <p>{speedResult?.available ? `${Math.round(speedResult.downloadMbps || 0)} Mbps down · ${Math.round(speedResult.uploadMbps || 0)} Mbps up · ${speedResult.latencyMs} ms · ${formatUpdated(speedResult.testedAt)}` : "Internet speed has not been tested."}</p>
    {nativeHealth?.available && <details><summary>Native diagnostics</summary><pre>{JSON.stringify(nativeHealth, null, 2)}</pre></details>}
    <button type="button" onClick={() => window.jarvisDesktop?.resetJarvisPosition?.()}>Reset Jarvis window position</button>
  </aside>;
}

function nativePoll<T>(loader: (() => Promise<T>) | undefined, setter: (value: T) => void, visible: boolean, intervalMs: number) {
  if (!loader || !visible) return undefined;
  let cancelled = false;
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    try { const value = await loader(); if (!cancelled) setter(value); }
    catch { /* Main process returns structured unavailable states; IPC transport failures remain non-fatal. */ }
    finally { loading = false; }
  };
  void load();
  const timer = window.setInterval(load, intervalMs);
  return () => { cancelled = true; window.clearInterval(timer); };
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
