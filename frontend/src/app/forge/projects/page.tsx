"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";

type ForgeProject = {
  id: string;
  title: string;
  category: string;
  status: string;
  summary?: string | null;
  progress_percent?: number | null;
  next_milestone?: string | null;
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/forge?user_id=john`, { headers: { "x-api-key": API_KEY } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load projects.");
        setProjects(data.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects.");
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const activeStatuses = new Set(["Active", "Building", "Experiment"]);
    if (category) {
      return projects.filter((project) => project.category.toLowerCase() === category.toLowerCase());
    }
    if (filter === "active") return projects.filter((project) => activeStatuses.has(project.status));
    if (filter === "building") return projects.filter((project) => project.status === "Building");
    if (filter === "incubating") return projects.filter((project) => project.status === "Incubating");
    if (filter === "archived") return projects.filter((project) => project.status === "Archived");
    if (filter === "recent") return projects.filter((project) => !["Incubating", "Archived", "Completed"].includes(project.status));
    return projects;
  }, [projects, filter, category]);

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
        .forge-list-alert {
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
      `}</style>
    </main>
  );
}

function formatFilter(filter: string) {
  return filter === "recent" ? "Recently Updated" : `${filter.charAt(0).toUpperCase()}${filter.slice(1)} Projects`;
}
