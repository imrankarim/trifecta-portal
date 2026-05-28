// scoreMembers — score every Member in a chapter and write the results back
// to the members table. Mirrors the structure of syncConnector.ts:
//   1. Load chapter members
//   2. Derive scoring inputs (canonical columns + custom_fields fallback)
//   3. Compute engagement score
//   4. Update members.engagement_score_current + _prev + _trend + churn_risk_tier
//      + score_last_calculated_at
//   5. Return summary
//
// Phase 1 build plan Week 3: runs nightly via Vercel Cron (set up in a
// separate commit alongside the at-risk digest send).

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEngagementScore, type ChurnRiskTier } from "../scoring/engagementScore";
import {
  deriveScoringInputs,
  computeChapterEventCounts,
  type MemberForScoring,
} from "../scoring/deriveScoringInputs";

export interface ScoreMembersResult {
  chapterId: string;
  startedAt: string;
  finishedAt: string;
  totalMembers: number;
  membersScored: number;
  membersSkipped: number; // non-Members (Staff, Spouse, Sponsor) — not scored
  membersFailed: number;
  errors: string[];
  /** Tier distribution after the run. */
  tierDistribution: Record<ChurnRiskTier, number>;
  /** Score statistics across scored members. */
  scoreStats: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
}

export interface ScoreMembersOptions {
  supabase: SupabaseClient;
  chapterId: string;
  /** Set true to compute scores without writing them back. */
  dryRun?: boolean;
  log?: (msg: string) => void;
}

/** Columns we read from members for scoring. */
const SCORING_SELECT =
  "trifecta_member_id, first_name, last_name, contact_type, membership_status, " +
  "forum_attendance_rate_12m, local_event_attendance_rate_12m, " +
  "slp_engagement_status, whatsapp_activity_level, " +
  "global_event_count_24m, days_since_last_engagement, " +
  "forum_last_attended_date, local_event_last_attended_date, global_event_last_attended_date, " +
  "engagement_score_current, custom_fields";

interface MemberRow extends MemberForScoring {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  engagement_score_current: number | null;
}

export async function scoreMembers(opts: ScoreMembersOptions): Promise<ScoreMembersResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const startedAt = new Date();
  const result: ScoreMembersResult = {
    chapterId: opts.chapterId,
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    totalMembers: 0,
    membersScored: 0,
    membersSkipped: 0,
    membersFailed: 0,
    errors: [],
    tierDistribution: { Critical: 0, High: 0, Medium: 0, Low: 0, Monitor: 0 },
    scoreStats: { min: 0, max: 0, mean: 0, median: 0 },
  };

  try {
    // 1. Load all members for the chapter
    const { data: members, error: loadErr } = await opts.supabase
      .from("members")
      .select(SCORING_SELECT)
      .eq("chapter_id", opts.chapterId);
    if (loadErr) throw new Error(`load members failed: ${loadErr.message}`);
    const rows = (members ?? []) as unknown as MemberRow[];
    result.totalMembers = rows.length;
    log(`loaded ${rows.length} members`);

    // 2. Pre-compute chapter event counts (denominator for attendance rates)
    const chapterEventCounts = computeChapterEventCounts(rows);
    log(`derived ${Object.keys(chapterEventCounts).length} chapter-event buckets`);

    // 3. Score each Member
    const scoresEmitted: number[] = [];

    for (const m of rows) {
      // Only Members get a score (per ADR-005)
      if (m.contact_type !== "Member") {
        result.membersSkipped++;
        continue;
      }

      try {
        const inputs = deriveScoringInputs(m, { asOf: startedAt, chapterEventCounts });
        const output = computeEngagementScore(inputs);

        const prevScore = m.engagement_score_current;
        const trend = computeTrend(prevScore, output.score);

        if (!opts.dryRun) {
          // Write back BOTH the final score AND the derived inputs that fed
          // it, so the dashboard / admin / digest can show consistent
          // explanatory data without re-running the deriver.
          const update: Record<string, unknown> = {
            engagement_score_current: output.score,
            engagement_score_prev: prevScore,
            engagement_trend: trend,
            churn_risk_tier: output.tier,
            score_last_calculated_at: startedAt.toISOString(),
          };
          // Only write derived values that aren't already populated from
          // direct sync — don't blow away data the connector put there.
          if (m.forum_attendance_rate_12m == null && inputs.forum_attendance_rate_12m != null) {
            update.forum_attendance_rate_12m = inputs.forum_attendance_rate_12m;
          }
          if (
            m.local_event_attendance_rate_12m == null &&
            inputs.local_event_attendance_rate_12m != null
          ) {
            update.local_event_attendance_rate_12m = inputs.local_event_attendance_rate_12m;
          }
          if (m.days_since_last_engagement == null && inputs.days_since_last_engagement != null) {
            update.days_since_last_engagement = inputs.days_since_last_engagement;
          }
          const { error: updErr } = await opts.supabase
            .from("members")
            .update(update)
            .eq("trifecta_member_id", m.trifecta_member_id);
          if (updErr) throw new Error(updErr.message);
        }

        result.membersScored++;
        result.tierDistribution[output.tier]++;
        scoresEmitted.push(output.score);
      } catch (err) {
        result.membersFailed++;
        result.errors.push(
          `[${m.first_name} ${m.last_name}] ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 4. Stats
    if (scoresEmitted.length > 0) {
      scoresEmitted.sort((a, b) => a - b);
      const sum = scoresEmitted.reduce((a, b) => a + b, 0);
      result.scoreStats = {
        min: scoresEmitted[0],
        max: scoresEmitted[scoresEmitted.length - 1],
        mean: Math.round((sum / scoresEmitted.length) * 10) / 10,
        median: scoresEmitted[Math.floor(scoresEmitted.length / 2)],
      };
    }

    log(`scored ${result.membersScored} / skipped ${result.membersSkipped} / failed ${result.membersFailed}`);
  } catch (err) {
    result.errors.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    result.finishedAt = new Date().toISOString();
  }

  return result;
}

/** Trend label from old → new score. Thresholds tuned to feel intuitive. */
function computeTrend(
  prev: number | null,
  current: number,
): "Improving" | "Stable" | "Declining" {
  if (prev == null) return "Stable";
  const delta = current - prev;
  if (delta >= 5) return "Improving";
  if (delta <= -5) return "Declining";
  return "Stable";
}
