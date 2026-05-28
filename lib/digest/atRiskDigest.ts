// At-risk digest — the Monday-morning email per the Phase 1 build plan Week 3.
//
// "Every Monday morning at 8am Central, you (and Jon, if he wants in) receive
//  an email titled 'EO Dallas — Top 10 At-Risk Members This Week' with a
//  ranked list."
//
// This module: pure rendering + data shaping. Sending via Resend lives in a
// separate function (sendDigest, in a follow-up commit). Preview route at
// /admin/digest-preview renders this without sending.
//
// One-line reasons are derived from the scoring components — explainability
// is non-negotiable; the chair has to know WHY each at-risk flag.

import type { ChurnRiskTier } from "../scoring/engagementScore";

export interface DigestMember {
  trifecta_member_id: string;
  first_name: string;
  last_name: string;
  email_primary: string;
  company_name: string | null;
  membership_status: string | null;
  engagement_score_current: number | null;
  engagement_trend: "Improving" | "Stable" | "Declining" | null;
  churn_risk_tier: ChurnRiskTier | null;
  score_last_calculated_at: string | null;
  /** Member's previous score so we can show deltas. */
  engagement_score_prev: number | null;
  /** For reason derivation — populated by deriveScoringInputs. */
  custom_fields: Record<string, unknown> | null;
  forum_attendance_rate_12m: number | null;
  local_event_attendance_rate_12m: number | null;
  slp_engagement_status: string | null;
  whatsapp_activity_level: string | null;
  days_since_last_engagement: number | null;
}

export interface DigestData {
  chapter_name: string;
  generated_at: string;
  /** Top 10 (or fewer) at-risk Members, sorted by tier severity then ascending score. */
  top_risk: Array<DigestMember & { reason: string }>;
  /** Chapter-level stats for context. */
  stats: {
    total_members: number;          // contact_type='Member' only
    scored_members: number;         // those with engagement_score_current set
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    monitor_count: number;
    /** Members who moved from Low/Monitor to High/Critical this week. */
    newly_at_risk_count: number;
  };
}

const TIER_ORDER: Record<ChurnRiskTier, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Monitor: 4,
};

/**
 * Pick the top-N at-risk members, sorted by tier severity then score ascending.
 * Excludes Members in Low/Monitor (those aren't "at risk" — they're fine or
 * unknown). Caps at 10 by default.
 */
export function selectTopRisk(
  members: DigestMember[],
  options: { limit?: number; includeMedium?: boolean } = {},
): DigestMember[] {
  const limit = options.limit ?? 10;
  const acceptable: ChurnRiskTier[] = options.includeMedium
    ? ["Critical", "High", "Medium"]
    : ["Critical", "High"];
  const atRisk = members.filter(
    (m) => m.churn_risk_tier && acceptable.includes(m.churn_risk_tier),
  );
  atRisk.sort((a, b) => {
    const tierA = TIER_ORDER[a.churn_risk_tier!];
    const tierB = TIER_ORDER[b.churn_risk_tier!];
    if (tierA !== tierB) return tierA - tierB;
    const scoreA = a.engagement_score_current ?? 50;
    const scoreB = b.engagement_score_current ?? 50;
    return scoreA - scoreB;
  });
  return atRisk.slice(0, limit);
}

/**
 * Build the one-line reason for why a member is flagged. Reads the signals
 * we have data for; picks the most-negative one as the primary explanation.
 *
 * Goal: short, scannable, actionable. "Has not attended a local event in 14
 * months" beats "engagement_score_current is 18".
 */
export function buildReason(m: DigestMember): string {
  const reasons: string[] = [];

  if (m.local_event_attendance_rate_12m != null && m.local_event_attendance_rate_12m < 25) {
    reasons.push(`only ${m.local_event_attendance_rate_12m}% local event attendance`);
  }
  if (m.forum_attendance_rate_12m != null && m.forum_attendance_rate_12m < 25) {
    reasons.push(`only ${m.forum_attendance_rate_12m}% forum attendance`);
  }
  if (m.days_since_last_engagement != null && m.days_since_last_engagement > 180) {
    reasons.push(`no engagement in ${m.days_since_last_engagement} days`);
  }
  if (m.slp_engagement_status === "None") {
    reasons.push("no SLP engagement");
  }
  if (m.whatsapp_activity_level === "None") {
    reasons.push("inactive on chapter WhatsApp");
  }
  if (m.engagement_trend === "Declining") {
    reasons.push("declining trend");
  }

  if (reasons.length === 0) {
    return `score ${m.engagement_score_current} — signals limited`;
  }
  // Show the two most informative
  return reasons.slice(0, 2).join("; ");
}

/**
 * Compute chapter-level stats from the full member list.
 */
export function computeStats(allMembers: DigestMember[]): DigestData["stats"] {
  const stats: DigestData["stats"] = {
    total_members: 0,
    scored_members: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    monitor_count: 0,
    newly_at_risk_count: 0,
  };

  for (const m of allMembers) {
    stats.total_members++;
    if (m.engagement_score_current != null) stats.scored_members++;
    switch (m.churn_risk_tier) {
      case "Critical":
        stats.critical_count++;
        break;
      case "High":
        stats.high_count++;
        break;
      case "Medium":
        stats.medium_count++;
        break;
      case "Low":
        stats.low_count++;
        break;
      case "Monitor":
        stats.monitor_count++;
        break;
    }
    // Newly at-risk: prev score was Low/Monitor (>= 60) but current is Critical/High (< 40)
    if (
      m.engagement_score_prev != null &&
      m.engagement_score_prev >= 60 &&
      m.engagement_score_current != null &&
      m.engagement_score_current < 40
    ) {
      stats.newly_at_risk_count++;
    }
  }
  return stats;
}

/**
 * Render the digest as HTML email. Inline styles for max email-client
 * compatibility. Self-contained — no external CSS.
 */
export function renderDigestHTML(data: DigestData): string {
  const titleDate = formatDate(data.generated_at);
  const rows = data.top_risk
    .map(
      (m, i) => `
    <tr style="border-top: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; font-weight: 600; color: #111827;">${i + 1}.</td>
      <td style="padding: 12px 8px; color: #111827;">
        ${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}<br/>
        <span style="font-size: 12px; color: #6b7280;">${escapeHtml(m.company_name ?? "")}</span>
      </td>
      <td style="padding: 12px 8px;">${tierBadge(m.churn_risk_tier)}</td>
      <td style="padding: 12px 8px; text-align: right; font-variant-numeric: tabular-nums; color: #111827; font-weight: 600;">${m.engagement_score_current ?? "—"}</td>
      <td style="padding: 12px 8px; color: #6b7280; font-size: 14px;">${escapeHtml(m.reason)}</td>
    </tr>`,
    )
    .join("\n");

  const emptyState =
    data.top_risk.length === 0
      ? `<p style="padding: 24px; text-align: center; color: #6b7280;">No at-risk members this week. 🎉</p>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.chapter_name)} — Top At-Risk Members</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 24px;">
  <div style="max-width: 720px; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px 24px 16px;">
      <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Weekly digest · ${titleDate}</p>
      <h1 style="margin: 4px 0 0; font-size: 22px; color: #111827;">${escapeHtml(data.chapter_name)} — Top At-Risk Members</h1>
    </div>

    <div style="padding: 0 24px 16px; display: flex; gap: 16px; flex-wrap: wrap;">
      ${statCard("Critical", data.stats.critical_count, "#dc2626")}
      ${statCard("High", data.stats.high_count, "#ea580c")}
      ${statCard("Medium", data.stats.medium_count, "#d97706")}
      ${statCard("Newly at risk", data.stats.newly_at_risk_count, "#7c3aed")}
      ${statCard("Total members", data.stats.total_members, "#111827")}
    </div>

    ${
      data.top_risk.length > 0
        ? `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background: #f9fafb; text-align: left;">
          <th style="padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">#</th>
          <th style="padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Member</th>
          <th style="padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Tier</th>
          <th style="padding: 10px 8px; text-align: right; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Score</th>
          <th style="padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">Why flagged</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`
        : emptyState
    }

    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
      Scores updated ${formatDate(data.generated_at)}.
      Trifecta generates this digest from chapter data including HubSpot, attendance records, and forum engagement.
      Phase 1 confidence is limited — signals expand as Drive and meeting-note ingestion come online.
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────

function statCard(label: string, value: number, color: string): string {
  return `
    <div style="flex: 1; min-width: 120px; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 6px;">
      <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;">${escapeHtml(label)}</div>
      <div style="font-size: 24px; font-weight: 700; color: ${color}; margin-top: 4px;">${value}</div>
    </div>`;
}

function tierBadge(tier: ChurnRiskTier | null): string {
  if (!tier) return `<span style="color: #9ca3af;">—</span>`;
  const colors: Record<ChurnRiskTier, { bg: string; fg: string }> = {
    Critical: { bg: "#fee2e2", fg: "#991b1b" },
    High: { bg: "#fed7aa", fg: "#9a3412" },
    Medium: { bg: "#fef3c7", fg: "#92400e" },
    Low: { bg: "#d1fae5", fg: "#065f46" },
    Monitor: { bg: "#e5e7eb", fg: "#374151" },
  };
  const c = colors[tier];
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; background: ${c.bg}; color: ${c.fg}; font-size: 11px; font-weight: 600;">${tier}</span>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build the digest from a chapter id. Loads members, computes stats, picks
 * top risk, returns DigestData ready for renderDigestHTML.
 */
export async function buildDigest(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  chapterId: string,
): Promise<DigestData> {
  const { data: chapter, error: chErr } = await supabase
    .from("chapters")
    .select("chapter_name")
    .eq("trifecta_chapter_id", chapterId)
    .single();
  if (chErr) throw new Error(`load chapter: ${chErr.message}`);

  const { data: members, error: mErr } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, membership_status, " +
        "engagement_score_current, engagement_score_prev, engagement_trend, " +
        "churn_risk_tier, score_last_calculated_at, custom_fields, " +
        "forum_attendance_rate_12m, local_event_attendance_rate_12m, " +
        "slp_engagement_status, whatsapp_activity_level, days_since_last_engagement",
    )
    .eq("chapter_id", chapterId)
    .eq("contact_type", "Member");
  if (mErr) throw new Error(`load members: ${mErr.message}`);

  const allMembers = (members ?? []) as unknown as DigestMember[];
  const top_risk = selectTopRisk(allMembers).map((m) => ({ ...m, reason: buildReason(m) }));
  const stats = computeStats(allMembers);

  return {
    chapter_name: chapter?.chapter_name ?? "Chapter",
    generated_at: new Date().toISOString(),
    top_risk,
    stats,
  };
}
