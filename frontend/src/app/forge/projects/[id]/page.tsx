"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
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
  linked_goals?: Array<{
    id: string;
    title: string;
    category?: string | null;
    relationship_type?: string | null;
    notes?: string | null;
    milestones?: Array<{ id: string; title: string; status: string; target_date?: string | null; cost?: number | null; notes?: string | null }>;
    project?: {
      completed_count?: number;
      total_count?: number;
      percent?: number;
      next_milestone?: { title?: string | null } | null;
    } | null;
    progress?: { percent?: number; remaining?: number; is_complete?: boolean } | null;
  }> | null;
};

type ForgeSpark = { id: string; spark_text: string; project_id?: string | null; category?: string | null; tags?: string[] | null; folder_path?: string[] | null; created_at?: string | null };
type ForgeNote = {
  id: string;
  title: string;
  body?: string | null;
  project_id?: string | null;
  category?: string | null;
  tags?: string[] | null;
  folder_path?: string[] | null;
  note_type?: string | null;
  status?: string | null;
  is_pinned?: boolean | null;
  linked_milestone?: string | null;
  linked_tasks?: string[] | null;
  sort_order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};
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
  task_type?: string | null;
  linked_goal_id?: string | null;
  counts_toward_goal?: boolean | null;
  goal_event_id?: string | null;
  metadata?: Record<string, unknown> | null;
  project_id: string;
  created_at?: string | null;
};
type ForgeSession = {
  id: string;
  project_id: string;
  task_id?: string | null;
  linked_goal_id?: string | null;
  session_type: string;
  title: string;
  scratchpad?: string | null;
  decisions?: string | null;
  follow_up_task?: string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
};
type ForgeLedgerEntry = {
  id: string;
  project_id: string;
  note_id?: string | null;
  entry_type: "canon" | "decision" | "question" | "draft" | "idea" | "reference";
  title?: string | null;
  body: string;
  tags?: string[] | null;
  folder?: string | null;
  subfolder?: string | null;
  linked_task_id?: string | null;
  linked_milestone?: string | null;
  is_pinned?: boolean | null;
  status?: string | null;
  resolved?: boolean | null;
  resolution_text?: string | null;
  resolved_into_entry_id?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  forge_notes?: { id: string; title: string } | null;
};
type ProjectGoalOption = { id: string; title: string };
type ImportedGoalTask = {
  id: string;
  goalId: string;
  goalTitle: string;
  section: string;
  title: string;
  status: string;
  complete: boolean;
  targetDate?: string | null;
  cost?: number | null;
  notes?: string | null;
};

type EditingForgeItem =
  | { kind: "spark"; item: ForgeSpark; text: string; projectId: string; category: string; tags: string; folderPrimary: string; folderChild: string; newFolderPrimary: string; newFolderChild: string }
  | { kind: "note"; item: ForgeNote; title: string; body: string; projectId: string; category: string; tags: string; noteType: string; status: string; isPinned: boolean; linkedMilestone: string; folderPrimary: string; folderChild: string; newFolderPrimary: string; newFolderChild: string };

const TABS = ["Overview", "Shared Goals", "Writing Desk", "Canon Board", "Tasks", "Spark Log", "Timeline", "Research", "Notes", "Files", "Images", "Activity"];

export default function ForgeProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const inbox = projectId === "inbox";
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [sparks, setSparks] = useState<ForgeSpark[]>([]);
  const [notes, setNotes] = useState<ForgeNote[]>([]);
  const [files, setFiles] = useState<ForgeFile[]>([]);
  const [tasks, setTasks] = useState<ForgeTask[]>([]);
  const [sessions, setSessions] = useState<ForgeSession[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<ForgeLedgerEntry[]>([]);
  const [tab, setTab] = useState("Overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskGroup, setNewTaskGroup] = useState("Milestone 5 - Vertical Slice");
  const [previewImage, setPreviewImage] = useState<ForgeFile | null>(null);
  const [showTaskGoalForm, setShowTaskGoalForm] = useState(false);
  const [taskGoalTarget, setTaskGoalTarget] = useState("3");
  const [taskGoalFrequency, setTaskGoalFrequency] = useState("weekly");
  const [taskBusy, setTaskBusy] = useState<{ id?: string; title: string; action: "complete" | "reopen" | "create" } | null>(null);
  const [editingItem, setEditingItem] = useState<EditingForgeItem | null>(null);
  const [uploadForm, setUploadForm] = useState({ fileName: "", fileType: "", fileSize: "", fileUrl: "", caption: "", tags: "", useAsCover: false });
  const [previewFile, setPreviewFile] = useState<ForgeFile | null>(null);
  const [writingDraft, setWritingDraft] = useState({ title: "", body: "", noteType: "draft", folderPrimary: "", folderChild: "", tags: "" });
  const [captureModal, setCaptureModal] = useState<"spark" | "note" | null>(null);
  const [captureForm, setCaptureForm] = useState({
    sparkText: "",
    noteTitle: "",
    noteBody: "",
    noteType: "idea",
    projectId: "",
    category: "",
    tags: "",
    folderPrimary: "",
    folderChild: "",
    newFolderPrimary: "",
    newFolderChild: "",
  });
  const [sessionDraft, setSessionDraft] = useState({
    open: false,
    sessionType: "Continue Current Mission",
    taskId: "",
    title: "",
    scratchpad: "",
    decisions: "",
    followUpTask: "",
    convertScratchpadToNote: true,
    markTaskComplete: false,
    countTowardGoal: true,
    linkedGoalId: "",
  });

  const project = projects.find((item) => item.id === projectId) || null;
  const visibleSparks = sparks.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleNotes = notes.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleFiles = files.filter((item) => inbox ? !item.project_id : item.project_id === projectId);
  const visibleImages = visibleFiles.filter(isImage);
  const visibleTasks = tasks.filter((item) => !inbox && item.project_id === projectId);
  const visibleSessions = sessions.filter((item) => !inbox && item.project_id === projectId);
  const importedGoalTasks = useMemo(() => project ? buildLinkedGoalTasks(project) : [], [project]);
  const visibleLedgerEntries = ledgerEntries.filter((item) => !inbox && item.project_id === projectId);
  const progress = project?.linked_goal?.project?.percent ?? project?.progress_percent ?? 0;

  const counts = useMemo(() => ({
    "Spark Log": visibleSparks.length,
    Notes: visibleNotes.length,
    Files: visibleFiles.length,
    Images: visibleImages.length,
    Activity: visibleSparks.length + visibleNotes.length + visibleFiles.length + visibleTasks.length + visibleSessions.length,
    Timeline: project?.linked_goal?.milestones?.length || 0,
    Tasks: visibleTasks.length + importedGoalTasks.length,
    "Writing Desk": visibleNotes.length,
    "Canon Board": visibleLedgerEntries.length + visibleNotes.filter((note) => ["canon", "decision", "question", "draft", "idea"].includes(note.note_type || "")).length,
    "Shared Goals": (project?.linked_goal ? 1 : 0) + (project?.linked_goals?.length || 0),
    Research: 0,
  }), [visibleSparks.length, visibleNotes, visibleFiles.length, visibleImages.length, visibleTasks.length, visibleSessions.length, visibleLedgerEntries.length, importedGoalTasks.length, project]);

  const folderOptions = useMemo(() => buildFolderOptions(visibleNotes, visibleSparks), [visibleNotes, visibleSparks]);

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
      setSessions(data.sessions || []);
      setLedgerEntries(data.ledger_entries || []);
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

  function openSparkDrawer(spark: ForgeSpark) {
    setEditingItem({
      kind: "spark",
      item: spark,
      text: spark.spark_text,
      projectId: spark.project_id || "",
      category: spark.category || project?.category || "",
      tags: (spark.tags || []).join(", "),
      folderPrimary: spark.folder_path?.[0] || "",
      folderChild: spark.folder_path?.[1] || "",
      newFolderPrimary: "",
      newFolderChild: "",
    });
  }

  function openNoteDrawer(note: ForgeNote) {
    setEditingItem({
      kind: "note",
      item: note,
      title: note.title,
      body: note.body || "",
      projectId: note.project_id || "",
      category: note.category || project?.category || "",
      tags: (note.tags || []).join(", "),
      noteType: note.note_type || "idea",
      status: note.status || "active",
      isPinned: Boolean(note.is_pinned),
      linkedMilestone: note.linked_milestone || "",
      folderPrimary: note.folder_path?.[0] || "",
      folderChild: note.folder_path?.[1] || "",
      newFolderPrimary: "",
      newFolderChild: "",
    });
  }

  async function saveEditingItem() {
    if (!editingItem) return;
    setError("");
    const selectedProject = projects.find((item) => item.id === editingItem.projectId);
    const tags = editingItem.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const folder_path = resolveFolderPath(folderOptions, editingItem.folderPrimary, editingItem.folderChild, editingItem.newFolderPrimary, editingItem.newFolderChild);
    const endpoint = editingItem.kind === "spark" ? "sparks" : "notes";
    const payload = editingItem.kind === "spark"
      ? {
          spark_text: editingItem.text,
          project_id: editingItem.projectId || null,
          category: selectedProject?.category || editingItem.category || null,
          tags,
          folder_path,
        }
      : {
          title: editingItem.title,
          body: editingItem.body || null,
          project_id: editingItem.projectId || null,
          category: selectedProject?.category || editingItem.category || null,
          tags,
          folder_path,
          note_type: editingItem.noteType || null,
          status: editingItem.status || "active",
          is_pinned: editingItem.isPinned,
          linked_milestone: editingItem.linkedMilestone || null,
        };
    const res = await fetch(`${API_BASE}/forge/${endpoint}/${editingItem.item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Forge item update failed.");
      return;
    }
    setMessage(editingItem.kind === "spark" ? "Spark updated." : "Note updated.");
    setEditingItem(null);
    await loadForge();
  }

  async function createLedgerExtract(entryType: ForgeLedgerEntry["entry_type"], note?: ForgeNote) {
    if (!project) return;
    const selectedText = typeof window !== "undefined" ? window.getSelection()?.toString().trim() || "" : "";
    const fallback = note?.body || note?.title || "";
    const body = window.prompt(`Add ${ledgerTypeLabel(entryType)} extract`, selectedText || fallback.slice(0, 320));
    if (!body?.trim()) return;
    const title = window.prompt("Optional ledger title", note?.title || ledgerTypeLabel(entryType)) || "";
    const tags = note?.tags || [];
    const folderPath = normalizeFolderPath(note?.folder_path || []);
    const res = await fetch(`${API_BASE}/forge/ledger-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: USER_ID,
        project_id: project.id,
        note_id: note?.id || null,
        entry_type: entryType,
        title: title.trim() || null,
        body: body.trim(),
        tags,
        folder: folderPath[0] || null,
        subfolder: folderPath[1] || null,
        is_pinned: ["canon", "decision"].includes(entryType),
        status: "active",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Canon Board entry could not be saved. Run the Canon Board SQL migration if the table is missing.");
      return;
    }
    setMessage(`${ledgerTypeLabel(entryType)} added to Canon Board.`);
    await loadForge();
  }

  async function updateLedgerEntry(entry: ForgeLedgerEntry, payload: Partial<ForgeLedgerEntry>) {
    const res = await fetch(`${API_BASE}/forge/ledger-entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Canon Board update failed.");
      return;
    }
    setMessage("Canon Board updated.");
    await loadForge();
  }

  async function resolveLedgerQuestion(entry: ForgeLedgerEntry, nextType: "canon" | "decision") {
    const resolution = window.prompt("Resolution", entry.resolution_text || "");
    if (!resolution?.trim()) return;
    const created = await fetch(`${API_BASE}/forge/ledger-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: USER_ID,
        project_id: entry.project_id,
        note_id: entry.note_id || null,
        entry_type: nextType,
        title: entry.title ? `${entry.title} Resolution` : `Resolved ${ledgerTypeLabel(nextType)}`,
        body: resolution.trim(),
        tags: entry.tags || [],
        folder: entry.folder || null,
        subfolder: entry.subfolder || null,
        is_pinned: true,
        status: "active",
      }),
    });
    const createdData = await created.json();
    if (!created.ok) {
      setError(createdData.detail || "Resolution entry could not be saved.");
      return;
    }
    await updateLedgerEntry(entry, {
      resolved: true,
      resolution_text: resolution.trim(),
      resolved_into_entry_id: createdData.entry?.id || null,
      resolved_at: new Date().toISOString(),
    });
  }

  async function saveWritingDraft() {
    if (!project || !writingDraft.title.trim()) {
      setError("Writing Desk needs a title before saving.");
      return;
    }
    setTaskBusy({ title: writingDraft.title.trim(), action: "create" });
    setError("");
    try {
      const tags = writingDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const folder_path = resolveFolderPath(folderOptions, writingDraft.folderPrimary, writingDraft.folderChild, "", "");
      const res = await fetch(`${API_BASE}/forge/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          user_id: USER_ID,
          project_id: project.id,
          category: project.category,
          title: writingDraft.title.trim(),
          body: writingDraft.body || null,
          tags,
          note_type: writingDraft.noteType,
          status: "active",
          is_pinned: ["canon", "decision", "gdd_section"].includes(writingDraft.noteType),
          folder_path,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Writing Desk save failed.");
      setWritingDraft({ title: "", body: "", noteType: "draft", folderPrimary: "", folderChild: "", tags: "" });
      setMessage(`Writing saved: ${data.note?.title || "Forge note"}`);
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Writing Desk save failed.");
    } finally {
      setTaskBusy(null);
    }
  }

  function openCaptureModal(kind: "spark" | "note") {
    setCaptureModal(kind);
    setCaptureForm({
      sparkText: "",
      noteTitle: "",
      noteBody: "",
      noteType: "idea",
      projectId: project?.id || "",
      category: project?.category || "",
      tags: "",
      folderPrimary: "",
      folderChild: "",
      newFolderPrimary: "",
      newFolderChild: "",
    });
  }

  async function saveCaptureModal() {
    if (!captureModal) return;
    const selectedProject = projects.find((item) => item.id === captureForm.projectId);
    const isSpark = captureModal === "spark";
    if (isSpark && !captureForm.sparkText.trim()) {
      setError("Spark text is required.");
      return;
    }
    if (!isSpark && !captureForm.noteTitle.trim()) {
      setError("Note title is required.");
      return;
    }
    setTaskBusy({ title: isSpark ? "New Spark" : captureForm.noteTitle.trim(), action: "create" });
    setError("");
    try {
      const tags = captureForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const folder_path = resolveFolderPath(folderOptions, captureForm.folderPrimary, captureForm.folderChild, captureForm.newFolderPrimary, captureForm.newFolderChild);
      const res = await fetch(`${API_BASE}/forge/${isSpark ? "sparks" : "notes"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify(isSpark
          ? {
              user_id: USER_ID,
              project_id: captureForm.projectId || null,
              category: selectedProject?.category || captureForm.category || null,
              spark_text: captureForm.sparkText.trim(),
              tags,
              folder_path,
            }
          : {
              user_id: USER_ID,
              project_id: captureForm.projectId || null,
              category: selectedProject?.category || captureForm.category || null,
              title: captureForm.noteTitle.trim(),
              body: captureForm.noteBody || null,
              note_type: captureForm.noteType,
              status: "active",
              tags,
              folder_path,
              is_pinned: ["canon", "decision", "gdd_section"].includes(captureForm.noteType),
            }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `${isSpark ? "Spark" : "Note"} could not be saved.`);
      setCaptureModal(null);
      setMessage(isSpark ? `Spark saved${selectedProject ? ` to ${selectedProject.title}` : " to Forge Inbox"}.` : `Note saved${selectedProject ? ` to ${selectedProject.title}` : " to Forge Inbox"}.`);
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forge capture could not be saved.");
    } finally {
      setTaskBusy(null);
    }
  }

  function openForgeSession(task?: ForgeTask) {
    if (!project) return;
    const nextTask = task || visibleTasks.filter((item) => !isTaskComplete(item)).sort(sortTasks)[0];
    const goalId = project.task_goal?.id || project.linked_goal?.id || project.linked_goals?.[0]?.id || "";
    setSessionDraft({
      open: true,
      sessionType: nextTask ? "Work on Selected Task" : "Continue Current Mission",
      taskId: nextTask?.id || "",
      title: nextTask?.title || project.next_milestone || "Forge Session",
      scratchpad: "",
      decisions: "",
      followUpTask: "",
      convertScratchpadToNote: true,
      markTaskComplete: false,
      countTowardGoal: Boolean(goalId),
      linkedGoalId: goalId,
    });
  }

  async function completeForgeSession() {
    if (!project || !sessionDraft.title.trim()) return;
    setTaskBusy({ title: sessionDraft.title.trim(), action: "create" });
    setError("");
    try {
      const res = await fetch(`${API_BASE}/forge/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          user_id: USER_ID,
          project_id: project.id,
          task_id: sessionDraft.taskId || null,
          linked_goal_id: sessionDraft.linkedGoalId || null,
          session_type: sessionDraft.sessionType,
          title: sessionDraft.title.trim(),
          scratchpad: sessionDraft.scratchpad || null,
          decisions: sessionDraft.decisions || null,
          follow_up_task: sessionDraft.followUpTask || null,
          convert_scratchpad_to_note: sessionDraft.convertScratchpadToNote,
          mark_task_complete: sessionDraft.markTaskComplete,
          count_toward_goal: sessionDraft.countTowardGoal,
          status: "completed",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Forge session could not be saved. Run the Forge sessions SQL migration if the table is missing.");
      setSessionDraft((prev) => ({ ...prev, open: false }));
      setMessage(`Forge session completed: ${data.session?.title || sessionDraft.title}`);
      await loadForge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forge session could not be saved.");
    } finally {
      setTaskBusy(null);
    }
  }

  async function uploadWorkspaceFile() {
    if (!project || !uploadForm.fileName.trim()) return;
    setError("");
    const tags = uploadForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const res = await fetch(`${API_BASE}/forge/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        user_id: USER_ID,
        project_id: project.id,
        category: project.category,
        file_name: uploadForm.fileName.trim(),
        file_type: uploadForm.fileType || null,
        file_size: uploadForm.fileSize ? Number(uploadForm.fileSize) : null,
        file_url: uploadForm.fileUrl || null,
        caption: uploadForm.caption || null,
        tags,
        metadata: { upload_status: "workspace_upload" },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "File upload metadata failed.");
      return;
    }
    if (uploadForm.useAsCover && uploadForm.fileUrl) {
      await fetch(`${API_BASE}/forge/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ cover_image_url: uploadForm.fileUrl }),
      });
    }
    setUploadForm({ fileName: "", fileType: "", fileSize: "", fileUrl: "", caption: "", tags: "", useAsCover: false });
    setMessage(`File attached: ${data.file?.file_name || uploadForm.fileName}`);
    await loadForge();
  }

  async function deleteItem(kind: "projects" | "sparks" | "notes" | "files" | "tasks" | "ledger-entries", id: string, label: string): Promise<boolean> {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return false;
    const res = await fetch(`${API_BASE}/forge/${kind}/${id}`, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || "Delete failed.");
      return false;
    }
    setMessage(`${label} deleted.`);
    if (kind === "projects") {
      window.location.href = "/forge/projects?filter=all";
      return true;
    }
    await loadForge();
    return true;
  }

  async function addTask() {
    if (!project || !newTaskTitle.trim()) return;
    if (taskBusy) return;
    const maxSort = visibleTasks.reduce((max, task) => Math.max(max, Number(task.sort_order || 0)), 0);
    const taskTitle = newTaskTitle.trim();
    setTaskBusy({ title: taskTitle, action: "create" });
    setError("");
    try {
      const res = await fetch(`${API_BASE}/forge/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          user_id: USER_ID,
          project_id: project.id,
          title: taskTitle,
          milestone_group: newTaskGroup || "General",
          status: "Backlog",
          task_type: "task",
          linked_goal_id: project.task_goal?.id || null,
          counts_toward_goal: true,
          sort_order: maxSort + 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Task could not be added. Run the Forge task SQL migration if the table is missing.");
        return;
      }
      setNewTaskTitle("");
      setMessage(`Task added: ${data.task?.title || taskTitle}`);
      await loadForge();
    } finally {
      setTaskBusy(null);
    }
  }

  async function toggleTask(task: ForgeTask) {
    if (taskBusy) return;
    const complete = isTaskComplete(task);
    setError("");
    setTaskBusy({ id: task.id, title: task.title, action: complete ? "reopen" : "complete" });
    try {
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
    } finally {
      setTaskBusy(null);
    }
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
              <button type="button" onClick={() => openForgeSession()}>Start Forge Session</button>
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
      {taskBusy && <TaskSavingOverlay task={taskBusy} />}

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
            {!inbox && project && <LinkedGoalsPanel project={project} />}
            {visibleImages.length > 0 && <ImageGrid files={visibleImages.slice(0, 3)} onPreview={setPreviewImage} />}
          </div>
        )}
        {tab === "Shared Goals" && !inbox && project && (
          <SharedGoalsScreen project={project} />
        )}
        {tab === "Writing Desk" && !inbox && project && (
          <WritingDesk
            draft={writingDraft}
            notes={visibleNotes}
            ledgerEntries={visibleLedgerEntries}
            folderOptions={folderOptions}
            onDraftChange={setWritingDraft}
            onSave={saveWritingDraft}
            onEdit={openNoteDrawer}
            onExtract={createLedgerExtract}
          />
        )}
        {tab === "Canon Board" && !inbox && project && (
          <CanonBoard
            entries={visibleLedgerEntries}
            notes={visibleNotes}
            tasks={visibleTasks}
            onOpenNote={openNoteDrawer}
            onCreateExtract={createLedgerExtract}
            onUpdate={updateLedgerEntry}
            onResolve={resolveLedgerQuestion}
            onDelete={(id, label) => deleteItem("ledger-entries", id, label)}
          />
        )}
        {tab === "Spark Log" && (
          <>
            {!inbox && project && <CaptureLaunchBar kind="spark" projectTitle={project.title} onOpen={() => openCaptureModal("spark")} />}
            <SparkList sparks={visibleSparks} folderOptions={folderOptions} onEdit={openSparkDrawer} />
          </>
        )}
        {tab === "Notes" && (
          <>
            {!inbox && project && <CaptureLaunchBar kind="note" projectTitle={project.title} onOpen={() => openCaptureModal("note")} />}
            <NoteList notes={visibleNotes} folderOptions={folderOptions} onEdit={openNoteDrawer} />
          </>
        )}
        {tab === "Files" && (
          <>
            {!inbox && project && <WorkspaceUploadForm form={uploadForm} onChange={setUploadForm} onUpload={uploadWorkspaceFile} />}
            <FileList files={visibleFiles} projects={projects} onMove={(id, next) => moveItem("files", id, next)} onDelete={(id, label) => deleteItem("files", id, label)} onPreview={setPreviewFile} />
          </>
        )}
        {tab === "Images" && (
          <>
            {!inbox && project && <WorkspaceUploadForm form={uploadForm} onChange={setUploadForm} onUpload={uploadWorkspaceFile} imageMode />}
            <ImageGrid files={visibleImages} projects={projects} onMove={(id, next) => moveItem("files", id, next)} onDelete={(id, label) => deleteItem("files", id, label)} onPreview={setPreviewImage} onSetCover={setProjectCover} />
          </>
        )}
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
            importedTasks={importedGoalTasks}
            title={newTaskTitle}
            group={newTaskGroup}
            onTitleChange={setNewTaskTitle}
            onGroupChange={setNewTaskGroup}
            onAdd={addTask}
            onToggle={toggleTask}
            onStartSession={openForgeSession}
            onDelete={(id, label) => deleteItem("tasks", id, label)}
            busyTaskId={taskBusy?.id || null}
          />
        )}
        {tab === "Research" && <Empty title="No research pinned yet." text="Research storage is prepared in SQL; save articles, videos, references, and sources here next." />}
        {tab === "Activity" && <Activity sparks={visibleSparks} notes={visibleNotes} files={visibleFiles} tasks={visibleTasks} sessions={visibleSessions} project={project} inbox={inbox} />}
      </section>
      {previewImage && <ImageLightbox file={previewImage} onClose={() => setPreviewImage(null)} />}
      {previewFile && <DocumentPreview file={previewFile} onClose={() => setPreviewFile(null)} />}
      {editingItem && (
        <ForgeItemDrawer
          item={editingItem}
          projects={projects}
          folderOptions={folderOptions}
          onChange={setEditingItem}
          onSave={saveEditingItem}
          onExtract={createLedgerExtract}
          onDelete={(kind, id, label) => deleteItem(kind, id, label).then((deleted) => {
            if (deleted) setEditingItem(null);
          })}
          onCancel={() => setEditingItem(null)}
        />
      )}
      {sessionDraft.open && project && (
        <ForgeSessionDrawer
          draft={sessionDraft}
          project={project}
          tasks={visibleTasks}
          goals={getProjectGoals(project)}
          onChange={setSessionDraft}
          onComplete={completeForgeSession}
          onCancel={() => setSessionDraft((prev) => ({ ...prev, open: false }))}
        />
      )}
      {captureModal && (
        <ProjectCaptureModal
          kind={captureModal}
          form={captureForm}
          projects={projects}
          folderOptions={folderOptions}
          onChange={setCaptureForm}
          onSave={saveCaptureModal}
          onClose={() => setCaptureModal(null)}
        />
      )}
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

function LinkedGoalsPanel({ project }: { project: ForgeProject }) {
  const goals = [
    ...(project.linked_goal ? [{ ...project.linked_goal, relationship_type: "primary", notes: "Primary synced project goal." }] : []),
    ...(project.linked_goals || []),
  ];

  if (!goals.length) {
    return <article className="workspace-card linked-goals-card"><p>Linked Goals</p><strong>No shared goals linked yet.</strong><span>Future dependency goals can be attached here without moving the project.</span></article>;
  }

  return (
    <article className="workspace-card linked-goals-card">
      <p>Linked Goals</p>
      {goals.map((goal) => {
        const percent = goal.project?.percent ?? goal.progress?.percent ?? 0;
        return (
          <div className="linked-goal-row" key={`${goal.id}-${goal.relationship_type || "goal"}`}>
            <div>
              <strong>{goal.title}</strong>
              <span>{goal.relationship_type || "linked"} · {goal.notes || "Updates here can depend on this goal."}</span>
            </div>
            <Progress value={percent} />
            <Link href={`/goals?focus=${goal.id}`}>Open Goal</Link>
          </div>
        );
      })}
    </article>
  );
}

function SharedGoalsScreen({ project }: { project: ForgeProject }) {
  const goals = [
    ...(project.linked_goal ? [{ ...project.linked_goal, relationship_type: "primary", notes: "Primary synced project goal." }] : []),
    ...(project.linked_goals || []),
  ];
  return (
    <div className="shared-goals-screen">
      <header>
        <p>Shared Goals</p>
        <h2>Dependencies and weekly standards connected to this project.</h2>
        <span>Use this when one goal matters to multiple Forge projects, like the workstation build supporting other systems.</span>
      </header>
      {!goals.length ? (
        <Empty title="No shared goals linked yet." text="Link a goal when this project depends on another active build or weekly standard." />
      ) : (
        <div className="shared-goal-grid">
          {goals.map((goal) => {
            const percent = goal.project?.percent ?? goal.progress?.percent ?? 0;
            const projectRemaining = (goal.project as { remaining_count?: number } | null | undefined)?.remaining_count;
            const remaining = projectRemaining ?? goal.progress?.remaining;
            return (
              <article key={`${goal.id}-${goal.relationship_type || "goal"}`} className="shared-goal-card">
                <p>{goal.relationship_type || "linked goal"}</p>
                <h3>{goal.title}</h3>
                <span>{goal.notes || "This goal is connected to the project workspace."}</span>
                <Progress value={percent} />
                <div>
                  <b>{Math.round(percent)}%</b>
                  <small>{remaining ?? "?"} remaining</small>
                </div>
                <Link href={`/goals?focus=${goal.id}`}>Open Goal</Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CanonBoard({
  entries,
  notes,
  tasks,
  onOpenNote,
  onCreateExtract,
  onUpdate,
  onResolve,
  onDelete,
}: {
  entries: ForgeLedgerEntry[];
  notes: ForgeNote[];
  tasks: ForgeTask[];
  onOpenNote: (note: ForgeNote) => void;
  onCreateExtract: (entryType: ForgeLedgerEntry["entry_type"], note?: ForgeNote) => void;
  onUpdate: (entry: ForgeLedgerEntry, payload: Partial<ForgeLedgerEntry>) => void;
  onResolve: (entry: ForgeLedgerEntry, nextType: "canon" | "decision") => void;
  onDelete: (id: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const ledgerItems = useMemo(() => buildCanonBoardItems(entries, notes), [entries, notes]);
  const filtered = ledgerItems.filter((item) => matchesCanonFilter(item, filter, query));
  const sections = [
    { key: "canon", title: "Canon", items: filtered.filter((item) => item.entry_type === "canon") },
    { key: "decision", title: "Decisions", items: filtered.filter((item) => item.entry_type === "decision") },
    { key: "question", title: "Open Questions", items: filtered.filter((item) => item.entry_type === "question" && !item.resolved) },
    { key: "draft", title: "Draft Ideas", items: filtered.filter((item) => ["draft", "idea"].includes(item.entry_type)) },
  ];
  const recentCanon = ledgerItems.filter((item) => item.entry_type === "canon").sort((a, b) => timestampValue(b.updated_at) - timestampValue(a.updated_at))[0];
  const recentDecision = ledgerItems.filter((item) => item.entry_type === "decision").sort((a, b) => timestampValue(b.updated_at) - timestampValue(a.updated_at))[0];
  const oldestQuestion = ledgerItems.filter((item) => item.entry_type === "question" && !item.resolved).sort((a, b) => timestampValue(a.created_at) - timestampValue(b.created_at))[0];

  return (
    <div className="canon-board">
      <header className="canon-header">
        <div>
          <p>Canon Board</p>
          <h2>Project truth without digging through folders.</h2>
        </div>
        <div className="canon-summary">
          {sections.map((section) => <span key={section.key}>{section.title}: <b>{section.items.length}</b></span>)}
        </div>
      </header>
      <div className="canon-highlight-row">
        <InfoCard title="Recently Changed Canon" value={recentCanon?.title || recentCanon?.body || "No canon recorded yet."} />
        <InfoCard title="Most Recent Decision" value={recentDecision?.title || recentDecision?.body || "No decisions recorded yet."} />
        <InfoCard title="Oldest Unresolved Question" value={oldestQuestion?.title || oldestQuestion?.body || "No open questions."} />
      </div>
      <div className="canon-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canon, decisions, tags, folders..." />
        <div>
          {CANON_FILTERS.map((chip) => (
            <button key={chip} type="button" className={filter === chip ? "active" : ""} onClick={() => setFilter(chip)}>{chip}</button>
          ))}
        </div>
      </div>
      <div className="ledger-quick-actions">
        <button type="button" onClick={() => onCreateExtract("canon")}>Add Canon Extract</button>
        <button type="button" onClick={() => onCreateExtract("decision")}>Add Decision Extract</button>
        <button type="button" onClick={() => onCreateExtract("question")}>Add Question Extract</button>
        <button type="button" onClick={() => onCreateExtract("draft")}>Add Draft Idea</button>
      </div>
      <div className="canon-section-grid">
        {sections.map((section) => (
          <section key={section.key}>
            <h3>{section.title}</h3>
            {section.items.length ? (
              <div className="workspace-list">
                {section.items.map((item) => (
                  <CanonBoardCard
                    key={`${item.source}-${item.id}`}
                    item={item}
                    notes={notes}
                    tasks={tasks}
                    onOpenNote={onOpenNote}
                    onUpdate={onUpdate}
                    onResolve={onResolve}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : (
              <Empty title={`No ${section.title.toLowerCase()} yet.`} text="Use extracts or note types to build this ledger." />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function CanonBoardCard({
  item,
  notes,
  tasks,
  onOpenNote,
  onUpdate,
  onResolve,
  onDelete,
}: {
  item: CanonBoardItem;
  notes: ForgeNote[];
  tasks: ForgeTask[];
  onOpenNote: (note: ForgeNote) => void;
  onUpdate: (entry: ForgeLedgerEntry, payload: Partial<ForgeLedgerEntry>) => void;
  onResolve: (entry: ForgeLedgerEntry, nextType: "canon" | "decision") => void;
  onDelete: (id: string, label: string) => void;
}) {
  const sourceNote = item.note_id ? notes.find((note) => note.id === item.note_id) : null;
  const linkedTask = item.linked_task_id ? tasks.find((task) => task.id === item.linked_task_id) : null;
  const canMutate = item.source === "ledger" && item.raw;
  return (
    <article className={`canon-card ${item.entry_type}`}>
      <div className="canon-card-top">
        <span>{ledgerTypeLabel(item.entry_type)}</span>
        {item.is_pinned && <em>Pinned</em>}
        {item.resolved && <em>Resolved</em>}
      </div>
      <h4>{item.title || firstLine(item.body)}</h4>
      <p>{item.body}</p>
      <div className="canon-tags">
        {(item.tags || []).slice(0, 6).map((tag) => <small key={tag}>{tag}</small>)}
      </div>
      {(item.folder || item.subfolder || sourceNote || linkedTask) && (
        <span className="canon-source">
          {[item.folder, item.subfolder].filter(Boolean).join(" / ")}
          {sourceNote ? ` · Source: ${sourceNote.title}` : ""}
          {linkedTask ? ` · Task: ${linkedTask.title}` : ""}
        </span>
      )}
      <div className="canon-card-actions">
        {sourceNote && <button type="button" onClick={() => onOpenNote(sourceNote)}>Open Source Note</button>}
        <button type="button" onClick={() => navigator.clipboard.writeText(item.body)}>Copy</button>
        {canMutate && item.raw && <button type="button" onClick={() => onUpdate(item.raw as ForgeLedgerEntry, { is_pinned: !item.is_pinned })}>{item.is_pinned ? "Unpin" : "Pin"}</button>}
        {canMutate && item.raw && item.entry_type === "question" && !item.resolved && <button type="button" onClick={() => onResolve(item.raw as ForgeLedgerEntry, "canon")}>Resolve as Canon</button>}
        {canMutate && item.raw && item.entry_type === "question" && !item.resolved && <button type="button" onClick={() => onResolve(item.raw as ForgeLedgerEntry, "decision")}>Resolve as Decision</button>}
        {canMutate && item.raw && <button type="button" onClick={() => onUpdate(item.raw as ForgeLedgerEntry, { status: item.status === "archived" ? "active" : "archived" })}>{item.status === "archived" ? "Restore" : "Archive"}</button>}
        {canMutate && <button type="button" className="danger" onClick={() => onDelete(item.id, `ledger entry: ${item.title || firstLine(item.body)}`)}>Delete</button>}
      </div>
    </article>
  );
}

function WritingDesk({
  draft,
  notes,
  ledgerEntries,
  folderOptions,
  onDraftChange,
  onSave,
  onEdit,
  onExtract,
}: {
  draft: { title: string; body: string; noteType: string; folderPrimary: string; folderChild: string; tags: string };
  notes: ForgeNote[];
  ledgerEntries: ForgeLedgerEntry[];
  folderOptions: FolderOptions;
  onDraftChange: (draft: { title: string; body: string; noteType: string; folderPrimary: string; folderChild: string; tags: string }) => void;
  onSave: () => void;
  onEdit: (note: ForgeNote) => void;
  onExtract: (entryType: ForgeLedgerEntry["entry_type"], note?: ForgeNote) => void;
}) {
  const bible = buildProjectBible(notes, ledgerEntries);
  return (
    <div className="writing-desk">
      <section className="writing-editor">
        <div>
          <p>Writing Desk</p>
          <h2>Build the document inside Forge.</h2>
          <span>Use this for GDD sections, canon notes, decisions, references, and project-bible material.</span>
        </div>
        <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Document title" />
        <div className="drawer-grid">
          <select value={draft.noteType} onChange={(event) => onDraftChange({ ...draft, noteType: event.target.value })}>
            <option value="draft">Draft</option>
            <option value="gdd_section">GDD Section</option>
            <option value="canon">Canon</option>
            <option value="decision">Decision</option>
            <option value="reference">Reference</option>
            <option value="question">Question</option>
            <option value="idea">Idea</option>
          </select>
          <input value={draft.tags} onChange={(event) => onDraftChange({ ...draft, tags: event.target.value })} placeholder="tags, comma separated" />
        </div>
        <FolderPicker
          folderOptions={folderOptions}
          primary={draft.folderPrimary}
          child={draft.folderChild}
          newPrimary=""
          newChild=""
          onChange={(next) => onDraftChange({ ...draft, folderPrimary: next.primary, folderChild: next.child })}
        />
        <textarea value={draft.body} onChange={(event) => onDraftChange({ ...draft, body: event.target.value })} placeholder="# Heading&#10;&#10;Write the project doc here..." rows={14} />
        <button type="button" className="workspace-secondary" onClick={onSave}>Save to Writing Desk</button>
      </section>
      <section className="project-bible">
        <div>
          <p>Project Bible</p>
          <h2>Generated from pinned/canon notes.</h2>
        </div>
        <pre>{bible || "No Project Bible material yet. Save canon, decision, reference, or GDD section notes to generate one."}</pre>
        <button type="button" className="workspace-secondary" onClick={() => navigator.clipboard.writeText(bible)}>Copy Project Bible Markdown</button>
      </section>
      <section className="writing-library">
        <h3>Writing Library</h3>
        <NoteList notes={notes} folderOptions={folderOptions} onEdit={onEdit} />
        <div className="ledger-quick-actions">
          <button type="button" onClick={() => onExtract("canon")}>Add Canon Extract</button>
          <button type="button" onClick={() => onExtract("decision")}>Add Decision Extract</button>
          <button type="button" onClick={() => onExtract("question")}>Add Question Extract</button>
          <button type="button" onClick={() => onExtract("draft")}>Add Draft Idea</button>
        </div>
      </section>
    </div>
  );
}

function TaskBoard({
  tasks,
  importedTasks,
  title,
  group,
  onTitleChange,
  onGroupChange,
  onAdd,
  onToggle,
  onStartSession,
  onDelete,
  busyTaskId,
}: {
  tasks: ForgeTask[];
  importedTasks: ImportedGoalTask[];
  title: string;
  group: string;
  onTitleChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (task: ForgeTask) => void;
  onStartSession: (task?: ForgeTask) => void;
  onDelete: (id: string, label: string) => void;
  busyTaskId: string | null;
}) {
  const complete = tasks.filter(isTaskComplete).sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
  const incomplete = tasks.filter((task) => !isTaskComplete(task)).sort(sortTasks);
  const completedCount = complete.length;
  const totalCount = tasks.length;
  const groups = groupTasks(incomplete);
  const milestoneGroups = ["Milestone 1 - Foundation", "Milestone 2 - Characters", "Milestone 3 - Story", "Milestone 4 - Gameplay", "Milestone 5 - Vertical Slice", "Story", "Characters", "World Building", "Combat", "Guild System", "Items", "Legendary Weapons", "Final Fantasy Worlds", "Art", "Audio", "Development", "Milestones", "General"];

  if (!tasks.length && !importedTasks.length) {
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
        {orderedGroupEntries(groupTasks(tasks)).map(([groupName, groupTasksList]) => {
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
      {importedTasks.length > 0 && <ImportedGoalTaskSection tasks={importedTasks} />}

      <div className="task-groups">
        {orderedGroupEntries(groups).map(([groupName, groupTasksList]) => (
          <section key={groupName}>
            <h3>{groupName}</h3>
            <div className="workspace-list">
              {groupTasksList.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onStartSession={onStartSession} onDelete={onDelete} busy={busyTaskId === task.id} disabled={Boolean(busyTaskId)} />)}
            </div>
          </section>
        ))}
        {complete.length > 0 && (
          <section className="completed-tasks">
            <h3>Completed</h3>
            <div className="workspace-list">
              {complete.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onStartSession={onStartSession} onDelete={onDelete} busy={busyTaskId === task.id} disabled={Boolean(busyTaskId)} />)}
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
      <input list="forge-task-groups" value={group} onChange={(event) => onGroupChange(event.target.value)} placeholder="Milestone or custom group" />
      <datalist id="forge-task-groups">
        {groups.map((item) => <option key={item} value={item} />)}
      </datalist>
      <button type="button" onClick={onAdd}>Add Task</button>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onStartSession,
  onDelete,
  busy,
  disabled,
}: {
  task: ForgeTask;
  onToggle: (task: ForgeTask) => void;
  onStartSession: (task?: ForgeTask) => void;
  onDelete: (id: string, label: string) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const complete = isTaskComplete(task);
  return (
    <article className={`task-row ${complete ? "done" : ""} ${busy ? "task-row-busy" : ""}`}>
      <button
        type="button"
        className="task-check"
        onClick={() => onToggle(task)}
        aria-label={complete ? `Reopen ${task.title}` : `Complete ${task.title}`}
        disabled={disabled}
      >
        {busy ? <span className="task-check-spinner" aria-hidden="true" /> : complete ? "✓" : ""}
      </button>
      <div>
        <b>{task.title}</b>
        <span>{task.milestone_group || "General"}{task.priority ? ` · ${task.priority}` : ""}</span>
      </div>
      <button type="button" className="workspace-secondary" onClick={() => onStartSession(task)} disabled={disabled}>Session</button>
      <button type="button" className="workspace-delete" onClick={() => onDelete(task.id, `task: ${task.title}`)} disabled={disabled}>Delete</button>
    </article>
  );
}

function ImportedGoalTaskSection({ tasks }: { tasks: ImportedGoalTask[] }) {
  const groups = useMemo(() => tasks.reduce<Record<string, ImportedGoalTask[]>>((acc, task) => {
    acc[task.section] ||= [];
    acc[task.section].push(task);
    return acc;
  }, {}), [tasks]);
  const groupEntries = useMemo(() => Object.entries(groups), [groups]);
  const groupNames = useMemo(() => groupEntries.map(([group]) => group), [groupEntries]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(groupEntries.map(([group]) => group)));

  useEffect(() => {
    setOpenGroups((prev) => {
      const validNames = new Set(groupNames);
      const next = new Set([...prev].filter((group) => validNames.has(group)));
      if (prev.size === 0) {
        groupNames.forEach((group) => next.add(group));
      }
      return next;
    });
  }, [groupNames]);

  if (!tasks.length) return null;

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  function setAllGroups(open: boolean) {
    setOpenGroups(open ? new Set(groupNames) : new Set());
  }

  return (
    <section className="imported-goal-section">
      <div className="task-command">
        <div>
          <p>Shared / Linked Goal Imports</p>
          <h2>Read-only milestones feeding overall progress.</h2>
          <span>These rows come from linked goals. Update the source goal to change them.</span>
        </div>
        <div className="imported-goal-controls">
          <strong>{tasks.filter((task) => task.complete).length} / {tasks.length}</strong>
          <button type="button" onClick={() => setAllGroups(true)}>Expand All</button>
          <button type="button" onClick={() => setAllGroups(false)}>Collapse All</button>
        </div>
      </div>
      {groupEntries.map(([group, groupTasks]) => {
        const isOpen = openGroups.has(group);
        const done = groupTasks.filter((task) => task.complete).length;
        return (
          <div className={`workspace-list imported-goal-list ${isOpen ? "open" : "collapsed"}`} key={group}>
            <button type="button" className="imported-goal-header" onClick={() => toggleGroup(group)} aria-expanded={isOpen}>
              <span>
                <b>{group}</b>
                <em>{done} / {groupTasks.length} complete</em>
              </span>
              <strong>{isOpen ? "Collapse" : "Expand"}</strong>
            </button>
            {isOpen && groupTasks.map((task) => (
              <article key={task.id} className={`task-row imported ${task.complete ? "done" : ""}`}>
                <span className="task-check read-only">{task.complete ? "✓" : ""}</span>
                <div>
                  <b>{task.title}</b>
                  <span>{task.goalTitle} · {task.status}{task.targetDate ? ` · due ${task.targetDate}` : ""}{task.cost ? ` · $${task.cost}` : ""}</span>
                  {task.notes && <small>{task.notes}</small>}
                </div>
                <Link className="workspace-secondary" href={`/goals?focus=${task.goalId}`}>Open Goal</Link>
              </article>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function TaskSavingOverlay({ task }: { task: { title: string; action: "complete" | "reopen" | "create" } }) {
  return (
    <div className="task-saving-overlay" role="status" aria-live="polite" aria-label="Saving Forge task">
      <div className="task-saving-core">
        <span className="forge-loader-ring" aria-hidden="true" />
        <p>{task.action === "complete" ? "Completing Task" : task.action === "create" ? "Creating Task" : "Reopening Task"}</p>
        <strong>{task.title}</strong>
        <em>Syncing Forge and Goals...</em>
      </div>
    </div>
  );
}

type FolderOptions = { primary: string[]; children: Record<string, string[]> };

function SparkList({ sparks, folderOptions, onEdit }: { sparks: ForgeSpark[]; folderOptions: FolderOptions; onEdit: (spark: ForgeSpark) => void }) {
  if (!sparks.length) return <Empty title="No sparks captured for this project yet." text="Capture the small idea before it cools." />;
  return <FolderBoard items={sparks} folderOptions={folderOptions} renderItem={(spark) => (
    <button type="button" className="workspace-click-card" key={spark.id} onClick={() => onEdit(spark)}>
      <b>{spark.spark_text}</b>
      <span>{spark.tags?.length ? spark.tags.join(", ") : "Open spark protocol"}</span>
    </button>
  )} />;
}

function CaptureLaunchBar({ kind, projectTitle, onOpen }: { kind: "spark" | "note"; projectTitle: string; onOpen: () => void }) {
  return (
    <div className="quick-forge-composer compact-capture">
      <div>
        <p>{kind === "spark" ? "Spark Log" : "Notes"}</p>
        <strong>{kind === "spark" ? "Capture a raw idea." : "Write a project note."}</strong>
        <span>Default project: {projectTitle}</span>
      </div>
      <button type="button" onClick={onOpen}>{kind === "spark" ? "New Spark" : "New Note"}</button>
    </div>
  );
}

function NoteList({ notes, folderOptions, onEdit }: { notes: ForgeNote[]; folderOptions: FolderOptions; onEdit: (note: ForgeNote) => void }) {
  if (!notes.length) return <Empty title="No notes yet." text="Write down the shape of the idea." />;
  return <FolderBoard items={notes} folderOptions={folderOptions} renderItem={(note) => (
        <button type="button" className={`workspace-click-card ${note.is_pinned ? "pinned" : ""}`} key={note.id} onClick={() => onEdit(note)}>
          <b>{note.title}</b>
          <span>{note.note_type ? `${note.note_type} · ` : ""}{note.body || "Open note dossier"}</span>
        </button>
  )} />;
}

function ProjectCaptureModal({
  kind,
  form,
  projects,
  folderOptions,
  onChange,
  onSave,
  onClose,
}: {
  kind: "spark" | "note";
  form: {
    sparkText: string;
    noteTitle: string;
    noteBody: string;
    noteType: string;
    projectId: string;
    category: string;
    tags: string;
    folderPrimary: string;
    folderChild: string;
    newFolderPrimary: string;
    newFolderChild: string;
  };
  projects: ForgeProject[];
  folderOptions: FolderOptions;
  onChange: (form: {
    sparkText: string;
    noteTitle: string;
    noteBody: string;
    noteType: string;
    projectId: string;
    category: string;
    tags: string;
    folderPrimary: string;
    folderChild: string;
    newFolderPrimary: string;
    newFolderChild: string;
  }) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const title = kind === "spark" ? "New Spark" : "New Note";
  return (
    <div className="forge-drawer-backdrop capture-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="forge-edit-drawer capture-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <p>Forge Capture</p>
        <h2>{title}</h2>
        {kind === "spark" ? (
          <textarea value={form.sparkText} onChange={(event) => onChange({ ...form, sparkText: event.target.value })} placeholder="Spark text" rows={7} />
        ) : (
          <>
            <input value={form.noteTitle} onChange={(event) => onChange({ ...form, noteTitle: event.target.value })} placeholder="Note title" />
            <select value={form.noteType} onChange={(event) => onChange({ ...form, noteType: event.target.value })}>
              <option value="idea">Idea</option>
              <option value="draft">Draft</option>
              <option value="decision">Decision</option>
              <option value="canon">Canon</option>
              <option value="question">Question</option>
              <option value="reference">Reference</option>
              <option value="gdd_section">GDD Section</option>
            </select>
            <textarea value={form.noteBody} onChange={(event) => onChange({ ...form, noteBody: event.target.value })} placeholder="Body" rows={10} />
          </>
        )}
        <select value={form.projectId} onChange={(event) => {
          const project = projects.find((item) => item.id === event.target.value);
          onChange({ ...form, projectId: event.target.value, category: project?.category || form.category });
        }}>
          <option value="">Unassigned Forge Inbox</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <FolderPicker
          folderOptions={folderOptions}
          primary={form.folderPrimary}
          child={form.folderChild}
          newPrimary={form.newFolderPrimary}
          newChild={form.newFolderChild}
          onChange={(next) => onChange({
            ...form,
            folderPrimary: next.primary,
            folderChild: next.child,
            newFolderPrimary: next.newPrimary,
            newFolderChild: next.newChild,
          })}
        />
        <input value={form.tags} onChange={(event) => onChange({ ...form, tags: event.target.value })} placeholder="tags, comma separated" />
        <div className="drawer-actions">
          <button type="button" onClick={onSave}>Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

function FolderBoard<T extends { id: string; folder_path?: string[] | null }>({ items, renderItem }: { items: T[]; folderOptions: FolderOptions; renderItem: (item: T) => ReactNode }) {
  const tree = useMemo(() => buildFolderTree(items), [items]);
  const [openPrimary, setOpenPrimary] = useState("");
  const [openChild, setOpenChild] = useState("");
  const activePrimary = tree.find((folder) => folder.key === openPrimary);
  const childFolders = activePrimary?.children || [];
  const directItems = activePrimary?.items || [];
  const activeChild = childFolders.find((folder) => folder.key === openChild);
  const visibleItems = activeChild ? activeChild.items : childFolders.length ? directItems : directItems;
  return (
    <div className="folder-board folder-explorer">
      <div className="folder-level">
        {tree.map((folder) => (
          <button
            key={folder.key}
            type="button"
            className={`forge-folder-label ${openPrimary === folder.key ? "active" : ""}`}
            onClick={() => {
              const next = openPrimary === folder.key ? "" : folder.key;
              setOpenPrimary(next);
              setOpenChild("");
            }}
          >
            <Image src="/images/Forge/cleaned/forge-incubation-folder-small.png" alt="" width={72} height={52} unoptimized />
            <span>{folder.label}</span>
            <small>{folder.count}</small>
          </button>
        ))}
      </div>
      {activePrimary && (
        <section className="folder-section">
          {childFolders.length > 0 && (
            <div className="folder-level child-folders">
              {directItems.length > 0 && (
                <button type="button" className={`forge-folder-label ${!openChild ? "active" : ""}`} onClick={() => setOpenChild("")}>
                  <Image src="/images/Forge/cleaned/forge-incubation-folder-small.png" alt="" width={62} height={45} unoptimized />
                  <span>{activePrimary.label}</span>
                  <small>{directItems.length}</small>
                </button>
              )}
              {childFolders.map((folder) => (
                <button
                  key={folder.key}
                  type="button"
                  className={`forge-folder-label ${openChild === folder.key ? "active" : ""}`}
                  onClick={() => setOpenChild(openChild === folder.key ? "" : folder.key)}
                >
                  <Image src="/images/Forge/cleaned/forge-incubation-folder-small.png" alt="" width={62} height={45} unoptimized />
                  <span>{folder.label}</span>
                  <small>{folder.items.length}</small>
                </button>
              ))}
            </div>
          )}
          {visibleItems.length > 0 ? (
            <div className="workspace-list">{visibleItems.map(renderItem)}</div>
          ) : (
            <Empty title="Folder selected." text="Open a subfolder to see its Forge items." />
          )}
        </section>
      )}
    </div>
  );
}

function FolderPicker({
  folderOptions,
  primary,
  child,
  newPrimary,
  newChild,
  onChange,
}: {
  folderOptions: FolderOptions;
  primary: string;
  child: string;
  newPrimary: string;
  newChild: string;
  onChange: (next: { primary: string; child: string; newPrimary: string; newChild: string }) => void;
}) {
  const children = primary ? folderOptions.children[primary] || [] : [];
  return (
    <div className="folder-picker">
      <label>
        <span>Folder</span>
        <select value={primary} onChange={(event) => onChange({ primary: event.target.value, child: "", newPrimary: "", newChild })}>
          <option value="">Unfiled</option>
          {folderOptions.primary.map((item) => <option key={item} value={item}>{item}</option>)}
          <option value="__new">Create new folder...</option>
        </select>
      </label>
      {primary === "__new" ? (
        <label>
          <span>New Folder</span>
          <input value={newPrimary} onChange={(event) => onChange({ primary, child, newPrimary: event.target.value, newChild })} placeholder="Characters" />
        </label>
      ) : (
        <label>
          <span>Subfolder</span>
          <select value={child} onChange={(event) => onChange({ primary, child: event.target.value, newPrimary, newChild: "" })} disabled={!primary || primary === "__new"}>
            <option value="">None</option>
            {children.map((item) => <option key={item} value={item}>{item}</option>)}
            {primary && <option value="__new">Create new subfolder...</option>}
          </select>
        </label>
      )}
      {child === "__new" && primary !== "__new" && (
        <label>
          <span>New Subfolder</span>
          <input value={newChild} onChange={(event) => onChange({ primary, child, newPrimary, newChild: event.target.value })} placeholder="Lucien" />
        </label>
      )}
    </div>
  );
}

function WorkspaceUploadForm({
  form,
  imageMode = false,
  onChange,
  onUpload,
}: {
  form: { fileName: string; fileType: string; fileSize: string; fileUrl: string; caption: string; tags: string; useAsCover: boolean };
  imageMode?: boolean;
  onChange: (next: { fileName: string; fileType: string; fileSize: string; fileUrl: string; caption: string; tags: string; useAsCover: boolean }) => void;
  onUpload: () => void;
}) {
  return (
    <div className="workspace-upload">
      <div>
        <p>{imageMode ? "Image Upload" : "File Upload"}</p>
        <strong>{imageMode ? "Attach concept art, screenshots, or references." : "Attach docs, PDFs, screenshots, sketches, or references."}</strong>
      </div>
      <input
        type="file"
        accept={imageMode ? "image/*" : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange({
            ...form,
            fileName: file.name,
            fileType: file.type,
            fileSize: String(file.size),
            fileUrl: String(reader.result || ""),
          });
          reader.readAsDataURL(file);
        }}
      />
      <input value={form.caption} onChange={(event) => onChange({ ...form, caption: event.target.value })} placeholder="Caption or note" />
      <input value={form.tags} onChange={(event) => onChange({ ...form, tags: event.target.value })} placeholder="tags, comma separated" />
      <label>
        <input type="checkbox" checked={form.useAsCover} onChange={(event) => onChange({ ...form, useAsCover: event.target.checked })} />
        Use as project cover
      </label>
      <button type="button" onClick={onUpload} disabled={!form.fileName}>Upload</button>
    </div>
  );
}

function ForgeItemDrawer({
  item,
  projects,
  folderOptions,
  onChange,
  onSave,
  onExtract,
  onDelete,
  onCancel,
}: {
  item: EditingForgeItem;
  projects: ForgeProject[];
  folderOptions: FolderOptions;
  onChange: (item: EditingForgeItem) => void;
  onSave: () => void;
  onExtract: (entryType: ForgeLedgerEntry["entry_type"], note?: ForgeNote) => void;
  onDelete: (kind: "sparks" | "notes", id: string, label: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="forge-drawer-backdrop" onMouseDown={onCancel}>
      <aside className="forge-edit-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <p>{item.kind === "spark" ? "Spark Protocol" : "Note Dossier"}</p>
        {item.kind === "spark" ? (
          <textarea value={item.text} onChange={(event) => onChange({ ...item, text: event.target.value })} rows={8} />
        ) : (
          <>
            <input value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} placeholder="Title" />
            <div className="drawer-grid">
              <select value={item.noteType} onChange={(event) => onChange({ ...item, noteType: event.target.value })}>
                <option value="idea">Idea</option>
                <option value="draft">Draft</option>
                <option value="decision">Decision</option>
                <option value="canon">Canon</option>
                <option value="question">Question</option>
                <option value="reference">Reference</option>
                <option value="gdd_section">GDD Section</option>
              </select>
              <select value={item.status} onChange={(event) => onChange({ ...item, status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <textarea value={item.body} onChange={(event) => onChange({ ...item, body: event.target.value })} rows={12} />
            <label className="drawer-check">
              <input type="checkbox" checked={item.isPinned} onChange={(event) => onChange({ ...item, isPinned: event.target.checked })} />
              Pinned project-bible item
            </label>
            <input value={item.linkedMilestone} onChange={(event) => onChange({ ...item, linkedMilestone: event.target.value })} placeholder="Linked milestone" />
            <div className="ledger-quick-actions drawer-ledger-actions">
              <button type="button" onClick={() => onExtract("canon", item.item)}>Canon Extract</button>
              <button type="button" onClick={() => onExtract("decision", item.item)}>Decision Extract</button>
              <button type="button" onClick={() => onExtract("question", item.item)}>Question Extract</button>
              <button type="button" onClick={() => onExtract("draft", item.item)}>Draft Idea</button>
            </div>
          </>
        )}
        <FolderPicker
          folderOptions={folderOptions}
          primary={item.folderPrimary}
          child={item.folderChild}
          newPrimary={item.newFolderPrimary}
          newChild={item.newFolderChild}
          onChange={(next) => onChange({
            ...item,
            folderPrimary: next.primary,
            folderChild: next.child,
            newFolderPrimary: next.newPrimary,
            newFolderChild: next.newChild,
          } as EditingForgeItem)}
        />
        <select value={item.projectId} onChange={(event) => onChange({ ...item, projectId: event.target.value })}>
          <option value="">Unassigned Forge Inbox</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <input value={item.tags} onChange={(event) => onChange({ ...item, tags: event.target.value })} placeholder="tags, comma separated" />
        <div className="drawer-actions">
          <button type="button" onClick={onSave}>Save Changes</button>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger" onClick={() => onDelete(item.kind === "spark" ? "sparks" : "notes", item.item.id, `${item.kind}: ${item.kind === "spark" ? item.text.slice(0, 40) : item.title}`)}>Delete</button>
        </div>
      </aside>
    </div>
  );
}

function ForgeSessionDrawer({
  draft,
  project,
  tasks,
  goals,
  onChange,
  onComplete,
  onCancel,
}: {
  draft: {
    open: boolean;
    sessionType: string;
    taskId: string;
    title: string;
    scratchpad: string;
    decisions: string;
    followUpTask: string;
    convertScratchpadToNote: boolean;
    markTaskComplete: boolean;
    countTowardGoal: boolean;
    linkedGoalId: string;
  };
  project: ForgeProject;
  tasks: ForgeTask[];
  goals: ProjectGoalOption[];
  onChange: (draft: {
    open: boolean;
    sessionType: string;
    taskId: string;
    title: string;
    scratchpad: string;
    decisions: string;
    followUpTask: string;
    convertScratchpadToNote: boolean;
    markTaskComplete: boolean;
    countTowardGoal: boolean;
    linkedGoalId: string;
  }) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const selectedTask = tasks.find((task) => task.id === draft.taskId);
  return (
    <div className="forge-drawer-backdrop" onMouseDown={onCancel}>
      <aside className="forge-edit-drawer forge-session-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <p>Forge Work Session</p>
        <h2>{project.title}</h2>
        <label>
          <span>Session Type</span>
          <select value={draft.sessionType} onChange={(event) => onChange({ ...draft, sessionType: event.target.value })}>
            {["Continue Current Mission", "Pick Quick Win", "Work on Selected Task", "Add Spark", "Write Note", "Upload Asset", "Review Project"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Selected Task</span>
          <select value={draft.taskId} onChange={(event) => {
            const task = tasks.find((item) => item.id === event.target.value);
            onChange({ ...draft, taskId: event.target.value, title: task?.title || draft.title });
          }}>
            <option value="">No task selected</option>
            {tasks.filter((task) => !isTaskComplete(task)).sort(sortTasks).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="Session title" />
        {selectedTask && (
          <div className="session-context">
            <strong>{selectedTask.title}</strong>
            <span>{selectedTask.milestone_group || "General"} · {selectedTask.priority || "normal priority"}</span>
            {selectedTask.description && <small>{selectedTask.description}</small>}
          </div>
        )}
        <textarea value={draft.scratchpad} onChange={(event) => onChange({ ...draft, scratchpad: event.target.value })} placeholder="Scratchpad: what did you do, notice, or build?" rows={8} />
        <textarea value={draft.decisions} onChange={(event) => onChange({ ...draft, decisions: event.target.value })} placeholder="Decisions made during this session..." rows={4} />
        <input value={draft.followUpTask} onChange={(event) => onChange({ ...draft, followUpTask: event.target.value })} placeholder="Optional follow-up task" />
        <label>
          <span>Goal Credit</span>
          <select value={draft.linkedGoalId} onChange={(event) => onChange({ ...draft, linkedGoalId: event.target.value, countTowardGoal: Boolean(event.target.value) })}>
            <option value="">Do not link to a goal</option>
            {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          </select>
        </label>
        <label className="drawer-check">
          <input type="checkbox" checked={draft.convertScratchpadToNote} onChange={(event) => onChange({ ...draft, convertScratchpadToNote: event.target.checked })} />
          Save scratchpad as a session note
        </label>
        <label className="drawer-check">
          <input type="checkbox" checked={draft.markTaskComplete} onChange={(event) => onChange({ ...draft, markTaskComplete: event.target.checked })} disabled={!draft.taskId} />
          Mark selected task complete
        </label>
        <label className="drawer-check">
          <input type="checkbox" checked={draft.countTowardGoal} onChange={(event) => onChange({ ...draft, countTowardGoal: event.target.checked })} disabled={!draft.linkedGoalId} />
          Count this session toward the linked goal
        </label>
        <div className="drawer-actions">
          <button type="button" onClick={onComplete}>Complete Session</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </aside>
    </div>
  );
}

function FileList({ files, projects, onMove, onDelete, onPreview }: { files: ForgeFile[]; projects: ForgeProject[]; onMove: (id: string, projectId: string) => void; onDelete: (id: string, label: string) => void; onPreview: (file: ForgeFile) => void }) {
  if (!files.length) return <Empty title="No files attached yet." text="Upload screenshots, PDFs, references, sketches, or docs." />;
  return <div className="workspace-list">{files.map((file) => <article key={file.id}><b>{file.file_name}</b><span>{file.caption || file.file_type || "Forge file"}</span><button type="button" className="workspace-secondary" onClick={() => onPreview(file)}>Preview</button><MoveSelect value={file.project_id || ""} projects={projects} onChange={(value) => onMove(file.id, value)} /><DeleteButton onClick={() => onDelete(file.id, `file: ${file.file_name}`)} /></article>)}</div>;
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

function Activity({ sparks, notes, files, tasks, sessions, project, inbox }: { sparks: ForgeSpark[]; notes: ForgeNote[]; files: ForgeFile[]; tasks: ForgeTask[]; sessions: ForgeSession[]; project: ForgeProject | null; inbox: boolean }) {
  const rows = [
    ...sessions.map((session) => ({
      label: "Forge session completed",
      title: session.title,
      at: session.completed_at || session.created_at,
    })),
    ...sparks.map((spark) => ({
      label: "Spark added",
      title: spark.spark_text,
      at: spark.created_at,
    })),
    ...notes.map((note) => ({
      label: note.updated_at && note.updated_at !== note.created_at ? "Note updated" : "Note added",
      title: note.title,
      at: note.updated_at || note.created_at,
    })),
    ...files.map((file) => ({
      label: isImage(file) ? "Image uploaded" : "File uploaded",
      title: file.file_name,
      at: file.created_at,
    })),
    ...tasks.map((task) => ({
      label: isTaskComplete(task) ? "Task completed" : "Task added",
      title: task.title,
      at: task.completed_at || task.created_at,
    })),
    ...(!inbox && project ? [{
      label: "Project updated",
      title: project.title,
      at: project.updated_at,
    }] : []),
  ].sort((a, b) => timestampValue(b.at) - timestampValue(a.at));

  if (!rows.length) return <Empty title="No activity yet." text="Project movement will appear here." />;
  return (
    <div className="workspace-list activity-list">
      {rows.map((row, index) => (
        <article key={`${row.label}-${row.title}-${row.at || index}`}>
          <p>{row.label}</p>
          <b>{row.title}</b>
          <time dateTime={row.at || undefined}>{formatActivityTime(row.at)}</time>
        </article>
      ))}
    </div>
  );
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

function getProjectGoals(project: ForgeProject): ProjectGoalOption[] {
  const goals = [
    ...(project.task_goal ? [{ id: project.task_goal.id, title: project.task_goal.title }] : []),
    ...(project.linked_goal ? [{ id: project.linked_goal.id, title: project.linked_goal.title }] : []),
    ...(project.linked_goals || []).map((goal) => ({ id: goal.id, title: goal.title })),
  ];
  const seen = new Set<string>();
  return goals.filter((goal) => {
    if (!goal.id || seen.has(goal.id)) return false;
    seen.add(goal.id);
    return true;
  });
}

function buildLinkedGoalTasks(project: ForgeProject): ImportedGoalTask[] {
  const goals = [
    ...(project.linked_goal ? [{ ...project.linked_goal, relationship_type: "linked goal", notes: "Primary linked goal." }] : []),
    ...(project.linked_goals || []),
  ];
  return goals.flatMap((goal) => (goal.milestones || []).map((milestone) => ({
    id: `${goal.id}-${milestone.id}`,
    goalId: goal.id,
    goalTitle: goal.title,
    section: `${goal.relationship_type || "Linked Goal"} / ${goal.title}`,
    title: milestone.title,
    status: milestone.status,
    complete: isMilestoneComplete(milestone.status),
    targetDate: milestone.target_date,
    cost: milestone.cost,
    notes: milestone.notes || goal.notes || null,
  })));
}

function isMilestoneComplete(status?: string | null) {
  return ["done", "complete", "completed", "already acquired", "acquired"].includes((status || "").toLowerCase());
}

function isImage(file: ForgeFile) {
  return Boolean((file.file_type || "").startsWith("image/") || (file.file_url || "").startsWith("data:image/"));
}

function isTaskComplete(task: ForgeTask) {
  return ["done", "complete", "completed"].includes((task.status || "").toLowerCase()) || Boolean(task.completed_at);
}

function timestampValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatActivityTime(value?: string | null) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortTasks(a: ForgeTask, b: ForgeTask) {
  return Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

function groupTasks(tasks: ForgeTask[]) {
  return tasks.reduce<Record<string, ForgeTask[]>>((groups, task) => {
    const key = task.task_type === "project_gate" ? "Major Milestones / Project Gates" : task.milestone_group || "General";
    groups[key] ||= [];
    groups[key].push(task);
    groups[key].sort(sortTasks);
    return groups;
  }, {});
}

function orderedGroupEntries(groups: Record<string, ForgeTask[]>) {
  const order = [
    "Completed Foundation",
    "Milestone 1 - Foundation",
    "Milestone 2 - Characters",
    "Milestone 3 - Story",
    "Milestone 4 - Gameplay",
    "Milestone 5 - Vertical Slice",
    "Characters",
    "Story",
    "Combat",
    "Art",
    "Audio",
    "Development",
    "Major Milestones / Project Gates",
    "General",
  ];
  return Object.entries(groups).sort(([a], [b]) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.localeCompare(b);
  });
}

function buildFolderOptions(notes: ForgeNote[], sparks: ForgeSpark[]): FolderOptions {
  const primary = new Set<string>();
  const children: Record<string, Set<string>> = {};
  [...notes, ...sparks].forEach((item) => {
    const path = normalizeFolderPath(item.folder_path || []);
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

function resolveFolderPath(options: FolderOptions, primary: string, child: string, newPrimary: string, newChild: string) {
  const resolvedPrimary = primary === "__new" ? newPrimary : primary;
  const resolvedChild = child === "__new" ? newChild : child;
  const canonicalPrimary = canonicalFolderLabel(resolvedPrimary, options.primary);
  const canonicalChild = canonicalPrimary ? canonicalFolderLabel(resolvedChild, options.children[canonicalPrimary] || []) : "";
  return [canonicalPrimary, canonicalChild].filter(Boolean).slice(0, 2);
}

function canonicalFolderLabel(value: string, existing: string[]) {
  const clean = titleCaseFolder(value);
  if (!clean) return "";
  const normalized = normalizeFolderKey(clean);
  return existing.find((item) => normalizeFolderKey(item) === normalized) || clean;
}

function normalizeFolderKey(value: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean.endsWith("s") ? clean.slice(0, -1) : clean;
}

function titleCaseFolder(value: string) {
  return value.trim().replace(/\s+/g, " ").split(" ").map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "").join(" ");
}

function normalizeFolderPath(path: string[]) {
  return (path || []).map(titleCaseFolder).filter(Boolean).slice(0, 2);
}

type FolderTree<T> = {
  key: string;
  label: string;
  items: T[];
  children: Array<{ key: string; label: string; items: T[] }>;
  count: number;
};

function buildFolderTree<T extends { id: string; folder_path?: string[] | null; created_at?: string | null; updated_at?: string | null }>(items: T[]): FolderTree<T>[] {
  const folders = new Map<string, FolderTree<T>>();
  items.forEach((item) => {
    const path = normalizeFolderPath(item.folder_path || []);
    const primary = path[0] || "Unfiled";
    const child = path[1] || "";
    const primaryKey = primary.toLowerCase();
    if (!folders.has(primaryKey)) {
      folders.set(primaryKey, { key: primaryKey, label: primary, items: [], children: [], count: 0 });
    }
    const folder = folders.get(primaryKey);
    if (!folder) return;
    folder.count += 1;
    if (!child) {
      folder.items.push(item);
      return;
    }
    const childKey = `${primaryKey}/${child.toLowerCase()}`;
    let childFolder = folder.children.find((entry) => entry.key === childKey);
    if (!childFolder) {
      childFolder = { key: childKey, label: child, items: [] };
      folder.children.push(childFolder);
    }
    childFolder.items.push(item);
  });
  return [...folders.values()]
    .map((folder) => ({
      ...folder,
      items: folder.items.sort(sortFolderItems),
      children: folder.children
        .map((child) => ({ ...child, items: child.items.sort(sortFolderItems) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function sortFolderItems<T extends { created_at?: string | null; updated_at?: string | null }>(a: T, b: T) {
  return timestampValue(b.updated_at || b.created_at) - timestampValue(a.updated_at || a.created_at);
}

type CanonBoardItem = {
  source: "ledger" | "note";
  raw?: ForgeLedgerEntry;
  id: string;
  entry_type: ForgeLedgerEntry["entry_type"];
  title?: string | null;
  body: string;
  tags?: string[] | null;
  folder?: string | null;
  subfolder?: string | null;
  note_id?: string | null;
  linked_task_id?: string | null;
  is_pinned?: boolean | null;
  status?: string | null;
  resolved?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const CANON_FILTERS = [
  "All",
  "Pinned",
  "Characters",
  "Story",
  "Gameplay",
  "Class System",
  "World Visits",
  "Art Direction",
  "Development",
  "MVP",
  "Lucien",
  "Aldric",
  "Liora",
  "Placement Trial",
  "Guild System",
  "Hybrid Classes",
  "Unreal",
  "Visual Style",
];

function buildCanonBoardItems(entries: ForgeLedgerEntry[], notes: ForgeNote[]): CanonBoardItem[] {
  const ledgerItems = entries
    .filter((entry) => entry.status !== "archived")
    .map((entry) => ({
      source: "ledger" as const,
      raw: entry,
      id: entry.id,
      entry_type: entry.entry_type,
      title: entry.title,
      body: entry.body,
      tags: entry.tags,
      folder: entry.folder,
      subfolder: entry.subfolder,
      note_id: entry.note_id,
      linked_task_id: entry.linked_task_id,
      is_pinned: entry.is_pinned,
      status: entry.status,
      resolved: entry.resolved,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    }));
  const noteItems = notes
    .filter((note) => ["canon", "decision", "question", "draft", "idea"].includes(note.note_type || ""))
    .map((note) => {
      const path = normalizeFolderPath(note.folder_path || []);
      return {
        source: "note" as const,
        id: note.id,
        entry_type: note.note_type as ForgeLedgerEntry["entry_type"],
        title: note.title,
        body: note.body || "No body recorded yet.",
        tags: note.tags,
        folder: path[0] || null,
        subfolder: path[1] || null,
        note_id: note.id,
        is_pinned: note.is_pinned,
        status: note.status,
        created_at: note.created_at,
        updated_at: note.updated_at,
      };
    });
  return [...ledgerItems, ...noteItems].sort((a, b) => timestampValue(b.updated_at || b.created_at) - timestampValue(a.updated_at || a.created_at));
}

function matchesCanonFilter(item: CanonBoardItem, filter: string, query: string) {
  const haystack = [
    item.title,
    item.body,
    item.folder,
    item.subfolder,
    item.entry_type,
    ...(item.tags || []),
  ].join(" ").toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
  if (filter === "All") return true;
  if (filter === "Pinned") return Boolean(item.is_pinned);
  const filterKey = filter.toLowerCase();
  return haystack.includes(filterKey) || haystack.includes(filterKey.replace(/\s+/g, "-"));
}

function ledgerTypeLabel(type: ForgeLedgerEntry["entry_type"]) {
  return {
    canon: "Canon",
    decision: "Decision",
    question: "Question",
    draft: "Draft Idea",
    idea: "Idea",
    reference: "Reference",
  }[type] || type;
}

function firstLine(value: string) {
  return value.split(/\n+/)[0]?.slice(0, 90) || "Untitled";
}

function buildProjectBible(notes: ForgeNote[], ledgerEntries: ForgeLedgerEntry[] = []) {
  const source = notes
    .filter((note) => ["gdd_section", "canon", "decision", "reference"].includes(note.note_type || "") || note.is_pinned)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.title.localeCompare(b.title));
  const noteMarkdown = source.map((note) => `## ${note.title}\n\n${note.body || "_No body recorded yet._"}`);
  const ledgerMarkdown = ledgerEntries
    .filter((entry) => entry.status !== "archived" && (entry.is_pinned || ["canon", "decision"].includes(entry.entry_type)))
    .sort((a, b) => ledgerTypeLabel(a.entry_type).localeCompare(ledgerTypeLabel(b.entry_type)) || (a.title || "").localeCompare(b.title || ""))
    .map((entry) => `## ${entry.title || ledgerTypeLabel(entry.entry_type)}\n\n_${ledgerTypeLabel(entry.entry_type)}_\n\n${entry.body}`);
  return [...noteMarkdown, ...ledgerMarkdown].join("\n\n---\n\n");
}

function DocumentPreview({ file, onClose }: { file: ForgeFile; onClose: () => void }) {
  const type = file.file_type || "";
  const name = file.file_name || "";
  const isPdf = type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  const isOffice = /\.(doc|docx|pages)$/i.test(name) || type.includes("wordprocessingml") || type.includes("msword");
  return (
    <div className="image-lightbox document-lightbox" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={name} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close document preview">×</button>
        <div className="document-preview-header">
          <p>Document Preview</p>
          <h2>{name}</h2>
          <span>{file.caption || type || "Forge document"}</span>
        </div>
        {isPdf && file.file_url ? (
          <iframe src={file.file_url} title={name} />
        ) : isImage(file) ? (
          <Image src={file.file_url || ""} alt={file.caption || name} width={1100} height={760} unoptimized />
        ) : isOffice ? (
          <div className="document-preview-fallback">
            <strong>{name}</strong>
            <span>Word and Pages files are stored in Forge. Browser-native preview is limited for this file type, so use Open/Download to inspect the original document.</span>
          </div>
        ) : (
          <div className="document-preview-fallback"><strong>{name}</strong><span>No browser preview is available for this file type yet.</span></div>
        )}
        {file.file_url && <a className="workspace-secondary" href={file.file_url} target="_blank" rel="noreferrer" download={name}>Open / Download</a>}
      </section>
    </div>
  );
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
    .linked-goals-card {
      grid-column: span 2;
    }
    .linked-goal-row {
      border-top: 1px solid rgba(212,173,101,.14);
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) auto;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
    }
    .linked-goal-row a {
      border: 1px solid rgba(143,220,124,.28);
      border-radius: 999px;
      color: #caffbf;
      padding: 8px 10px;
      text-decoration: none;
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
    .workspace-click-card {
      border: 1px solid rgba(212,173,101,.16);
      border-radius: 10px;
      background: rgba(0,0,0,.26);
      color: inherit;
      cursor: pointer;
      display: grid;
      gap: 8px;
      padding: 14px;
      text-align: left;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    .workspace-click-card:hover,
    .workspace-click-card.pinned {
      background: rgba(196,111,45,.08);
      border-color: rgba(196,111,45,.42);
      box-shadow: 0 0 28px rgba(196,111,45,.18), inset 0 0 18px rgba(143,220,124,.04);
      transform: translateY(-2px);
    }
    .workspace-click-card b {
      color: #fff1c8;
    }
    .writing-desk {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(320px, 1.1fr) minmax(280px, .9fr);
    }
    .writing-editor,
    .project-bible,
    .writing-library {
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 12px;
      background:
        radial-gradient(circle at 90% 5%, rgba(196,111,45,.12), transparent 26%),
        rgba(0,0,0,.26);
      display: grid;
      gap: 12px;
      padding: 15px;
    }
    .writing-library {
      grid-column: 1 / -1;
    }
    .writing-editor p,
    .project-bible p,
    .writing-library h3 {
      color: #f0a44d;
      font-size: .74rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .writing-editor h2,
    .project-bible h2 {
      color: #fff1c8;
      margin-top: 4px;
    }
    .writing-editor span {
      color: rgba(234,223,199,.72);
      display: block;
      margin-top: 5px;
    }
    .writing-editor input,
    .writing-editor select,
    .writing-editor textarea {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .writing-editor textarea {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      line-height: 1.65;
      resize: vertical;
    }
    .project-bible pre {
      background:
        linear-gradient(rgba(232,211,165,.03) 1px, transparent 1px),
        rgba(0,0,0,.28);
      background-size: 100% 28px;
      border: 1px solid rgba(212,173,101,.16);
      border-radius: 10px;
      color: #eadfc7;
      line-height: 1.58;
      max-height: 420px;
      overflow: auto;
      padding: 14px;
      white-space: pre-wrap;
    }
    .folder-board {
      display: grid;
      gap: 14px;
    }
    .folder-explorer .folder-level {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .folder-section {
      border: 1px solid rgba(212,173,101,.12);
      border-radius: 12px;
      background: rgba(0,0,0,.16);
      display: grid;
      gap: 10px;
      padding: 12px;
    }
    .forge-folder-label {
      align-items: end;
      color: #f4d38f;
      display: inline-flex;
      font-size: .78rem;
      font-weight: 900;
      gap: 8px;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    button.forge-folder-label {
      border: 1px solid rgba(212,173,101,.16);
      border-radius: 10px;
      background: rgba(0,0,0,.22);
      cursor: pointer;
      padding: 7px 10px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    button.forge-folder-label:hover,
    button.forge-folder-label.active {
      background: rgba(196,111,45,.08);
      border-color: rgba(196,111,45,.42);
      box-shadow: 0 0 24px rgba(196,111,45,.16), inset 0 0 16px rgba(143,220,124,.04);
      transform: translateY(-2px);
    }
    .forge-folder-label small {
      border: 1px solid rgba(143,220,124,.22);
      border-radius: 999px;
      color: #caffbf;
      font-size: .68rem;
      padding: 2px 7px;
    }
    .forge-folder-label img {
      filter: drop-shadow(0 0 14px rgba(196,111,45,.24));
    }
    .child-folders {
      border-bottom: 1px solid rgba(212,173,101,.12);
      padding-bottom: 10px;
    }
    .folder-picker {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .folder-picker label {
      display: grid;
      gap: 6px;
    }
    .folder-picker span {
      color: rgba(234,223,199,.66);
      font-size: .72rem;
      font-weight: 800;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .folder-picker input,
    .folder-picker select {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .quick-forge-composer {
      align-items: end;
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 12px;
      background:
        radial-gradient(circle at 88% 0%, rgba(196,111,45,.14), transparent 28%),
        rgba(0,0,0,.26);
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(220px, .8fr) minmax(240px, 1fr) auto;
      margin-bottom: 14px;
      padding: 14px;
    }
    .quick-forge-composer.note-composer {
      grid-template-columns: minmax(220px, .7fr) minmax(180px, .7fr) minmax(260px, 1fr) auto;
    }
    .quick-forge-composer p {
      color: #f0a44d;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .quick-forge-composer strong {
      color: #fff1c8;
      display: block;
      margin-top: 4px;
    }
    .quick-forge-composer input,
    .quick-forge-composer textarea {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .quick-forge-composer button {
      border: 1px solid rgba(143,220,124,.36);
      border-radius: 8px;
      background: rgba(143,220,124,.1);
      color: #caffbf;
      cursor: pointer;
      font-weight: 900;
      padding: 10px 12px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    .quick-forge-composer button:hover:not(:disabled) {
      border-color: rgba(143,220,124,.72);
      box-shadow: 0 0 24px rgba(143,220,124,.18);
      transform: translateY(-2px);
    }
    .quick-forge-composer button:disabled {
      cursor: not-allowed;
      opacity: .55;
    }
    .workspace-upload {
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 12px;
      background:
        radial-gradient(circle at 90% 0%, rgba(196,111,45,.14), transparent 28%),
        rgba(0,0,0,.26);
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(220px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr) auto auto;
      margin-bottom: 14px;
      padding: 14px;
    }
    .workspace-upload p,
    .forge-edit-drawer p {
      color: #f0a44d;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .workspace-upload strong {
      color: #fff1c8;
      display: block;
      margin-top: 4px;
    }
    .workspace-upload input,
    .workspace-upload button,
    .forge-edit-drawer input,
    .forge-edit-drawer select,
    .forge-edit-drawer textarea {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 8px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 10px 11px;
    }
    .workspace-upload label,
    .drawer-check {
      align-items: center;
      color: rgba(234,223,199,.72);
      display: flex;
      gap: 8px;
    }
    .workspace-upload button,
    .drawer-actions button {
      border-color: rgba(143,220,124,.36);
      background: rgba(143,220,124,.1);
      color: #caffbf;
      cursor: pointer;
      font-weight: 900;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    .workspace-upload button:hover,
    .drawer-actions button:hover {
      border-color: rgba(143,220,124,.72);
      box-shadow: 0 0 24px rgba(143,220,124,.18);
      transform: translateY(-2px);
    }
    .forge-drawer-backdrop {
      background: rgba(0,0,0,.54);
      inset: 0;
      position: fixed;
      z-index: 110;
    }
    .forge-edit-drawer {
      animation: forge-drawer-in 220ms ease both;
      border-left: 1px solid rgba(212,173,101,.28);
      background:
        linear-gradient(145deg, rgba(7,9,8,.98), rgba(14,10,7,.96)),
        url("/images/Forge/forge-bg-texture.png") center/cover;
      bottom: 0;
      box-shadow: -24px 0 70px rgba(0,0,0,.52), 0 0 42px rgba(196,111,45,.18);
      display: grid;
      gap: 12px;
      max-width: 520px;
      overflow-y: auto;
      padding: 22px;
      position: absolute;
      right: 0;
      top: 0;
      width: min(100%, 520px);
    }
    .forge-edit-drawer textarea {
      line-height: 1.55;
      resize: vertical;
    }
    .forge-session-drawer h2 {
      color: #fff1c8;
      font-size: 1.4rem;
    }
    .forge-session-drawer label {
      display: grid;
      gap: 6px;
    }
    .forge-session-drawer label > span {
      color: rgba(234,223,199,.66);
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .session-context {
      border: 1px solid rgba(80,176,255,.2);
      border-radius: 10px;
      background: rgba(80,176,255,.06);
      display: grid;
      gap: 5px;
      padding: 11px;
    }
    .session-context strong {
      color: #fff1c8;
    }
    .session-context span,
    .session-context small {
      color: rgba(234,223,199,.68);
    }
    .drawer-grid,
    .drawer-actions {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
    }
    .drawer-actions .danger {
      border-color: rgba(255,112,92,.42);
      background: rgba(92,18,12,.32);
      color: #ffd0c8;
      grid-column: 1 / -1;
    }
    @keyframes forge-drawer-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
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
    .shared-goals-screen,
    .canon-board {
      display: grid;
      gap: 16px;
    }
    .shared-goals-screen > header,
    .canon-header {
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 12px;
      background:
        radial-gradient(circle at 82% 10%, rgba(196,111,45,.16), transparent 28%),
        rgba(0,0,0,.26);
      padding: 16px;
    }
    .shared-goals-screen p,
    .canon-header p,
    .canon-section-grid h3 {
      color: #f0a44d;
      font-size: .74rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .shared-goals-screen h2,
    .canon-header h2 {
      color: #fff1c8;
      margin-top: 5px;
    }
    .shared-goals-screen span,
    .canon-header span {
      color: rgba(234,223,199,.72);
      display: block;
      margin-top: 6px;
    }
    .shared-goal-grid,
    .canon-highlight-row {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    }
    .shared-goal-card {
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 12px;
      background: rgba(0,0,0,.28);
      display: grid;
      gap: 10px;
      padding: 15px;
    }
    .shared-goal-card h3 {
      color: #fff1c8;
    }
    .shared-goal-card a {
      border: 1px solid rgba(143,220,124,.3);
      border-radius: 999px;
      color: #caffbf;
      justify-self: start;
      padding: 8px 11px;
      text-decoration: none;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }
    .shared-goal-card a:hover {
      border-color: rgba(143,220,124,.68);
      box-shadow: 0 0 24px rgba(143,220,124,.16);
      transform: translateY(-2px);
    }
    .canon-header {
      align-items: end;
      display: flex;
      gap: 16px;
      justify-content: space-between;
    }
    .canon-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .canon-summary span {
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 999px;
      margin: 0;
      padding: 7px 10px;
    }
    .canon-summary b {
      color: #caffbf;
    }
    .canon-tools {
      display: grid;
      gap: 10px;
    }
    .canon-tools input {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 10px;
      background: rgba(0,0,0,.34);
      color: #eadfc7;
      padding: 11px 12px;
    }
    .canon-tools > div,
    .ledger-quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .canon-tools button,
    .ledger-quick-actions button,
    .canon-card-actions button {
      border: 1px solid rgba(212,173,101,.24);
      border-radius: 999px;
      background: rgba(0,0,0,.28);
      color: #eadfc7;
      cursor: pointer;
      font-size: .78rem;
      font-weight: 800;
      padding: 8px 10px;
      transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease;
    }
    .canon-tools button:hover,
    .canon-tools button.active,
    .ledger-quick-actions button:hover,
    .canon-card-actions button:hover {
      border-color: rgba(196,111,45,.58);
      box-shadow: 0 0 22px rgba(196,111,45,.16);
      color: #ffc46c;
      transform: translateY(-2px);
    }
    .drawer-ledger-actions {
      border: 1px solid rgba(212,173,101,.12);
      border-radius: 10px;
      padding: 10px;
    }
    .canon-section-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .canon-section-grid section {
      display: grid;
      gap: 10px;
    }
    .canon-card {
      border-color: rgba(212,173,101,.2) !important;
      background:
        radial-gradient(circle at 90% 0%, rgba(196,111,45,.1), transparent 30%),
        rgba(0,0,0,.28) !important;
    }
    .canon-card.canon { box-shadow: inset 3px 0 0 rgba(143,220,124,.62); }
    .canon-card.decision { box-shadow: inset 3px 0 0 rgba(240,164,77,.62); }
    .canon-card.question { box-shadow: inset 3px 0 0 rgba(80,176,255,.58); }
    .canon-card.draft,
    .canon-card.idea { box-shadow: inset 3px 0 0 rgba(181,130,255,.52); }
    .canon-card-top {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .canon-card-top span,
    .canon-card-top em {
      border: 1px solid rgba(212,173,101,.2);
      border-radius: 999px;
      color: #f4d38f;
      font-size: .68rem;
      font-style: normal;
      font-weight: 900;
      letter-spacing: .12em;
      padding: 4px 7px;
      text-transform: uppercase;
    }
    .canon-card h4 {
      color: #fff1c8;
      font-size: 1rem;
    }
    .canon-card p {
      color: rgba(234,223,199,.78);
      line-height: 1.5;
    }
    .canon-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .canon-tags small {
      border: 1px solid rgba(143,220,124,.18);
      border-radius: 999px;
      color: #caffbf;
      padding: 3px 7px;
    }
    .canon-source {
      color: rgba(234,223,199,.58);
      font-size: .78rem;
    }
    .canon-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .canon-card-actions .danger {
      border-color: rgba(255,112,92,.38);
      color: #ffd0c8;
    }
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
    .imported-goal-section {
      display: grid;
      gap: 12px;
    }
    .imported-goal-controls {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .imported-goal-controls button,
    .imported-goal-header {
      border: 1px solid rgba(80,176,255,.26);
      background:
        linear-gradient(135deg, rgba(80,176,255,.12), rgba(212,173,101,.08)),
        rgba(0,0,0,.28);
      color: #dceeff;
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .imported-goal-controls button {
      border-radius: 999px;
      font-size: .68rem;
      font-weight: 900;
      letter-spacing: .1em;
      padding: 7px 10px;
      text-transform: uppercase;
    }
    .imported-goal-controls button:hover,
    .imported-goal-header:hover {
      border-color: rgba(212,173,101,.56);
      box-shadow: 0 0 22px rgba(80,176,255,.16), 0 0 18px rgba(212,173,101,.1);
      transform: translateY(-1px);
    }
    .imported-goal-list {
      border: 1px solid rgba(80,176,255,.14);
      border-radius: 12px;
      padding: 8px;
      background: rgba(0,0,0,.16);
    }
    .imported-goal-header {
      align-items: center;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
      text-align: left;
      width: 100%;
    }
    .imported-goal-header span {
      display: grid;
      gap: 2px;
    }
    .imported-goal-header b {
      color: #72c6ff;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .imported-goal-header em {
      color: rgba(234,223,199,.64);
      font-size: .74rem;
      font-style: normal;
    }
    .imported-goal-header strong {
      color: #d4ad65;
      font-size: .68rem;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .imported-goal-section .workspace-list h3 {
      color: #72c6ff;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .task-groups section {
      display: grid;
      gap: 9px;
    }
    .task-row {
      align-items: center;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
    }
    .task-row.imported {
      border-color: rgba(80,176,255,.22);
      background:
        radial-gradient(circle at 0% 50%, rgba(80,176,255,.1), transparent 34%),
        rgba(0,0,0,.24);
    }
    .task-row.imported small {
      color: rgba(234,223,199,.58);
      display: block;
      margin-top: 4px;
    }
    .task-row.done {
      opacity: .7;
    }
    .task-row.done b {
      text-decoration: line-through;
      text-decoration-color: rgba(143,220,124,.55);
    }
    .task-row-busy {
      border-color: rgba(143,220,124,.42);
      box-shadow: 0 0 24px rgba(143,220,124,.16), inset 0 0 18px rgba(143,220,124,.05);
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
    .task-check:disabled,
    .workspace-delete:disabled {
      cursor: wait;
      opacity: .68;
      transform: none;
    }
    .task-check-spinner {
      animation: forge-spin 900ms linear infinite;
      border: 2px solid rgba(202,255,191,.25);
      border-top-color: #caffbf;
      border-radius: 999px;
      display: inline-block;
      height: 15px;
      width: 15px;
    }
    .task-saving-overlay {
      align-items: center;
      background:
        radial-gradient(circle at 50% 45%, rgba(196,111,45,.18), transparent 30%),
        radial-gradient(circle at 50% 50%, rgba(143,220,124,.16), transparent 22%),
        rgba(0,0,0,.82);
      backdrop-filter: blur(8px);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      position: fixed;
      z-index: 120;
    }
    .task-saving-core {
      border: 1px solid rgba(212,173,101,.34);
      border-radius: 18px;
      background:
        linear-gradient(145deg, rgba(9,12,10,.96), rgba(18,13,8,.94)),
        url("/images/Forge/forge-bg-texture.png") center/cover;
      box-shadow: 0 28px 90px rgba(0,0,0,.66), 0 0 48px rgba(196,111,45,.22), inset 0 0 42px rgba(143,220,124,.06);
      display: grid;
      justify-items: center;
      max-width: 420px;
      padding: 34px;
      text-align: center;
      width: min(100%, 420px);
    }
    .forge-loader-ring {
      animation: forge-spin 1.05s linear infinite;
      border: 5px solid rgba(212,173,101,.22);
      border-left-color: #caffbf;
      border-top-color: #f0a44d;
      border-radius: 999px;
      box-shadow: 0 0 32px rgba(196,111,45,.24);
      height: 78px;
      width: 78px;
    }
    .task-saving-core p {
      color: #f0a44d;
      font-size: .78rem;
      font-weight: 900;
      letter-spacing: .2em;
      margin-top: 20px;
      text-transform: uppercase;
    }
    .task-saving-core strong {
      color: #fff1c8;
      font-size: 1.3rem;
      margin-top: 8px;
    }
    .task-saving-core em {
      color: rgba(234,223,199,.72);
      font-style: normal;
      margin-top: 10px;
    }
    .activity-list article {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
    .activity-list p {
      color: #f0a44d;
      font-size: .72rem;
      font-weight: 900;
      grid-column: 1;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .activity-list b {
      grid-column: 1;
    }
    .activity-list time {
      animation: activity-time-pulse 2.8s ease-in-out infinite;
      border: 1px solid rgba(212,173,101,.18);
      border-radius: 999px;
      color: rgba(234,223,199,.7);
      font-size: .78rem;
      grid-column: 2;
      grid-row: 1 / span 2;
      padding: 7px 10px;
      white-space: nowrap;
    }
    @keyframes activity-time-pulse {
      0%, 100% {
        border-color: rgba(212,173,101,.18);
        box-shadow: 0 0 12px rgba(196,111,45,.08);
      }
      50% {
        border-color: rgba(212,173,101,.42);
        box-shadow: 0 0 20px rgba(196,111,45,.2), 0 0 8px rgba(143,220,124,.1);
      }
    }
    @keyframes forge-spin {
      to { transform: rotate(360deg); }
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
    .document-lightbox iframe {
      border: 1px solid rgba(212,173,101,.22);
      border-radius: 10px;
      height: min(72vh, 780px);
      width: min(1040px, 88vw);
      background: #10100c;
    }
    .document-preview-header {
      margin-bottom: 12px;
      padding-right: 54px;
    }
    .document-preview-header p {
      color: #f0a44d;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .document-preview-header h2 {
      color: #fff1c8;
      margin-top: 4px;
    }
    .document-preview-header span,
    .document-preview-fallback span {
      color: rgba(234,223,199,.72);
      display: block;
      margin-top: 6px;
    }
    .document-preview-fallback {
      border: 1px dashed rgba(212,173,101,.3);
      border-radius: 12px;
      background: rgba(0,0,0,.28);
      display: grid;
      gap: 8px;
      min-height: 260px;
      place-content: center;
      text-align: center;
      padding: 24px;
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
      .linked-goals-card,
      .writing-library {
        grid-column: auto;
      }
      .linked-goal-row,
      .writing-desk {
        grid-template-columns: 1fr;
      }
      .task-command {
        align-items: start;
        flex-direction: column;
      }
      .task-composer {
        grid-template-columns: 1fr;
      }
      .workspace-upload,
      .quick-forge-composer,
      .drawer-grid,
      .drawer-actions {
        grid-template-columns: 1fr;
      }
      .task-row {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .task-row .workspace-delete {
        grid-column: 2;
      }
      .task-row .workspace-secondary {
        grid-column: 2;
      }
      .activity-list article {
        grid-template-columns: 1fr;
      }
      .activity-list time {
        grid-column: 1;
        grid-row: auto;
        justify-self: start;
      }
      .task-goal-form {
        grid-template-columns: 1fr;
      }
    }
  `}</style>;
}
