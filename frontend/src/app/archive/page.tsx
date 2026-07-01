"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, HelpCircle, Sun, type LucideIcon } from "lucide-react";
import { Caveat, Cinzel, Cormorant_Garamond, Great_Vibes, Inter, Kalam } from "next/font/google";
import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "600", "700"] });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"] });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type Dream = {
  id: string;
  user_id: string;
  title?: string | null;
  dream_text?: string | null;
  dream_prompt?: string | null;
  dream_date?: string | null;
  moon_phase?: string | null;
  people?: string[] | null;
  emotions?: string[] | null;
  settings?: string[] | null;
  symbols?: string[] | null;
  lucid?: string | null;
  recurring?: string | null;
  intensity?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type DreamForm = {
  id?: string;
  title: string;
  dream_text: string;
  dream_prompt: string;
  dream_date: string;
  moon_phase: string;
  people: string;
  emotions: string;
  settings: string;
  symbols: string;
  lucid: string;
  recurring: string;
  intensity: string;
  notes: string;
};

type Chronicle = {
  id: string;
  user_id: string;
  entry_date: string;
  title?: string | null;
  status: "draft" | "in_progress" | "filed";
  started_at?: string | null;
  filed_at?: string | null;
  daily_score?: number | null;
  weekly_score?: number | null;
  mission_rank?: string | null;
  overall_status?: string | null;
  workout_status?: string | null;
  workout_summary?: string | null;
  next_protocol?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  water_oz?: number | null;
  sleep_hours?: number | null;
  temperature?: string | null;
  health_event_count?: number | null;
  deep_breath_event_count?: number | null;
  goal_impacts?: ChronicleGoalImpact[] | null;
  victory_log?: string | null;
  lessons_worked?: string | null;
  lessons_not_worked?: string | null;
  lessons_adjust_tomorrow?: string | null;
  tomorrow_focus?: string | null;
  story_text?: string | null;
  future_me_message?: string | null;
  notes?: string | null;
};

type ChronicleGoalImpact = {
  id?: string | null;
  title?: string | null;
  state?: string | null;
  detail?: string | null;
  achievement_label?: string | null;
  completed?: boolean | null;
};

type ChronicleForm = {
  id?: string;
  title: string;
  story_text: string;
  future_me_message: string;
  notes: string;
};

type ArchiveSection = "dreams" | "daily" | "lessons" | "moments";
type SidebarItem =
  | { label: string; image: string; href: string; section?: never }
  | { label: string; image: string; section: ArchiveSection; href?: never };

const DREAM_PROMPTS = [
  "What would my future self show me if we met tonight?",
  "Show me something I have been avoiding.",
  "Take me to a place I need to remember.",
  "Let me meet the part of myself that knows the answer.",
  "Show me the door I need to open.",
  "Help me remember what matters.",
  "Take me somewhere impossible.",
  "Let me dream with clarity tonight.",
];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Command Center", image: "/images/Command Center Icon.png", href: "/" },
  { label: "Health Ops", image: "/images/Health Ops Icon.png", href: "/health-ops" },
  { label: "Food Ops", image: "/images/Food Ops Icon.png", href: "/meal-planner" },
  { label: "Training Grounds", image: "/images/Training Grounds Icon.png", href: "/workouts" },
  { label: "Finance Ops", image: "/images/Finance Icon.png", href: "/finance-ops" },
  { label: "Dream Journal", image: "/images/Dream Journal.png", section: "dreams" as const },
  { label: "Daily Journal", image: "/images/Daily Journal.png", section: "daily" as const },
  { label: "Lessons Learned", image: "/images/Lessons Learned.png", section: "lessons" as const },
  { label: "Life Moments", image: "/images/Life Moments.png", section: "moments" as const },
];

const MOON_PHASE_ICONS: Record<string, string> = {
  "New Moon": "/icons/new_moon.png",
  "Waxing Crescent": "/icons/waxing_crescent.png",
  "First Quarter": "/icons/half_moon.png",
  "Waxing Gibbous": "/icons/waxing_gibbous.png",
  "Full Moon": "/icons/full_moon.png",
  "Waning Gibbous": "/icons/waning_gibbous.png",
  "Last Quarter": "/icons/last_quarter.png",
  "Third Quarter": "/icons/last_quarter.png",
  "Waning Crescent": "/icons/waning_crescent.png",
};

function emptyForm(prompt: string): DreamForm {
  return {
    title: "",
    dream_text: "",
    dream_prompt: prompt,
    dream_date: new Date().toISOString().slice(0, 10),
    moon_phase: getMoonPhase(new Date().toISOString().slice(0, 10)),
    people: "",
    emotions: "",
    settings: "",
    symbols: "",
    lucid: "No",
    recurring: "No",
    intensity: "3",
    notes: "",
  };
}

function emptyChronicleForm(): ChronicleForm {
  return {
    title: "",
    story_text: "",
    future_me_message: "",
    notes: "",
  };
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<main className={`archive-shell ${inter.className}`} />}>
      <ArchivePageContent />
    </Suspense>
  );
}

function ArchivePageContent() {
  const searchParams = useSearchParams();
  const prompt = useMemo(() => {
    const dayIndex = Math.floor(Date.now() / 86_400_000) % DREAM_PROMPTS.length;
    return DREAM_PROMPTS[dayIndex];
  }, []);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [chronicles, setChronicles] = useState<Chronicle[]>([]);
  const [form, setForm] = useState<DreamForm>(() => emptyForm(prompt));
  const [chronicle, setChronicle] = useState<Chronicle | null>(null);
  const [chronicleForm, setChronicleForm] = useState<ChronicleForm>(() => emptyChronicleForm());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [chroniclesLoading, setChroniclesLoading] = useState(false);
  const [chronicleFilter, setChronicleFilter] = useState<"all" | "draft" | "in_progress" | "filed">("all");
  const [chronicleSearch, setChronicleSearch] = useState("");
  const [weatherSnapshot, setWeatherSnapshot] = useState("Weather unavailable");
  const section = normalizeSection(searchParams.get("section"));
  const selectedChronicleDate = searchParams.get("date");

  const loadDreams = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/archive/dreams?user_id=${USER_ID}`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to open The Archive.");
      setDreams(data.dreams || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open The Archive.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDreams();
  }, [loadDreams]);

  const loadChronicles = useCallback(async () => {
    setChroniclesLoading(true);
    setError("");
    try {
      const [listRes, todayRes] = await Promise.all([
        fetch(`${API_BASE}/archive/chronicles?user_id=${USER_ID}`, {
          headers: { "x-api-key": API_KEY },
        }),
        fetch(`${API_BASE}/archive/chronicles/today?user_id=${USER_ID}`, {
          headers: { "x-api-key": API_KEY },
        }),
      ]);
      const listData = await listRes.json();
      const todayData = await todayRes.json();
      if (!listRes.ok) throw new Error(listData.detail || "Failed to open Chronicles.");
      if (!todayRes.ok) throw new Error(todayData.detail || "Failed to build today's Chronicle.");
      const nextChronicles = listData.chronicles || [];
      const todayChronicle = todayData.chronicle as Chronicle;
      const merged = [todayChronicle, ...nextChronicles.filter((item: Chronicle) => item.id !== todayChronicle.id)];
      setChronicles(merged);
      const selected = selectedChronicleDate
        ? merged.find((item) => item.entry_date === selectedChronicleDate)
        : todayChronicle;
      selectChronicle(selected || todayChronicle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Chronicles.");
    } finally {
      setChroniclesLoading(false);
    }
  }, [selectedChronicleDate]);

  useEffect(() => {
    if (section === "daily") {
      loadChronicles();
    }
  }, [loadChronicles, section]);

  const loadChronicleWeather = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setWeatherSnapshot("Weather unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            daily: "temperature_2m_max,weathercode",
            temperature_unit: "fahrenheit",
            timezone: "auto",
            forecast_days: "1",
          });
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
          const data = await res.json();
          if (!res.ok) throw new Error("Weather unavailable");
          const high = Math.round(Number(data.daily?.temperature_2m_max?.[0]));
          const code = Number(data.daily?.weathercode?.[0]);
          if (!Number.isFinite(high)) throw new Error("Weather unavailable");
          setWeatherSnapshot(`${weatherCodeLabel(code)}, ${high}° high`);
        } catch {
          setWeatherSnapshot("Weather unavailable");
        }
      },
      () => setWeatherSnapshot("Weather unavailable"),
      { timeout: 8000, maximumAge: 900000 }
    );
  }, []);

  useEffect(() => {
    if (section === "daily") {
      loadChronicleWeather();
    }
  }, [loadChronicleWeather, section]);

  function updateForm<K extends keyof DreamForm>(key: K, value: DreamForm[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "dream_date" ? { moon_phase: getMoonPhase(String(value)) } : {}),
    }));
  }

  function selectDream(dream: Dream) {
    setMessage("");
    setError("");
    setForm({
      id: dream.id,
      title: dream.title || "",
      dream_text: dream.dream_text || "",
      dream_prompt: dream.dream_prompt || prompt,
      dream_date: dream.dream_date || new Date().toISOString().slice(0, 10),
      moon_phase: dream.moon_phase || getMoonPhase(dream.dream_date || new Date().toISOString().slice(0, 10)),
      people: (dream.people || []).join(", "),
      emotions: (dream.emotions || []).join(", "),
      settings: (dream.settings || []).join(", "),
      symbols: (dream.symbols || []).join(", "),
      lucid: dream.lucid || "No",
      recurring: dream.recurring || "No",
      intensity: String(dream.intensity || 3),
      notes: dream.notes || "",
    });
  }

  function newDream() {
    setMessage("");
    setError("");
    setForm(emptyForm(prompt));
  }

  function selectChronicle(nextChronicle: Chronicle) {
    setMessage("");
    setError("");
    setChronicle(nextChronicle);
    setChronicleForm({
      id: nextChronicle.id,
      title: nextChronicle.title || "",
      story_text: nextChronicle.story_text || "",
      future_me_message: nextChronicle.future_me_message || "",
      notes: nextChronicle.notes || "",
    });
  }

  function updateChronicleForm<K extends keyof ChronicleForm>(key: K, value: ChronicleForm[K]) {
    setChronicleForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveChronicle(options?: { file?: boolean }) {
    if (!chronicleForm.id) return;
    const file = !!options?.file;
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/archive/chronicles/${chronicleForm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          title: chronicleForm.title || null,
          story_text: chronicleForm.story_text || null,
          future_me_message: chronicleForm.future_me_message || null,
          notes: chronicleForm.notes || null,
          status: file || chronicle?.status === "filed" ? "filed" : "in_progress",
          filed_at: file && chronicle?.status !== "filed" ? new Date().toISOString() : chronicle?.filed_at || null,
          temperature: file ? (chronicle?.temperature || weatherSnapshot) : chronicle?.temperature || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save Chronicle.");
      setMessage(file ? "Chronicle filed." : "Chronicle saved.");
      if (data.chronicle) {
        selectChronicle(data.chronicle);
        setChronicles((prev) => prev.map((item) => item.id === data.chronicle.id ? data.chronicle : item));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Chronicle.");
    }
  }

  async function createDream() {
    setMessage("");
    setError("");
    try {
      const payload = formToPayload(form);
      const res = await fetch(`${API_BASE}/archive/dreams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to archive dream.");
      setMessage("Dream archived.");
      await loadDreams();
      if (data.dream) selectDream(data.dream);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive dream.");
    }
  }

  async function saveDream() {
    setMessage("");
    setError("");
    try {
      const payload = formToPayload(form);
      const res = await fetch(form.id ? `${API_BASE}/archive/dreams/${form.id}` : `${API_BASE}/archive/dreams`, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save dream.");
      setMessage(form.id ? "Dream updated in The Archive." : "Dream archived.");
      await loadDreams();
      if (data.dream) selectDream(data.dream);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dream.");
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(form.dream_prompt || prompt);
    setMessage("Dream prompt copied.");
  }

  return (
    <main className={`archive-shell ${inter.className}`}>
      <ArchiveSidebar activeSection={section} />
      <section className="archive-main">
        {section !== "daily" && (
          <div className="archive-hero-grid">
            <ArchiveBanner />
            <ArchiveStatsPanel dreams={dreams} activeSection={section} />
          </div>
        )}

        {error && <div className="archive-alert archive-error">{error}</div>}
        {message && <div className="archive-alert archive-message">{message}</div>}

        {section === "dreams" ? (
          <section className="archive-workspace">
            <DreamList dreams={dreams} loading={loading} selectedId={form.id} onSelect={selectDream} onNewDream={newDream} />
            <DreamBookEditor
              form={form}
              onChange={updateForm}
              onArchive={createDream}
              onSave={saveDream}
              onCancel={newDream}
              onCopyPrompt={copyPrompt}
            />
          </section>
        ) : section === "daily" ? (
          <ChroniclesWorkspace
            chronicles={chronicles}
            current={chronicle}
            form={chronicleForm}
            loading={chroniclesLoading}
            filter={chronicleFilter}
            search={chronicleSearch}
            onFilter={setChronicleFilter}
            onSearch={setChronicleSearch}
            onSelect={selectChronicle}
            onChange={updateChronicleForm}
            onSave={() => saveChronicle()}
            onFile={() => saveChronicle({ file: true })}
            onToday={loadChronicles}
            weather={weatherSnapshot}
          />
        ) : (
          <ComingSoonPanel section={section} />
        )}
      </section>

      <ArchiveStyles />
    </main>
  );
}

function ArchiveSidebar({ activeSection }: { activeSection: ArchiveSection }) {
  return (
    <aside className="archive-sidebar">
      <div className={`${cinzel.className} archive-brand`}>
        <span>JARVIS</span>
        <small>Archive Wing</small>
      </div>
      <nav className="archive-icon-rail">
        {SIDEBAR_ITEMS.map((item) => {
          const content = (
            <>
              <Image src={item.image} alt="" width={56} height={56} className="archive-side-icon" />
              <span className="archive-tooltip">{item.label}</span>
            </>
          );
          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className="archive-icon-button" aria-label={item.label}>
                {content}
              </Link>
            );
          }
          return (
            <Link key={item.label} href={`/archive?section=${item.section}`} className={`archive-icon-button ${activeSection === item.section ? "active" : ""}`} aria-label={item.label}>
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function ArchiveBanner() {
  return (
    <section className="archive-banner">
      <Image src="/images/Banner.png" alt="" fill priority className="archive-banner-image" />
      <div className="archive-banner-overlay" />
      <p className={`${cinzel.className} archive-wing-label`}>Archive Wing</p>
    </section>
  );
}

function ArchiveStatsPanel({ dreams, activeSection }: { dreams: Dream[]; activeSection: ArchiveSection }) {
  const documentedDays = new Set(dreams.map((dream) => dream.dream_date).filter(Boolean)).size;
  const sectionLabel = {
    dreams: "Dream Journal",
    daily: "Daily Journal",
    lessons: "Lessons Learned",
    moments: "Life Moments",
  }[activeSection];
  return (
    <section className="archive-stats">
      <h2 className={cinzel.className}>Archive Stats</h2>
      <div className="archive-current-section">
        <span>Current Section</span>
        <strong>{sectionLabel}</strong>
      </div>
      <StatRow label="Dreams Recorded" value={dreams.length} />
      <StatRow label="Journal Entries" value={0} />
      <StatRow label="Lessons Learned" value={0} />
      <StatRow label="Life Moments" value={0} />
      <StatRow label="Days Documented" value={documentedDays} />
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="archive-stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DreamList({
  dreams,
  loading,
  selectedId,
  onSelect,
  onNewDream,
}: {
  dreams: Dream[];
  loading: boolean;
  selectedId?: string;
  onSelect: (dream: Dream) => void;
  onNewDream: () => void;
}) {
  return (
    <aside className="dream-list-panel">
      <div className="dream-list-header">
        <h2 className={cinzel.className}>Dreams</h2>
        <button type="button" onClick={onNewDream}>+</button>
      </div>
      <div className="dream-list">
        {loading && <p className="archive-muted">Opening the shelves...</p>}
        {!loading && dreams.length === 0 && <p className="archive-muted">No dreams archived yet.</p>}
        {dreams.map((dream) => (
          <button
            key={dream.id}
            type="button"
            onClick={() => onSelect(dream)}
            className={`dream-card ${selectedId === dream.id ? "selected" : ""}`}
          >
            <span className="dream-card-date">
              <MoonPhaseIcon phase={dream.moon_phase || getMoonPhase(dream.dream_date || "")} />
              {formatDate(dream.dream_date)}
            </span>
            <strong>{dream.title || "Untitled Dream"}</strong>
            <small>Emotion: {(dream.emotions || [])[0] || "Unmarked"}</small>
            <small>Setting: {(dream.settings || [])[0] || "Unknown"}</small>
            <div>
              <em>Lucid: {dream.lucid || "Unknown"}</em>
              <em>Recurring: {dream.recurring || "Unknown"}</em>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function DreamBookEditor({
  form,
  onChange,
  onArchive,
  onSave,
  onCancel,
  onCopyPrompt,
}: {
  form: DreamForm;
  onChange: <K extends keyof DreamForm>(key: K, value: DreamForm[K]) => void;
  onArchive: () => void;
  onSave: () => void;
  onCancel: () => void;
  onCopyPrompt: () => void;
}) {
  return (
    <section className={`dream-editor-wrap ${form.id ? "archived" : ""}`}>
      <div className="open-book-editor">
        <div className="book-page book-left">
          <div className="book-row two">
            <ArchiveField label="Date">
              <input value={form.dream_date} onChange={(e) => onChange("dream_date", e.target.value)} type="date" />
            </ArchiveField>
            <ArchiveField label="Moon Phase">
              <input value={form.moon_phase} readOnly aria-readonly="true" />
            </ArchiveField>
          </div>
          <ArchiveField label="Dream Prompt Used">
            <input value={form.dream_prompt} onChange={(e) => onChange("dream_prompt", e.target.value)} placeholder="What did you ask the night before?" />
          </ArchiveField>
          <input
            value={form.title}
            onChange={(e) => onChange("title", e.target.value)}
            className={`${cormorant.className} dream-title-input ${form.title.length > 42 ? "very-long" : form.title.length > 28 ? "long" : ""}`}
            placeholder="Name this memory"
          />
          <textarea
            value={form.dream_text}
            onChange={(e) => onChange("dream_text", e.target.value)}
            className={`${caveat.className} dream-textarea`}
            placeholder="Start writing your dream here..."
          />
        </div>

        <div className="book-page book-right">
          <ArchiveField label="People Tags">
            <input value={form.people} onChange={(e) => onChange("people", e.target.value)} placeholder="Unknown, Teacher, Friend" />
          </ArchiveField>
          <ArchiveField label="Emotion Tags">
            <input value={form.emotions} onChange={(e) => onChange("emotions", e.target.value)} placeholder="Wonder, anxious, calm" />
          </ArchiveField>
          <ArchiveField label="Setting Tags">
            <input value={form.settings} onChange={(e) => onChange("settings", e.target.value)} placeholder="School, ocean, forest" />
          </ArchiveField>
          <ArchiveField label="Symbols Tags">
            <input value={form.symbols} onChange={(e) => onChange("symbols", e.target.value)} placeholder="Door, clock, bridge" />
          </ArchiveField>
          <div className="book-row two">
            <ChoiceGroup label="Lucid" value={form.lucid} options={["No", "Yes", "Maybe"]} onChange={(value) => onChange("lucid", value)} />
            <ChoiceGroup label="Recurring" value={form.recurring} options={["No", "Yes", "Unknown"]} onChange={(value) => onChange("recurring", value)} />
          </div>
          <ArchiveField label="Intensity">
            <div className="star-row">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => onChange("intensity", String(star))} className={Number(form.intensity || 0) >= star ? "lit" : ""}>
                  ★
                </button>
              ))}
            </div>
          </ArchiveField>
          <ArchiveField label="Notes">
            <textarea value={form.notes} onChange={(e) => onChange("notes", e.target.value)} placeholder="A factual note, fragment, or memory trace." />
          </ArchiveField>
        </div>
        {form.id && (
          <div className="archive-saved-seal" aria-label="Dream saved to The Archive" title="Dream saved to The Archive">
            <Image src="/images/Red Wax Seal Button.png" alt="" width={86} height={86} />
            <span>Sealed</span>
          </div>
        )}
      </div>

      <div className="dream-prompt-panel">
        <div>
          <span className={cinzel.className}>Tonight&apos;s Suggested Dream Prompt</span>
          <p className={cormorant.className}>{form.dream_prompt || DREAM_PROMPTS[0]}</p>
        </div>
        <button type="button" onClick={onCopyPrompt}>Copy Prompt</button>
      </div>

      <div className="wax-actions">
        <WaxSealButton label="Archive Dream" image="/images/Blue Wax Seal Button.png" onClick={onArchive} />
        <WaxSealButton label="Save Changes" image="/images/Green Wax Seal Button.png" onClick={onSave} />
        <WaxSealButton label="Cancel" image="/images/Red Wax Seal Button.png" onClick={onCancel} />
        <WaxSealButton label="Add Note" image="/images/Purple Wax Seal Button.png" onClick={() => document.getElementById("archive-notes-anchor")?.scrollIntoView({ behavior: "smooth" })} />
      </div>
      <span id="archive-notes-anchor" />
    </section>
  );
}

function ChroniclesWorkspace({
  chronicles,
  current,
  form,
  loading,
  filter,
  search,
  onFilter,
  onSearch,
  onSelect,
  onChange,
  onSave,
  onFile,
  onToday,
  weather,
}: {
  chronicles: Chronicle[];
  current: Chronicle | null;
  form: ChronicleForm;
  loading: boolean;
  filter: "all" | "draft" | "in_progress" | "filed";
  search: string;
  onFilter: (filter: "all" | "draft" | "in_progress" | "filed") => void;
  onSearch: (search: string) => void;
  onSelect: (chronicle: Chronicle) => void;
  onChange: <K extends keyof ChronicleForm>(key: K, value: ChronicleForm[K]) => void;
  onSave: () => void;
  onFile: () => void;
  onToday: () => void;
  weather: string;
}) {
  const filteredChronicles = chronicles.filter((item) => {
    const matchesFilter = filter === "all" || item.status === filter;
    const searchText = `${item.entry_date} ${item.title || ""} ${item.victory_log || ""}`.toLowerCase();
    return matchesFilter && searchText.includes(search.toLowerCase());
  });

  return (
    <section className="chronicles-shell">
      <div className="chronicles-topbar">
        <p className={cinzel.className}>The Archive <span>/ Chronicles / {formatDate(current?.entry_date)}</span></p>
        <strong>Status: {statusLabel(current?.status)}</strong>
      </div>
      <aside className="chronicle-list-panel">
        <div className="chronicles-title-block">
          <p className={cinzel.className}>Chronicles</p>
          <span>The official record of what happened, what mattered, and what should be remembered.</span>
        </div>
        <button type="button" className="chronicle-today-button" onClick={onToday}>Today&apos;s Chronicle</button>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="chronicle-search"
          placeholder="Search date or title..."
        />
        <div className="chronicle-filter-row">
          {(["all", "draft", "in_progress", "filed"] as const).map((option) => (
            <button key={option} type="button" className={filter === option ? "active" : ""} onClick={() => onFilter(option)}>
              {option === "in_progress" ? "In Progress" : option}
            </button>
          ))}
        </div>
        <div className="chronicle-list">
          {loading && <p className="archive-muted">Opening the ledgers...</p>}
          {!loading && filteredChronicles.length === 0 && <p className="archive-muted">No Chronicle entries found.</p>}
          {filteredChronicles.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`chronicle-card ${current?.id === item.id ? "selected" : ""} ${item.status === "filed" ? "filed" : ""}`}
            >
              <span>{formatDate(item.entry_date)}</span>
              <strong>{item.title || `Chronicle for ${formatDate(item.entry_date)}`}</strong>
              <em><b>{statusLabel(item.status)}</b>{item.daily_score != null ? ` · Score ${item.daily_score}` : ""}</em>
              <small>{item.victory_log || "Awaiting the day's record."}</small>
            </button>
          ))}
        </div>
      </aside>

      {current ? (
        <ChronicleEditor current={current} form={form} onChange={onChange} onSave={onSave} onFile={onFile} weather={weather} />
      ) : (
        <section className="chronicle-empty">
          <p className={cinzel.className}>Chronicles</p>
          <span>Select or create today&apos;s Chronicle to begin the record.</span>
        </section>
      )}
    </section>
  );
}

function ChronicleEditor({
  current,
  form,
  onChange,
  onSave,
  onFile,
  weather,
}: {
  current: Chronicle;
  form: ChronicleForm;
  onChange: <K extends keyof ChronicleForm>(key: K, value: ChronicleForm[K]) => void;
  onSave: () => void;
  onFile: () => void;
  weather: string;
}) {
  const filed = current.status === "filed";
  const goalImpacts = current.goal_impacts || [];
  const [showGoalImpacts, setShowGoalImpacts] = useState(false);
  const goalSummary = summarizeGoalImpacts(goalImpacts);
  const displayedWeather = filed ? current.temperature || "Weather unavailable" : current.temperature || weather || "Weather unavailable";
  return (
    <section className="chronicle-editor-wrap">
      <div className="chronicle-book">
        <div className="chronicle-page official-record">
          <div className="chronicle-official-header">
            <div>
              <h2 className={cormorant.className}>{formatDate(current.entry_date)}</h2>
              <p>{weekdayForDate(current.entry_date)}</p>
              <WeatherDisplay weather={displayedWeather} />
            </div>
            <div className="chronicle-draft-times">
              <strong>Today&apos;s Chronicle</strong>
              <span>Drafted {formatTimeOnly(current.started_at)}</span>
              <span>Filed {filed ? formatTimeOnly(current.filed_at) : "Pending"}</span>
            </div>
          </div>

          <label className="chronicle-title-compact">
            <span>Archive Title</span>
            <input
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder={`Chronicle for ${formatDate(current.entry_date)}`}
            />
          </label>

          <RecordSection title="Mission Overview">
            <RecordRow label="Mission Score" value={valueOrPending(current.daily_score)} fallbackIcon={Activity} />
            <RecordRow label="Weekly Score" value={valueOrPending(current.weekly_score)} iconSrc="/icons/weekly_score.png" />
            <RecordRow label="Mission Rank" value={current.mission_rank || "Pending"} iconSrc="/icons/mission_rank.png" />
            <RecordRow label="Overall Status" value={current.overall_status || "Pending"} iconSrc="/icons/overall_status.png" strong />
          </RecordSection>

          <RecordSection title="Performance">
            <RecordRow label="Workout" value={current.workout_status || current.workout_summary || "Pending"} iconSrc="/icons/workout.png" />
            <RecordRow label="Next Protocol" value={current.next_protocol || "Pending"} iconSrc="/icons/next_protocol.png" />
            <div className="performance-stat-grid">
              <PerformanceStat
                label="Nutrition"
                iconSrc="/icons/nutrition.png"
                lines={[
                  current.calories != null ? `${current.calories.toLocaleString()} calories` : "Calories pending",
                  current.protein_g != null ? `${current.protein_g}g protein` : "Protein pending",
                ]}
              />
              <PerformanceStat label="Water" iconSrc="/icons/water.png" lines={[current.water_oz != null ? `${current.water_oz} oz` : "Pending"]} />
              <PerformanceStat label="Sleep" iconSrc="/icons/sleep.png" lines={[current.sleep_hours != null ? `${current.sleep_hours} hr` : "Pending"]} />
              <PerformanceStat
                label="Health Events"
                iconSrc="/icons/health.png"
                lines={[current.health_event_count != null ? `${current.health_event_count} symptoms` : "0 symptoms"]}
              />
            </div>
          </RecordSection>

          <div className="chronicle-goal-impact">
            <button type="button" className="chronicle-goal-toggle" onClick={() => setShowGoalImpacts((prev) => !prev)}>
              <span>Goal Impact</span>
              <strong>{goalSummary}</strong>
            </button>
            {goalImpacts.length === 0 && <p>Pending</p>}
            {showGoalImpacts && goalImpacts.map((impact, index) => (
                <div key={impact.id || `${impact.title}-${index}`} className="chronicle-impact-card">
                  <strong>{impact.title || "Objective"}</strong>
                  <em>{impact.achievement_label || impact.state || (impact.completed ? "Completed" : "Active")}</em>
                  {impact.detail && <small>{impact.detail}</small>}
                </div>
              ))}
          </div>
        </div>

        <div className="chronicle-page john-record">
          <div className="chronicle-page-heading">
            <p className={`${cinzel.className} chronicle-page-label`}>Today&apos;s Chronicle</p>
            <ChronicleStamp chronicle={current} />
          </div>
          <label className="chronicle-writing-field">
            <span>Story of Today</span>
            <textarea
              value={form.story_text}
              onChange={(event) => onChange("story_text", event.target.value)}
              placeholder="Write the historical record of the day..."
            />
          </label>
          <div className="chronicle-reflection-grid">
            <ChronicleReadOnly label="Victory Log" value={current.victory_log} />
            <ChronicleReadOnly label="Lessons Learned" value={current.lessons_worked} />
            <ChronicleReadOnly label="What Did Not Work" value={current.lessons_not_worked} />
            <ChronicleReadOnly label="Adjust Tomorrow" value={current.lessons_adjust_tomorrow} />
            <ChronicleReadOnly label="Tomorrow Focus" value={current.tomorrow_focus} />
          </div>
          <label className="chronicle-writing-field compact">
            <span>Message to Future Me</span>
            <textarea
              value={form.future_me_message}
              onChange={(event) => onChange("future_me_message", event.target.value)}
              placeholder="What should future John remember?"
            />
          </label>
          <label className="chronicle-writing-field compact">
            <span>Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              placeholder="Optional archival notes..."
            />
          </label>
          <div className="chronicle-signature-block">
            <span className="signature-label">Recorded By</span>
            <strong className={`${greatVibes.className} chronicle-signature-name`}>John Summers</strong>
            <span>{formatDate(current.entry_date)} · {current.mission_rank || "Rank Pending"}</span>
            <em>Every day becomes history.</em>
          </div>
        </div>
      </div>
      <div className="chronicle-actions">
        <button type="button" onClick={onSave}>Save Progress</button>
        <button type="button" className="file" onClick={onFile}>{filed ? "Update Filed Chronicle" : "File Chronicle"}</button>
      </div>
    </section>
  );
}

function ChronicleStamp({ chronicle }: { chronicle: Chronicle }) {
  const filed = chronicle.status === "filed";
  const inProgress = chronicle.status === "in_progress";
  return (
    <span className={`chronicle-stamp ${filed ? "filed" : inProgress ? "progress" : "draft"}`}>
      {filed ? "FILED" : inProgress ? "IN PROGRESS" : "DRAFT"}
      <small>{formatDate(chronicle.entry_date)}</small>
      {filed ? (
        <>
          <em>Mission Score</em>
          <strong>{valueOrPending(chronicle.daily_score)}</strong>
        </>
      ) : (
        <em>{inProgress ? "Mission in motion." : "Mission still unfolding."}</em>
      )}
    </span>
  );
}

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chronicle-record-section">
      <p>{title}</p>
      <div>{children}</div>
    </section>
  );
}

function RecordRow({
  label,
  value,
  iconSrc,
  fallbackIcon: FallbackIcon,
  strong,
}: {
  label: string;
  value: ReactNode;
  iconSrc?: string;
  fallbackIcon?: LucideIcon;
  strong?: boolean;
}) {
  return (
    <div className={`record-row ${strong ? "strong" : ""}`}>
      <span className="record-row-label">
        <ArchiveRecordIcon src={iconSrc} fallbackIcon={FallbackIcon} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function PerformanceStat({ label, lines, iconSrc }: { label: string; lines: string[]; iconSrc: string }) {
  return (
    <article className="performance-stat-card">
      <span>
        <ArchiveRecordIcon src={iconSrc} />
        {label}
      </span>
      <strong>
        {lines.map((line) => (
          <em key={line}>{line}</em>
        ))}
      </strong>
    </article>
  );
}

function ArchiveRecordIcon({ src, fallbackIcon: FallbackIcon }: { src?: string; fallbackIcon?: LucideIcon }) {
  if (src) {
    return <Image className="archive-record-icon" src={src} alt="" width={22} height={22} />;
  }
  if (FallbackIcon) {
    return <FallbackIcon className="archive-record-lucide" aria-hidden="true" size={21} strokeWidth={1.8} />;
  }
  return null;
}

function WeatherDisplay({ weather }: { weather: string }) {
  const parsed = parseWeatherSnapshot(weather);

  return (
    <span className="chronicle-weather-line" title={parsed.condition === "Unavailable" ? "Weather unavailable" : weather}>
      <WeatherIcon condition={parsed.condition} />
      {parsed.temperatureText}
    </span>
  );
}

function WeatherIcon({ condition }: { condition: string }) {
  const normalized = condition.toLowerCase();
  const props = { "aria-hidden": true, size: 18, strokeWidth: 1.9 };
  if (normalized.includes("sunny")) return <Sun {...props} />;
  if (normalized.includes("partly")) return <Cloud {...props} />;
  if (normalized.includes("cloud")) return <Cloud {...props} />;
  if (normalized.includes("fog")) return <CloudFog {...props} />;
  if (normalized.includes("drizzle")) return <CloudDrizzle {...props} />;
  if (normalized.includes("rain") || normalized.includes("shower")) return <CloudRain {...props} />;
  if (normalized.includes("snow")) return <CloudSnow {...props} />;
  if (normalized.includes("thunder")) return <CloudLightning {...props} />;
  return <HelpCircle {...props} />;
}

function ChronicleReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="chronicle-readonly">
      <span>{label}</span>
      <p>{value || "Pending"}</p>
      <small>Pulled from Daily Debrief.</small>
    </div>
  );
}

function ComingSoonPanel({ section }: { section: ArchiveSection }) {
  const copy = {
    daily: {
      title: "Daily Journal",
      text: "A quieter journal shelf for ordinary days, reflections, and memory fragments is being prepared.",
      image: "/images/Daily Journal.png",
    },
    lessons: {
      title: "Lessons Learned",
      text: "This wing will gather hard-earned wisdom into a searchable book of patterns, choices, and outcomes.",
      image: "/images/Lessons Learned.png",
    },
    moments: {
      title: "Life Moments",
      text: "A future gallery for the memories you will want to keep forever.",
      image: "/images/Life Moments.png",
    },
    dreams: {
      title: "Dream Journal",
      text: "The dream journal is ready.",
      image: "/images/Dream Journal.png",
    },
  }[section];

  return (
    <section className="archive-coming-soon">
      <Image src={copy.image} alt="" width={220} height={280} />
      <div>
        <p className={cinzel.className}>Coming Soon</p>
        <h2 className={cormorant.className}>{copy.title}</h2>
        <span>{copy.text}</span>
      </div>
    </section>
  );
}

function ArchiveField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="archive-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ChoiceGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="archive-choice">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} className={value === option ? "active" : ""}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function WaxSealButton({ label, image, onClick }: { label: string; image: string; onClick: () => void }) {
  return (
    <button type="button" className="wax-button" onClick={onClick}>
      <Image src={image} alt="" width={72} height={72} />
      <span>{label}</span>
    </button>
  );
}

function MoonPhaseIcon({ phase }: { phase: string }) {
  const icon = MOON_PHASE_ICONS[phase] || MOON_PHASE_ICONS["New Moon"];
  return (
    <span className="moon-phase-icon" aria-label={phase || "Moon phase unknown"} title={phase || "Moon phase unknown"}>
      <Image src={icon} alt="" width={24} height={24} />
    </span>
  );
}

function formToPayload(form: DreamForm) {
  return {
    user_id: USER_ID,
    title: form.title || null,
    dream_text: form.dream_text || null,
    dream_prompt: form.dream_prompt || null,
    dream_date: form.dream_date || null,
    moon_phase: form.moon_phase || getMoonPhase(form.dream_date),
    people: tagsToArray(form.people),
    emotions: tagsToArray(form.emotions),
    settings: tagsToArray(form.settings),
    symbols: tagsToArray(form.symbols),
    lucid: form.lucid || null,
    recurring: form.recurring || null,
    intensity: form.intensity ? Number(form.intensity) : null,
    notes: form.notes || null,
  };
}

function tagsToArray(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatDate(value?: string | null) {
  if (!value) return "Undated";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeOnly(value?: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekdayForDate(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function statusLabel(value?: string | null) {
  if (value === "filed") return "Filed";
  if (value === "in_progress") return "In Progress";
  return "Draft";
}

function valueOrPending(value?: number | string | null) {
  return value == null || value === "" ? "Pending" : value;
}

function summarizeGoalImpacts(impacts: ChronicleGoalImpact[]) {
  if (!impacts.length) return "0 recorded";
  const completed = impacts.filter((impact) => impact.completed || (impact.state || "").toLowerCase().includes("complete")).length;
  const above = impacts.filter((impact) => {
    const label = `${impact.achievement_label || ""} ${impact.state || ""}`.toLowerCase();
    return label.includes("above") || label.includes("beyond");
  }).length;
  const parts = [
    `${completed} completed`,
    above ? `${above} above & beyond` : null,
  ].filter(Boolean);
  return parts.join(", ") || `${impacts.length} recorded`;
}

function weatherCodeLabel(code: number) {
  if (code === 0) return "Sunny";
  if ([1, 2, 3].includes(code)) return code === 3 ? "Cloudy" : "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather";
}

function parseWeatherSnapshot(weather?: string | null) {
  if (!weather || weather === "Weather unavailable") {
    return { condition: "Unavailable", temperatureText: "Weather unavailable" };
  }
  const [rawCondition, ...rest] = weather.split(",");
  const temperatureText = rest.join(",").trim() || weather.replace(rawCondition, "").trim() || weather;
  return {
    condition: rawCondition.trim() || "Weather",
    temperatureText: temperatureText || "Weather unavailable",
  };
}

function normalizeSection(value: string | null): ArchiveSection {
  if (value === "daily" || value === "lessons" || value === "moments") return value;
  return "dreams";
}

function getMoonPhase(dateValue: string) {
  if (!dateValue) return "";
  const selected = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(selected.getTime())) return "";
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const lunarCycle = 29.530588853;
  const daysSince = (selected.getTime() - knownNewMoon) / 86_400_000;
  const age = ((daysSince % lunarCycle) + lunarCycle) % lunarCycle;
  if (age < 1.84566) return "New Moon";
  if (age < 5.53699) return "Waxing Crescent";
  if (age < 9.22831) return "First Quarter";
  if (age < 12.91963) return "Waxing Gibbous";
  if (age < 16.61096) return "Full Moon";
  if (age < 20.30228) return "Waning Gibbous";
  if (age < 23.99361) return "Last Quarter";
  if (age < 27.68493) return "Waning Crescent";
  return "New Moon";
}

function ArchiveStyles() {
  return (
    <style jsx global>{`
      .archive-shell {
        --archive-bg: #050912;
        --archive-green: #31533a;
        --archive-gold: #d6a85f;
        --parchment: #e8d3a5;
        --ink: #25190f;
        --muted-ink: rgba(62, 48, 28, 0.68);
        --line: rgba(62, 48, 28, 0.18);
        min-height: 100vh;
        background:
          radial-gradient(circle at 45% 0%, rgba(47, 111, 179, 0.28), transparent 32rem),
          linear-gradient(180deg, #050912, #060914 52%, #02040a);
        color: #f4ead2;
      }

      .archive-main {
        margin-left: 92px;
        padding: 28px 32px 64px;
      }

      .archive-sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 20;
        width: 92px;
        border-right: 1px solid rgba(214, 168, 95, 0.24);
        background: linear-gradient(180deg, rgba(5, 9, 18, 0.96), rgba(3, 6, 13, 0.98));
        box-shadow: 12px 0 44px rgba(0, 0, 0, 0.34);
        padding: 18px 10px;
      }

      .archive-brand {
        display: grid;
        gap: 4px;
        place-items: center;
        color: #d6a85f;
        font-size: 0.82rem;
        letter-spacing: 0.18em;
        text-align: center;
      }

      .archive-brand small {
        color: rgba(232, 211, 165, 0.58);
        font-size: 0.58rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .archive-icon-rail {
        margin-top: 28px;
        display: grid;
        gap: 12px;
      }

      .archive-icon-button {
        position: relative;
        display: grid;
        width: 64px;
        height: 64px;
        place-items: center;
        border: 1px solid rgba(214, 168, 95, 0.1);
        border-radius: 14px;
        background: rgba(11, 18, 32, 0.52);
        transition: transform 220ms, border-color 220ms, box-shadow 220ms, background 220ms;
      }

      .archive-icon-button:hover,
      .archive-icon-button.active {
        transform: translateY(-2px) scale(1.03);
        border-color: rgba(214, 168, 95, 0.54);
        background: rgba(16, 33, 58, 0.78);
        box-shadow: 0 0 24px rgba(47, 111, 179, 0.38), inset 0 0 20px rgba(214, 168, 95, 0.08);
      }

      .archive-side-icon {
        width: 52px;
        height: 52px;
        object-fit: contain;
        border-radius: 12px;
      }

      .archive-tooltip {
        pointer-events: none;
        position: absolute;
        left: 74px;
        top: 50%;
        min-width: max-content;
        transform: translate(8px, -50%);
        border: 1px solid rgba(214, 168, 95, 0.36);
        border-radius: 999px;
        background: rgba(5, 9, 18, 0.94);
        color: #f4ead2;
        opacity: 0;
        padding: 7px 12px;
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        transition: opacity 180ms, transform 180ms;
        white-space: nowrap;
      }

      .archive-icon-button:hover .archive-tooltip {
        opacity: 1;
        transform: translate(0, -50%);
      }

      .archive-hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 230px;
        gap: 18px;
        align-items: stretch;
      }

      .archive-banner {
        position: relative;
        min-height: 270px;
        overflow: hidden;
        border: 1px solid rgba(214, 168, 95, 0.22);
        border-radius: 18px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42), 0 0 44px rgba(47, 111, 179, 0.16);
      }

      .archive-banner-image {
        object-fit: cover;
      }

      .archive-banner-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(3, 6, 13, 0.02), rgba(3, 6, 13, 0.18)), radial-gradient(circle at center, transparent, rgba(0, 0, 0, 0.18));
      }

      .archive-wing-label {
        position: absolute;
        left: 24px;
        top: 22px;
        border: 1px solid rgba(214, 168, 95, 0.34);
        border-radius: 999px;
        background: rgba(5, 9, 18, 0.62);
        color: #d6a85f;
        font-size: 0.72rem;
        letter-spacing: 0.18em;
        padding: 9px 14px;
        text-transform: uppercase;
        box-shadow: 0 0 22px rgba(47, 111, 179, 0.24);
      }

      .archive-section,
      .dream-list-panel,
      .archive-stats {
        border: 1px solid rgba(214, 168, 95, 0.22);
        border-radius: 18px;
        background: rgba(5, 9, 18, 0.68);
        box-shadow: inset 0 0 30px rgba(47, 111, 179, 0.05), 0 20px 60px rgba(0, 0, 0, 0.28);
      }

      .archive-section {
        padding: 18px;
      }

      .archive-section-header,
      .dream-list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .archive-section-header p,
      .dream-list-header h2,
      .archive-stats h2 {
        color: #d6a85f;
        font-size: 1rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .archive-section-header button,
      .dream-list-header button,
      .dream-prompt-panel button {
        border: 1px solid rgba(214, 168, 95, 0.35);
        border-radius: 999px;
        background: rgba(16, 33, 58, 0.72);
        color: #e8d3a5;
        padding: 8px 14px;
        transition: transform 220ms, box-shadow 220ms, border-color 220ms;
      }

      .archive-section-header button:hover,
      .dream-list-header button:hover,
      .dream-prompt-panel button:hover {
        transform: translateY(-2px);
        border-color: rgba(214, 168, 95, 0.72);
        box-shadow: 0 0 24px rgba(47, 111, 179, 0.35);
      }

      .archive-muted {
        color: rgba(232, 211, 165, 0.72);
        font-size: 0.9rem;
      }

      .archive-stats {
        padding: 16px;
        background-image: linear-gradient(rgba(232, 211, 165, 0.88), rgba(232, 211, 165, 0.78)), url("/images/Parchment Paper Texture.png");
        background-size: cover;
        color: #3a2815;
        align-self: stretch;
      }

      .archive-stat-row {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid rgba(58, 40, 21, 0.18);
        padding: 7px 0;
        font-size: 0.86rem;
      }

      .archive-stat-row strong {
        color: #6f4214;
      }

      .archive-current-section {
        border: 1px solid rgba(58, 40, 21, 0.16);
        border-radius: 12px;
        background: rgba(244, 234, 210, 0.28);
        margin: 10px 0 6px;
        padding: 9px 10px;
      }

      .archive-current-section span {
        display: block;
        color: rgba(58, 40, 21, 0.68);
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .archive-current-section strong {
        color: #6f4214;
        font-size: 0.98rem;
      }

      .archive-workspace {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 22px;
        margin-top: 18px;
      }

      .dream-list-panel {
        align-self: start;
        padding: 16px;
      }

      .dream-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
        max-height: 680px;
        overflow-y: auto;
        padding-right: 6px;
      }

      .dream-card {
        display: grid;
        gap: 5px;
        border: 1px solid rgba(214, 168, 95, 0.16);
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(16, 33, 58, 0.74), rgba(5, 9, 18, 0.86));
        padding: 13px;
        text-align: left;
        transition: transform 200ms, border-color 200ms, box-shadow 200ms;
      }

      .dream-card:hover,
      .dream-card.selected {
        transform: translateY(-2px);
        border-color: rgba(47, 111, 179, 0.62);
        box-shadow: 0 0 24px rgba(47, 111, 179, 0.28);
      }

      .dream-card span,
      .dream-card small,
      .dream-card em {
        color: rgba(232, 211, 165, 0.68);
        font-size: 0.78rem;
        font-style: normal;
      }

      .dream-card strong {
        color: #f4ead2;
      }

      .dream-card div {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .dream-card-date {
        align-items: center;
        display: inline-flex;
        gap: 8px;
      }

      .moon-phase-icon {
        display: inline-grid;
        width: 26px;
        height: 26px;
        place-items: center;
        flex: 0 0 auto;
        filter: drop-shadow(0 0 8px rgba(214, 168, 95, 0.22));
      }

      .moon-phase-icon img {
        width: 24px;
        height: 24px;
        object-fit: contain;
      }

      .dream-editor-wrap {
        min-width: 0;
        max-width: 1500px;
      }

      .open-book-editor {
        position: relative;
        display: grid;
        min-height: 830px;
        grid-template-columns: 1fr 1fr;
        gap: clamp(38px, 5vw, 82px);
        overflow: visible;
        border-radius: 24px;
        background:
          url("/images/Open Book.png") top center / 100% 100% no-repeat,
          linear-gradient(90deg, rgba(232, 211, 165, 0.94), rgba(232, 211, 165, 0.82));
        padding: clamp(42px, 4vw, 68px) clamp(52px, 6.2vw, 110px) 70px;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5), 0 0 40px rgba(47, 111, 179, 0.18);
        transition: filter 700ms ease, box-shadow 700ms ease;
      }

      .dream-editor-wrap.archived .open-book-editor {
        filter: sepia(0.12) saturate(0.92) brightness(0.95);
        box-shadow:
          inset 0 0 90px rgba(111, 66, 20, 0.12),
          0 28px 80px rgba(0, 0, 0, 0.5),
          0 0 40px rgba(47, 111, 179, 0.18);
      }

      .book-page {
        min-width: 0;
        color: #2b2118;
      }

      .book-row {
        display: grid;
        gap: 6px;
      }

      .book-row.two {
        grid-template-columns: 1fr 1fr;
      }

      .archive-field,
      .archive-choice {
        display: grid;
        gap: 4px;
        margin-bottom: 6px;
      }

      .archive-field span,
      .archive-choice > span {
        color: rgba(47, 38, 28, 0.72);
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .archive-field input,
      .archive-field textarea {
        width: 100%;
        border: 1px solid rgba(47, 38, 28, 0.18);
        border-radius: 10px;
        background: rgba(244, 234, 210, 0.34);
        color: #2b2118;
        outline: none;
        padding: 7px 9px;
      }

      .archive-field input::placeholder,
      .archive-field textarea::placeholder,
      .dream-title-input::placeholder,
      .dream-textarea::placeholder {
        color: rgba(43, 33, 24, 0.54);
      }

      .dream-title-input {
        margin: 0 auto 0;
        width: calc(100% - 80px);
        border: 0;
        border-bottom: 1px solid rgba(47, 38, 28, 0.18);
        background: transparent;
        color: #2b2118;
        font-size: clamp(26px, 2vw, 42px);
        font-weight: 600;
        line-height: 1.1;
        outline: none;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        transform: translateX(-30px);
        white-space: nowrap;
      }

      .dream-title-input.long {
        font-size: clamp(22px, 1.7vw, 34px);
      }

      .dream-title-input.very-long {
        font-size: clamp(19px, 1.35vw, 28px);
      }

      .dream-textarea {
        height: 590px;
        margin-top: -10px;
        width: calc(100% + 30px);
        caret-color: #2b1d12;
        resize: none;
        border: 0;
        border-radius: 12px;
        background:
          repeating-linear-gradient(
            transparent 0 33px,
            rgba(43, 29, 18, 0.07) 34px 35px
          );
        color: #2b1d12;
        font-size: 24px;
        letter-spacing: 0.15px;
        line-height: 1.65;
        outline: none;
        overflow-y: auto;
        padding: 14px 30px 70px;
        text-shadow: 0 0.5px 0.5px rgba(0, 0, 0, 0.18);
        transform: translateX(-30px);
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .dream-textarea::-webkit-scrollbar {
        display: none;
      }

      .archive-saved-seal {
        position: absolute;
        right: calc(clamp(58px, 6vw, 112px) + 15px);
        bottom: 72px;
        display: grid;
        justify-items: center;
        pointer-events: none;
        transform: rotate(-8deg);
      }

      .archive-saved-seal img {
        width: 86px;
        height: 86px;
        object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(43, 29, 18, 0.34));
      }

      .archive-saved-seal span {
        color: #6f1d16;
        font-size: 0.64rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        margin-top: -22px;
        text-transform: uppercase;
      }

      .chronicles-shell {
        display: grid;
        grid-template-columns: 288px minmax(0, 1fr);
        gap: 16px 24px;
        min-height: calc(100vh - 80px);
      }

      .chronicles-topbar {
        align-items: center;
        border-bottom: 1px solid rgba(214, 168, 95, 0.18);
        display: flex;
        grid-column: 1 / -1;
        justify-content: space-between;
        padding-bottom: 12px;
      }

      .chronicles-topbar p {
        color: #d6a85f;
        font-size: 1.05rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .chronicles-topbar span,
      .chronicles-topbar strong {
        color: rgba(232, 211, 165, 0.72);
        font-family: ${inter.style.fontFamily};
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .chronicle-list-panel,
      .chronicle-empty {
        border: 1px solid rgba(214, 168, 95, 0.28);
        border-radius: 18px;
        background:
          linear-gradient(135deg, rgba(11, 34, 25, 0.9), rgba(7, 12, 11, 0.96)),
          repeating-linear-gradient(135deg, rgba(232, 211, 165, 0.04) 0 1px, transparent 1px 12px);
        box-shadow: inset 0 0 28px rgba(214, 168, 95, 0.06), 0 22px 60px rgba(0, 0, 0, 0.32);
      }

      .chronicle-list-panel {
        align-self: start;
        padding: 18px;
      }

      .chronicles-title-block {
        display: grid;
        gap: 8px;
      }

      .chronicles-title-block p {
        color: var(--archive-gold);
        font-size: 1.2rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .chronicles-title-block span {
        color: rgba(232, 211, 165, 0.72);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .chronicle-today-button,
      .chronicle-search,
      .chronicle-filter-row button,
      .chronicle-actions button {
        border: 1px solid rgba(214, 168, 95, 0.34);
        border-radius: 12px;
        background: rgba(17, 49, 37, 0.76);
        color: #f4ead2;
        transition: transform 200ms, border-color 200ms, box-shadow 200ms, background 200ms;
      }

      .chronicle-today-button,
      .chronicle-search {
        margin-top: 14px;
        width: 100%;
        padding: 10px 12px;
      }

      .chronicle-today-button:hover,
      .chronicle-filter-row button:hover,
      .chronicle-filter-row button.active,
      .chronicle-actions button:hover {
        transform: translateY(-2px);
        border-color: rgba(214, 168, 95, 0.72);
        background: rgba(29, 75, 55, 0.82);
        box-shadow: 0 0 20px rgba(214, 168, 95, 0.18);
      }

      .chronicle-search::placeholder {
        color: rgba(232, 211, 165, 0.45);
      }

      .chronicle-filter-row {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: 10px;
      }

      .chronicle-filter-row button {
        padding: 8px;
        font-size: 0.68rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .chronicle-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
        max-height: calc(100vh - 270px);
        overflow-y: auto;
        padding-right: 6px;
      }

      .chronicle-card {
        display: grid;
        gap: 6px;
        border: 1px solid rgba(214, 168, 95, 0.18);
        border-radius: 14px;
        background:
          linear-gradient(135deg, rgba(28, 72, 52, 0.32), rgba(5, 9, 18, 0.36)),
          rgba(4, 10, 8, 0.52);
        padding: 13px;
        text-align: left;
        transition: transform 200ms, border-color 200ms, box-shadow 200ms, background 200ms;
      }

      .chronicle-card:hover,
      .chronicle-card.selected {
        transform: translateY(-2px);
        border-color: rgba(214, 168, 95, 0.82);
        box-shadow: 0 0 24px rgba(214, 168, 95, 0.2), inset 0 0 18px rgba(49, 83, 58, 0.16);
      }

      .chronicle-card.filed {
        border-color: rgba(214, 168, 95, 0.34);
      }

      .chronicle-card span,
      .chronicle-card em,
      .chronicle-card small {
        color: rgba(232, 211, 165, 0.68);
        font-size: 0.78rem;
        font-style: normal;
      }

      .chronicle-card strong {
        color: #f4ead2;
        line-height: 1.25;
      }

      .chronicle-card em b {
        border: 1px solid rgba(214, 168, 95, 0.24);
        border-radius: 999px;
        color: var(--archive-gold);
        font-size: 0.64rem;
        letter-spacing: 0.1em;
        padding: 2px 7px;
        text-transform: uppercase;
      }

      .chronicle-editor-wrap {
        min-width: 0;
      }

      .chronicle-book {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: clamp(44px, 5vw, 86px);
        min-height: 900px;
        border-radius: 24px;
        background:
          url("/images/daily_journal.png") top center / 100% 100% no-repeat,
          linear-gradient(90deg, rgba(232, 211, 165, 0.9), rgba(216, 188, 127, 0.82));
        padding: clamp(54px, 4.4vw, 78px) clamp(62px, 6.4vw, 122px) 74px;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5), 0 0 42px rgba(20, 78, 48, 0.18);
      }

      .chronicle-page {
        min-width: 0;
        color: var(--ink);
      }

      .chronicle-page.official-record {
        padding-left: clamp(24px, 2.2vw, 40px);
        padding-right: 6px;
      }

      .chronicle-page-label {
        color: var(--archive-green);
        font-size: 0.92rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .chronicle-official-header {
        align-items: start;
        border-bottom: 1px solid var(--line);
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        padding: 8px 0 12px;
      }

      .chronicle-official-header h2 {
        color: var(--ink);
        font-size: clamp(1.75rem, 2.4vw, 2.6rem);
        font-weight: 700;
        line-height: 1;
      }

      .chronicle-official-header p,
      .chronicle-official-header span,
      .chronicle-draft-times span {
        color: var(--muted-ink);
        display: block;
        font-size: 0.9rem;
        margin-top: 5px;
      }

      .chronicle-official-header .chronicle-weather-line {
        align-items: center;
        color: #6f4214;
        display: inline-flex;
        gap: 7px;
        font-size: 0.88rem;
        font-weight: 700;
        margin-top: 7px;
      }

      .chronicle-weather-line svg {
        color: #8a5b19;
        filter: drop-shadow(0 0 5px rgba(214, 168, 95, 0.22));
        flex: 0 0 auto;
      }

      .chronicle-draft-times {
        color: var(--ink);
        display: grid;
        gap: 4px;
        min-width: 150px;
        text-align: right;
      }

      .chronicle-draft-times strong {
        color: var(--archive-green);
        font-family: ${kalam.style.fontFamily};
        font-size: 1.2rem;
        font-weight: 700;
      }

      .chronicle-title-compact {
        display: grid;
        gap: 4px;
        margin-top: 10px;
      }

      .chronicle-title-compact input {
        border: 0;
        border-bottom: 1px solid var(--line);
        background: transparent;
        color: var(--ink);
        font-family: ${cormorant.style.fontFamily};
        font-size: 1.08rem;
        font-weight: 700;
        outline: none;
        padding: 4px 0 6px;
        transition: border-color 180ms, background 180ms;
      }

      .chronicle-title-compact input:focus {
        border-bottom-color: rgba(138, 91, 25, 0.62);
        background: linear-gradient(180deg, transparent, rgba(214, 168, 95, 0.08));
      }

      .chronicle-title-compact span,
      .chronicle-goal-impact > span,
      .chronicle-readonly span,
      .chronicle-writing-field span,
      .chronicle-record-section > p {
        color: rgba(49, 83, 58, 0.88);
        display: block;
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .chronicle-record-section {
        margin-top: 14px;
      }

      .chronicle-record-section > div {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(244, 234, 210, 0.16);
        margin-top: 8px;
      }

      .record-row {
        align-items: center;
        border-bottom: 1px solid var(--line);
        display: grid;
        grid-template-columns: minmax(145px, 0.88fr) minmax(120px, 1fr);
        gap: 10px;
        min-height: 38px;
        padding: 7px 12px;
      }

      .record-row:last-child {
        border-bottom: 0;
      }

      .record-row .record-row-label {
        align-items: center;
        color: var(--muted-ink);
        display: inline-flex;
        font-size: 0.84rem;
        gap: 8px;
        justify-content: center;
        line-height: 1.15;
        text-align: center;
      }

      .record-row strong {
        color: var(--ink);
        font-family: ${cormorant.style.fontFamily};
        font-size: 1.18rem;
        font-weight: 700;
        line-height: 1.05;
        text-align: left;
      }

      .record-row.strong strong {
        color: var(--archive-green);
        text-transform: uppercase;
      }

      .archive-record-icon,
      .archive-record-lucide {
        flex: 0 0 auto;
        height: 22px;
        object-fit: contain;
        opacity: 0.9;
        width: 22px;
      }

      .archive-record-icon {
        filter: sepia(0.14) saturate(0.8) drop-shadow(0 0 5px rgba(138, 91, 25, 0.12));
      }

      .archive-record-lucide {
        color: #6f4214;
        filter: drop-shadow(0 0 5px rgba(214, 168, 95, 0.18));
      }

      .performance-stat-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: 1fr 1fr;
        padding: 9px;
      }

      .performance-stat-card {
        border: 1px solid rgba(62, 48, 28, 0.16);
        border-radius: 9px;
        background:
          linear-gradient(145deg, rgba(244, 234, 210, 0.26), rgba(214, 168, 95, 0.06)),
          rgba(49, 83, 58, 0.05);
        min-height: 78px;
        padding: 9px 10px;
      }

      .performance-stat-card span {
        align-items: center;
        color: rgba(49, 83, 58, 0.88);
        display: inline-flex;
        font-size: 0.68rem;
        font-weight: 800;
        gap: 7px;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .performance-stat-card strong {
        display: grid;
        gap: 2px;
        margin-top: 7px;
      }

      .performance-stat-card em {
        color: #25190f;
        font-family: ${cormorant.style.fontFamily};
        font-size: 1.05rem;
        font-style: normal;
        font-weight: 700;
        line-height: 1.05;
      }

      .chronicle-goal-impact {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .chronicle-goal-toggle {
        align-items: center;
        border: 1px solid rgba(49, 83, 58, 0.28);
        border-radius: 10px;
        background: rgba(49, 83, 58, 0.08);
        display: flex;
        justify-content: space-between;
        padding: 10px 12px;
        text-align: left;
        transition: background 180ms, border-color 180ms, transform 180ms;
      }

      .chronicle-goal-toggle:hover {
        border-color: rgba(49, 83, 58, 0.55);
        background: rgba(49, 83, 58, 0.14);
        transform: translateY(-1px);
      }

      .chronicle-goal-toggle strong {
        color: #8a5b19;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .chronicle-goal-impact p,
      .chronicle-impact-card small,
      .chronicle-readonly small {
        color: rgba(37, 25, 15, 0.58);
        font-size: 0.76rem;
      }

      .chronicle-impact-card strong,
      .chronicle-impact-card em {
        display: block;
      }

      .chronicle-impact-card strong {
        color: #25190f;
        font-size: 0.9rem;
      }

      .chronicle-impact-card em {
        color: #8a5b19;
        font-size: 0.7rem;
        font-style: normal;
        font-weight: 800;
        letter-spacing: 0.1em;
        margin-top: 2px;
        text-transform: uppercase;
      }

      .chronicle-page-heading {
        min-height: 116px;
        padding-right: 150px;
        position: relative;
      }

      .chronicle-stamp {
        border: 2px solid rgba(138, 91, 25, 0.78);
        border-radius: 10px;
        color: #8a5b19;
        display: grid;
        font-size: 1rem;
        font-weight: 900;
        letter-spacing: 0.13em;
        min-width: 128px;
        padding: 10px 12px;
        position: absolute;
        right: 0;
        top: -6px;
        text-align: center;
        text-transform: uppercase;
        transform: rotate(-4deg);
        background: rgba(216, 168, 83, 0.13);
        box-shadow: inset 0 0 18px rgba(138, 91, 25, 0.1);
      }

      .chronicle-stamp small {
        color: rgba(62, 48, 28, 0.7);
        font-size: 0.54rem;
        letter-spacing: 0.06em;
        margin-top: 2px;
      }

      .chronicle-stamp em {
        color: rgba(62, 48, 28, 0.7);
        font-size: 0.52rem;
        font-style: normal;
        letter-spacing: 0.08em;
        margin-top: 5px;
      }

      .chronicle-stamp strong {
        color: #25190f;
        font-size: 1.25rem;
        line-height: 1;
      }

      .chronicle-stamp.draft {
        border-color: rgba(49, 83, 58, 0.46);
        color: #31533a;
      }

      .chronicle-stamp.progress {
        border-color: rgba(49, 83, 58, 0.58);
        color: #31533a;
      }

      .chronicle-readonly {
        margin-top: 0;
        border: 1px solid rgba(62, 48, 28, 0.16);
        border-radius: 8px;
        background: rgba(244, 234, 210, 0.2);
        padding: 8px 10px;
      }

      .chronicle-readonly p {
        color: #25190f;
        font-size: 0.92rem;
        line-height: 1.35;
        margin-top: 3px;
      }

      .chronicle-writing-field {
        display: grid;
        gap: 5px;
        margin-top: 10px;
      }

      .chronicle-writing-field textarea {
        min-height: 238px;
        resize: vertical;
        border: 1px solid rgba(62, 48, 28, 0.16);
        border-radius: 10px;
        background:
          repeating-linear-gradient(transparent 0 29px, rgba(37, 25, 15, 0.07) 30px 31px),
          rgba(244, 234, 210, 0.2);
        color: #2b1d12;
        font-family: ${kalam.style.fontFamily};
        font-size: 1.12rem;
        line-height: 1.5;
        outline: none;
        padding: 10px 12px;
      }

      .chronicle-writing-field.compact textarea {
        min-height: 76px;
      }

      .chronicle-reflection-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
      }

      .chronicle-reflection-grid .chronicle-readonly:last-child {
        grid-column: 1 / -1;
      }

      .chronicle-signature-block {
        border-top: 1px solid var(--line);
        color: var(--muted-ink);
        display: grid;
        gap: 3px;
        margin-top: 12px;
        padding-top: 10px;
      }

      .chronicle-signature-block span {
        font-size: 0.82rem;
      }

      .chronicle-signature-block .signature-label {
        color: rgba(49, 83, 58, 0.82);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .chronicle-signature-name {
        color: #25190f;
        font-size: clamp(2rem, 3vw, 2.8rem);
        font-weight: 400;
        line-height: 0.98;
      }

      .chronicle-signature-block em {
        color: #8a5b19;
        font-family: ${cormorant.style.fontFamily};
        font-size: 1rem;
      }

      .chronicle-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 14px;
      }

      .chronicle-actions button {
        padding: 12px 16px;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .chronicle-actions button.file {
        border-color: rgba(214, 168, 95, 0.58);
        background: rgba(214, 168, 95, 0.16);
        color: #f4ead2;
      }

      .chronicle-empty {
        display: grid;
        min-height: 420px;
        place-content: center;
        text-align: center;
      }

      .chronicle-empty p {
        color: #d6a85f;
        font-size: 1.4rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .chronicle-empty span {
        color: rgba(232, 211, 165, 0.72);
        margin-top: 8px;
      }

      .archive-choice div,
      .star-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .archive-choice button {
        border: 1px solid rgba(47, 38, 28, 0.36);
        border-radius: 999px;
        background: rgba(244, 234, 210, 0.28);
        color: #2b2118;
        font-weight: 700;
        padding: 9px 14px;
        transition: border-color 180ms, background 180ms, transform 180ms, box-shadow 180ms;
      }

      .archive-choice button.active {
        border-color: rgba(47, 111, 179, 0.9);
        background: rgba(47, 111, 179, 0.22);
        box-shadow: 0 0 0 2px rgba(47, 111, 179, 0.12), inset 0 0 14px rgba(47, 111, 179, 0.12);
      }

      .archive-choice button:hover {
        transform: translateY(-1px);
        border-color: rgba(111, 66, 20, 0.58);
      }

      .star-row button {
        color: rgba(47, 38, 28, 0.48);
        font-size: 2rem;
        line-height: 1;
        text-shadow: none;
      }

      .star-row button.lit {
        color: #b9832e;
        text-shadow: 0 0 10px rgba(214, 168, 95, 0.5);
      }

      .archive-coming-soon {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 28px;
        align-items: center;
        border: 1px solid rgba(214, 168, 95, 0.24);
        border-radius: 22px;
        background:
          radial-gradient(circle at 20% 10%, rgba(47, 111, 179, 0.18), transparent 20rem),
          rgba(5, 9, 18, 0.72);
        margin-top: 22px;
        padding: 32px;
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.34);
      }

      .archive-coming-soon img {
        height: 280px;
        width: 220px;
        object-fit: contain;
      }

      .archive-coming-soon p {
        color: #d6a85f;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .archive-coming-soon h2 {
        color: #f4ead2;
        font-size: clamp(2rem, 4vw, 4rem);
      }

      .archive-coming-soon span {
        color: rgba(232, 211, 165, 0.78);
        font-size: 1.1rem;
      }

      .dream-prompt-panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid rgba(214, 168, 95, 0.22);
        border-radius: 18px;
        background: rgba(5, 9, 18, 0.72);
        margin-top: 16px;
        padding: 16px 18px;
      }

      .dream-prompt-panel span {
        color: #d6a85f;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .dream-prompt-panel p {
        color: #f4ead2;
        font-size: 1.2rem;
        font-style: italic;
      }

      .wax-actions {
        display: flex;
        justify-content: center;
        gap: 18px;
        flex-wrap: wrap;
        margin-top: 18px;
      }

      .wax-button {
        display: grid;
        gap: 5px;
        justify-items: center;
        color: #e8d3a5;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition: transform 200ms, filter 200ms;
      }

      .wax-button img {
        width: 72px;
        height: 72px;
        object-fit: contain;
      }

      .wax-button:hover {
        transform: translateY(-3px) scale(1.04);
        filter: drop-shadow(0 0 16px rgba(47, 111, 179, 0.5));
      }

      .archive-alert {
        margin-top: 16px;
        border-radius: 12px;
        padding: 12px 14px;
      }

      .archive-error {
        border: 1px solid rgba(248, 113, 113, 0.34);
        background: rgba(127, 29, 29, 0.18);
        color: #fecaca;
      }

      .archive-message {
        border: 1px solid rgba(214, 168, 95, 0.34);
        background: rgba(214, 168, 95, 0.12);
        color: #f4ead2;
      }

      @media (max-width: 1100px) {
        .archive-hero-grid,
        .archive-workspace,
        .chronicles-shell {
          grid-template-columns: 1fr;
        }

        .archive-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px 14px;
        }

        .archive-stats h2,
        .archive-current-section {
          grid-column: 1 / -1;
        }

        .open-book-editor {
          grid-template-columns: 1fr;
          background-image: linear-gradient(rgba(232, 211, 165, 0.9), rgba(232, 211, 165, 0.82)), url("/images/Parchment Paper Texture.png");
          background-size: cover;
          min-height: 0;
          padding: 32px;
        }

        .chronicle-book {
          grid-template-columns: 1fr;
          background-image: linear-gradient(rgba(232, 211, 165, 0.92), rgba(216, 188, 127, 0.84)), url("/images/Parchment Paper Texture.png");
          background-size: cover;
          min-height: 0;
          padding: 32px;
        }

        .chronicle-list {
          max-height: 420px;
        }

        .dream-title-input,
        .dream-title-input.long,
        .dream-title-input.very-long {
          transform: none;
          width: 100%;
        }

        .dream-textarea {
          height: 430px;
          font-size: 21px;
          transform: none;
          width: 100%;
        }
      }

      @media (max-width: 760px) {
        .archive-sidebar {
          position: sticky;
          top: 0;
          width: auto;
          border-right: 0;
          border-bottom: 1px solid rgba(214, 168, 95, 0.24);
          padding: 10px;
        }

        .archive-brand {
          display: none;
        }

        .archive-icon-rail {
          margin-top: 0;
          display: flex;
          overflow-x: auto;
        }

        .archive-main {
          margin-left: 0;
          padding: 16px 14px 40px;
        }

        .archive-banner {
          min-height: 220px;
        }

        .archive-stats {
          grid-template-columns: 1fr 1fr;
        }

        .book-row.two {
          grid-template-columns: 1fr;
        }

        .open-book-editor {
          min-height: 0;
          padding: 28px 18px;
        }

        .chronicle-book {
          padding: 24px 18px;
        }

        .chronicle-ledger-grid {
          grid-template-columns: 1fr;
        }

        .chronicle-page-heading {
          display: grid;
          min-height: 132px;
          padding-right: 0;
        }

        .chronicle-stamp {
          position: static;
          margin-top: 12px;
          max-width: 160px;
        }

        .chronicle-reflection-grid {
          grid-template-columns: 1fr;
        }

        .dream-title-input,
        .dream-title-input.long,
        .dream-title-input.very-long {
          font-size: clamp(24px, 8vw, 34px);
          transform: none;
          width: 100%;
        }

        .dream-textarea {
          height: 380px;
          font-size: 19px;
          padding: 16px 24px 58px;
        }

        .archive-coming-soon {
          grid-template-columns: 1fr;
          text-align: center;
        }

        .archive-coming-soon img {
          margin: 0 auto;
        }

        .dream-prompt-panel {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `}</style>
  );
}
