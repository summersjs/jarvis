export type StrengthLift = "deadlift" | "squat" | "bench" | "overhead_press";

export type StrengthTierName =
  | "Novice"
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Elite"
  | "Legendary";

export type StrengthTier = {
  name: StrengthTierName;
  min: number;
  max: number | null;
  trophyIcon: string;
  powerliftingDescription: string;
  generalPopulationDescription: string;
};

export type StrengthClassification = {
  lift: StrengthLift;
  liftLabel: string;
  bodyweightRange: string;
  estimated1rm: number;
  currentRank: StrengthTierName;
  trophyIcon: string;
  currentTierMin: number;
  currentTierMax: number | null;
  nextRank: StrengthTierName | null;
  nextRankMin: number | null;
  poundsToNextRank: number;
  progressToNextRank: number;
  powerliftingDescription: string;
  generalPopulationDescription: string;
};

export const BODYWEIGHT_RANGE = "200-220";

const TIER_DETAILS: Record<StrengthTierName, Omit<StrengthTier, "min" | "max" | "name">> = {
  Novice: {
    trophyIcon: "NV",
    powerliftingDescription: "Entry-level trained standard for men in the 200-220 lb range.",
    generalPopulationDescription: "Stronger than many untrained adult men.",
  },
  Beginner: {
    trophyIcon: "BG",
    powerliftingDescription: "Early strength base for men in the 200-220 lb range.",
    generalPopulationDescription: "Around or above average compared to adult men.",
  },
  Intermediate: {
    trophyIcon: "IN",
    powerliftingDescription: "Solid recreational lifter standard for men in the 200-220 lb range.",
    generalPopulationDescription: "Stronger than most adult men.",
  },
  Advanced: {
    trophyIcon: "AD",
    powerliftingDescription: "Advanced trained range for men in the 200-220 lb class.",
    generalPopulationDescription: "Very strong compared to the general adult male population.",
  },
  Elite: {
    trophyIcon: "EL",
    powerliftingDescription: "High-level strength standard for men in the 200-220 lb class.",
    generalPopulationDescription: "Extremely rare general population strength.",
  },
  Legendary: {
    trophyIcon: "LG",
    powerliftingDescription: "Top-end standard beyond typical gym strength for this bodyweight range.",
    generalPopulationDescription: "Exceptional strength rarely seen outside dedicated strength athletes.",
  },
};

const THRESHOLDS: Record<StrengthLift, Array<Pick<StrengthTier, "name" | "min" | "max">>> = {
  deadlift: [
    { name: "Novice", min: 135, max: 224 },
    { name: "Beginner", min: 225, max: 314 },
    { name: "Intermediate", min: 315, max: 404 },
    { name: "Advanced", min: 405, max: 494 },
    { name: "Elite", min: 495, max: 584 },
    { name: "Legendary", min: 585, max: null },
  ],
  squat: [
    { name: "Novice", min: 95, max: 184 },
    { name: "Beginner", min: 185, max: 274 },
    { name: "Intermediate", min: 275, max: 364 },
    { name: "Advanced", min: 365, max: 454 },
    { name: "Elite", min: 455, max: 544 },
    { name: "Legendary", min: 545, max: null },
  ],
  bench: [
    { name: "Novice", min: 95, max: 154 },
    { name: "Beginner", min: 155, max: 224 },
    { name: "Intermediate", min: 225, max: 294 },
    { name: "Advanced", min: 295, max: 364 },
    { name: "Elite", min: 365, max: 454 },
    { name: "Legendary", min: 455, max: null },
  ],
  overhead_press: [
    { name: "Novice", min: 65, max: 104 },
    { name: "Beginner", min: 105, max: 134 },
    { name: "Intermediate", min: 135, max: 184 },
    { name: "Advanced", min: 185, max: 224 },
    { name: "Elite", min: 225, max: 274 },
    { name: "Legendary", min: 275, max: null },
  ],
};

const LIFT_LABELS: Record<StrengthLift, string> = {
  deadlift: "Deadlift",
  squat: "Squat",
  bench: "Bench Press",
  overhead_press: "Overhead Press",
};

export function getStrengthStandards(lift: StrengthLift): StrengthTier[] {
  return THRESHOLDS[lift].map((tier) => ({
    ...tier,
    ...TIER_DETAILS[tier.name],
  }));
}

export function getStrengthClassification(
  lift: string,
  estimated1rm: number,
  bodyweightRange: string = BODYWEIGHT_RANGE
): StrengthClassification {
  const normalizedLift = normalizeLift(lift);
  const standards = getStrengthStandards(normalizedLift);
  const value = Math.max(0, Math.round(Number(estimated1rm) || 0));
  const currentTier =
    standards.find((tier) => value >= tier.min && (tier.max === null || value <= tier.max)) ||
    standards[0];
  const currentIndex = standards.findIndex((tier) => tier.name === currentTier.name);
  const nextTier = standards[currentIndex + 1] || null;
  const floor = currentTier.min;
  const ceiling = nextTier?.min ?? Math.max(value, currentTier.min);
  const progress =
    nextTier && ceiling > floor
      ? Math.min(100, Math.max(0, ((value - floor) / (ceiling - floor)) * 100))
      : 100;

  return {
    lift: normalizedLift,
    liftLabel: LIFT_LABELS[normalizedLift],
    bodyweightRange,
    estimated1rm: value,
    currentRank: currentTier.name,
    trophyIcon: currentTier.trophyIcon,
    currentTierMin: currentTier.min,
    currentTierMax: currentTier.max,
    nextRank: nextTier?.name ?? null,
    nextRankMin: nextTier?.min ?? null,
    poundsToNextRank: nextTier ? Math.max(0, nextTier.min - value) : 0,
    progressToNextRank: Math.round(progress),
    powerliftingDescription: currentTier.powerliftingDescription,
    generalPopulationDescription: currentTier.generalPopulationDescription,
  };
}

export function normalizeLift(lift: string): StrengthLift {
  if (lift === "overheadPress" || lift === "overhead press" || lift === "ohp") {
    return "overhead_press";
  }
  if (lift === "bench_press" || lift === "bench press") {
    return "bench";
  }
  if (lift === "squat" || lift === "bench" || lift === "deadlift" || lift === "overhead_press") {
    return lift;
  }
  return "deadlift";
}

export const STRENGTH_LIFTS: StrengthLift[] = ["deadlift", "squat", "bench", "overhead_press"];
