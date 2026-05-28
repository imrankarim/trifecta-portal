// Bridges the gap between Trifecta's member rows (canonical columns +
// custom_fields JSONB) and the pure scoring engine's `ScoringInputs`.
//
// Two responsibilities:
//   1. Read canonical columns when populated (members.forum_attendance_rate_12m,
//      etc.) — the "ideal" data shape Phase 2 sync targets will produce.
//   2. Fall back to deriving from custom_fields when canonical fields are null —
//      handles EO Dallas's actual shape today (per-fiscal-year attendance
//      arrays in custom_fields.attendance.*) without forcing the sync to
//      pre-compute rates.
//
// Pure function. No I/O. Heavy unit tests in deriveScoringInputs.test.ts.

import type { ScoringInputs } from "./engagementScore";

/**
 * Subset of the members row we need for scoring. Anything else is ignored.
 * Field names match Postgres column names (snake_case).
 */
export interface MemberForScoring {
  contact_type?: string | null;
  membership_status?: string | null;

  // Canonical attendance / engagement columns (preferred when populated)
  forum_attendance_rate_12m?: number | null;
  local_event_attendance_rate_12m?: number | null;
  slp_engagement_status?: string | null;
  whatsapp_activity_level?: string | null;
  global_event_count_24m?: number | null;
  days_since_last_engagement?: number | null;
  forum_last_attended_date?: string | null;
  local_event_last_attended_date?: string | null;
  global_event_last_attended_date?: string | null;

  // The JSONB overflow column — holds chapter-specific data the sync routed
  // here (e.g. EO Dallas's per-fiscal-year attendance arrays from HubSpot
  // multi-selects).
  custom_fields?: Record<string, unknown> | null;
}

/**
 * Attendance entry as emitted by the multi_select_to_attendance transform
 * (lib/connectors/transformations.ts). Lives at
 * members.custom_fields.attendance.{event_type}_{fiscal_year}: AttendanceEntry[].
 */
export interface AttendanceEntry {
  event_id: string;
  event_name: string;
  event_type: string;
  fiscal_year: string;
  attended: boolean;
}

/** EO fiscal year runs July → June. */
function fiscalYearForDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  if (m >= 7) {
    // Jul-Dec → FY = current-next (e.g. Oct 2024 → "2024-25")
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  }
  // Jan-Jun → FY = prev-current (e.g. Feb 2025 → "2024-25")
  return `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

/**
 * Look at every per-fiscal-year attendance bucket in custom_fields.attendance.*
 * and return a rough 12-month attendance rate (%), or null if no data.
 *
 * The denominator (events offered in that window) isn't tracked anywhere —
 * we use chapter-level event counts derived from the union of event_ids seen
 * across all members in the same FY buckets. That's the "chapterEventCounts"
 * argument the caller supplies (typically computed once per scoring run).
 *
 * If chapterEventCounts is absent or empty, falls back to a heuristic: rate =
 * min(100, attended * (100 / EXPECTED_EVENTS_PER_FY)) — assumes ~10 events/year
 * as a reasonable EO chapter calendar.
 */
const EXPECTED_EVENTS_PER_FY_FALLBACK = 10;

export interface ChapterEventCounts {
  /** Per (event_type, fiscal_year) bucket: how many distinct events did the chapter host. */
  [key: string]: number;
}

function bucketKey(eventType: string, fiscalYear: string): string {
  return `${eventType}|${fiscalYear}`;
}

function attendanceRateFromCustomFields(
  customFields: Record<string, unknown> | null | undefined,
  eventType: "learning" | "local" | "forum" | "global" | "slp",
  asOf: Date,
  chapterEventCounts?: ChapterEventCounts,
): number | null {
  if (!customFields) return null;
  const attendance = customFields["attendance"];
  if (typeof attendance !== "object" || attendance === null) return null;

  const currentFy = fiscalYearForDate(asOf);
  // Prior FY for rolling 12 months. Chapter terminology in bucket KEY may
  // differ from canonical event_type on records (e.g. EO Dallas uses
  // "social_*" bucket key for event_type="local"), so we iterate ALL buckets
  // and filter by the record's event_type + fiscal_year fields.
  const priorFy = fiscalYearForDate(
    new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), asOf.getUTCDate())),
  );
  const inWindow = (fy: string): boolean => fy === currentFy || fy === priorFy;

  const buckets = attendance as Record<string, unknown>;
  let attended = 0;
  let denominator = 0;
  const fysSeenForThisType = new Set<string>();

  for (const entries of Object.values(buckets)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries as AttendanceEntry[]) {
      if (!e || e.event_type !== eventType) continue;
      if (!inWindow(e.fiscal_year)) continue;
      fysSeenForThisType.add(e.fiscal_year);
      if (e.attended) attended++;
    }
  }

  if (chapterEventCounts) {
    for (const fy of Array.from(fysSeenForThisType)) {
      denominator += chapterEventCounts[bucketKey(eventType, fy)] ?? 0;
    }
  }

  if (attended === 0 && fysSeenForThisType.size === 0) return null; // truly no data
  if (denominator > 0) {
    return Math.round((100 * attended) / denominator);
  }
  // Fallback heuristic — assume one chapter year of events per FY observed
  const expected = EXPECTED_EVENTS_PER_FY_FALLBACK * Math.max(1, fysSeenForThisType.size);
  return Math.min(100, Math.round((attended * 100) / expected));
}

/**
 * Compute the most recent attendance date across all known buckets.
 * Used to derive days_since_last_engagement when no canonical
 * `*_last_attended_date` columns are populated.
 */
function lastEngagementFromCustomFields(
  customFields: Record<string, unknown> | null | undefined,
): Date | null {
  if (!customFields) return null;
  const attendance = customFields["attendance"];
  if (typeof attendance !== "object" || attendance === null) return null;

  // The attendance arrays carry event_id + fiscal_year but not the exact event
  // date. Use the LATEST fiscal year present as a coarse proxy for "most
  // recent engagement". A member who attended a 2025-26 event was engaged
  // sometime in 2025-26; we approximate that date as the FY midpoint
  // (Jan 1 of the second calendar year).
  let latestFy = "";
  for (const key of Object.keys(attendance as Record<string, unknown>)) {
    const match = key.match(/_(\d{4})_(\d{2})$/);
    if (!match) continue;
    const fy = `${match[1]}-${match[2]}`;
    if (fy > latestFy) latestFy = fy;
  }
  if (!latestFy) return null;
  const [startYear] = latestFy.split("-");
  // Approximate engagement date as Jan 1 of the second calendar year of the FY
  return new Date(Date.UTC(Number(startYear) + 1, 0, 1));
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDateMaybe(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────────────

export interface DeriveScoringInputsOptions {
  /** Reference time for fiscal-year + recency computations. Defaults to now. */
  asOf?: Date;
  /** Per-(event_type, fiscal_year) chapter event counts for denominator-true rates. */
  chapterEventCounts?: ChapterEventCounts;
}

/**
 * Produce ScoringInputs for a single member by reading canonical columns
 * first, then deriving from custom_fields as fallback.
 *
 * Canonical-wins rule: if a canonical column has a non-null value, the
 * derived computation is ignored (the chapter explicitly tracks that signal
 * and we trust their data). The derivation only fills in null canonical
 * fields.
 */
export function deriveScoringInputs(
  member: MemberForScoring,
  opts: DeriveScoringInputsOptions = {},
): ScoringInputs {
  const asOf = opts.asOf ?? new Date();
  const customFields = member.custom_fields ?? {};

  // Forum attendance — for EO Dallas no data; canonical column wins if Phase 2 supplies it
  const forum_attendance_rate_12m =
    member.forum_attendance_rate_12m ??
    attendanceRateFromCustomFields(customFields, "forum", asOf, opts.chapterEventCounts);

  // Local event attendance — combines learning + local + social buckets observed in EO Dallas data
  const local_event_attendance_rate_12m =
    member.local_event_attendance_rate_12m ??
    combineLocalEventRates(customFields, asOf, opts.chapterEventCounts);

  // SLP — canonical column only for now
  const slp_engagement_status = normalizeSlp(member.slp_engagement_status);
  const whatsapp_activity_level = normalizeWhatsApp(member.whatsapp_activity_level);
  const global_event_count_24m = member.global_event_count_24m ?? null;

  // Recency — canonical date columns win; fall back to derived FY-based estimate
  const days_since_last_engagement = computeDaysSinceLastEngagement(member, asOf);

  return {
    forum_attendance_rate_12m,
    local_event_attendance_rate_12m,
    slp_engagement_status,
    whatsapp_activity_level,
    global_event_count_24m,
    days_since_last_engagement,
  };
}

/**
 * Combine "learning" + "local" + "social" event-type rates into one local-event
 * rate. EO Dallas's HubSpot splits learning and social as separate multi-selects;
 * Trifecta's canonical "local_event_attendance_rate_12m" wants the merged view.
 */
function combineLocalEventRates(
  customFields: Record<string, unknown>,
  asOf: Date,
  chapterEventCounts: ChapterEventCounts | undefined,
): number | null {
  const learning = attendanceRateFromCustomFields(customFields, "learning", asOf, chapterEventCounts);
  const local = attendanceRateFromCustomFields(customFields, "local", asOf, chapterEventCounts);
  // SLP and forum are separate; only roll up learning + local here
  const rates = [learning, local].filter((r): r is number => r != null);
  if (rates.length === 0) return null;
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
}

function normalizeSlp(v: string | null | undefined): ScoringInputs["slp_engagement_status"] {
  if (!v) return null;
  if (v === "Active" || v === "Occasional" || v === "None") return v;
  return null;
}

function normalizeWhatsApp(v: string | null | undefined): ScoringInputs["whatsapp_activity_level"] {
  if (!v) return null;
  if (v === "High" || v === "Medium" || v === "Low" || v === "None") return v;
  return null;
}

function computeDaysSinceLastEngagement(member: MemberForScoring, asOf: Date): number | null {
  if (member.days_since_last_engagement != null) return member.days_since_last_engagement;

  const dates = [
    parseDateMaybe(member.forum_last_attended_date),
    parseDateMaybe(member.local_event_last_attended_date),
    parseDateMaybe(member.global_event_last_attended_date),
    lastEngagementFromCustomFields(member.custom_fields),
  ].filter((d): d is Date => d != null);

  if (dates.length === 0) return null;
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  return Math.max(0, daysBetween(asOf, latest));
}

/**
 * Pre-compute chapter-wide event counts per (event_type, fiscal_year) from
 * the attendance arrays across all members. The scoring job calls this once
 * per run; the result is passed into deriveScoringInputs as opts.chapterEventCounts.
 *
 * Idea: a chapter's "event calendar" can be inferred from the union of
 * event_ids any member attended. If 30 members each attended a subset of the
 * chapter's events, the union is the chapter event list.
 */
export function computeChapterEventCounts(
  members: Array<MemberForScoring>,
): ChapterEventCounts {
  // Keyed by (event_type, fiscal_year) from the records themselves — bucket
  // names are chapter terminology and may not match canonical event_type.
  const seen: Record<string, Set<string>> = {};
  for (const m of members) {
    const att = m.custom_fields?.["attendance"];
    if (typeof att !== "object" || att === null) continue;
    for (const entries of Object.values(att as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries as AttendanceEntry[]) {
        if (!e?.event_id || !e.event_type || !e.fiscal_year) continue;
        const bucket = bucketKey(e.event_type, e.fiscal_year);
        seen[bucket] ??= new Set();
        seen[bucket].add(e.event_id);
      }
    }
  }
  const counts: ChapterEventCounts = {};
  for (const [k, set] of Object.entries(seen)) counts[k] = set.size;
  return counts;
}
