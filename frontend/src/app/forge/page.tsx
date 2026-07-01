"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Archive,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Compass,
  Cpu,
  Feather,
  FileUp,
  FolderKanban,
  Gamepad2,
  Hammer,
  Lightbulb,
  Map,
  PackageOpen,
  Plus,
  ScrollText,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type ForgeCategory = "Games" | "Jarvis" | "Business" | "Hardware" | "Writing" | "Life";
type ForgeStatus = "Active" | "Building" | "Experiment" | "Incubating" | "Archived" | "Completed";
type ModalType = "project" | "spark" | "note" | "file" | "roadmap" | "templates" | null;

type ForgeProject = {
  id: string;
  title: string;
  category: ForgeCategory;
  status: ForgeStatus;
  summary?: string | null;
  tags?: string[] | null;
  next_milestone?: string | null;
  progress_percent?: number | null;
  project_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ForgeDashboard = {
  status: string;
  projects: ForgeProject[];
  sparks: unknown[];
  notes: unknown[];
  files: unknown[];
  category_counts: Record<ForgeCategory, number>;
  recently_updated: ForgeProject[];
  incubating: ForgeProject[];
  stats: {
    active_projects: number;
    building: number;
    incubating: number;
    archived: number;
    recently_updated: number;
  };
};

type FormState = {
  title: string;
  category: ForgeCategory;
  status: ForgeStatus;
  summary: string;
  tags: string;
  next_milestone: string;
  progress_percent: string;
  project_type: string;
  spark_text: string;
  note_title: string;
  note_body: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  caption: string;
};

const FORGE_CATEGORIES: Array<{
  name: ForgeCategory;
  Icon: LucideIcon;
  image: string;
  accent: string;
  description: string;
}> = [
  { name: "Games", Icon: Gamepad2, image: "/images/Forge/cleaned/forge-icon-games.png", accent: "#f0a44d", description: "Video games, board games, mechanics, worlds, and interactive ideas." },
  { name: "Jarvis", Icon: Bot, image: "/images/Forge/cleaned/forge-icon-jarvis.png", accent: "#8fdc7c", description: "Systems, modules, improvements, and the Jarvis roadmap." },
  { name: "Business", Icon: BriefcaseBusiness, image: "/images/Forge/cleaned/forge-icon-business.png", accent: "#d4ad65", description: "Courses, content, merch, income ideas, and experiments." },
  { name: "Hardware", Icon: Cpu, image: "/images/Forge/cleaned/forge-icon-hardware.png", accent: "#62b7c8", description: "Devices, setups, labs, servers, networking, and physical builds." },
  { name: "Writing", Icon: Feather, image: "/images/Forge/cleaned/forge-icon-writing.png", accent: "#b58cff", description: "Stories, scripts, characters, worlds, and written concepts." },
  { name: "Life", Icon: Compass, image: "/images/Forge/cleaned/forge-icon-life.png", accent: "#9dbb63", description: "Life systems, personal growth, relationships, and future plans." },
];

const FORGE_STATUSES: ForgeStatus[] = ["Active", "Building", "Experiment", "Incubating", "Archived", "Completed"];

const SPARKS = [
  { text: "Where ideas become reality.", author: "J.S." },
  { text: "What if every decision we make today is a blueprint for the world we build tomorrow?", author: "J.S." },
  { text: "A rough idea is still metal. Put it in the fire.", author: "J.S." },
  { text: "Do not judge the spark before it becomes flame.", author: "J.S." },
  { text: "The first version is not the masterpiece. It is the anvil.", author: "J.S." },
  { text: "Finish what you started, or return it to the shelf with honor.", author: "J.S." },
  { text: "A project is just a promise with a workspace.", author: "J.S." },
  { text: "Some ideas are not dead. They are incubating.", author: "J.S." },
  { text: "Build the room your future self needs.", author: "J.S." },
  { text: "Every system began as a sentence.", author: "J.S." },
  { text: "Sparks do not ask for permission.", author: "J.S." },
  { text: "The Forge remembers what your busy life forgot.", author: "J.S." },
  { text: "A bad draft is proof the engine started.", author: "J.S." },
  { text: "Do not wait for clarity. Build toward it.", author: "J.S." },
  { text: "Momentum is manufactured here.", author: "J.S." },
  { text: "The idea does not need to be perfect. It needs a place to survive.", author: "J.S." },
  { text: "Make the future jealous of the blueprint.", author: "J.S." },
  { text: "If it keeps returning to your mind, give it a workbench.", author: "J.S." },
  { text: "The shelf is not a graveyard. It is a waiting room.", author: "J.S." },
  { text: "You are not collecting ideas. You are assembling futures.", author: "J.S." },
  { text: "Small sparks become systems when they are protected.", author: "J.S." },
  { text: "Every unfinished project is asking for a next action.", author: "J.S." },
  { text: "The blueprint does not shame the builder. It guides him.", author: "J.S." },
  { text: "A dream in the Archive becomes a project in the Forge.", author: "J.S." },
  { text: "Your future is not found. It is fabricated.", author: "J.S." },
  { text: "When the idea is too big, start with the smallest part you can hold.", author: "J.S." },
  { text: "The Forge does not ask, 'Is this possible?' It asks, 'What is the first piece?'", author: "J.S." },
  { text: "Do not confuse incubation with failure.", author: "J.S." },
  { text: "Build badly. Refine honestly. Ship eventually.", author: "J.S." },
  { text: "The future enters as a spark and leaves as a system.", author: "J.S." },
];

const emptyDashboard: ForgeDashboard = {
  status: "ok",
  projects: [],
  sparks: [],
  notes: [],
  files: [],
  category_counts: { Games: 0, Jarvis: 0, Business: 0, Hardware: 0, Writing: 0, Life: 0 },
  recently_updated: [],
  incubating: [],
  stats: { active_projects: 0, building: 0, incubating: 0, archived: 0, recently_updated: 0 },
};

const emptyForm: FormState = {
  title: "",
  category: "Jarvis",
  status: "Active",
  summary: "",
  tags: "",
  next_milestone: "",
  progress_percent: "",
  project_type: "",
  spark_text: "",
  note_title: "",
  note_body: "",
  project_id: "",
  file_name: "",
  file_type: "",
  file_size: "",
  caption: "",
};

export default function ForgePage() {
  const [dashboard, setDashboard] = useState<ForgeDashboard>(emptyDashboard);
  const [selectedCategory, setSelectedCategory] = useState<ForgeCategory | "All">("All");
  const [selectedProject, setSelectedProject] = useState<ForgeProject | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [setupNotice, setSetupNotice] = useState("");

  const spark = useMemo(() => {
    const day = Math.floor(new Date().setHours(0, 0, 0, 0) / 86_400_000);
    return SPARKS[day % SPARKS.length];
  }, []);

  const filteredProjects = useMemo(() => {
    if (selectedCategory === "All") return dashboard.projects;
    return dashboard.projects.filter((project) => project.category === selectedCategory);
  }, [dashboard.projects, selectedCategory]);

  useEffect(() => {
    loadForge();
  }, []);

  async function loadForge() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/forge?user_id=${USER_ID}`, { headers: { "x-api-key": API_KEY } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Forge tables are not online yet.");
      setDashboard({ ...emptyDashboard, ...data });
      setSetupNotice("");
    } catch (err) {
      setDashboard(emptyDashboard);
      setSetupNotice("Forge data tables are not online yet. Run backend/data/20260701_forge.sql in Supabase to enable persistence.");
      setError(err instanceof Error ? err.message : "Forge data is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function openModal(nextModal: ModalType) {
    setMessage("");
    setError("");
    setForm(emptyForm);
    setModal(nextModal);
  }

  async function saveModal() {
    if (!modal || modal === "roadmap" || modal === "templates") {
      setModal(null);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const endpoint = modal === "project" ? "projects" : modal === "spark" ? "sparks" : modal === "note" ? "notes" : "files";
      const payload = buildPayload(modal, form);
      const res = await fetch(`${API_BASE}/forge/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Forge save failed.");
      setMessage(modal === "project" ? "Project placed on the bench." : modal === "spark" ? "Spark captured." : modal === "note" ? "Note stored." : "File metadata attached.");
      setModal(null);
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forge save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="forge-shell">
      <div className="forge-bg" aria-hidden="true" />
      <div className="forge-vignette" aria-hidden="true" />
      <ForgeNav />
      <section className="forge-main">
        <ForgeHero stats={dashboard.stats} />

        {setupNotice && <div className="forge-alert">{setupNotice}</div>}
        {error && !setupNotice && <div className="forge-alert danger">{error}</div>}
        {message && <div className="forge-alert success">{message}</div>}
        {loading && <div className="forge-alert">Igniting Forge systems...</div>}

        <SectionFrame title="Project Categories" action={selectedCategory !== "All" ? <button onClick={() => setSelectedCategory("All")}>Clear Filter</button> : null}>
          <div className="forge-category-grid">
            {FORGE_CATEGORIES.map((category) => (
              <CategoryFolder
                key={category.name}
                category={category}
                active={selectedCategory === category.name}
                count={dashboard.category_counts?.[category.name] || 0}
                onClick={() => setSelectedCategory(category.name)}
              />
            ))}
          </div>
        </SectionFrame>

        {selectedCategory !== "All" && (
          <section className="forge-filter-panel">
            <div>
              <p>Selected Folder</p>
              <h2>{selectedCategory}</h2>
              <span>{filteredProjects.length ? `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"} on this bench.` : "No projects on this bench yet."}</span>
            </div>
            <button onClick={() => openModal("project")}>New {selectedCategory} Project</button>
          </section>
        )}

        <section className="forge-work-grid">
          <RecentlyUpdated projects={dashboard.recently_updated} onSelect={setSelectedProject} />
          <IncubationShelf projects={dashboard.incubating} onSelect={setSelectedProject} />
          <SparkOfDay spark={spark} />
        </section>

        <ProjectDesk project={selectedProject} onClose={() => setSelectedProject(null)} />
        <BottomActions onOpen={openModal} />
      </section>
      <ForgeModal
        modal={modal}
        form={form}
        projects={dashboard.projects}
        saving={saving}
        onClose={() => setModal(null)}
        onSave={saveModal}
        onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
      />
      <ForgeStyles />
    </main>
  );
}

function ForgeNav() {
  const pathname = usePathname();
  const items = [
    { label: "Command Center", href: "/", Icon: Boxes },
    { label: "The Archive", href: "/archive", Icon: Archive },
    { label: "The Forge", href: "/forge", Icon: Hammer },
    { label: "Health Ops", href: "/health-ops", Icon: Search },
    { label: "Food Vault", href: "/food-vault", Icon: PackageOpen },
    { label: "Meal Planner", href: "/meal-planner", Icon: ScrollText },
    { label: "Workout", href: "/workouts", Icon: CheckCircle2 },
    { label: "Goals", href: "/goals", Icon: FolderKanban },
  ];

  return (
    <aside className="forge-nav">
      <div className="forge-mark">
        <Hammer size={22} />
        <span>Jarvis Systems</span>
      </div>
      <nav>
        {items.map(({ label, href, Icon }) => (
          <Link key={label} href={href} className={pathname === href ? "active" : ""}>
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function ForgeHero({ stats }: { stats: ForgeDashboard["stats"] }) {
  return (
    <header className="forge-hero">
      <Image src="/images/Forge/forge-hero-workshop.png" alt="" fill priority sizes="(max-width: 820px) 100vw, calc(100vw - 190px)" className="forge-hero-image" />
      <div className="forge-hero-overlay" />
      <div className="forge-hero-copy">
        <h1>The Forge</h1>
        <em>Where ideas become reality.</em>
        <p>Creation Wing Online <span /></p>
        <strong>A workshop for projects, inventions, stories, systems, and sparks of inspiration.</strong>
      </div>
      <div className="forge-plaque" aria-hidden="true">
        <Image src="/images/Forge/new_forge_plaque.png" alt="" fill sizes="280px" className="forge-plaque-image" />
      </div>
      <div className="forge-stat-strip">
        <Stat label="Active Projects" value={stats.active_projects} Icon={FolderKanban} />
        <Stat label="Building" value={stats.building} Icon={Hammer} tone="orange" />
        <Stat label="Incubating" value={stats.incubating} Icon={Lightbulb} tone="green" />
        <Stat label="Archived" value={stats.archived} Icon={Archive} tone="muted" />
        <Stat label="Recently Updated" value={stats.recently_updated} Icon={Clock3} tone="blue" />
      </div>
    </header>
  );
}

function Stat({ label, value, Icon, tone = "green" }: { label: string; value: number; Icon: LucideIcon; tone?: string }) {
  return (
    <article className={`forge-stat ${tone}`}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <Icon size={24} />
      </div>
    </article>
  );
}

function SectionFrame({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="forge-section">
      <div className="forge-section-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CategoryFolder({
  category,
  count,
  active,
  onClick,
}: {
  category: (typeof FORGE_CATEGORIES)[number];
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = category.Icon;
  const shellSrc = active ? "/images/Forge/cleaned/forge-folder-shell-active.png" : "/images/Forge/cleaned/forge-folder-shell.png";
  return (
    <button
      type="button"
      className={`forge-folder ${active ? "active" : ""}`}
      style={{ "--category-accent": category.accent } as CSSProperties}
      onClick={onClick}
    >
      <Image src={shellSrc} alt="" fill sizes="(max-width: 820px) 100vw, (max-width: 1280px) 33vw, 16vw" className="forge-folder-shell" />
      <span className="forge-folder-shade" aria-hidden="true" />
      <span className="forge-folder-tab" aria-hidden="true" />
      <span className="forge-folder-heading">
        <span className="forge-folder-icon">
          <ForgeAssetImage
            src={category.image}
            alt={`${category.name} icon`}
            width={38}
            height={38}
            className="forge-category-asset"
            fallback={<Icon size={29} strokeWidth={1.65} />}
          />
        </span>
        <span>
          <strong>{category.name}</strong>
          <em>{count} project{count === 1 ? "" : "s"}</em>
        </span>
      </span>
      <p>{category.description}</p>
    </button>
  );
}

function RecentlyUpdated({ projects, onSelect }: { projects: ForgeProject[]; onSelect: (project: ForgeProject) => void }) {
  return (
    <Panel title="Recently Updated" className="recent-panel">
      {projects.length === 0 ? (
        <EmptyState title="No projects updated yet." text="Create your first project to begin building." />
      ) : (
        <div className="forge-project-list">
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => onSelect(project)} className="forge-project-row">
              <CategoryMiniIcon category={project.category} />
              <span>
                <strong>{project.title}</strong>
                <small>{project.category}</small>
              </span>
              <StatusBadge status={project.status} />
              <ProgressLine value={project.progress_percent} />
              <time>{relativeDate(project.updated_at)}</time>
            </button>
          ))}
        </div>
      )}
      <button className="forge-text-link">View all projects →</button>
    </Panel>
  );
}

function IncubationShelf({ projects, onSelect }: { projects: ForgeProject[]; onSelect: (project: ForgeProject) => void }) {
  return (
    <Panel title="Incubation Shelf" className="incubation-panel">
      {projects.length === 0 ? (
        <div className="incubation-empty">
          <span className="forge-incubation-folder">
            <ForgeAssetImage
              src="/images/Forge/cleaned/forge-incubation-folder-small.png"
              alt=""
              width={86}
              height={62}
              fallback={<FolderKanban size={36} />}
            />
          </span>
          <EmptyState title="No ideas are incubating yet." text="Shelve an idea when it still matters, but it is not time yet." />
        </div>
      ) : (
        <div className="incubation-list">
          {projects.map((project) => (
            <button key={project.id} type="button" onClick={() => onSelect(project)}>
              <span className="forge-incubation-folder small">
                <ForgeAssetImage
                  src="/images/Forge/cleaned/forge-incubation-folder-small.png"
                  alt=""
                  width={64}
                  height={46}
                  fallback={<FolderKanban size={28} />}
                />
              </span>
              <span>
                <strong>{project.title}</strong>
                <small>{project.category} · {relativeDate(project.updated_at || project.created_at)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <span className="forge-sticky" aria-hidden="true">
        <ForgeAssetImage
          src="/images/Forge/cleaned/forge-sticky-finish.png"
          alt=""
          width={132}
          height={132}
          fallback={<span className="forge-sticky-fallback">Finish what you started.</span>}
        />
      </span>
      <button className="forge-text-link">View incubation shelf →</button>
    </Panel>
  );
}

function SparkOfDay({ spark }: { spark: { text: string; author: string } }) {
  return (
    <Panel title="Spark of the Day" className="spark-panel">
      <div className="spark-note">
        <span className="spark-bulb">
          <ForgeAssetImage
            src="/images/Forge/cleaned/forge-spark-lightbulb.png"
            alt=""
            width={58}
            height={58}
            fallback={<Lightbulb size={42} />}
          />
        </span>
        <blockquote>“{spark.text}”</blockquote>
        <cite>— {spark.author}</cite>
      </div>
    </Panel>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`forge-panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="forge-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function BottomActions({ onOpen }: { onOpen: (modal: ModalType) => void }) {
  const actions: Array<{ label: string; subtitle: string; modal: ModalType; Icon: LucideIcon }> = [
    { label: "New Project", subtitle: "Start something new", modal: "project", Icon: Plus },
    { label: "New Spark", subtitle: "Capture an idea", modal: "spark", Icon: Sparkles },
    { label: "New Note", subtitle: "Write something down", modal: "note", Icon: ScrollText },
    { label: "Upload File", subtitle: "Attach a file to a project", modal: "file", Icon: FileUp },
    { label: "View Roadmap", subtitle: "See the big picture", modal: "roadmap", Icon: Map },
    { label: "Browse Templates", subtitle: "Use a project template", modal: "templates", Icon: FolderKanban },
  ];

  return (
    <section className="forge-action-bar">
      {actions.map(({ label, subtitle, modal, Icon }) => (
        <button key={label} type="button" onClick={() => onOpen(modal)}>
          <Icon size={24} />
          <span>
            <strong>{label}</strong>
            <small>{subtitle}</small>
          </span>
        </button>
      ))}
    </section>
  );
}

function ForgeModal({
  modal,
  form,
  projects,
  saving,
  onClose,
  onSave,
  onChange,
}: {
  modal: ModalType;
  form: FormState;
  projects: ForgeProject[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (key: keyof FormState, value: string) => void;
}) {
  if (!modal) return null;
  const title = modal === "project" ? "New Project" : modal === "spark" ? "New Spark" : modal === "note" ? "New Note" : modal === "file" ? "Upload File" : modal === "roadmap" ? "Roadmap" : "Templates";

  return (
    <div className="forge-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="forge-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>Forge Capture</p>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Forge modal"><X size={20} /></button>
        </header>

        {modal === "roadmap" || modal === "templates" ? (
          <EmptyState
            title={modal === "roadmap" ? "Roadmap coming soon." : "Templates coming soon."}
            text={modal === "roadmap" ? "The big-picture planning board will connect projects, milestones, and priorities." : "Project templates will become reusable starting points for recurring build types."}
          />
        ) : modal === "project" ? (
          <div className="forge-form-grid">
            <ForgeInput label="Project Title" value={form.title} onChange={(value) => onChange("title", value)} required />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ForgeSelect label="Status" value={form.status} options={FORGE_STATUSES} onChange={(value) => onChange("status", value)} />
            <ForgeInput label="Progress %" value={form.progress_percent} onChange={(value) => onChange("progress_percent", value)} type="number" />
            <ForgeInput label="Project Type / Template" value={form.project_type} onChange={(value) => onChange("project_type", value)} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
            <ForgeTextarea label="Summary" value={form.summary} onChange={(value) => onChange("summary", value)} />
            <ForgeInput label="Next Milestone" value={form.next_milestone} onChange={(value) => onChange("next_milestone", value)} />
          </div>
        ) : modal === "spark" ? (
          <div className="forge-form-grid">
            <ForgeTextarea label="Spark Text" value={form.spark_text} onChange={(value) => onChange("spark_text", value)} required />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onChange("project_id", value)} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
          </div>
        ) : modal === "note" ? (
          <div className="forge-form-grid">
            <ForgeInput label="Note Title" value={form.note_title} onChange={(value) => onChange("note_title", value)} required />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onChange("project_id", value)} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
            <ForgeTextarea label="Body" value={form.note_body} onChange={(value) => onChange("note_body", value)} />
          </div>
        ) : (
          <div className="forge-form-grid">
            <label className="forge-input">
              <span>File</span>
              <input
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  onChange("file_name", file.name);
                  onChange("file_type", file.type);
                  onChange("file_size", String(file.size));
                }}
              />
            </label>
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onChange("project_id", value)} />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
            <ForgeTextarea label="Caption / Note" value={form.caption} onChange={(value) => onChange("caption", value)} />
          </div>
        )}

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : modal === "roadmap" || modal === "templates" ? "Close" : "Save"}</button>
        </footer>
      </section>
    </div>
  );
}

function ForgeInput({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="forge-input">
      <span>{label}{required ? " *" : ""}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} placeholder={placeholder} />
    </label>
  );
}

function ForgeTextarea({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="forge-input wide">
      <span>{label}{required ? " *" : ""}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ForgeSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="forge-input">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ProjectSelect({ projects, value, onChange }: { projects: ForgeProject[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="forge-input">
      <span>Linked Project</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Unassigned Forge Inbox</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select>
    </label>
  );
}

function ProjectDesk({ project, onClose }: { project: ForgeProject | null; onClose: () => void }) {
  if (!project) return null;
  return (
    <section className="forge-desk">
      <button type="button" onClick={onClose} aria-label="Close Project Desk"><X size={18} /></button>
      <div>
        <p>Project Desk</p>
        <h2>{project.title}</h2>
        <span>{project.category} · {project.status}</span>
        <p>{project.summary || "No summary recorded yet."}</p>
      </div>
      <ProgressLine value={project.progress_percent} large />
      <div className="forge-desk-tabs">
        {["Overview", "Tasks", "Spark Log", "Timeline", "Research", "Notes", "Files", "Images"].map((tab) => <span key={tab}>{tab}</span>)}
      </div>
      <strong>Next Milestone: {project.next_milestone || "Not assigned"}</strong>
    </section>
  );
}

function CategoryMiniIcon({ category }: { category: ForgeCategory }) {
  const item = FORGE_CATEGORIES.find((categoryItem) => categoryItem.name === category);
  const Icon = item?.Icon || Hammer;
  return (
    <span className="forge-mini-icon" style={{ "--category-accent": item?.accent || "#f0a44d" } as CSSProperties}>
      {item ? (
        <ForgeAssetImage src={item.image} alt="" width={30} height={30} fallback={<Icon size={25} strokeWidth={1.7} />} />
      ) : (
        <Icon size={25} strokeWidth={1.7} />
      )}
    </span>
  );
}

function ForgeAssetImage({
  src,
  alt,
  width,
  height,
  className = "",
  fallback,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <Image src={src} alt={alt} width={width} height={height} className={className} onError={() => setFailed(true)} />;
}

function StatusBadge({ status }: { status: ForgeStatus }) {
  return <b className={`forge-status ${status.toLowerCase()}`}>{status}</b>;
}

function ProgressLine({ value, large = false }: { value?: number | null; large?: boolean }) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <span className={`forge-progress ${large ? "large" : ""}`} aria-label={`Progress ${safeValue}%`}>
      <i style={{ width: `${safeValue}%` }} />
      <em>{safeValue}%</em>
    </span>
  );
}

function buildPayload(modal: Exclude<ModalType, null>, form: FormState) {
  const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (modal === "project") {
    return {
      user_id: USER_ID,
      title: form.title,
      category: form.category,
      status: form.status,
      summary: form.summary || null,
      tags,
      next_milestone: form.next_milestone || null,
      progress_percent: form.progress_percent ? Number(form.progress_percent) : 0,
      project_type: form.project_type || null,
    };
  }
  if (modal === "spark") {
    return {
      user_id: USER_ID,
      spark_text: form.spark_text,
      category: form.category || null,
      project_id: form.project_id || null,
      tags,
    };
  }
  if (modal === "note") {
    return {
      user_id: USER_ID,
      title: form.note_title,
      body: form.note_body || null,
      category: form.category || null,
      project_id: form.project_id || null,
      tags,
    };
  }
  return {
    user_id: USER_ID,
    file_name: form.file_name || "Unassigned Forge File",
    file_type: form.file_type || null,
    file_size: form.file_size ? Number(form.file_size) : null,
    caption: form.caption || null,
    category: form.category || null,
    project_id: form.project_id || null,
    tags,
    metadata: { upload_status: "metadata_only_v1" },
  };
}

function relativeDate(value?: string | null) {
  if (!value) return "Pending";
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(diff / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ForgeStyles() {
  return (
    <style jsx global>{`
      @font-face {
        font-family: "Iron And Brine Hero";
        src: url("/fonts/iron-and-brine/Iron & Brine.ttf") format("truetype");
        font-display: swap;
      }

      .forge-shell {
        --forge-bg: #030404;
        --forge-panel: rgba(6, 8, 7, 0.88);
        --forge-copper: #c46f2d;
        --forge-brass: #d4ad65;
        --forge-green: #8fdc7c;
        --forge-blue: #4eb5c7;
        min-height: 100vh;
        background:
          radial-gradient(circle at 72% 10%, rgba(196, 111, 45, 0.2), transparent 30rem),
          radial-gradient(circle at 20% 30%, rgba(78, 181, 199, 0.08), transparent 24rem),
          #030404;
        color: #eadfc7;
        overflow-x: hidden;
        position: relative;
      }

      .forge-bg,
      .forge-vignette {
        pointer-events: none;
        position: fixed;
        inset: 0;
      }

      .forge-bg {
        background:
          linear-gradient(180deg, rgba(3, 4, 4, 0.58), rgba(3, 4, 4, 0.76)),
          url("/images/Forge/forge-bg-texture.png") center / cover no-repeat;
        opacity: 0.64;
      }

      .forge-vignette {
        background:
          radial-gradient(circle at 50% 20%, transparent 0 24rem, rgba(0, 0, 0, 0.42) 46rem),
          url("/images/Forge/forge-vignette-overlay.png") center / cover no-repeat;
        mix-blend-mode: multiply;
        opacity: 0.28;
      }

      .forge-nav {
        background: linear-gradient(180deg, rgba(6, 9, 8, 0.98), rgba(3, 5, 5, 0.98));
        border-right: 1px solid rgba(212, 173, 101, 0.18);
        bottom: 0;
        box-shadow: 18px 0 60px rgba(0, 0, 0, 0.44);
        left: 0;
        padding: 22px 14px;
        position: fixed;
        top: 0;
        width: 190px;
        z-index: 5;
      }

      .forge-mark {
        align-items: center;
        color: #f4d38f;
        display: flex;
        gap: 10px;
        font-size: 0.88rem;
        font-weight: 700;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .forge-nav nav {
        display: grid;
        gap: 9px;
        margin-top: 34px;
      }

      .forge-nav a {
        align-items: center;
        border: 1px solid transparent;
        border-radius: 8px;
        color: rgba(234, 223, 199, 0.68);
        display: flex;
        gap: 11px;
        letter-spacing: 0.09em;
        padding: 12px 10px;
        text-decoration: none;
        text-transform: uppercase;
        transition: transform 180ms, border-color 180ms, color 180ms, background 180ms, box-shadow 180ms;
      }

      .forge-nav a:hover,
      .forge-nav a.active {
        background: rgba(196, 111, 45, 0.14);
        border-color: rgba(196, 111, 45, 0.62);
        box-shadow: inset 0 0 18px rgba(196, 111, 45, 0.12), 0 0 24px rgba(196, 111, 45, 0.18);
        color: #ffc46c;
        transform: translateX(2px);
      }

      .forge-main {
        margin-left: 190px;
        padding: 28px 28px 40px;
        position: relative;
        z-index: 1;
      }

      .forge-hero {
        border: 1px solid rgba(212, 173, 101, 0.22);
        border-radius: 12px;
        min-height: 395px;
        overflow: hidden;
        position: relative;
        box-shadow:
          inset 0 -90px 70px rgba(3, 4, 4, 0.72),
          0 28px 80px rgba(0, 0, 0, 0.56),
          0 0 38px rgba(196, 111, 45, 0.12);
      }

      .forge-hero-image {
        object-fit: cover;
      }

      .forge-hero-overlay {
        background:
          linear-gradient(90deg, rgba(3, 4, 4, 0.92), rgba(3, 4, 4, 0.42) 45%, rgba(3, 4, 4, 0.2)),
          linear-gradient(180deg, rgba(0, 0, 0, 0.22), transparent 38%, rgba(0, 0, 0, 0.48)),
          radial-gradient(circle at 72% 66%, rgba(196, 111, 45, 0.24), transparent 24rem);
        position: absolute;
        inset: 0;
      }

      .forge-hero-copy {
        left: clamp(24px, 3vw, 48px);
        max-width: 500px;
        position: absolute;
        top: 72px;
      }

      .forge-hero-copy h1 {
        color: #f1d8a3;
        font-family: "Iron And Brine Hero", Georgia, serif;
        font-size: clamp(3.25rem, 5.55vw, 6.15rem);
        font-weight: 400;
        letter-spacing: 0.01em;
        line-height: 0.96;
        text-shadow: 0 4px 0 rgba(58, 31, 15, 0.82), 0 0 24px rgba(212, 173, 101, 0.28);
        text-transform: uppercase;
      }

      .forge-hero-copy em {
        color: #f0a44d;
        display: block;
        font-family: Georgia, serif;
        font-size: clamp(1.15rem, 1.7vw, 1.65rem);
        margin-top: 12px;
      }

      .forge-hero-copy p {
        color: #a8ff9d;
        font-weight: 700;
        letter-spacing: 0.18em;
        margin-top: 16px;
        text-transform: uppercase;
      }

      .forge-hero-copy p span {
        background: #8fdc7c;
        border-radius: 999px;
        display: inline-block;
        height: 7px;
        margin-left: 8px;
        width: 7px;
      }

      .forge-hero-copy strong {
        color: rgba(234, 223, 199, 0.92);
        display: block;
        font-size: 1rem;
        font-weight: 500;
        line-height: 1.45;
        margin-top: 8px;
        max-width: 460px;
      }

      .forge-plaque {
        filter: drop-shadow(0 14px 24px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 20px rgba(196, 111, 45, 0.18));
        height: 94px;
        left: 55.8%;
        position: absolute;
        top: 14px;
        transform: translateX(-50%);
        width: min(306px, 22vw);
        z-index: 2;
      }

      .forge-plaque-image {
        object-fit: contain;
      }

      .forge-stat-strip {
        display: grid;
        gap: 0;
        grid-template-columns: repeat(5, minmax(92px, 1fr));
        bottom: auto;
        position: absolute;
        right: 16px;
        top: 22px;
        width: min(560px, 44vw);
      }

      .forge-stat {
        border: 1px solid rgba(212, 173, 101, 0.2);
        background: rgba(5, 7, 6, 0.7);
        min-height: 70px;
        padding: 10px 12px;
      }

      .forge-stat span {
        color: rgba(234, 223, 199, 0.58);
        display: block;
        font-size: 0.64rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-stat div {
        align-items: center;
        color: var(--forge-green);
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .forge-stat svg {
        height: 20px;
        width: 20px;
      }

      .forge-stat strong {
        font-size: 1.55rem;
      }

      .forge-stat.orange div { color: #ff8a34; }
      .forge-stat.blue div { color: var(--forge-blue); }
      .forge-stat.muted div { color: #a99d86; }

      .forge-alert {
        border: 1px solid rgba(212, 173, 101, 0.34);
        border-radius: 10px;
        background: rgba(18, 14, 8, 0.78);
        color: #f4d38f;
        margin-top: 16px;
        padding: 12px 14px;
      }

      .forge-alert.danger { border-color: rgba(255, 85, 85, 0.35); color: #ffb0a8; }
      .forge-alert.success { border-color: rgba(143, 220, 124, 0.35); color: #caffbf; }

      .forge-section,
      .forge-panel,
      .forge-filter-panel,
      .forge-desk,
      .forge-action-bar {
        border: 1px solid rgba(212, 173, 101, 0.18);
        border-radius: 10px;
        background:
          linear-gradient(135deg, rgba(10, 13, 11, 0.92), rgba(3, 4, 4, 0.9)),
          radial-gradient(circle at 80% 0%, rgba(196, 111, 45, 0.08), transparent 16rem);
        box-shadow: inset 0 0 28px rgba(212, 173, 101, 0.04), 0 18px 48px rgba(0, 0, 0, 0.32);
      }

      .forge-section {
        margin-top: 18px;
        padding: 16px;
      }

      .forge-section-header {
        align-items: center;
        display: flex;
        justify-content: space-between;
      }

      .forge-section h2,
      .forge-panel h2 {
        color: #f4d38f;
        font-size: 1.02rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .forge-section-header button,
      .forge-filter-panel button,
      .forge-text-link,
      .forge-modal button {
        border: 1px solid rgba(143, 220, 124, 0.24);
        border-radius: 8px;
        background: rgba(143, 220, 124, 0.08);
        color: #9bea91;
        cursor: pointer;
        padding: 8px 12px;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms;
      }

      .forge-section-header button:hover,
      .forge-filter-panel button:hover,
      .forge-text-link:hover,
      .forge-modal button:hover {
        transform: translateY(-2px);
        border-color: rgba(143, 220, 124, 0.58);
        box-shadow: 0 0 22px rgba(143, 220, 124, 0.18);
      }

      .forge-category-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(6, minmax(150px, 1fr));
        margin-top: 14px;
      }

      .forge-folder {
        aspect-ratio: 1.44;
        border: 0;
        background: transparent;
        color: #eadfc7;
        cursor: pointer;
        display: grid;
        min-height: 180px;
        isolation: isolate;
        overflow: hidden;
        padding: 34px 16px 18px 32px;
        position: relative;
        text-align: left;
        transition: transform 180ms, filter 180ms;
      }

      .forge-folder:hover,
      .forge-folder.active {
        filter: drop-shadow(0 0 22px color-mix(in srgb, var(--category-accent) 32%, transparent));
        transform: translateY(-4px);
      }

      .forge-folder-shell {
        inset: 0;
        object-fit: fill;
        opacity: 0.92;
        z-index: -2;
      }

      .forge-folder.active .forge-folder-shell,
      .forge-folder:hover .forge-folder-shell {
        opacity: 1;
        filter: saturate(1.15) brightness(1.08);
      }

      .forge-folder-shade {
        background:
          linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.28)),
          radial-gradient(circle at 12% 22%, rgba(196, 111, 45, 0.16), transparent 52%);
        inset: 0;
        position: absolute;
        z-index: -1;
      }

      .forge-folder-tab {
        background:
          linear-gradient(90deg, color-mix(in srgb, var(--category-accent) 38%, transparent), rgba(212, 173, 101, 0.12));
        border: 1px solid color-mix(in srgb, var(--category-accent) 28%, transparent);
        border-bottom: 0;
        border-radius: 8px 8px 0 0;
        height: 15px;
        left: 42px;
        opacity: 0.58;
        position: absolute;
        top: 20px;
        width: 78px;
      }

      .forge-folder-heading {
        align-items: center;
        border-bottom: 1px solid rgba(212, 173, 101, 0.18);
        display: flex;
        gap: 10px;
        margin-left: 18px;
        padding-bottom: 8px;
      }

      .forge-folder-icon {
        align-items: center;
        color: var(--category-accent);
        display: inline-flex;
        flex: 0 0 auto;
        height: 40px;
        justify-content: center;
        width: 40px;
      }

      .forge-folder.active .forge-folder-icon,
      .forge-folder:hover .forge-folder-icon {
        color: var(--category-accent);
      }

      .forge-category-asset {
        filter: drop-shadow(0 0 8px color-mix(in srgb, var(--category-accent) 42%, transparent));
        height: 36px;
        object-fit: contain;
        width: 36px;
      }

      .forge-folder strong {
        color: var(--category-accent);
        display: block;
        font-size: 0.92rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .forge-folder em {
        color: color-mix(in srgb, var(--category-accent) 72%, #f4d38f);
        display: block;
        font-size: 0.7rem;
        font-style: normal;
        letter-spacing: 0.08em;
        margin-top: 2px;
        text-transform: uppercase;
      }

      .forge-folder p {
        color: rgba(234, 223, 199, 0.74);
        font-size: 0.72rem;
        line-height: 1.23;
        margin-left: 18px;
        margin-top: 9px;
        max-width: calc(100% - 20px);
      }

      .forge-filter-panel {
        align-items: center;
        display: flex;
        justify-content: space-between;
        margin-top: 14px;
        padding: 14px 16px;
      }

      .forge-filter-panel p,
      .forge-desk p:first-child {
        color: #f4d38f;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-filter-panel h2,
      .forge-desk h2 {
        color: #fff1c8;
        font-size: 1.6rem;
      }

      .forge-filter-panel span {
        color: rgba(234, 223, 199, 0.72);
      }

      .forge-work-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(280px, 1.1fr) minmax(280px, 1fr) minmax(280px, 1.1fr);
        margin-top: 16px;
      }

      .forge-panel {
        min-height: 318px;
        overflow: hidden;
        padding: 16px;
        position: relative;
        isolation: isolate;
      }

      .forge-panel > * {
        position: relative;
        z-index: 1;
      }

      .forge-empty {
        border: 1px dashed rgba(212, 173, 101, 0.28);
        border-radius: 10px;
        color: rgba(234, 223, 199, 0.74);
        display: grid;
        gap: 6px;
        margin-top: 16px;
        min-height: 150px;
        place-content: center;
        padding: 20px;
        text-align: center;
      }

      .forge-empty strong {
        color: #f4d38f;
        font-size: 1.1rem;
      }

      .forge-project-list,
      .incubation-list {
        display: grid;
        gap: 9px;
        margin-top: 14px;
      }

      .forge-project-row {
        align-items: center;
        border: 1px solid rgba(212, 173, 101, 0.13);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.22);
        color: #eadfc7;
        cursor: pointer;
        display: grid;
        gap: 10px;
        grid-template-columns: 42px 1fr auto 90px 58px;
        padding: 9px;
        text-align: left;
        transition: transform 180ms, border-color 180ms, background 180ms;
      }

      .forge-project-row:hover,
      .incubation-list button:hover {
        background: rgba(196, 111, 45, 0.1);
        border-color: rgba(196, 111, 45, 0.46);
        transform: translateY(-2px);
      }

      .forge-project-row strong,
      .incubation-list strong {
        color: #fff1c8;
        display: block;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .forge-mini-icon {
        align-items: center;
        color: var(--category-accent);
        display: inline-flex;
        filter: drop-shadow(0 0 8px color-mix(in srgb, var(--category-accent) 30%, transparent));
        height: 34px;
        justify-content: center;
        width: 34px;
      }

      .forge-mini-icon img {
        height: 30px;
        object-fit: contain;
        width: 30px;
      }

      .forge-project-row small,
      .incubation-list small,
      .forge-project-row time {
        color: rgba(234, 223, 199, 0.64);
      }

      .forge-status {
        border: 1px solid currentColor;
        border-radius: 999px;
        color: #8fdc7c;
        font-size: 0.72rem;
        letter-spacing: 0.1em;
        padding: 4px 8px;
        text-transform: uppercase;
      }

      .forge-status.building { color: #ff8a34; }
      .forge-status.experiment { color: #4eb5c7; }
      .forge-status.incubating { color: #f4c95d; }
      .forge-status.archived { color: #9d9687; }
      .forge-status.completed { color: #ffd87a; }

      .forge-progress {
        align-items: center;
        display: grid;
        gap: 4px;
        grid-template-columns: 1fr auto;
      }

      .forge-progress::before {
        content: "";
      }

      .forge-progress {
        position: relative;
      }

      .forge-progress i {
        background: linear-gradient(90deg, #f4d38f, #ff8a34);
        border-radius: 999px;
        display: block;
        height: 3px;
        left: 0;
        position: absolute;
        top: 50%;
      }

      .forge-progress::after {
        background: rgba(234, 223, 199, 0.16);
        border-radius: 999px;
        content: "";
        height: 3px;
        left: 0;
        position: absolute;
        right: 32px;
        top: 50%;
        z-index: -1;
      }

      .forge-progress em {
        color: rgba(234, 223, 199, 0.66);
        font-style: normal;
      }

      .forge-progress.large {
        min-height: 30px;
        width: min(360px, 100%);
      }

      .incubation-list button {
        align-items: center;
        border: 1px solid rgba(212, 173, 101, 0.14);
        border-radius: 9px;
        background: rgba(0, 0, 0, 0.26);
        color: #eadfc7;
        cursor: pointer;
        display: flex;
        gap: 13px;
        padding: 10px;
        text-align: left;
        transition: transform 180ms, border-color 180ms, background 180ms;
      }

      .incubation-panel::before {
        background:
          linear-gradient(180deg, rgba(4, 5, 5, 0.06), rgba(4, 5, 5, 0.28)),
          url("/images/Forge/forge-incubation-shelf.png") center bottom / cover no-repeat;
        content: "";
        inset: 44px 0 0;
        opacity: 0.82;
        position: absolute;
        z-index: 0;
      }

      .incubation-empty {
        display: grid;
        margin-top: 18px;
        place-items: center;
      }

      .forge-incubation-folder,
      .css-folder-icon {
        align-items: center;
        color: #f4d38f;
        display: inline-flex;
        justify-content: center;
        position: relative;
      }

      .forge-incubation-folder {
        filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.42)) drop-shadow(0 0 16px rgba(212, 173, 101, 0.18));
        min-height: 58px;
        min-width: 86px;
      }

      .forge-incubation-folder.small {
        min-height: 44px;
        min-width: 64px;
      }

      .forge-incubation-folder img {
        height: auto;
        object-fit: contain;
        width: 100%;
      }

      .css-folder-icon {
        background:
          linear-gradient(180deg, rgba(212, 173, 101, 0.26), rgba(82, 50, 20, 0.38));
        border: 1px solid rgba(212, 173, 101, 0.34);
        border-radius: 8px;
        height: 52px;
        width: 70px;
      }

      .css-folder-icon::before {
        background: rgba(212, 173, 101, 0.28);
        border-radius: 6px 6px 0 0;
        content: "";
        height: 13px;
        left: 8px;
        position: absolute;
        top: -9px;
        width: 32px;
      }

      .forge-sticky {
        bottom: -10px;
        filter: drop-shadow(0 12px 16px rgba(0, 0, 0, 0.42));
        position: absolute;
        right: 12px;
        text-align: center;
        transform: rotate(-7deg);
        width: 128px;
      }

      .forge-sticky img {
        height: auto;
        object-fit: contain;
        width: 100%;
      }

      .forge-sticky-fallback {
        background: linear-gradient(160deg, #c99b59, #e5bd77);
        border: 1px solid rgba(92, 55, 20, 0.38);
        color: #3b2413;
        display: block;
        font-family: "Kalam", "Patrick Hand", "Bradley Hand", cursive;
        font-size: 1.02rem;
        line-height: 1.08;
        padding: 15px 12px;
        width: 112px;
      }

      .spark-panel {
        min-height: 330px;
        background: linear-gradient(135deg, rgba(6, 11, 12, 0.9), rgba(3, 5, 5, 0.92));
        border-color: rgba(78, 181, 199, 0.24);
      }

      .spark-note {
        background:
          linear-gradient(180deg, rgba(5, 8, 10, 0.12), rgba(5, 8, 10, 0.22)),
          url("/images/Forge/forge-spark-board.png") center / cover no-repeat;
        border: 1px solid rgba(78, 181, 199, 0.28);
        border-radius: 8px;
        box-shadow: inset 0 0 32px rgba(78, 181, 199, 0.08), 0 12px 26px rgba(0, 0, 0, 0.28);
        display: grid;
        justify-items: center;
        margin: 16px auto 0;
        max-width: 430px;
        min-height: 246px;
        padding: 34px 30px 24px 76px;
        position: relative;
        text-align: center;
      }

      .spark-bulb {
        align-items: center;
        color: #f4d38f;
        display: inline-flex;
        filter: drop-shadow(0 0 18px rgba(212, 173, 101, 0.32));
        height: 58px;
        justify-content: center;
        left: 30px;
        position: absolute;
        top: 45px;
        transform: rotate(-43deg);
        width: 58px;
      }

      .spark-bulb img {
        height: 52px;
        object-fit: contain;
        width: 52px;
      }

      .spark-note blockquote {
        color: #e9c590;
        font-size: clamp(1.22rem, 1.7vw, 1.85rem);
        line-height: 1.32;
        margin-top: 20px;
        transform: rotate(-2deg);
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.58);
      }

      .spark-note cite {
        color: #f4d38f;
        display: block;
        font-style: normal;
        margin-top: 10px;
      }

      .forge-text-link {
        bottom: 16px;
        left: 16px;
        position: absolute;
      }

      .forge-action-bar {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(6, minmax(130px, 1fr));
        margin-top: 16px;
        padding: 12px;
      }

      .forge-action-bar button {
        align-items: center;
        border: 1px solid rgba(143, 220, 124, 0.18);
        border-radius: 9px;
        background: rgba(5, 8, 7, 0.72);
        color: #eadfc7;
        cursor: pointer;
        display: flex;
        gap: 12px;
        padding: 13px;
        text-align: left;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms;
      }

      .forge-action-bar button:hover {
        background: rgba(143, 220, 124, 0.08);
        border-color: rgba(143, 220, 124, 0.5);
        box-shadow: 0 0 24px rgba(143, 220, 124, 0.14);
        transform: translateY(-2px);
      }

      .forge-action-bar svg {
        color: #8fdc7c;
      }

      .forge-action-bar strong,
      .forge-action-bar small {
        display: block;
      }

      .forge-action-bar small {
        color: rgba(234, 223, 199, 0.58);
      }

      .forge-desk {
        display: grid;
        gap: 12px;
        margin-top: 16px;
        padding: 16px;
        position: relative;
      }

      .forge-desk > button {
        border: 1px solid rgba(212, 173, 101, 0.26);
        border-radius: 999px;
        color: #f4d38f;
        padding: 6px;
        position: absolute;
        right: 14px;
        top: 14px;
      }

      .forge-desk-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .forge-desk-tabs span {
        border: 1px solid rgba(212, 173, 101, 0.18);
        border-radius: 999px;
        color: #f4d38f;
        padding: 5px 9px;
      }

      .forge-modal-backdrop {
        align-items: center;
        background: rgba(0, 0, 0, 0.72);
        display: flex;
        inset: 0;
        justify-content: center;
        padding: 24px;
        position: fixed;
        z-index: 30;
      }

      .forge-modal {
        border: 1px solid rgba(212, 173, 101, 0.38);
        border-radius: 14px;
        background:
          linear-gradient(135deg, rgba(18, 20, 17, 0.98), rgba(5, 6, 6, 0.98)),
          url("/images/Forge/forge-bg-texture.png") center / cover;
        box-shadow: 0 34px 90px rgba(0, 0, 0, 0.64), 0 0 42px rgba(196, 111, 45, 0.2);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        padding: 18px;
        width: min(780px, 96vw);
      }

      .forge-modal header,
      .forge-modal footer {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }

      .forge-modal header {
        border-bottom: 1px solid rgba(212, 173, 101, 0.16);
        padding-bottom: 12px;
      }

      .forge-modal footer {
        border-top: 1px solid rgba(212, 173, 101, 0.16);
        margin-top: 14px;
        padding-top: 14px;
      }

      .forge-modal h2 {
        color: #fff1c8;
        font-size: 2rem;
      }

      .forge-modal p {
        color: #f4d38f;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-modal button.primary {
        background: rgba(196, 111, 45, 0.24);
        border-color: rgba(196, 111, 45, 0.6);
        color: #ffc46c;
      }

      .forge-form-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr 1fr;
        margin-top: 16px;
      }

      .forge-input {
        display: grid;
        gap: 6px;
      }

      .forge-input.wide {
        grid-column: 1 / -1;
      }

      .forge-input span {
        color: rgba(244, 211, 143, 0.82);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .forge-input input,
      .forge-input select,
      .forge-input textarea {
        border: 1px solid rgba(212, 173, 101, 0.24);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.34);
        color: #eadfc7;
        outline: none;
        padding: 10px 11px;
      }

      .forge-input textarea {
        min-height: 110px;
        resize: vertical;
      }

      @media (max-width: 1280px) {
        .forge-category-grid {
          grid-template-columns: repeat(3, 1fr);
        }

        .forge-work-grid,
        .forge-action-bar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .forge-stat-strip {
          bottom: 18px;
          left: 18px;
          right: 18px;
          top: auto;
          width: auto;
        }

        .forge-plaque {
          display: none;
        }
      }

      @media (max-width: 820px) {
        .forge-nav {
          position: relative;
          width: auto;
        }

        .forge-nav nav {
          grid-template-columns: repeat(2, 1fr);
        }

        .forge-main {
          margin-left: 0;
          padding: 18px;
        }

        .forge-hero {
          min-height: 540px;
        }

        .forge-stat-strip,
        .forge-category-grid,
        .forge-work-grid,
        .forge-action-bar,
        .forge-form-grid {
          grid-template-columns: 1fr;
        }

        .forge-project-row {
          grid-template-columns: 40px 1fr;
        }

        .forge-project-row .forge-status,
        .forge-project-row .forge-progress,
        .forge-project-row time {
          grid-column: 2;
        }
      }
    `}</style>
  );
}
