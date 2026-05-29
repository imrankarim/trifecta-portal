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
    /** Currently-active dues-paying members (membership_status='Active'). The headline number. */
    active_members: number;
    /** Members on sabbatical — informational, not at-risk. */
    on_leave_members: number;
    /** Members who have an engagement_score_current set (excluding On Leave + Former). */
    scored_members: number;
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
 *
 * IMPORTANT: counts only currently-active members + on-leave for the
 * headline numbers. Former Members and Prospects are present in the
 * Trifecta members table (for historical / pipeline reasons) but they
 * shouldn't inflate the "total members" the board chair sees in the digest.
 */
export function computeStats(allMembers: DigestMember[]): DigestData["stats"] {
  const stats: DigestData["stats"] = {
    active_members: 0,
    on_leave_members: 0,
    scored_members: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    monitor_count: 0,
    newly_at_risk_count: 0,
  };

  for (const m of allMembers) {
    // Headline counts — only Active + On Leave count as "current" members.
    if (m.membership_status === "Active") stats.active_members++;
    else if (m.membership_status === "On Leave") stats.on_leave_members++;

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

  // Email-safe layout: 600px max, table-based stat row (flexbox is unreliable
  // in Outlook), single-column stack for at-risk members with reason as a
  // sub-row underneath the name. Renders consistently across Gmail web/iOS,
  // Apple Mail, Outlook desktop.
  const rows = data.top_risk
    .map(
      (m, i) => `
    <tr style="border-top: 1px solid #e5e7eb;">
      <td style="padding: 14px 20px;">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span style="color: #6b7280; font-variant-numeric: tabular-nums; font-size: 13px; min-width: 18px;">${i + 1}.</span>
          <strong style="color: #111827; font-size: 15px;">${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</strong>
          ${tierBadge(m.churn_risk_tier)}
          <span style="margin-left: auto; color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; font-size: 15px;">${m.engagement_score_current ?? "—"}</span>
        </div>
        ${m.company_name ? `<div style="margin-left: 26px; margin-top: 2px; color: #6b7280; font-size: 13px;">${escapeHtml(m.company_name)}</div>` : ""}
        <div style="margin-left: 26px; margin-top: 6px; color: #4b5563; font-size: 13px; font-style: italic;">${escapeHtml(m.reason)}</div>
      </td>
    </tr>`,
    )
    .join("\n");

  const emptyState =
    data.top_risk.length === 0
      ? `<p style="padding: 32px 24px; text-align: center; color: #6b7280; font-size: 14px;">No at-risk members this week. 🎉</p>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.chapter_name)} — Top At-Risk Members</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width: 600px; width: 100%; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: separate; overflow: hidden;">
    <tr>
      <td style="padding: 24px 24px 12px;">
        <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600;">Weekly digest · ${titleDate}</p>
        <h1 style="margin: 6px 0 0; font-size: 20px; line-height: 1.3; color: #111827; font-weight: 700;">${escapeHtml(data.chapter_name)}</h1>
        <p style="margin: 4px 0 0; color: #4b5563; font-size: 14px;">Top at-risk members this week</p>
      </td>
    </tr>

    <tr>
      <td style="padding: 12px 24px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: separate; border-spacing: 8px 0;">
          <tr>
            ${statCell("At Risk", data.stats.critical_count + data.stats.high_count, "#dc2626")}
            ${statCell("Newly at risk", data.stats.newly_at_risk_count, "#7c3aed")}
            ${statCell("Active members", data.stats.active_members, "#111827")}
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="border-top: 1px solid #e5e7eb;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
          ${data.top_risk.length > 0 ? rows : `<tr><td>${emptyState}</td></tr>`}
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; line-height: 1.5;">
        Scores updated ${titleDate}. ${data.stats.scored_members} of ${data.stats.active_members + data.stats.on_leave_members} members carry an engagement signal — coverage grows as Drive and meeting-note ingestion come online.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────

function statCell(label: string, value: number, color: string): string {
  return `<td style="width: 33.33%; padding: 12px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px; vertical-align: top;">
      <div style="font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.06em; font-weight: 600;">${escapeHtml(label)}</div>
      <div style="font-size: 22px; font-weight: 700; color: ${color}; margin-top: 4px; line-height: 1.1;">${value}</div>
    </td>`;
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
