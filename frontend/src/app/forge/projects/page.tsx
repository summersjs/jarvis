"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const PAGE_SIZE = 25;
let initialProjectsRequest: Promise<Response> | null = null;

type ForgeProject = {
  id: string;
  title: string;
  category: string;
  status: string;
  summary?: string | null;
  progress_percent?: number | null;
  next_milestone?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function ForgeProjectListPage() {
  return (
    <Suspense fallback={<main className="forge-project-list-page" />}>
      <ForgeProjectListInner />
    </Suspense>
  );
}

function ForgeProjectListInner() {
  const params = useSearchParams();
  const filter = params.get("filter") || "all";
  const category = params.get("category") || "";
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    async function load() {
      try {
        const url = `${API_BASE}/forge/projects?user_id=john&page=1&page_size=${PAGE_SIZE}`;
        if (process.env.NODE_ENV === "development") console.info(`[forge-query] GET ${url}`);
        initialProjectsRequest ||= fetch(url, { headers: { "x-api-key": API_KEY } });
        const res = (await initialProjectsRequest).clone();
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load projects.");
        setProjects(data.projects || []);
        setHasMore(Boolean(data.pagination?.has_more));
        if (process.env.NODE_ENV === "development") console.info(`[forge-query] projects list returned ${(data.projects || []).length} records`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects.");
      }
    }
    load();
  }, []);

  async function loadMore() {
    const nextPage = page + 1;
    const url = `${API_BASE}/forge/projects?user_id=john&page=${nextPage}&page_size=${PAGE_SIZE}`;
    if (process.env.NODE_ENV === "development") console.info(`[forge-query] GET ${url}`);
    const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
    const data = await res.json();
    if (!res.ok) return setError(data.detail || "Failed to load more projects.");
    setProjects((current) => [...current, ...(data.projects || [])]);
    setPage(nextPage);
    setHasMore(Boolean(data.pagination?.has_more));
    if (process.env.NODE_ENV === "development") console.info(`[forge-query] projects page ${nextPage} returned ${(data.projects || []).length} records`);
  }

  const filtered = useMemo(() => {
    const buildingCutoff = nowMs - 14 * 24 * 60 * 60 * 1000;
    const recentCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
    if (category) {
      return projects.filter((project) => project.category.toLowerCase() === category.toLowerCase());
    }
    if (filter === "active") return projects.filter(isActiveProject);
    if (filter === "building") {
      return projects.filter((project) => isActiveProject(project) && getProjectActivityTime(project) >= buildingCutoff);
    }
    if (filter === "incubating") return projects.filter((project) => normalizeStatus(project.status) === "incubating");
    if (filter === "archived") return projects.filter(isCompletedProject);
    if (filter === "completed") return projects.filter(isCompletedProject);
    if (filter === "recent") {
      return projects.filter((project) => isActiveProject(project) && getProjectActivityTime(project) >= recentCutoff);
    }
    return projects;
  }, [projects, filter, category, nowMs]);

  const title = category ? `${category} Projects` : formatFilter(filter);

  return (
    <main className="forge-project-list-page">
      <div className="forge-list-bg" aria-hidden="true" />
      <header>
        <Link href="/forge">Back to Forge</Link>
        <p>FORGE PROJECT INDEX</p>
        <h1>{title}</h1>
        <span>{filtered.length} project{filtered.length === 1 ? "" : "s"} available.</span>
      </header>

      {error && <div className="forge-list-alert">{error}</div>}

      <section className="forge-list-grid">
        {filtered.map((project) => (
          <Link key={project.id} href={`/forge/projects/${project.id}`} className="forge-list-card">
            <p>{project.category} / {project.status}</p>
            <h2>{project.title}</h2>
            <span>{project.summary || "No project summary recorded."}</span>
            <b>{project.progress_percent ?? 0}% · Next: {project.next_milestone || "Not assigned"}</b>
          </Link>
        ))}
        {!filtered.length && <div className="forge-list-empty">No projects match this filter.</div>}
      </section>
      {hasMore && <button type="button" className="forge-list-more" onClick={loadMore}>Load 25 more</button>}
      <style jsx global>{`
        .forge-project-list-page {
          min-height: 100vh;
          padding: 28px;
          background: #030404;
          color: #eadfc7;
          position: relative;
        }
        .forge-list-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(3,4,4,.68), rgba(3,4,4,.86)), url("/images/Forge/forge-bg-texture.png") center/cover;
          opacity: .82;
        }
        .forge-project-list-page header,
        .forge-list-card,
        .forge-list-empty,
        .forge-list-alert,
        .forge-list-more {
          position: relative;
          z-index: 1;
          border: 1px solid rgba(212,173,101,.2);
          border-radius: 12px;
          background: rgba(6,8,7,.88);
          box-shadow: inset 0 0 28px rgba(212,173,101,.04), 0 18px 48px rgba(0,0,0,.32);
        }
        .forge-project-list-page header { padding: 22px; }
        .forge-project-list-page header > a,
        .forge-list-card {
          color: inherit;
          text-decoration: none;
        }
        .forge-project-list-page header > a {
          border: 1px solid rgba(143,220,124,.35);
          border-radius: 8px;
          color: #caffbf;
          display: inline-flex;
          margin-bottom: 16px;
          padding: 9px 12px;
          transition: transform 180ms, border-color 180ms, box-shadow 180ms;
        }
        .forge-project-list-page header > a:hover,
        .forge-list-card:hover {
          border-color: rgba(196,111,45,.62);
          box-shadow: 0 0 28px rgba(196,111,45,.2);
          transform: translateY(-2px);
        }
        .forge-project-list-page p {
          color: #f0a44d;
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .forge-project-list-page h1 {
          color: #fff1c8;
          font-size: clamp(2rem, 5vw, 4rem);
          text-transform: uppercase;
        }
        .forge-list-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          margin-top: 18px;
          position: relative;
          z-index: 1;
        }
        .forge-list-card {
          display: grid;
          gap: 8px;
          padding: 16px;
          transition: transform 180ms, border-color 180ms, box-shadow 180ms;
        }
        .forge-list-card h2 {
          color: #fff1c8;
        }
        .forge-list-card span {
          color: rgba(234,223,199,.7);
        }
        .forge-list-card b {
          color: #caffbf;
        }
        .forge-list-empty,
        .forge-list-alert {
          padding: 18px;
        }
        .forge-list-more { color: #caffbf; cursor: pointer; display: block; margin: 18px auto; padding: 12px 18px; }
      `}</style>
    </main>
  );
}

function formatFilter(filter: string) {
  if (filter === "recent") return "Recently Updated";
  if (filter === "building") return "Building - Last 14 Days";
  if (filter === "completed") return "Completed Projects";
  return `${filter.charAt(0).toUpperCase()}${filter.slice(1)} Projects`;
}

function getProjectActivityTime(project: ForgeProject) {
  const value = project.updated_at || project.created_at || "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isCompletedStatus(status: string) {
  return ["archived", "complete", "completed", "done"].includes(normalizeStatus(status));
}

function isCompletedProject(project: ForgeProject) {
  return Boolean(project.archived_at) || isCompletedStatus(project.status);
}

function isActiveProject(project: ForgeProject) {
  return normalizeStatus(project.status) !== "incubating" && !isCompletedProject(project);
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}
