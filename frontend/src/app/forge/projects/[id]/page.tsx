"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type ForgeProject = {
  id: string;
  title: string;
  category: string;
  status: string;
  summary?: string | null;
  tags?: string[] | null;
  next_milestone?: string | null;
  progress_percent?: number | null;
  cover_image_url?: string | null;
  updated_at?: string | null;
  task_summary?: {
    completed?: number;
    total?: number;
    remaining?: number;
    current_mission?: string | null;
    next_suggested_task?: string | null;
    recently_unlocked?: string | null;
  } | null;
  task_goal?: {
    id: string;
    title: string;
    frequency?: string | null;
    target_value?: number | null;
    unit?: string | null;
    standard?: { status?: string | null; remaining?: number | null } | null;
    period?: { status?: string | null; remaining?: number | null } | null;
  } | null;
  linked_goal?: {
    id: string;
    title: string;
    project?: {
      completed_count?: number;
      total_count?: number;
      remaining_count?: number;
      percent?: number;
      next_milestone?: { title: string } | null;
    } | null;
    milestones?: Array<{ id: string; title: string; status: string; target_date?: string | null; cost?: number | null; notes?: string | null }>;
  } | null;
};

type ForgeSpark = { id: string; spark_text: string; project_id?: string | null; category?: string | null; tags?: string[] | null; created_at?: string | null };
type ForgeNote = { id: string; title: string; body?: string | null; project_id?: string | null; category?: string | null; tags?: string[] | null; created_at?: string | null; updated_at?: string | null };
type ForgeFile = { id: string; file_name: string; file_type?: string | null; file_url?: string | null; caption?: string | null; project_id?: string | null; category?: string | null; tags?: string[] | null; created_at?: string | null };
type ForgeTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  milestone_group?: string | null;
  sort_order?: number | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  project_id: string;
  created_at?: string | null;
};

const TABS = ["Overview", "Tasks", "Spark Log", "Timeline", "Research", "Notes", "Files", "Images", "Activity"];

export default function ForgeProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const inbox = projectId === "inbox";
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [sparks, setSparks] = useState<ForgeSpark[]>([]);
  const [notes, setNotes] = useState<ForgeNote[]>([]);
  const [files, setFiles] = useState<ForgeFile[]>([]);
  const [tasks, setTasks] = useState<ForgeTask[]>([]);
  const [tab, setTab] = useState("Overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskGroup, setNewTaskGroup] = useState("Milestone 5 - Vertical Slice");
  const [previewImage, setPreviewImage] = useState<ForgeFile | null>(null);
  const [showTaskGoalForm, setShowTaskGoalForm] = useState(false);
  const [taskGoalTarget, setTaskGoalTarget] = useState("3");
  const [taskGoalFrequency, setTaskGoalFrequency] = useState("weekly");

  const project = projects.find((item) => item.id === projectId) || null;
  const visibleSparks = sparks.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleNotes = notes.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleFiles = files.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleImages = visibleFiles.filter(isImage);
  const visibleTasks = tasks.filter((item) => !inbox && item.project_id === projectId);
  const progress = project?.linked_goal?.project?.percent ?? project?.progress_percent ?? 0;

  const counts = useMemo(() => ({
    "Spark Log": visibleSparks.length,
    Notes: visibleNotes.length,
    Files: visibleFiles.length,
    Images: visibleImages.length,
    Activity: visibleSparks.length + visibleNotes.length + visibleFiles.length + visibleTasks.length,
    Timeline: project?.linked_goal?.milestones?.length || 0,
    Tasks: visibleTasks.length,
    Research: 0,
  }), [visibleSparks.length, visibleNotes.length, visibleFiles.length, visibleImages.length, visibleTasks.length, project]);

  useEffect(() => {
    loadForge();
  }, []);

  async function loadForge() {
    try {
      const res = await fetch(`${API_BASE}/forge?user_id=${USER_ID}`, { headers: { "x-api-key": API_KEY } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load Forge workspace.");
      setProjects(data.projects || []);
      setSparks(data.sparks || []);
      setNotes(data.notes || []);
      setFiles(data.files || []);
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Forge workspace.");
    }
  }

  async function moveItem(kind: "sparks" | "notes" | "files", id: string, nextProjectId: string) {
    const project = projects.find((item) => item.id === nextProjectId);
    const res = await fetch(`${API_BASE}/forge/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ project_id: nextProjectId || null, category: project?.category || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Move failed.");
      return;
    }
    setMessage(project ? `Moved to ${project.title}.` : "Moved to Unassigned Forge Inbox.");
    await loadForge();
  }

  async function deleteItem(kind: "projects" | "sparks" | "notes" | "files" | "tasks", id: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    const res = await fetch(`${API_BASE}/forge/${kind}/${id}`, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Delete failed.");
      return;
    }
    setMessage(`${label} deleted.`);
    if (kind === "projects") {
      window.location.href = "/forge/projects?filter=all";
      return;
    }
    await loadForge();
  }

  async function addTask() {
    if (!project || !newTaskTitle.trim()) return;
    const maxSort = visibleTasks.reduce((max, task) => Math.max(max, Number(task.sort_order || 0)), 0);
    const res = await fetch(`${API_BASE}/forge/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: USER_ID,
        project_id: project.id,
        title: newTaskTitle.trim(),
        milestone_group: newTaskGroup || "General",
        status: "Backlog",
        sort_order: maxSort + 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Task could not be added. Run the Forge task SQL migration if the table is missing.");
      return;
    }
    setNewTaskTitle("");
    setMessage(`Task added: ${data.task?.title || newTaskTitle.trim()}`);
    await loadForge();
  }

  async function toggleTask(task: ForgeTask) {
    const complete = isTaskComplete(task);
    const res = await fetch(`${API_BASE}/forge/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        status: complete ? "Backlog" : "Done",
        completed_at: complete ? null : new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Task update failed.");
      return;
    }
    setMessage(complete ? "Task reopened." : "Task completed.");
    await loadForge();
  }

  async function setProjectCover(file: ForgeFile) {
    if (!project || !file.file_url) return;
    const res = await fetch(`${API_BASE}/forge/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ cover_image_url: file.file_url }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Cover image could not be saved. Run the Forge task SQL migration if the cover column is missing.");
      return;
    }
    setMessage(`${file.file_name} set as project cover.`);
    await loadForge();
  }

  async function createTaskGoal() {
    if (!project) return;
    const target = Math.max(1, Number(taskGoalTarget || 1));
    const frequency = taskGoalFrequency || "weekly";
    const title = `Complete ${target} ${project.title} Task${target === 1 ? "" : "s"} ${frequency.charAt(0).toUpperCase()}${frequency.slice(1)}`;
    const res = await fetch(`${API_BASE}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: USER_ID,
        title,
        description: `Complete ${target} Forge task${target === 1 ? "" : "s"} for ${project.title} every ${frequency}. Checking off Forge tasks will log progress here automatically.`,
        category: project.category,
        goal_type: "count",
        target_value: target,
        current_value: 0,
        unit: "task",
        frequency,
        is_active: true,
        mission_type: "standard",
        status: "active",
        metadata: {
          forge_goal_type: "task_completion",
          forge_project_id: project.id,
          forge_project_title: project.title,
          forge_category: project.category,
          sync_rule: "Forge task completions auto-log progress.",
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Task goal could not be created.");
      return;
    }
    setMessage(`Goal created: ${data.goal?.title || title}`);
    setShowTaskGoalForm(false);
    await loadForge();
  }

  if (!inbox && !project && !error) {
    return <main className="forge-workspace"><p>Loading Forge workspace...</p><WorkspaceStyles /></main>;
  }

  return (
    <main className="forge-workspace">
      <div className="workspace-bg" aria-hidden="true" />
      <header className="workspace-header">
        <Link href="/forge">Back to Forge</Link>
        <p>{inbox ? "FORGE / INBOX" : `PROJECT / ${project?.category}`}</p>
        <h1>{inbox ? "Unassigned Forge Inbox" : project?.title}</h1>
        {!inbox && project?.cover_image_url && (
          <figure className="workspace-cover">
            <Image src={project.cover_image_url} alt={`${project.title} cover`} width={420} height={220} unoptimized />
          </figure>
        )}
        <span>{inbox ? "Sparks, notes, and files that need a project." : project?.summary || "No summary recorded yet."}</span>
        {!inbox && (
          <>
            <div className="workspace-progress"><Progress value={progress} /></div>
            <div className="workspace-meta">
              <b>{project?.status}</b>
              <b>Next: {project?.linked_goal?.project?.next_milestone?.title || project?.next_milestone || "Not assigned"}</b>
              {project?.linked_goal && <Link href={`/goals?focus=${project.linked_goal.id}`}>Open Goal</Link>}
              {project?.task_goal ? <Link href={`/goals?focus=${project.task_goal.id}`}>Open Task Goal</Link> : <button type="button" onClick={() => setShowTaskGoalForm((value) => !value)}>Add Tasks to Goals</button>}
              {project && <button type="button" className="workspace-delete project-delete" onClick={() => deleteItem("projects", project.id, project.title)}>Delete Project</button>}
            </div>
            {showTaskGoalForm && (
              <div className="task-goal-form">
                <div>
                  <p>Forge Task Goal</p>
                  <strong>How many tasks should count toward Mission Score?</strong>
                  <span>Jarvis will create a Standard goal and auto-log progress when Forge tasks are checked off.</span>
                </div>
                <label>
                  <span>Task Count</span>
                  <input value={taskGoalTarget} onChange={(event) => setTaskGoalTarget(event.target.value)} type="number" min="1" />
                </label>
                <label>
                  <span>Cadence</span>
                  <select value={taskGoalFrequency} onChange={(event) => setTaskGoalFrequency(event.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <button type="button" onClick={createTaskGoal}>Create Goal</button>
              </div>
            )}
          </>
        )}
      </header>

      {message && <div className="workspace-alert">{message}</div>}
      {error && <div className="workspace-alert danger">{error}</div>}

      <nav className="workspace-tabs">
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}{counts[item as keyof typeof counts] ? ` ${counts[item as keyof typeof counts]}` : ""}
          </button>
        ))}
      </nav>

      <section className="workspace-panel">
        {tab === "Overview" && (
          <div className="workspace-grid">
            <InfoCard title="Latest Spark" value={visibleSparks[0]?.spark_text || "No sparks captured for this project yet."} />
            <InfoCard title="Latest Note" value={visibleNotes[0]?.title || "No notes yet."} />
            <InfoCard title="Latest Upload" value={visibleFiles[0]?.file_name || "No files attached yet."} />
            <MissionCard project={project} tasks={visibleTasks} />
            {visibleImages.length > 0 && <ImageGrid files={visibleImages.slice(0, 3)} onPreview={setPreviewImage} />}
          </div>
        )}
        {tab === "Spark Log" && <SparkList sparks={visibleSparks} projects={projects} onMove={(id, next) => moveItem("sparks", id, next)} onDelete={(id, label) => deleteItem("sparks", id, label)} />}
        {tab === "Notes" && <NoteList notes={visibleNotes} projects={projects} onMove={(id, next) => moveItem("notes", id, next)} onDelete={(id, label) => deleteItem("notes", id, label)} />}
        {tab === "Files" && <FileList files={visibleFiles} projects={projects} onMove={(id, next) => moveItem("files", id, next)} onDelete={(id, label) => deleteItem("files", id, label)} />}
        {tab === "Images" && <ImageGrid files={visibleImages} projects={projects} onMove={(id, next) => moveItem("files", id, next)} onDelete={(id, label) => deleteItem("files", id, label)} onPreview={setPreviewImage} onSetCover={setProjectCover} />}
        {tab === "Timeline" && (
          <div className="workspace-list">
            {(project?.linked_goal?.milestones || []).length ? project?.linked_goal?.milestones?.map((milestone) => (
              <article key={milestone.id}><b>{milestone.title}</b><span>{milestone.status}</span><small>{milestone.target_date || "No target"}{milestone.cost ? ` · $${milestone.cost}` : ""}</small></article>
            )) : <Empty title="No timeline yet." text="Add milestones when this idea starts becoming a build." />}
          </div>
        )}
        {tab === "Tasks" && (
          <TaskBoard
            tasks={visibleTasks}
            title={newTaskTitle}
            group={newTaskGroup}
            onTitleChange={setNewTaskTitle}
            onGroupChange={setNewTaskGroup}
            onAdd={addTask}
            onToggle={toggleTask}
            onDelete={(id, label) => deleteItem("tasks", id, label)}
          />
        )}
        {tab === "Research" && <Empty title="No research pinned yet." text="Research storage is prepared in SQL; save articles, videos, references, and sources here next." />}
        {tab === "Activity" && <Activity sparks={visibleSparks} notes={visibleNotes} files={visibleFiles} tasks={visibleTasks} project={project} inbox={inbox} />}
      </section>
      {previewImage && <ImageLightbox file={previewImage} onClose={() => setPreviewImage(null)} />}
      <WorkspaceStyles />
    </main>
  );
}

function Progress({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  const complete = safe >= 100;
  return (
    <div className="goal-progress-shell">
      <div className={`goal-progress-track ${complete ? "goal-progress-track-complete" : ""}`}>
        <div className={`goal-progress-fill ${complete ? "limit-break-bar goal-progress-fill-complete" : safe >= 70 ? "goal-progress-fill-green" : safe >= 35 ? "goal-progress-fill-yellow" : "goal-progress-fill-red"}`} style={{ width: `${safe}%` }}>
          {(safe >= 70 || complete) && <span className="goal-progress-particles" aria-hidden="true" />}
        </div>
      </div>
      <em>{safe}%</em>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <article className="workspace-card"><p>{title}</p><strong>{value}</strong></article>;
}

function MissionCard({ project, tasks }: { project: ForgeProject | null; tasks: ForgeTask[] }) {
  const sortedIncomplete = tasks.filter((task) => !isTaskComplete(task)).sort(sortTasks);
  const sortedComplete = tasks.filter(isTaskComplete).sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
  const current = sortedIncomplete[0]?.title || project?.task_summary?.current_mission || "No active mission selected.";
  const next = sortedIncomplete[1]?.title || project?.task_summary?.next_suggested_task || "No suggested task yet.";
  const unlocked = sortedComplete[0]?.title || project?.task_summary?.recently_unlocked || "Nothing unlocked yet.";
  return (
    <article className="workspace-card mission-card">
      <p>Project Mission</p>
      <strong>Current Mission: {current}</strong>
      <span>Next Suggested Task: {next}</span>
      <span>Recently Unlocked: {unlocked}{unlocked !== "Nothing unlocked yet." ? " ✅" : ""}</span>
      <em>Project Completion: {sortedComplete.length} / {tasks.length} tasks complete</em>
    </article>
  );
}

function TaskBoard({
  tasks,
  title,
  group,
  onTitleChange,
  onGroupChange,
  onAdd,
  onToggle,
  onDelete,
}: {
  tasks: ForgeTask[];
  title: string;
  group: string;
  onTitleChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (task: ForgeTask) => void;
  onDelete: (id: string, label: string) => void;
}) {
  const complete = tasks.filter(isTaskComplete).sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
  const incomplete = tasks.filter((task) => !isTaskComplete(task)).sort(sortTasks);
  const completedCount = complete.length;
  const totalCount = tasks.length;
  const groups = groupTasks(incomplete);
  const milestoneGroups = ["Milestone 1 - Foundation", "Milestone 2 - Characters", "Milestone 3 - Story", "Milestone 4 - Gameplay", "Milestone 5 - Vertical Slice", "Story", "Characters", "World Building", "Combat", "Guild System", "Items", "Legendary Weapons", "Final Fantasy Worlds", "Art", "Audio", "Development", "Milestones", "General"];

  if (!tasks.length) {
    return (
      <div className="task-board">
        <TaskComposer title={title} group={group} groups={milestoneGroups} onTitleChange={onTitleChange} onGroupChange={onGroupChange} onAdd={onAdd} />
        <Empty title="No tasks on the bench yet." text="Run the World Walker task SQL seed or add the first task manually." />
      </div>
    );
  }

  return (
    <div className="task-board">
      <div className="task-command">
        <div>
          <p>Current Mission</p>
          <h2>{incomplete[0]?.title || "All current tasks complete."}</h2>
          <span>Next Suggested Task: {incomplete[1]?.title || "Add the next task when ready."}</span>
          <em>Recently Unlocked: {complete[0]?.title || "Nothing yet"}{complete[0] ? " ✅" : ""}</em>
        </div>
        <strong>{completedCount} / {totalCount} tasks complete</strong>
      </div>

      <div className="milestone-progress-grid">
        {Object.entries(groupTasks(tasks)).map(([groupName, groupTasksList]) => {
          const done = groupTasksList.filter(isTaskComplete).length;
          const percent = groupTasksList.length ? Math.round((done / groupTasksList.length) * 100) : 0;
          return (
            <article key={groupName}>
              <span>{groupName}</span>
              <b>{done} / {groupTasksList.length}</b>
              <Progress value={percent} />
            </article>
          );
        })}
      </div>

      <TaskComposer title={title} group={group} groups={milestoneGroups} onTitleChange={onTitleChange} onGroupChange={onGroupChange} onAdd={onAdd} />

      <div className="task-groups">
        {Object.entries(groups).map(([groupName, groupTasksList]) => (
          <section key={groupName}>
            <h3>{groupName}</h3>
            <div className="workspace-list">
              {groupTasksList.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}
            </div>
          </section>
        ))}
        {complete.length > 0 && (
          <section className="completed-tasks">
            <h3>Completed</h3>
            <div className="workspace-list">
              {complete.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TaskComposer({ title, group, groups, onTitleChange, onGroupChange, onAdd }: { title: string; group: string; groups: string[]; onTitleChange: (value: string) => void; onGroupChange: (value: string) => void; onAdd: () => void }) {
  return (
    <div className="task-composer">
      <input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Add a new Forge task..." />
      <select value={group} onChange={(event) => onGroupChange(event.target.value)}>
        {groups.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" onClick={onAdd}>Add Task</button>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: ForgeTask; onToggle: (task: ForgeTask) => void; onDelete: (id: string, label: string) => void }) {
  const complete = isTaskComplete(task);
  return (
    <article className={`task-row ${complete ? "done" : ""}`}>
      <button type="button" className="task-check" onClick={() => onToggle(task)} aria-label={complete ? `Reopen ${task.title}` : `Complete ${task.title}`}>
        {complete ? "✓" : ""}
      </button>
      <div>
        <b>{task.title}</b>
        <span>{task.milestone_group || "General"}{task.priority ? ` · ${task.priority}` : ""}</span>
      </div>
      <button type="button" className="workspace-delete" onClick={() => onDelete(task.id, `task: ${task.title}`)}>Delete</button>
    </article>
  );
}

function SparkList({ sparks, projects, onMove, onDelete }: { sparks: ForgeSpark[]; projects: ForgeProject[]; onMove: (id: string, projectId: string) => void; onDelete: (id: string, label: string) => void }) {
  if (!sparks.length) return <Empty title="No sparks captured for this project yet." text="Capture the small idea before it cools." />;
  return <div className="workspace-list">{sparks.map((spark) => <article key={spark.id}><b>{spark.spark_text}</b><MoveSelect value={spark.project_id || ""} projects={projects} onChange={(value) => onMove(spark.id, value)} /><DeleteButton onClick={() => onDelete(spark.id, `spark: ${spark.spark_text.slice(0, 40)}`)} /></article>)}</div>;
}

function NoteList({ notes, projects, onMove, onDelete }: { notes: ForgeNote[]; projects: ForgeProject[]; onMove: (id: string, projectId: string) => void; onDelete: (id: string, label: string) => void }) {
  if (!notes.length) return <Empty title="No notes yet." text="Write down the shape of the idea." />;
  return <div className="workspace-list">{notes.map((note) => <article key={note.id}><b>{note.title}</b><span>{note.body}</span><MoveSelect value={note.project_id || ""} projects={projects} onChange={(value) => onMove(note.id, value)} /><DeleteButton onClick={() => onDelete(note.id, `note: ${note.title}`)} /></article>)}</div>;
}

function FileList({ files, projects, onMove, onDelete }: { files: ForgeFile[]; projects: ForgeProject[]; onMove: (id: string, projectId: string) => void; onDelete: (id: string, label: string) => void }) {
  if (!files.length) return <Empty title="No files attached yet." text="Upload screenshots, PDFs, references, sketches, or docs." />;
  return <div className="workspace-list">{files.map((file) => <article key={file.id}><b>{file.file_name}</b><span>{file.caption || file.file_type || "Forge file"}</span><MoveSelect value={file.project_id || ""} projects={projects} onChange={(value) => onMove(file.id, value)} /><DeleteButton onClick={() => onDelete(file.id, `file: ${file.file_name}`)} /></article>)}</div>;
}

function ImageGrid({ files, projects, onMove, onDelete, onPreview, onSetCover }: { files: ForgeFile[]; projects?: ForgeProject[]; onMove?: (id: string, projectId: string) => void; onDelete?: (id: string, label: string) => void; onPreview?: (file: ForgeFile) => void; onSetCover?: (file: ForgeFile) => void }) {
  if (!files.length) return <Empty title="No images on the board yet." text="Attach concept art, sketches, screenshots, or references." />;
  return (
    <div className="workspace-images">
      {files.map((file) => (
        <figure key={file.id}>
          <button type="button" className="image-preview-button" onClick={() => onPreview?.(file)}>
            {file.file_url ? <Image src={file.file_url} alt={file.caption || file.file_name} width={260} height={170} unoptimized /> : <span>{file.file_name}</span>}
          </button>
          <figcaption>{file.caption || file.file_name}</figcaption>
          {projects && onMove && <MoveSelect value={file.project_id || ""} projects={projects} onChange={(value) => onMove(file.id, value)} />}
          {onSetCover && file.file_url && <button type="button" className="workspace-secondary" onClick={() => onSetCover(file)}>Set Cover</button>}
          {onDelete && <DeleteButton onClick={() => onDelete(file.id, `image: ${file.file_name}`)} />}
        </figure>
      ))}
    </div>
  );
}

function Activity({ sparks, notes, files, tasks, project, inbox }: { sparks: ForgeSpark[]; notes: ForgeNote[]; files: ForgeFile[]; tasks: ForgeTask[]; project: ForgeProject | null; inbox: boolean }) {
  const rows = [
    ...sparks.map((spark) => `Spark added: ${spark.spark_text}`),
    ...notes.map((note) => `Note added: ${note.title}`),
    ...files.map((file) => `${isImage(file) ? "Image" : "File"} uploaded: ${file.file_name}`),
    ...tasks.map((task) => `${isTaskComplete(task) ? "Task completed" : "Task added"}: ${task.title}`),
    ...(!inbox && project ? [`Project updated: ${project.title}`] : []),
  ];
  if (!rows.length) return <Empty title="No activity yet." text="Project movement will appear here." />;
  return <div className="workspace-list">{rows.map((row, index) => <article key={`${row}-${index}`}><b>{row}</b></article>)}</div>;
}

function MoveSelect({ value, projects, onChange }: { value: string; projects: ForgeProject[]; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned Forge Inbox</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="workspace-delete" onClick={onClick}>Delete</button>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="workspace-empty"><strong>{title}</strong><span>{text}</span></div>;
}

function isImage(file: ForgeFile) {
  return Boolean((file.file_type || "").startsWith("image/") || (file.file_url || "").startsWith("data:image/"));
}

function isTaskComplete(task: ForgeTask) {
  return ["done", "complete", "completed"].includes((task.status || "").toLowerCase()) || Boolean(task.completed_at);
}

function sortTasks(a: ForgeTask, b: ForgeTask) {
  return Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

function groupTasks(tasks: ForgeTask[]) {
  return tasks.reduce<Record<string, ForgeTask[]>>((groups, task) => {
    const key = task.milestone_group || "General";
    groups[key] ||= [];
    groups[key].push(task);
    groups[key].sort(sortTasks);
    return groups;
  }, {});
}

function ImageLightbox({ file, onClose }: { file: ForgeFile; onClose: () => void }) {
  return (
    <div className="image-lightbox" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={file.file_name} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close image preview">×</button>
        {file.file_url ? <Image src={file.file_url} alt={file.caption || file.file_name} width={1100} height={760} unoptimized /> : <strong>{file.file_name}</strong>}
        <p>{file.caption || file.file_name}</p>
      </section>
    </div>
  );
}

function WorkspaceStyles() {
  return <style jsx global>{`
    .forge-workspace { min-height: 100vh; padding: 28px; background: #030404; color: #eadfc7; position: relative; overflow-x: hidden; }
    .workspace-bg { position: fixed; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(3,4,4,.68), rgba(3,4,4,.84)), url("/images/Forge/forge-bg-texture.png") center/cover; opacity: .78; }
    .workspace-header, .workspace-panel, .workspace-tabs, .workspace-alert { position: relative; z-index: 1; border: 1px solid rgba(212,173,101,.2); border-radius: 12px; background: rgba(6,8,7,.88); box-shadow: inset 0 0 28px rgba(212,173,101,.04), 0 18px 48px rgba(0,0,0,.32); }
    .workspace-header { padding: 22px; }
    .workspace-header > a, .workspace-meta a { color: #caffbf; text-decoration: none; }
    .workspace-header > a,
    .workspace-meta a,
    .workspace-meta button,
    .workspace-tabs button,
    .workspace-delete,
    .workspace-list select {
      position: relative;
      overflow: hidden;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease, background 180ms ease;
    }
    .workspace-header > a::after,
    .workspace-meta a::after,
    .workspace-meta button::after,
    .workspace-tabs button::after,
    .workspace-delete::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent, rgba(255, 216, 144, .18), transparent);
      transform: translateX(-120%);
      transition: transform 420ms ease;
      pointer-events: none;
    }
    .workspace-header > a:hover,
    .workspace-meta a:hover,
    .workspace-meta button:hover,
    .workspace-tabs button:hover,
    .workspace-delete:hover,
    .workspace-list select:hover {
      border-color: rgba(196,111,45,.62);
      box-shadow: 0 0 26px rgba(196,111,45,.22), inset 0 0 18px rgba(143,220,124,.05);
      transform: translateY(-2px);
    }
    .workspace-header > a:hover::after,
    .workspace-meta a:hover::after,
    .workspace-meta button:hover::after,
    .workspace-tabs button:hover::after,
    .workspace-delete:hover::after {
      transform: translateX(120%);
    }
    .workspace-header p { color: #f0a44d; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    .workspace-header h1 { color: #fff1c8; font-size: clamp(2rem, 5vw, 4rem); text-transform: uppercase; }
    .workspace-header > span { color: rgba(234,223,199,.75); display: block; max-width: 820px; }
    .workspace-cover {
      border: 1px solid rgba(212,173,101,.2);
      border-radius: 12px;
      float: right;
      margin: 0 0 12px 18px;
      max-width: min(360px, 42vw);
      overflow: hidden;
      position: relative;
      box-shadow: 0 18px 46px rgba(0,0,0,.34), 0 0 26px rgba(196,111,45,.14);
    }
    .workspace-cover img {
      display: block;
      height: 190px;
      object-fit: cover;
      width: 100%;
    }
    .workspace-progress { max-width: 520px; margin-top: 18px; }
    .workspace-progress em { display: block; margin-top: 8px; color: #f4d38f; font-style: normal; font-weight: 800; }
    .workspace-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .workspace-meta b, .workspace-meta a, .workspace-meta button { border: 1px solid rgba(143,220,124,.28); border-radius: 999px; padding: 7px 10px; }
    .workspace-meta button { background: rgba(0,0,0,.34); color: #eadfc7; cursor: pointer; font: inherit; }
    .workspace-meta .project-delete {
      border-color: rgba(255, 112, 92, .38);
      color: #ffd0c8;
    }
    .task-goal-form {
      align-items: end;
      border: 1px solid rgba(143,220,124,.24);
      border-radius: 12px;
      background:
        radial-gradient(circle at 18% 20%, rgba(143,220,124,.12), transparent 28%),
        rgba(0,0,0,.28);
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(260px, 1fr) 120px 170px auto;
      margin-top: 14px;
      padding: 14px;
    }
    .task-goal-form p {
      color: #f0a44d;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .task-goal-form strong {
      color: #fff1c8;
      display: block;
      margin-top: 4px;
    }
    .task-goal-form span {
      color: rgba(234,223,199,.72);
      display: block;
      margin-top: 5px;
    }
    .task-goal-form label {
      display: grid;
      gap: 6px;
    }
    .task-goal-form input,
    .task-goal-form select {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .task-goal-form button {
      border: 1px solid rgba(143,220,124,.36);
      border-radius: 8px;
      background: rgba(143,220,124,.1);
      color: #caffbf;
      cursor: pointer;
      font-weight: 900;
      padding: 10px 12px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    .task-goal-form button:hover {
      border-color: rgba(143,220,124,.72);
      box-shadow: 0 0 24px rgba(143,220,124,.18);
      transform: translateY(-2px);
    }
    .workspace-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding: 10px; }
    .workspace-tabs button, .workspace-list select { border: 1px solid rgba(212,173,101,.22); border-radius: 8px; background: rgba(0,0,0,.34); color: #eadfc7; padding: 8px 10px; cursor: pointer; }
    .workspace-tabs button.active, .workspace-tabs button:hover { border-color: rgba(196,111,45,.62); color: #ffc46c; box-shadow: 0 0 22px rgba(196,111,45,.18); }
    .workspace-panel { margin-top: 16px; min-height: 420px; padding: 18px; }
    .workspace-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .workspace-card, .workspace-list article, .workspace-empty, .workspace-images figure { border: 1px solid rgba(212,173,101,.16); border-radius: 10px; background: rgba(0,0,0,.26); padding: 14px; }
    .workspace-card p { color: #f0a44d; letter-spacing: .14em; text-transform: uppercase; font-size: .72rem; }
    .workspace-card strong, .workspace-list b { color: #fff1c8; display: block; }
    .mission-card {
      grid-column: span 2;
    }
    .mission-card span,
    .mission-card em {
      color: rgba(234,223,199,.72);
      display: block;
      font-style: normal;
      margin-top: 7px;
    }
    .workspace-list { display: grid; gap: 10px; }
    .workspace-list span, .workspace-empty span { color: rgba(234,223,199,.68); display: block; margin-top: 5px; }
    .workspace-list article { display: grid; gap: 8px; }
    .workspace-images { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .workspace-images img { width: 100%; height: 170px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(212,173,101,.18); }
    .image-preview-button {
      border: 0;
      background: transparent;
      cursor: zoom-in;
      padding: 0;
      width: 100%;
    }
    .workspace-images figcaption { margin-top: 8px; color: rgba(234,223,199,.72); }
    .workspace-empty { display: grid; place-content: center; min-height: 180px; text-align: center; }
    .workspace-alert { margin-top: 12px; padding: 12px; color: #caffbf; }
    .workspace-alert.danger { color: #ffb0a8; }
    .workspace-delete {
      justify-self: start;
      border: 1px solid rgba(255, 112, 92, .4);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(80, 14, 10, .72), rgba(16, 6, 4, .92));
      color: #ffd0c8;
      cursor: pointer;
      font-weight: 800;
      letter-spacing: .08em;
      padding: 8px 11px;
      text-transform: uppercase;
    }
    .workspace-delete:hover {
      border-color: rgba(255, 162, 122, .78);
      color: #fff0e8;
      box-shadow: 0 0 28px rgba(255, 86, 52, .22), inset 0 0 18px rgba(255, 188, 108, .08);
    }
    .workspace-secondary,
    .task-composer button {
      border: 1px solid rgba(143,220,124,.34);
      border-radius: 8px;
      background: rgba(143,220,124,.08);
      color: #caffbf;
      cursor: pointer;
      font-weight: 800;
      padding: 8px 11px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    .workspace-secondary:hover,
    .task-composer button:hover {
      border-color: rgba(143,220,124,.68);
      box-shadow: 0 0 24px rgba(143,220,124,.18);
      transform: translateY(-2px);
    }
    .task-board {
      display: grid;
      gap: 16px;
    }
    .task-command {
      align-items: end;
      border: 1px solid rgba(196,111,45,.24);
      border-radius: 12px;
      background:
        radial-gradient(circle at 12% 20%, rgba(196,111,45,.16), transparent 28%),
        rgba(0,0,0,.28);
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding: 16px;
    }
    .task-command p,
    .task-groups h3,
    .milestone-progress-grid span {
      color: #f0a44d;
      font-size: .74rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .task-command h2 {
      color: #fff1c8;
      margin-top: 4px;
    }
    .task-command span,
    .task-command em {
      color: rgba(234,223,199,.72);
      display: block;
      font-style: normal;
      margin-top: 7px;
    }
    .task-command > strong {
      border: 1px solid rgba(143,220,124,.28);
      border-radius: 999px;
      color: #caffbf;
      padding: 9px 12px;
      white-space: nowrap;
    }
    .milestone-progress-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .milestone-progress-grid article {
      border: 1px solid rgba(212,173,101,.16);
      border-radius: 10px;
      background: rgba(0,0,0,.24);
      padding: 12px;
    }
    .milestone-progress-grid b {
      color: #fff1c8;
      display: block;
      margin: 6px 0 8px;
    }
    .task-composer {
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(220px, 1fr) minmax(190px, 260px) auto;
    }
    .task-composer input,
    .task-composer select {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .task-groups {
      display: grid;
      gap: 18px;
    }
    .task-groups section {
      display: grid;
      gap: 9px;
    }
    .task-row {
      align-items: center;
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .task-row.done {
      opacity: .7;
    }
    .task-row.done b {
      text-decoration: line-through;
      text-decoration-color: rgba(143,220,124,.55);
    }
    .task-check {
      align-items: center;
      border: 1px solid rgba(143,220,124,.42);
      border-radius: 8px;
      background: rgba(143,220,124,.08);
      color: #caffbf;
      cursor: pointer;
      display: inline-flex;
      font-weight: 900;
      height: 32px;
      justify-content: center;
      width: 32px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    .task-check:hover {
      border-color: rgba(143,220,124,.75);
      box-shadow: 0 0 20px rgba(143,220,124,.18);
      transform: translateY(-2px);
    }
    .image-lightbox {
      align-items: center;
      background: rgba(0,0,0,.82);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 28px;
      position: fixed;
      z-index: 100;
    }
    .image-lightbox section {
      border: 1px solid rgba(212,173,101,.34);
      border-radius: 14px;
      background: rgba(6,8,7,.96);
      max-height: calc(100vh - 56px);
      max-width: min(1120px, 94vw);
      overflow: auto;
      padding: 16px;
      position: relative;
      box-shadow: 0 24px 80px rgba(0,0,0,.62), 0 0 42px rgba(196,111,45,.2);
    }
    .image-lightbox section > button {
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      background: rgba(0,0,0,.58);
      color: #fff1c8;
      cursor: pointer;
      font-size: 1.8rem;
      height: 40px;
      position: absolute;
      right: 24px;
      top: 24px;
      width: 40px;
      z-index: 1;
    }
    .image-lightbox img {
      border-radius: 10px;
      display: block;
      height: auto;
      max-height: 74vh;
      max-width: 100%;
      object-fit: contain;
      width: auto;
    }
    .image-lightbox p {
      color: rgba(234,223,199,.76);
      margin-top: 10px;
    }
    @media (max-width: 760px) {
      .workspace-cover {
        float: none;
        margin: 0 0 14px;
        max-width: 100%;
      }
      .mission-card {
        grid-column: auto;
      }
      .task-command {
        align-items: start;
        flex-direction: column;
      }
      .task-composer {
        grid-template-columns: 1fr;
      }
      .task-row {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .task-row .workspace-delete {
        grid-column: 2;
      }
      .task-goal-form {
        grid-template-columns: 1fr;
      }
    }
  `}</style>;
}
