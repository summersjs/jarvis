"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Caveat, Cinzel, Cormorant_Garamond, Inter } from "next/font/google";
import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "600", "700"] });
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
  const [form, setForm] = useState<DreamForm>(() => emptyForm(prompt));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const section = normalizeSection(searchParams.get("section"));

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
        <div className="archive-hero-grid">
          <ArchiveBanner />
          <ArchiveStatsPanel dreams={dreams} activeSection={section} />
        </div>

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
        .archive-workspace {
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
