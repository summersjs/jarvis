"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Award, Crown, Medal, ShieldCheck, Trophy } from "lucide-react";
import {
  BODYWEIGHT_RANGE,
  STRENGTH_LIFTS,
  getStrengthClassification,
  getStrengthStandards,
  type StrengthLift,
  type StrengthTierName,
} from "@/lib/strengthStandards";

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type LiftSummary = {
  lift: string;
  training_max: number;
  estimated_pr?: {
    estimated_1rm: number;
    weight: number;
    reps: number;
    created_at?: string | null;
  } | null;
};

function getApiBase() {
  if (typeof window === "undefined") return CONFIGURED_API_BASE;

  const configuredUrl = new URL(CONFIGURED_API_BASE);
  const isConfiguredLocal =
    configuredUrl.hostname === "127.0.0.1" || configuredUrl.hostname === "localhost";
  const isPageLocal =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

  if (isConfiguredLocal && !isPageLocal) {
    return `${configuredUrl.protocol}//${window.location.hostname}:${configuredUrl.port || "8000"}`;
  }

  return CONFIGURED_API_BASE;
}

function apiUrl(path: string) {
  return `${getApiBase()}${path}`;
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.spoken_response || data.error || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export default function StrengthStandardsPage() {
  const [summaries, setSummaries] = useState<Record<string, LiftSummary>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    loadSummaries();
  }, []);

  async function loadSummaries() {
    setError("");
    const results = await Promise.all(
      STRENGTH_LIFTS.map(async (lift) => {
        try {
          const res = await fetch(apiUrl(`/workout/today/${lift}?user_id=${USER_ID}`), {
            headers: { "x-api-key": API_KEY },
          });

          if (!res.ok) {
            throw new Error(await parseApiError(res));
          }

          return [lift, await res.json()] as const;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not load strength standards.");
          return [lift, null] as const;
        }
      })
    );

    setSummaries(
      Object.fromEntries(
        results.filter((entry): entry is readonly [StrengthLift, LiftSummary] => entry[1] !== null)
      )
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Strength Index
            </p>
            <h1 className="mt-2 text-4xl font-bold text-green-100">Strength Standards</h1>
            <p className="mt-3 max-w-3xl text-green-300/80">
              Bodyweight range: {BODYWEIGHT_RANGE} lbs. Rankings use estimated 1RM / PR,
              not training max.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">Command Center</Link>
            <Link href="/workouts" className="command-nav-link">Workouts</Link>
            <Link href="/goals" className="command-nav-link">Goals</Link>
          </nav>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-green-500/25 bg-black/45 p-5 shadow-[0_0_26px_rgba(34,197,94,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="hud-panel-title">Classification Protocol</p>
              <h2 className="mt-2 text-2xl font-black uppercase text-green-100">
                Powerlifting-style standards with general population context
              </h2>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-green-500/25 bg-black/50 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-green-300" />
              <span className="text-sm font-bold uppercase tracking-[0.18em] text-green-100">
                Deterministic / No AI
              </span>
            </div>
          </div>
        </section>

        <div className="grid gap-6">
          {STRENGTH_LIFTS.map((lift) => (
            <LiftStandardsCard key={lift} lift={lift} summary={summaries[lift]} />
          ))}
        </div>
      </div>
    </main>
  );
}

function LiftStandardsCard({
  lift,
  summary,
}: {
  lift: StrengthLift;
  summary?: LiftSummary;
}) {
  const currentPr = summary?.estimated_pr?.estimated_1rm || 0;
  const classification = getStrengthClassification(lift, currentPr);
  const standards = getStrengthStandards(lift);
  const isLimitBreak = classification.progressToNextRank >= 100 && !classification.nextRank;
  const cardClass = isLimitBreak
    ? "rounded-xl border border-yellow-300/70 bg-zinc-950/95 p-5 shadow-[0_0_38px_rgba(250,204,21,0.35)]"
    : `${getProgressCardClass(classification.progressToNextRank)} rounded-xl bg-zinc-950/95 p-5`;

  return (
    <section className={cardClass}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hud-panel-title">{classification.liftLabel} Standards</p>
          <div className={`mt-2 inline-flex items-center gap-3 rounded-xl px-4 py-2 ${getRankPanelClass(classification.currentRank)}`}>
            <RankIcon rank={classification.currentRank} className="h-7 w-7" />
            <h2 className="text-3xl font-black uppercase">
              {classification.currentRank}
            </h2>
          </div>
          <p className="mt-2 text-green-300/75">
            PR / Estimated 1RM: {currentPr ? `${currentPr} lbs` : "No stored PR"}
            {summary ? ` • Training Max: ${summary.training_max} lbs` : ""}
          </p>
        </div>
        <div className={`rounded-xl px-4 py-3 text-right ${getRankPanelClass(classification.currentRank)}`}>
          <div className="inline-flex items-center gap-2">
            <RankIcon rank={classification.currentRank} className="h-5 w-5" />
            <span className="font-black uppercase tracking-[0.18em]">
              {classification.currentRank}
            </span>
          </div>
          <p className="mt-2 text-sm opacity-85">
            Next: {classification.nextRank ? `${classification.nextRank} at ${classification.nextRankMin} lbs` : "Max tier"}
          </p>
          <p className="text-sm opacity-85">
            {classification.poundsToNextRank ? `${classification.poundsToNextRank} lbs remaining` : "Threshold secured"}
          </p>
        </div>
      </div>

      <RankProgressBar classification={classification} />

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <InfoPanel
          icon={<Activity className="h-4 w-4" />}
          label="Powerlifting 200-220 lb class"
          value={classification.powerliftingDescription}
        />
        <InfoPanel
          icon={<ShieldCheck className="h-4 w-4" />}
          label="General population estimate"
          value={classification.generalPopulationDescription}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-green-500/20">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[0.9fr_0.8fr_1.4fr_1.4fr] gap-3 border-b border-green-500/20 bg-green-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-green-200">
            <span>Tier</span>
            <span>Threshold</span>
            <span>Powerlifting Standard</span>
            <span>General Population</span>
          </div>
          {standards.map((tier) => {
            const active = tier.name === classification.currentRank;
            return (
              <div
                key={tier.name}
                className={`grid grid-cols-[0.9fr_0.8fr_1.4fr_1.4fr] gap-3 px-3 py-3 text-sm ${
                  active
                    ? getRankTableClass(tier.name)
                    : "border-b border-green-500/10 text-green-300/78"
                }`}
              >
                <span className="inline-flex items-center gap-2 font-black uppercase tracking-[0.12em]">
                  <RankIcon rank={tier.name} className="h-4 w-4" />
                  {tier.name}
                </span>
                <span>{tier.max ? `${tier.min}-${tier.max}` : `${tier.min}+`} lbs</span>
                <span>{tier.powerliftingDescription}</span>
                <span>{tier.generalPopulationDescription}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RankProgressBar({
  classification,
}: {
  classification: ReturnType<typeof getStrengthClassification>;
}) {
  const percent = Math.min(100, Math.max(0, classification.progressToNextRank || 0));
  const isComplete = percent >= 100 && !classification.nextRank;
  const status = getProgressStatus(percent, isComplete);
  const milestones = getRankMilestones(classification);
  const upcomingMilestone = milestones.find((milestone) => percent < milestone.percent);

  return (
    <div className={`goal-progress-shell goal-progress-${status.tone} mb-5`}>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm text-green-300/75">
        <span>
          {classification.nextRank
            ? `${classification.estimated1rm} / ${classification.nextRankMin} lbs`
            : `${classification.estimated1rm} lbs`}
        </span>
        <span className={isComplete ? "font-bold text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]" : ""}>
          {percent}%
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`goal-progress-status goal-progress-status-${status.tone}`}>
          {status.label}
        </span>
        {upcomingMilestone && !isComplete && (
          <span className="text-xs uppercase tracking-[0.16em] text-green-300/65">
            Next unlock: {upcomingMilestone.label}
          </span>
        )}
      </div>

      <div className={`goal-progress-track ${isComplete ? "goal-progress-track-complete" : ""}`}>
        <div
          className={`goal-progress-fill ${
            isComplete ? "limit-break-bar goal-progress-fill-complete" : `goal-progress-fill-${status.tone}`
          }`}
          style={{ width: `${percent}%` }}
        >
          {(status.tone === "green" || isComplete) && (
            <span className="goal-progress-particles" aria-hidden="true" />
          )}
        </div>

        {milestones.map((milestone) => {
          const crossed = percent >= milestone.percent || isComplete;
          const upcoming = upcomingMilestone?.percent === milestone.percent;
          return (
            <div
              key={`${milestone.percent}-${milestone.kind}`}
              className={[
                "goal-milestone",
                crossed ? "goal-milestone-crossed" : "",
                upcoming ? "goal-milestone-upcoming" : "",
                milestone.kind === "final" ? "goal-milestone-final" : "",
              ].join(" ")}
              style={{ left: `${milestone.percent}%` }}
              title={milestone.tooltip}
              aria-label={milestone.tooltip}
            >
              <span className="goal-milestone-pin">{crossed ? "✓" : ""}</span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.95)]">
          Limit Break
        </p>
      )}
    </div>
  );
}

function getRankMilestones(classification: ReturnType<typeof getStrengthClassification>) {
  if (!classification.nextRank || !classification.nextRankMin) {
    return [
      {
        percent: 100,
        label: "Legendary secured",
        kind: "final",
        tooltip: "Legendary classification secured.",
      },
    ];
  }

  const start = classification.currentTierMin;
  const end = classification.nextRankMin;
  const range = Math.max(1, end - start);
  return [25, 50, 75, 100].map((percent) => {
    const value = Math.round(start + range * (percent / 100));
    return {
      percent,
      label: `${value} lbs`,
      kind: percent === 100 ? "final" : "progress",
      tooltip:
        percent === 100
          ? `${classification.nextRank} unlocks at ${classification.nextRankMin} lbs.`
          : `${percent}% checkpoint toward ${classification.nextRank}: ${value} lbs.`,
    };
  });
}

function RankIcon({
  rank,
  className,
}: {
  rank: StrengthTierName;
  className?: string;
}) {
  if (rank === "Novice") return <Medal className={className} />;
  if (rank === "Beginner") return <Award className={className} />;
  if (rank === "Intermediate") return <Trophy className={className} />;
  if (rank === "Advanced") return <Trophy className={className} />;
  if (rank === "Elite") return <Crown className={className} />;
  return <ShieldCheck className={className} />;
}

function getRankPanelClass(rank: StrengthTierName) {
  if (rank === "Novice") {
    return "border border-amber-700/70 bg-amber-900/30 text-amber-200 shadow-[0_0_14px_rgba(180,83,9,0.24)]";
  }
  if (rank === "Beginner") {
    return "border border-slate-300/65 bg-slate-400/15 text-slate-100 shadow-[0_0_14px_rgba(203,213,225,0.24)]";
  }
  if (rank === "Intermediate") {
    return "border border-yellow-300/70 bg-yellow-500/15 text-yellow-100 shadow-[0_0_18px_rgba(250,204,21,0.36)]";
  }
  if (rank === "Advanced") {
    return "border border-blue-300/75 bg-blue-500/15 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.44)]";
  }
  if (rank === "Elite") {
    return "border border-purple-300/75 bg-purple-500/15 text-purple-100 shadow-[0_0_24px_rgba(168,85,247,0.5)]";
  }
  return "border border-red-400/80 bg-red-500/15 text-red-100 shadow-[0_0_26px_rgba(248,113,113,0.55)]";
}

function getRankTableClass(rank: StrengthTierName) {
  if (rank === "Novice") {
    return "border-y border-amber-700/55 bg-amber-900/20 text-amber-100";
  }
  if (rank === "Beginner") {
    return "border-y border-slate-300/50 bg-slate-400/10 text-slate-100";
  }
  if (rank === "Intermediate") {
    return "border-y border-yellow-300/55 bg-yellow-500/12 text-yellow-100";
  }
  if (rank === "Advanced") {
    return "border-y border-blue-300/60 bg-blue-500/12 text-blue-100 shadow-[inset_0_0_16px_rgba(59,130,246,0.16)]";
  }
  if (rank === "Elite") {
    return "border-y border-purple-300/60 bg-purple-500/12 text-purple-100 shadow-[inset_0_0_18px_rgba(168,85,247,0.2)]";
  }
  return "border-y border-red-400/65 bg-red-500/12 text-red-100 shadow-[inset_0_0_20px_rgba(248,113,113,0.22)]";
}

function getProgressStatus(percent: number, isComplete: boolean) {
  if (isComplete) {
    return {
      tone: "rainbow",
      label: "ACHIEVEMENT UNLOCKED",
    };
  }
  if (percent >= 95) {
    return {
      tone: "green",
      label: "RANK IMMINENT",
    };
  }
  if (percent >= 85) {
    return {
      tone: "green",
      label: "FINAL STRETCH",
    };
  }
  if (percent >= 70) {
    return {
      tone: "yellow",
      label: "MOMENTUM BUILDING",
    };
  }
  if (percent >= 50) {
    return {
      tone: "yellow",
      label: "PROGRESSING",
    };
  }
  return {
    tone: "red",
    label: "LONG ROAD AHEAD",
  };
}

function getProgressCardClass(percent: number) {
  if (percent < 25) {
    return "border border-red-500/50 shadow-[0_0_22px_rgba(239,68,68,0.22)]";
  }
  if (percent < 60) {
    return "border border-orange-400/50 shadow-[0_0_22px_rgba(251,146,60,0.22)]";
  }
  if (percent < 90) {
    return "border border-yellow-300/55 shadow-[0_0_22px_rgba(253,224,71,0.24)]";
  }
  return "border border-green-400/55 shadow-[0_0_24px_rgba(74,222,128,0.28)]";
}

function InfoPanel({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-black/45 p-4">
      <div className="flex items-center gap-2 text-green-300">
        {icon}
        <p className="hud-panel-title">{label}</p>
      </div>
      <p className="mt-2 text-sm text-green-200/80">{value}</p>
    </div>
  );
}
