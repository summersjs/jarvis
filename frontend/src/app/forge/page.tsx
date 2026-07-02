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
  goal_id?: string | null;
  title: string;
  category: ForgeCategory;
  status: ForgeStatus;
  summary?: string | null;
  tags?: string[] | null;
  next_milestone?: string | null;
  progress_percent?: number | null;
  project_type?: string | null;
  cover_image_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linked_goal?: LinkedGoal | null;
};

type ForgeSpark = {
  id: string;
  spark_text: string;
  category?: ForgeCategory | null;
  project_id?: string | null;
  tags?: string[] | null;
  folder_path?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ForgeNote = {
  id: string;
  title: string;
  body?: string | null;
  category?: ForgeCategory | null;
  project_id?: string | null;
  tags?: string[] | null;
  folder_path?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ForgeFile = {
  id: string;
  file_name: string;
  file_type?: string | null;
  file_url?: string | null;
  caption?: string | null;
  category?: ForgeCategory | null;
  project_id?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GoalMilestone = {
  id: string;
  title: string;
  status: string;
  target_date?: string | null;
  completed_at?: string | null;
  cost?: number | null;
  notes?: string | null;
  sort_order?: number | null;
};

type LinkedGoal = {
  id: string;
  title: string;
  category?: string | null;
  mission_type?: string | null;
  project?: {
    completed_count?: number;
    total_count?: number;
    remaining_count?: number;
    percent?: number;
    next_milestone?: GoalMilestone | null;
    monthly_cadence?: string | null;
  } | null;
  milestones?: GoalMilestone[];
  logs?: Array<{ id: string; notes?: string | null; created_at?: string | null; log_type?: string | null }>;
};

type ForgeGoalOption = {
  id: string;
  title: string;
  category?: string | null;
  mission_type?: string | null;
  project?: LinkedGoal["project"];
};

type ForgeDashboard = {
  status: string;
  projects: ForgeProject[];
  sparks: ForgeSpark[];
  notes: ForgeNote[];
  files: ForgeFile[];
  goals: ForgeGoalOption[];
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
  file_url: string;
  use_as_cover: string;
  caption: string;
  goal_id: string;
  folder_primary: string;
  folder_child: string;
  new_folder_primary: string;
  new_folder_child: string;
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
  goals: [],
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
  file_url: "",
  use_as_cover: "",
  caption: "",
  goal_id: "",
  folder_primary: "",
  folder_child: "",
  new_folder_primary: "",
  new_folder_child: "",
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

  const folderOptions = useMemo(() => buildForgeFolderOptions(dashboard.notes, dashboard.sparks), [dashboard.notes, dashboard.sparks]);

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
      const requestedProjectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null;
      setSelectedProject((current) => {
        const projects = data.projects || [];
        if (requestedProjectId) return projects.find((project: ForgeProject) => project.id === requestedProjectId) || current;
        return current ? projects.find((project: ForgeProject) => project.id === current.id) || current : current;
      });
      setSetupNotice("");
    } catch (err) {
      setDashboard(emptyDashboard);
      setSetupNotice("Forge data tables are not online yet. Run backend/data/20260701_forge.sql in Supabase to enable persistence.");
      setError(err instanceof Error ? err.message : "Forge data is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function openModal(nextModal: ModalType, project: ForgeProject | null = selectedProject, category?: ForgeCategory) {
    setMessage("");
    setError("");
    setForm({
      ...emptyForm,
      project_id: nextModal && ["spark", "note", "file"].includes(nextModal) && project ? project.id : "",
      category: category || (nextModal && ["spark", "note", "file"].includes(nextModal) && project ? project.category : emptyForm.category),
    });
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
      if (modal === "file" && form.use_as_cover === "true" && form.project_id && form.file_url) {
        await fetch(`${API_BASE}/forge/projects/${form.project_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify({ cover_image_url: form.file_url }),
        });
      }
      const projectTitle = dashboard.projects.find((project) => project.id === form.project_id)?.title;
      setMessage(
        modal === "project"
          ? "Project placed on the bench."
          : modal === "spark"
            ? `Spark saved${projectTitle ? ` to ${projectTitle}` : " to the Forge Inbox"}.`
            : modal === "note"
              ? `Note added${projectTitle ? ` to ${projectTitle}` : " to the Forge Inbox"}.`
              : `File attached${projectTitle ? ` to ${projectTitle}` : " to the Forge Inbox"}.`
      );
      setModal(null);
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forge save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function completeLinkedMilestone(milestoneId: string) {
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/goals/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ status: "complete" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Milestone update failed.");
      setMessage("Linked goal milestone updated from The Forge.");
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Milestone update failed.");
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
            <Link href={`/forge/projects?category=${encodeURIComponent(selectedCategory)}`} className="forge-filter-link">
              <p>Selected Folder</p>
              <h2>{selectedCategory}</h2>
              <span>{filteredProjects.length ? `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"} on this bench.` : "No projects on this bench yet."}</span>
            </Link>
            <button onClick={() => openModal("project", null, selectedCategory)}>New {selectedCategory} Project</button>
          </section>
        )}

        <section className="forge-work-grid">
          <RecentlyUpdated projects={dashboard.recently_updated} onSelect={setSelectedProject} />
          <IncubationShelf projects={dashboard.incubating} onSelect={setSelectedProject} />
          <SparkOfDay spark={spark} />
        </section>

        <ProjectDesk
          project={selectedProject}
          sparks={dashboard.sparks}
          notes={dashboard.notes}
          files={dashboard.files}
          onClose={() => setSelectedProject(null)}
          onCompleteMilestone={completeLinkedMilestone}
          onOpenModal={openModal}
        />
        <UnassignedInbox sparks={dashboard.sparks} notes={dashboard.notes} files={dashboard.files} />
        <BottomActions onOpen={openModal} />
      </section>
      <ForgeModal
        modal={modal}
        form={form}
        projects={dashboard.projects}
        goals={dashboard.goals}
        folderOptions={folderOptions}
        saving={saving}
        onClose={() => setModal(null)}
        onSave={saveModal}
        onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
        onGoalSelect={(goal) => setForm((prev) => ({
          ...prev,
          goal_id: goal?.id || "",
          title: goal?.title || prev.title,
          category: goal?.title === "Build the Jarvis Workstation" ? "Hardware" : goal?.category?.toLowerCase() === "jarvis" ? "Jarvis" : prev.category,
          progress_percent: goal?.project?.percent != null ? String(goal.project.percent) : prev.progress_percent,
          next_milestone: goal?.project?.next_milestone?.title || prev.next_milestone,
        }))}
        onProjectSelect={(project) => setForm((prev) => ({
          ...prev,
          project_id: project?.id || "",
          category: project?.category || prev.category,
        }))}
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
        <Stat label="Active Projects" value={stats.active_projects} Icon={FolderKanban} href="/forge/projects?filter=active" />
        <Stat label="Building" value={stats.building} Icon={Hammer} tone="orange" href="/forge/projects?filter=building" />
        <Stat label="Incubating" value={stats.incubating} Icon={Lightbulb} tone="green" href="/forge/projects?filter=incubating" />
        <Stat label="Archived" value={stats.archived} Icon={Archive} tone="muted" href="/forge/projects?filter=archived" />
        <Stat label="Recently Updated" value={stats.recently_updated} Icon={Clock3} tone="blue" href="/forge/projects?filter=recent" />
      </div>
    </header>
  );
}

function Stat({ label, value, Icon, tone = "green", href }: { label: string; value: number; Icon: LucideIcon; tone?: string; href: string }) {
  return (
    <Link href={href} className={`forge-stat ${tone}`}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <Icon size={24} />
      </div>
    </Link>
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
      className={`forge-folder forge-folder-${category.name.toLowerCase()} ${active ? "active" : ""}`}
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
        <span className="forge-folder-title-block">
          <strong>{category.name}</strong>
          <em>{count} project{count === 1 ? "" : "s"}</em>
        </span>
      </span>
      <p className="forge-folder-description">{category.description}</p>
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
      <Link href="/forge/projects?filter=all" className="forge-text-link">View all projects →</Link>
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
      <Link href="/forge/projects?filter=incubating" className="forge-text-link">View incubation shelf →</Link>
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
  goals,
  folderOptions,
  saving,
  onClose,
  onSave,
  onChange,
  onGoalSelect,
  onProjectSelect,
}: {
  modal: ModalType;
  form: FormState;
  projects: ForgeProject[];
  goals: ForgeGoalOption[];
  folderOptions: FolderOptions;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (key: keyof FormState, value: string) => void;
  onGoalSelect: (goal: ForgeGoalOption | null) => void;
  onProjectSelect: (project: ForgeProject | null) => void;
}) {
  if (!modal) return null;
  const title = modal === "project" ? "New Project" : modal === "spark" ? "New Spark" : modal === "note" ? "New Note" : modal === "file" ? "Upload File" : modal === "roadmap" ? "Roadmap" : "Templates";
  const linkedGoal = goals.find((goal) => goal.id === form.goal_id);

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
            <label className="forge-input">
              <span>Link to Goal</span>
              <select
                value={form.goal_id}
                onChange={(event) => {
                  const goal = goals.find((item) => item.id === event.target.value) || null;
                  onGoalSelect(goal);
                }}
              >
                <option value="">No linked goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </label>
            <ForgeInput label="Progress %" value={form.progress_percent} onChange={(value) => onChange("progress_percent", value)} type="number" />
            <ForgeInput label="Project Type / Template" value={form.project_type} onChange={(value) => onChange("project_type", value)} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
            <ForgeTextarea label="Summary" value={form.summary} onChange={(value) => onChange("summary", value)} />
            <ForgeInput label="Next Milestone" value={form.next_milestone} onChange={(value) => onChange("next_milestone", value)} />
            {linkedGoal && (
              <div className="forge-linked-preview">
                <strong>Linked Goal Sync</strong>
                <span>This Forge project will track progress using the linked goal milestones.</span>
                <em>{linkedGoal.project?.completed_count ?? 0} / {linkedGoal.project?.total_count ?? 0} milestones · {linkedGoal.project?.percent ?? 0}%</em>
              </div>
            )}
          </div>
        ) : modal === "spark" ? (
          <div className="forge-form-grid">
            <ForgeTextarea label="Spark Text" value={form.spark_text} onChange={(value) => onChange("spark_text", value)} required />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onProjectSelect(projects.find((project) => project.id === value) || null)} />
            <ForgeFolderSelect form={form} folderOptions={folderOptions} onChange={onChange} />
            <ForgeInput label="Tags" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="comma, separated, tags" />
          </div>
        ) : modal === "note" ? (
          <div className="forge-form-grid">
            <ForgeInput label="Note Title" value={form.note_title} onChange={(value) => onChange("note_title", value)} required />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onProjectSelect(projects.find((project) => project.id === value) || null)} />
            <ForgeFolderSelect form={form} folderOptions={folderOptions} onChange={onChange} />
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
                  const reader = new FileReader();
                  reader.onload = () => onChange("file_url", String(reader.result || ""));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <ProjectSelect projects={projects} value={form.project_id} onChange={(value) => onProjectSelect(projects.find((project) => project.id === value) || null)} />
            <ForgeSelect label="Category" value={form.category} options={FORGE_CATEGORIES.map((item) => item.name)} onChange={(value) => onChange("category", value)} />
            <label className="forge-check">
              <input
                type="checkbox"
                checked={form.use_as_cover === "true"}
                onChange={(event) => onChange("use_as_cover", event.target.checked ? "true" : "")}
              />
              <span>Use this image as the project cover</span>
            </label>
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

type FolderOptions = { primary: string[]; children: Record<string, string[]> };

function ForgeFolderSelect({ form, folderOptions, onChange }: { form: FormState; folderOptions: FolderOptions; onChange: (key: keyof FormState, value: string) => void }) {
  const children = form.folder_primary ? folderOptions.children[form.folder_primary] || [] : [];
  return (
    <div className="forge-folder-select">
      <label className="forge-input">
        <span>Folder</span>
        <select
          value={form.folder_primary}
          onChange={(event) => {
            onChange("folder_primary", event.target.value);
            onChange("folder_child", "");
            onChange("new_folder_primary", "");
          }}
        >
          <option value="">Unfiled</option>
          {folderOptions.primary.map((item) => <option key={item} value={item}>{item}</option>)}
          <option value="__new">Create new folder...</option>
        </select>
      </label>
      {form.folder_primary === "__new" ? (
        <ForgeInput label="New Folder" value={form.new_folder_primary} onChange={(value) => onChange("new_folder_primary", value)} placeholder="Characters" />
      ) : (
        <label className="forge-input">
          <span>Subfolder</span>
          <select
            value={form.folder_child}
            onChange={(event) => {
              onChange("folder_child", event.target.value);
              onChange("new_folder_child", "");
            }}
            disabled={!form.folder_primary}
          >
            <option value="">None</option>
            {children.map((item) => <option key={item} value={item}>{item}</option>)}
            {form.folder_primary && <option value="__new">Create new subfolder...</option>}
          </select>
        </label>
      )}
      {form.folder_child === "__new" && form.folder_primary !== "__new" && (
        <ForgeInput label="New Subfolder" value={form.new_folder_child} onChange={(value) => onChange("new_folder_child", value)} placeholder="Lucien" />
      )}
    </div>
  );
}

function ProjectDesk({
  project,
  sparks,
  notes,
  files,
  onClose,
  onCompleteMilestone,
  onOpenModal,
}: {
  project: ForgeProject | null;
  sparks: ForgeSpark[];
  notes: ForgeNote[];
  files: ForgeFile[];
  onClose: () => void;
  onCompleteMilestone: (milestoneId: string) => void;
  onOpenModal: (modal: ModalType, project?: ForgeProject | null) => void;
}) {
  const [activeTab, setActiveTab] = useState("Overview");
  if (!project) return null;
  const linkedGoal = project.linked_goal;
  const linkedSnapshot = linkedGoal?.project;
  const milestones = linkedGoal?.milestones || [];
  const progress = linkedSnapshot?.percent ?? project.progress_percent;
  const projectSparks = sparks.filter((spark) => spark.project_id === project.id);
  const projectNotes = notes.filter((note) => note.project_id === project.id);
  const projectFiles = files.filter((file) => file.project_id === project.id);
  const projectImages = projectFiles.filter(isForgeImage);
  const latestSpark = projectSparks[0];
  const latestNote = projectNotes[0];
  const latestFile = projectFiles[0];
  const tabs = [
    { label: "Overview", count: null },
    { label: "Tasks", count: 0 },
    { label: "Spark Log", count: projectSparks.length },
    { label: "Timeline", count: milestones.length || null },
    { label: "Research", count: 0 },
    { label: "Notes", count: projectNotes.length },
    { label: "Files", count: projectFiles.length },
    { label: "Images", count: projectImages.length },
    { label: "Activity", count: projectSparks.length + projectNotes.length + projectFiles.length },
  ];
  return (
    <section className="forge-desk">
      <button type="button" onClick={onClose} aria-label="Close Project Desk"><X size={18} /></button>
      <div>
        <p>Project Desk</p>
        <h2>{project.title}</h2>
        <span>{project.category} · {project.status}{linkedGoal ? " · Synced with Goals" : ""}</span>
        <p>{project.summary || "No summary recorded yet."}</p>
      </div>
      {project.cover_image_url && (
        <figure className="forge-desk-cover">
          <Image src={project.cover_image_url} alt={`${project.title} cover`} width={420} height={210} unoptimized />
        </figure>
      )}
      <ProgressLine value={progress} large />
      <Link href={`/forge/projects/${project.id}`} className="forge-open-workspace">Open Project Desk</Link>
      {linkedGoal && (
        <>
          <div className="forge-linked-goal-panel">
            <div>
              <p>Linked Goal</p>
              <strong>{linkedGoal.title}</strong>
              <span>Updates made here also update the linked goal.</span>
            </div>
            <Link href={`/goals?focus=${linkedGoal.id}`}>Open Goal</Link>
          </div>
          <div className="forge-linked-stats">
            <MetricLite label="Milestones" value={`${linkedSnapshot?.completed_count ?? 0} / ${linkedSnapshot?.total_count ?? 0}`} />
            <MetricLite label="Remaining" value={`${linkedSnapshot?.remaining_count ?? 0}`} />
            <MetricLite label="Next" value={linkedSnapshot?.next_milestone?.title || "None"} />
          </div>
          <div className="forge-linked-milestones">
            {milestones.map((milestone) => {
              const complete = isForgeMilestoneComplete(milestone);
              return (
                <article key={milestone.id} className={complete ? "complete" : ""}>
                  <div>
                    <strong>{milestone.title}</strong>
                    <span>{complete ? getForgeMilestoneLabel(milestone) : (milestone.status || "Open").toUpperCase()}</span>
                  </div>
                  {!complete && (
                    <p>
                      {milestone.target_date ? `Target: ${milestone.target_date}` : "Open"}
                      {milestone.cost ? ` · $${milestone.cost}` : ""}
                      {milestone.notes ? ` · ${milestone.notes}` : ""}
                    </p>
                  )}
                  {complete ? (
                    <em>Inventory secured</em>
                  ) : (
                    <button type="button" onClick={() => onCompleteMilestone(milestone.id)}>Complete</button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      <div className="forge-desk-tabs">
        {tabs.map((tab) => (
          <button key={tab.label} type="button" className={activeTab === tab.label ? "active" : ""} onClick={() => setActiveTab(tab.label)}>
            {tab.label}{tab.count != null ? ` ${tab.count}` : ""}
          </button>
        ))}
      </div>
      <ProjectPreviewTab
        tab={activeTab}
        project={project}
        sparks={projectSparks}
        notes={projectNotes}
        files={projectFiles}
        images={projectImages}
        latestSpark={latestSpark}
        latestNote={latestNote}
        latestFile={latestFile}
        onOpenModal={onOpenModal}
      />
      <strong>Next Milestone: {linkedSnapshot?.next_milestone?.title || project.next_milestone || "Not assigned"}</strong>
    </section>
  );
}

function ProjectPreviewTab({
  tab,
  project,
  sparks,
  notes,
  files,
  images,
  latestSpark,
  latestNote,
  latestFile,
  onOpenModal,
}: {
  tab: string;
  project: ForgeProject;
  sparks: ForgeSpark[];
  notes: ForgeNote[];
  files: ForgeFile[];
  images: ForgeFile[];
  latestSpark?: ForgeSpark;
  latestNote?: ForgeNote;
  latestFile?: ForgeFile;
  onOpenModal: (modal: ModalType, project?: ForgeProject | null) => void;
}) {
  if (tab === "Spark Log") {
    return <PreviewList title="Spark Log" empty="No sparks captured for this project yet." items={sparks.map((spark) => spark.spark_text)} action="New Spark" onAction={() => onOpenModal("spark", project)} />;
  }
  if (tab === "Notes") {
    return <PreviewList title="Notes" empty="No notes yet." items={notes.map((note) => `${note.title}${note.body ? ` - ${note.body.slice(0, 90)}` : ""}`)} action="New Note" onAction={() => onOpenModal("note", project)} />;
  }
  if (tab === "Files") {
    return <PreviewList title="Files" empty="No files attached yet." items={files.map((file) => file.file_name)} action="Upload File" onAction={() => onOpenModal("file", project)} />;
  }
  if (tab === "Images") {
    return (
      <div className="forge-preview-pane">
        <div className="forge-preview-head"><strong>Images</strong><button type="button" onClick={() => onOpenModal("file", project)}>Upload Image</button></div>
        {images.length ? <ImageStrip files={images} /> : <EmptyState title="No images on the board yet." text="Attach concept art, sketches, screenshots, or references." />}
      </div>
    );
  }
  if (tab === "Tasks" || tab === "Research" || tab === "Timeline") {
    return <PreviewList title={tab} empty={tab === "Tasks" ? "No tasks on the bench yet." : tab === "Research" ? "No research pinned yet." : "No timeline yet."} items={[]} />;
  }
  if (tab === "Activity") {
    return <PreviewList title="Activity" empty="No activity yet." items={[...sparks.map((spark) => `Spark added: ${spark.spark_text}`), ...notes.map((note) => `Note added: ${note.title}`), ...files.map((file) => `File uploaded: ${file.file_name}`)]} />;
  }
  return (
    <div className="forge-preview-pane">
      <div className="forge-preview-grid">
        <PreviewBlock label="Latest Spark" value={latestSpark?.spark_text || "No spark captured yet."} />
        <PreviewBlock label="Latest Note" value={latestNote?.title || "No note written yet."} />
        <PreviewBlock label="Latest Upload" value={latestFile?.file_name || "No file uploaded yet."} />
      </div>
      {images.length > 0 && <ImageStrip files={images.slice(0, 3)} />}
    </div>
  );
}

function MetricLite({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function PreviewList({
  title,
  empty,
  items,
  action,
  onAction,
}: {
  title: string;
  empty: string;
  items: string[];
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="forge-preview-pane">
      <div className="forge-preview-head">
        <strong>{title}</strong>
        {action && <button type="button" onClick={onAction}>{action}</button>}
      </div>
      {items.length ? (
        <div className="forge-preview-list">
          {items.slice(0, 4).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
        </div>
      ) : (
        <EmptyState title={empty} text="Open the full workspace to build this section out." />
      )}
    </div>
  );
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function ImageStrip({ files }: { files: ForgeFile[] }) {
  return (
    <div className="forge-image-strip">
      {files.map((file) => (
        <figure key={file.id}>
          {file.file_url ? <Image src={file.file_url} alt={file.caption || file.file_name} width={180} height={120} unoptimized /> : <span>{file.file_name}</span>}
          <figcaption>{file.caption || file.file_name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function UnassignedInbox({
  sparks,
  notes,
  files,
}: {
  sparks: ForgeSpark[];
  notes: ForgeNote[];
  files: ForgeFile[];
}) {
  const count = sparks.filter((item) => !item.project_id).length + notes.filter((item) => !item.project_id).length + files.filter((item) => !item.project_id).length;
  if (!count) return null;
  return (
    <section className="forge-inbox-panel">
      <div>
        <p>Unassigned Forge Inbox</p>
        <h2>{count} item{count === 1 ? "" : "s"} need a project</h2>
        <span>Open the inbox workspace to move sparks, notes, and files to the right project.</span>
      </div>
      <Link href="/forge/projects/inbox">Open Inbox</Link>
    </section>
  );
}

function isForgeImage(file: ForgeFile) {
  return Boolean((file.file_type || "").startsWith("image/") || (file.file_url || "").startsWith("data:image/"));
}

function isForgeMilestoneComplete(milestone: GoalMilestone) {
  return ["complete", "completed", "purchased", "already acquired", "already_acquired"].includes((milestone.status || "").toLowerCase()) || Boolean(milestone.completed_at);
}

function getForgeMilestoneLabel(milestone: GoalMilestone) {
  if (milestone.title.trim().toLowerCase() === "gpu") return "Already Acquired";
  return "Completed";
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
  const complete = safeValue >= 100;
  const tone = complete ? "rainbow" : safeValue >= 70 ? "green" : safeValue >= 35 ? "yellow" : "red";
  return (
    <span className={`forge-progress goal-progress-shell goal-progress-${tone} ${large ? "large" : ""}`} aria-label={`Progress ${safeValue}%`}>
      <span className={`goal-progress-track ${complete ? "goal-progress-track-complete" : ""}`}>
        <span
          className={`goal-progress-fill ${complete ? "limit-break-bar goal-progress-fill-complete" : `goal-progress-fill-${tone}`}`}
          style={{ width: `${safeValue}%` }}
        >
          {(tone === "green" || complete) && <span className="goal-progress-particles" aria-hidden="true" />}
        </span>
      </span>
      <em>{safeValue}%</em>
    </span>
  );
}

function buildPayload(modal: Exclude<ModalType, null>, form: FormState) {
  const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const folder_path = resolveForgeFolderPath(form.folder_primary, form.folder_child, form.new_folder_primary, form.new_folder_child);
  if (modal === "project") {
    return {
      user_id: USER_ID,
      goal_id: form.goal_id || null,
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
      folder_path,
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
      folder_path,
    };
  }
  return {
    user_id: USER_ID,
    file_name: form.file_name || "Unassigned Forge File",
    file_type: form.file_type || null,
    file_size: form.file_size ? Number(form.file_size) : null,
    file_url: form.file_url || null,
    caption: form.caption || null,
    category: form.category || null,
    project_id: form.project_id || null,
    tags,
    metadata: { upload_status: "metadata_only_v1" },
  };
}

function buildForgeFolderOptions(notes: ForgeNote[], sparks: ForgeSpark[]): FolderOptions {
  const primary = new Set<string>();
  const children: Record<string, Set<string>> = {};
  [...notes, ...sparks].forEach((item) => {
    const path = (item.folder_path || []).map(titleCaseForgeFolder).filter(Boolean).slice(0, 2);
    if (!path[0]) return;
    primary.add(path[0]);
    if (path[1]) {
      children[path[0]] ||= new Set<string>();
      children[path[0]].add(path[1]);
    }
  });
  return {
    primary: [...primary].sort((a, b) => a.localeCompare(b)),
    children: Object.fromEntries(Object.entries(children).map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b))])),
  };
}

function resolveForgeFolderPath(primary: string, child: string, newPrimary: string, newChild: string) {
  return [
    titleCaseForgeFolder(primary === "__new" ? newPrimary : primary),
    titleCaseForgeFolder(child === "__new" ? newChild : child),
  ].filter(Boolean).slice(0, 2);
}

function titleCaseForgeFolder(value: string) {
  return value.trim().replace(/\s+/g, " ").split(" ").map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "").join(" ");
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
        left: 49.65%;
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
        display: grid;
        gap: 8px;
        grid-template-columns: 40px minmax(0, 1fr);
        margin-left: 15px;
        max-width: calc(100% - 44px);
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

      .forge-folder-jarvis .forge-category-asset,
      .forge-folder-business .forge-category-asset,
      .forge-folder-hardware .forge-category-asset,
      .forge-folder-writing .forge-category-asset,
      .forge-folder-life .forge-category-asset {
        transform: translateY(-3px);
      }

      .forge-folder strong {
        color: var(--category-accent);
        display: block;
        font-size: 0.84rem;
        letter-spacing: 0.075em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .forge-folder em {
        color: color-mix(in srgb, var(--category-accent) 72%, #f4d38f);
        display: block;
        font-size: 0.66rem;
        font-style: normal;
        letter-spacing: 0.075em;
        margin-top: 2px;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .forge-folder-title-block {
        align-self: center;
        display: grid;
        min-width: 0;
        transform: translateY(-1px);
        width: 86px;
      }

      .forge-folder-description {
        color: rgba(234, 223, 199, 0.74);
        font-size: 0.65rem;
        line-height: 1.14;
        margin-left: 15px;
        margin-top: 8px;
        max-width: calc(100% - 68px);
        overflow-wrap: normal;
        width: 116px;
      }

      .forge-filter-panel {
        align-items: center;
        display: flex;
        justify-content: space-between;
        margin-top: 14px;
        padding: 14px 16px;
      }

      .forge-filter-link {
        border: 1px solid transparent;
        border-radius: 10px;
        color: inherit;
        display: block;
        padding: 8px 10px;
        position: relative;
        text-decoration: none;
        transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
      }

      .forge-filter-link:hover {
        background: rgba(196, 111, 45, 0.08);
        border-color: rgba(196, 111, 45, 0.34);
        box-shadow: 0 0 24px rgba(196, 111, 45, 0.16), inset 0 0 18px rgba(143, 220, 124, 0.04);
        transform: translateY(-2px);
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

      .incubation-list {
        margin-top: 36px;
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
        display: block;
        min-width: 92px;
      }

      .forge-progress .goal-progress-track,
      .forge-progress .goal-progress-fill {
        display: block;
      }

      .forge-progress .goal-progress-track {
        width: 100%;
      }

      .forge-progress em {
        color: rgba(234, 223, 199, 0.74);
        display: block;
        font-size: 0.68rem;
        font-style: normal;
        font-weight: 800;
        letter-spacing: 0.12em;
        margin-top: 5px;
        text-align: center;
      }

      .forge-progress.large {
        width: min(360px, 100%);
      }

      .forge-progress.large em {
        text-align: left;
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
        bottom: 0;
        left: 16px;
        overflow: hidden;
        position: absolute;
        isolation: isolate;
      }

      .forge-text-link::after {
        background: linear-gradient(90deg, transparent, rgba(244, 211, 143, 0.34), transparent);
        content: "";
        inset: 0;
        position: absolute;
        transform: translateX(-120%) skewX(-18deg);
        transition: transform 420ms ease;
        z-index: -1;
      }

      .forge-text-link:hover::after {
        transform: translateX(120%) skewX(-18deg);
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
        overflow: hidden;
        padding: 13px;
        position: relative;
        text-align: left;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms;
      }

      .forge-action-bar button::after {
        background: linear-gradient(90deg, transparent, rgba(143, 220, 124, 0.28), transparent);
        content: "";
        inset: 0;
        position: absolute;
        transform: translateX(-120%) skewX(-18deg);
        transition: transform 420ms ease;
      }

      .forge-action-bar button:hover {
        background: rgba(143, 220, 124, 0.08);
        border-color: rgba(143, 220, 124, 0.5);
        box-shadow: 0 0 24px rgba(143, 220, 124, 0.14);
        transform: translateY(-2px);
      }

      .forge-action-bar button:hover::after {
        transform: translateX(120%) skewX(-18deg);
      }

      .forge-action-bar svg {
        color: #8fdc7c;
        z-index: 1;
      }

      .forge-action-bar strong,
      .forge-action-bar small {
        display: block;
        position: relative;
        z-index: 1;
      }

      .forge-action-bar small {
        color: rgba(234, 223, 199, 0.58);
      }

      .forge-inbox-panel {
        align-items: center;
        border: 1px solid rgba(212, 173, 101, 0.18);
        border-radius: 10px;
        background: rgba(6, 8, 7, 0.88);
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 16px;
        padding: 14px 16px;
      }

      .forge-inbox-panel p {
        color: #f0a44d;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-inbox-panel h2 {
        color: #fff1c8;
      }

      .forge-inbox-panel span {
        color: rgba(234, 223, 199, 0.68);
      }

      .forge-inbox-panel a {
        border: 1px solid rgba(143, 220, 124, 0.35);
        border-radius: 8px;
        color: #caffbf;
        padding: 9px 12px;
        text-decoration: none;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms;
      }

      .forge-inbox-panel a:hover {
        border-color: rgba(143, 220, 124, 0.65);
        box-shadow: 0 0 20px rgba(143, 220, 124, 0.16);
        transform: translateY(-1px);
      }

      .forge-desk {
        display: grid;
        gap: 12px;
        margin-top: 16px;
        padding: 16px;
        position: relative;
      }

      .forge-desk-cover {
        border: 1px solid rgba(212, 173, 101, 0.2);
        border-radius: 12px;
        margin: 0;
        max-width: 420px;
        overflow: hidden;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34), 0 0 24px rgba(196, 111, 45, 0.14);
      }

      .forge-desk-cover img {
        display: block;
        height: 210px;
        object-fit: cover;
        width: 100%;
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

      .forge-desk-tabs span,
      .forge-desk-tabs button,
      .forge-open-workspace {
        border: 1px solid rgba(212, 173, 101, 0.18);
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.22);
        color: #f4d38f;
        cursor: pointer;
        padding: 5px 9px;
        text-decoration: none;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms, background 180ms;
      }

      .forge-desk-tabs button:hover,
      .forge-desk-tabs button.active,
      .forge-open-workspace:hover {
        background: rgba(196, 111, 45, 0.12);
        border-color: rgba(196, 111, 45, 0.52);
        box-shadow: 0 0 20px rgba(196, 111, 45, 0.16);
        transform: translateY(-1px);
      }

      .forge-open-workspace {
        justify-self: start;
      }

      .forge-preview-pane {
        border: 1px solid rgba(212, 173, 101, 0.16);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.2);
        padding: 12px;
      }

      .forge-preview-head {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      .forge-preview-head strong,
      .forge-preview-grid small {
        color: #f0a44d;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-preview-head button {
        border: 1px solid rgba(143, 220, 124, 0.3);
        border-radius: 8px;
        background: rgba(143, 220, 124, 0.08);
        color: #caffbf;
        cursor: pointer;
        padding: 7px 10px;
      }

      .forge-preview-list,
      .forge-preview-grid {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .forge-preview-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }

      .forge-preview-list span,
      .forge-preview-grid span {
        border: 1px solid rgba(212, 173, 101, 0.13);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.24);
        color: rgba(234, 223, 199, 0.76);
        padding: 9px;
      }

      .forge-preview-grid strong {
        color: #fff1c8;
        display: block;
        margin-top: 4px;
      }

      .forge-image-strip {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        margin-top: 12px;
      }

      .forge-image-strip figure {
        border: 1px solid rgba(212, 173, 101, 0.15);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.24);
        padding: 8px;
      }

      .forge-image-strip img {
        border-radius: 6px;
        height: 96px;
        object-fit: cover;
        width: 100%;
      }

      .forge-image-strip figcaption {
        color: rgba(234, 223, 199, 0.66);
        font-size: 0.74rem;
        margin-top: 6px;
      }

      .forge-linked-preview,
      .forge-linked-goal-panel,
      .forge-linked-milestones article {
        border: 1px solid rgba(143, 220, 124, 0.24);
        border-radius: 10px;
        background: rgba(143, 220, 124, 0.07);
        box-shadow: inset 0 0 20px rgba(143, 220, 124, 0.04);
      }

      .forge-linked-preview {
        color: #caffbf;
        display: grid;
        gap: 5px;
        grid-column: 1 / -1;
        padding: 12px;
      }

      .forge-linked-preview strong,
      .forge-linked-goal-panel strong,
      .forge-linked-milestones strong {
        color: #fff1c8;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .forge-linked-preview span,
      .forge-linked-preview em,
      .forge-linked-goal-panel span,
      .forge-linked-milestones p,
      .forge-linked-milestones em {
        color: rgba(234, 223, 199, 0.72);
        font-style: normal;
      }

      .forge-linked-goal-panel {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 14px;
      }

      .forge-linked-goal-panel p {
        color: #8fdc7c;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .forge-linked-goal-panel a,
      .forge-linked-milestones button {
        border: 1px solid rgba(143, 220, 124, 0.35);
        border-radius: 8px;
        background: rgba(143, 220, 124, 0.08);
        color: #caffbf;
        cursor: pointer;
        padding: 8px 11px;
        text-decoration: none;
        transition: transform 180ms, border-color 180ms, box-shadow 180ms;
        white-space: nowrap;
      }

      .forge-linked-goal-panel a:hover,
      .forge-linked-milestones button:hover {
        border-color: rgba(143, 220, 124, 0.65);
        box-shadow: 0 0 20px rgba(143, 220, 124, 0.16);
        transform: translateY(-1px);
      }

      .forge-linked-stats {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .forge-linked-stats span {
        border: 1px solid rgba(212, 173, 101, 0.16);
        border-radius: 9px;
        background: rgba(0, 0, 0, 0.24);
        display: grid;
        gap: 5px;
        padding: 10px;
      }

      .forge-linked-stats small {
        color: rgba(234, 223, 199, 0.58);
        font-size: 0.68rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .forge-linked-stats strong {
        color: #f4d38f;
      }

      .forge-linked-milestones {
        display: grid;
        gap: 9px;
      }

      .forge-linked-milestones article {
        align-items: center;
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr auto;
        padding: 11px;
      }

      .forge-linked-milestones article.complete {
        border-color: rgba(143, 220, 124, 0.42);
        background: rgba(143, 220, 124, 0.11);
      }

      .forge-linked-milestones article > p {
        grid-column: 1 / -1;
        margin: 0;
      }

      .forge-linked-milestones span {
        border: 1px solid currentColor;
        border-radius: 999px;
        color: #f4d38f;
        display: inline-block;
        font-size: 0.66rem;
        letter-spacing: 0.12em;
        margin-top: 5px;
        padding: 3px 7px;
        text-transform: uppercase;
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

      .forge-check {
        align-items: center;
        border: 1px solid rgba(143, 220, 124, 0.22);
        border-radius: 8px;
        background: rgba(143, 220, 124, 0.06);
        color: #caffbf;
        display: flex;
        gap: 9px;
        padding: 10px 11px;
      }

      .forge-check input {
        accent-color: #8fdc7c;
      }

      .forge-check span {
        font-size: 0.82rem;
        font-weight: 800;
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
