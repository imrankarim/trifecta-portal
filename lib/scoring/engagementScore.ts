// Engagement score — the load-bearing intelligence that powers the at-risk
// digest (v1.1 spec §6 Phase 1 Deliverables; Phase 1 build plan Week 3).
//
// Pure function. No I/O. Heavy unit tests. The single piece of code where
// wrong-but-plausible output is worse than no output, per the build plan:
//
//   > "Don't skip the unit tests on the scoring engine. This is the one
//    piece of code where wrong-but-plausible output is worse than no
//    output. Tests catch it."
//
// Design principles:
//   1. Weights are NAMED CONSTANTS at the top of this file. Tunable without
//      hunting through code. Sum to 1.0 by construction.
//   2. Confidence-aware. Members with only one signal don't get scored
//      against the full-confidence rubric; they get a score reflecting only
//      what we know. As more signals come online (Drive/email ingestion in
//      Phase 2; meeting notes), confidence climbs without changing the math.
//   3. Tier thresholds are bands of the 0–100 score, defined explicitly here
//      so the digest can render them and humans can debate them.
//   4. No "best guess" inferences. If a signal is null, it contributes
//      nothing to the score and nothing to the confidence denominator.

// ─────────────────────────────────────────────────────────────────────
// Weights — tune freely; must sum to 1.0
// ─────────────────────────────────────────────────────────────────────
//
// Order reflects v1.1 spec §6 priorities: forum > local events > SLP >
// WhatsApp > global events. Recency is a tie-breaker, not a primary signal.
export const WEIGHTS = {
  /** Forum attendance over the last 12 months. Highest-leverage engagement signal. */
  forum_attendance_12m: 0.35,
  /** Local chapter event attendance over the last 12 months. */
  local_event_attendance_12m: 0.25,
  /** Spouse/Life Partner program engagement — "Active" vs "Occasional" vs "None". */
  slp_engagement: 0.15,
  /** WhatsApp activity level — chapter-internal coordination presence. */
  whatsapp_activity: 0.10,
  /** Global event attendance count over the last 24 months. */
  global_event_count_24m: 0.10,
  /** Recency tie-breaker — days since last engagement of any kind. */
  recency_of_last_engagement: 0.05,
} as const;

// Sum check happens at load time (catches mis-edits during weight tuning).
const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1.0) > 0.0001) {
  throw new Error(`WEIGHTS must sum to 1.0; got ${WEIGHT_SUM}`);
}

/** The tunable weight set. Keys match WEIGHTS. */
export type ScoringWeights = Record<keyof typeof WEIGHTS, number>;

/**
 * Validate a chapter's saved weights (from chapters.scoring_weights JSONB).
 * Returns a complete ScoringWeights only if every key is a finite number >= 0
 * and at least one is positive; otherwise null (caller falls back to defaults).
 * We don't require them to sum to 1.0 — computeEngagementScore normalizes.
 */
export function parseScoringWeights(raw: unknown): ScoringWeights | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as ScoringWeights;
  let positive = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    out[key] = v;
    if (v > 0) positive++;
  }
  return positive > 0 ? out : null;
}

function normalizeWeights(w: ScoringWeights): ScoringWeights {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...WEIGHTS };
  const out = {} as ScoringWeights;
  for (const key of Object.keys(w) as Array<keyof ScoringWeights>) {
    out[key] = w[key] / sum;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Tier thresholds (upper bounds of each band on the 0–100 score)
// ─────────────────────────────────────────────────────────────────────
//
// A score of 30 is "High" risk (>= 20 and < 40).
// A score of 80 is "Monitor" (>= 80).
export const TIER_THRESHOLDS = {
  Critical: 20,  // score in [0, 20)
  High: 40,      // score in [20, 40)
  Medium: 60,    // score in [40, 60)
  Low: 80,       // score in [60, 80)
  Monitor: 100,  // score in [80, 100]
} as const;

export type ChurnRiskTier = "Critical" | "High" | "Medium" | "Low" | "Monitor";

// ─────────────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────────────
//
// Every field optional/nullable — the function works on whatever's available
// and reports its confidence in the result.
export interface ScoringInputs {
  /** Percentage 0–100. */
  forum_attendance_rate_12m?: number | null;
  /** Percentage 0–100. */
  local_event_attendance_rate_12m?: number | null;
  slp_engagement_status?: "Active" | "Occasional" | "None" | null;
  whatsapp_activity_level?: "High" | "Medium" | "Low" | "None" | null;
  /** Raw count over last 24 months. Mapped through a curve below. */
  global_event_count_24m?: number | null;
  /** Days since any engagement signal. NULL means unknown. */
  days_since_last_engagement?: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────
export interface ScoringOutput {
  /** 0–100, rounded. Higher = more engaged. */
  score: number;
  tier: ChurnRiskTier;
  /** Per-component contribution (0–100 before weighting), for transparency. */
  components: {
    forum: number | null;
    local_events: number | null;
    slp: number | null;
    whatsapp: number | null;
    global_events: number | null;
    recency: number | null;
  };
  /**
   * Fraction of signals available, weighted by their weights.
   * 1.0 means every signal was non-null. 0.0 means no data — caller should
   * treat the score as "Monitor by default, low confidence" rather than acting.
   */
  confidence: number;
  /**
   * Names of the signals that contributed to the score. Useful for the digest
   * "one-line reason" — "low forum attendance, no recent local event".
   */
  signals_present: Array<keyof typeof WEIGHTS>;
  signals_missing: Array<keyof typeof WEIGHTS>;
}

// ─────────────────────────────────────────────────────────────────────
// Component scorers (each returns 0–100 or null when no data)
// ─────────────────────────────────────────────────────────────────────

/** Already a percentage. Clamp + pass through. */
function scoreFromPercentage(pct: number | null | undefined): number | null {
  if (pct == null) return null;
  return Math.max(0, Math.min(100, pct));
}

/** SLP categorical → 0–100. */
function scoreFromSlp(s: ScoringInputs["slp_engagement_status"]): number | null {
  if (s == null) return null;
  switch (s) {
    case "Active":
      return 100;
    case "Occasional":
      return 50;
    case "None":
      return 0;
  }
}

/** WhatsApp categorical → 0–100. */
function scoreFromWhatsApp(s: ScoringInputs["whatsapp_activity_level"]): number | null {
  if (s == null) return null;
  switch (s) {
    case "High":
      return 100;
    case "Medium":
      return 66;
    case "Low":
      return 33;
    case "None":
      return 0;
  }
}

/**
 * Global event count → 0–100 via a sub-linear curve. Asymptote at 100; 5 events
 * over 24 months is ~70; 2 events is ~40; 0 is 0.
 */
function scoreFromGlobalEvents(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (n <= 0) return 0;
  // 100 * (1 - exp(-n / 3)) — saturates around 5-6 events
  return Math.round(100 * (1 - Math.exp(-n / 3)));
}

/**
 * Recency → 0–100. Recent = high score; long absent = 0.
 *   0–30 days  → 100
 *   30–90 days → linear 100 → 50
 *   90+ days   → linear 50 → 0 over 270 more days
 *   360+ days  → 0
 */
function scoreFromRecency(daysSince: number | null | undefined): number | null {
  if (daysSince == null) return null;
  if (daysSince <= 30) return 100;
  if (daysSince <= 90) return Math.round(100 - ((daysSince - 30) / 60) * 50);
  if (daysSince <= 360) return Math.round(50 - ((daysSince - 90) / 270) * 50);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────

export function computeEngagementScore(
  inputs: ScoringInputs,
  weights: ScoringWeights = WEIGHTS,
): ScoringOutput {
  // Default path (weights omitted) is byte-identical to before. Custom weights
  // are normalized to sum 1.0 so `confidence` keeps its "fraction of weight
  // available" meaning regardless of the slider scale the caller used.
  const w = weights === WEIGHTS ? WEIGHTS : normalizeWeights(weights);

  const components: ScoringOutput["components"] = {
    forum: scoreFromPercentage(inputs.forum_attendance_rate_12m),
    local_events: scoreFromPercentage(inputs.local_event_attendance_rate_12m),
    slp: scoreFromSlp(inputs.slp_engagement_status),
    whatsapp: scoreFromWhatsApp(inputs.whatsapp_activity_level),
    global_events: scoreFromGlobalEvents(inputs.global_event_count_24m),
    recency: scoreFromRecency(inputs.days_since_last_engagement),
  };

  // Confidence-aware weighting: only signals with data contribute, and only
  // their weights count toward the total weight applied.
  const signalEntries = [
    ["forum_attendance_12m", components.forum, w.forum_attendance_12m],
    ["local_event_attendance_12m", components.local_events, w.local_event_attendance_12m],
    ["slp_engagement", components.slp, w.slp_engagement],
    ["whatsapp_activity", components.whatsapp, w.whatsapp_activity],
    ["global_event_count_24m", components.global_events, w.global_event_count_24m],
    ["recency_of_last_engagement", components.recency, w.recency_of_last_engagement],
  ] as const;

  let weightedSum = 0;
  let weightApplied = 0;
  const signals_present: Array<keyof typeof WEIGHTS> = [];
  const signals_missing: Array<keyof typeof WEIGHTS> = [];

  for (const [name, value, weight] of signalEntries) {
    if (value == null) {
      signals_missing.push(name);
    } else {
      weightedSum += value * weight;
      weightApplied += weight;
      signals_present.push(name);
    }
  }

  // No signals at all → return a neutral "Monitor" with 0 confidence. Caller
  // should NOT act on this; it's the "we don't know, flag for human review"
  // state rather than the "engaged, all good" state.
  if (weightApplied === 0) {
    return {
      score: 50,
      tier: "Monitor",
      components,
      confidence: 0,
      signals_present,
      signals_missing,
    };
  }

  const rawScore = weightedSum / weightApplied; // 0–100, in the units of the available signals
  const score = Math.round(rawScore);
  const tier = tierForScore(score);
  const confidence = weightApplied; // weight applied is already a fraction of 1.0

  return {
    score,
    tier,
    components,
    confidence,
    signals_present,
    signals_missing,
  };
}

export function tierForScore(score: number): ChurnRiskTier {
  if (score < TIER_THRESHOLDS.Critical) return "Critical";
  if (score < TIER_THRESHOLDS.High) return "High";
  if (score < TIER_THRESHOLDS.Medium) return "Medium";
  if (score < TIER_THRESHOLDS.Low) return "Low";
  return "Monitor";
}
