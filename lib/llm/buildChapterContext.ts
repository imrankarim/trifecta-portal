/**
 * Builds a compact, prompt-ready snapshot of the whole chapter for the AI
 * assistant. We summarize aggregates and then list the members a board would
 * actually act on (at-risk / disengaged), with the signals needed to answer
 * "who should I call this week?" — without dumping all 800 rows into the prompt.
 */

type MemberRow = Record<string, unknown>;

const ACTIVE = new Set(["Active", "Grace Period", "Lapsed"]);
const TIER_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Monitor: 4 };

function isActiveMember(m: MemberRow): boolean {
  return m.contact_type === "Member" && ACTIVE.has((m.membership_status as string) ?? "");
}

export function buildChapterContext(members: MemberRow[], chapterName: string): string {
  const lines: string[] = [];
  const active = members.filter(isActiveMember);
  const atRisk = active.filter(
    (m) => m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High",
  );
  const onLeave = members.filter(
    (m) => m.contact_type === "Member" && m.membership_status === "On Leave",
  );
  const prospects = members.filter(
    (m) => m.contact_type === "Member" && m.membership_status === "Prospect",
  );
  const sponsors = members.filter((m) => m.contact_type === "Sponsor");
  const former = members.filter(
    (m) => m.contact_type === "Member" && m.membership_status === "Former Member",
  );

  const scores = active
    .map((m) => m.engagement_score_current)
    .filter((s): s is number => typeof s === "number");
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  lines.push(`# ${chapterName} — chapter snapshot`);
  lines.push("");
  lines.push("## Totals");
  lines.push(`- Active members: ${active.length}`);
  lines.push(`- At-risk (Critical/High): ${atRisk.length}`);
  lines.push(`- On leave: ${onLeave.length}`);
  lines.push(`- Prospects: ${prospects.length}`);
  lines.push(`- Sponsors (SAPs): ${sponsors.length}`);
  lines.push(`- Former members: ${former.length}`);
  if (avgScore != null) lines.push(`- Average engagement score: ${avgScore}/100`);
  lines.push("");

  // At-risk + disengaged members, ranked, with the signals a chair needs.
  const ranked = active
    .filter((m) => m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High")
    .sort((a, b) => {
      const ra = TIER_RANK[(a.churn_risk_tier as string) ?? ""] ?? 9;
      const rb = TIER_RANK[(b.churn_risk_tier as string) ?? ""] ?? 9;
      if (ra !== rb) return ra - rb;
      return ((a.engagement_score_current as number) ?? 999) - ((b.engagement_score_current as number) ?? 999);
    })
    .slice(0, 40);

  if (ranked.length > 0) {
    lines.push(`## At-risk members (${ranked.length} shown, most urgent first)`);
    for (const m of ranked) {
      lines.push(`- ${describeMember(m)}`);
    }
    lines.push("");
  }

  // Forum health rollup.
  const byForum = new Map<string, number[]>();
  for (const m of active) {
    const f = (m.custom_fields as Record<string, unknown> | null)?.forum_name as string | undefined;
    if (!f || ["Opted Out of Forums", "Looking for Forum"].includes(f)) continue;
    if (!byForum.has(f)) byForum.set(f, []);
    if (typeof m.engagement_score_current === "number") byForum.get(f)!.push(m.engagement_score_current);
  }
  if (byForum.size > 0) {
    const rows = Array.from(byForum.entries())
      .map(([name, s]) => ({
        name,
        size: s.length,
        avg: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null,
      }))
      .sort((a, b) => (a.avg ?? 999) - (b.avg ?? 999));
    lines.push(`## Forum health (${rows.length} forums, weakest first)`);
    for (const r of rows) {
      lines.push(`- ${r.name}: ${r.size} members, avg engagement ${r.avg ?? "—"}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function describeMember(m: MemberRow): string {
  const name = `${(m.first_name as string) ?? ""} ${(m.last_name as string) ?? ""}`.trim();
  const parts: string[] = [name];
  if (m.churn_risk_tier) parts.push(`${m.churn_risk_tier} risk`);
  if (typeof m.engagement_score_current === "number") parts.push(`score ${m.engagement_score_current}`);
  const cf = (m.custom_fields as Record<string, unknown> | null) ?? {};
  if (cf.forum_name) parts.push(`forum ${cf.forum_name}`);
  if (typeof m.days_since_last_engagement === "number")
    parts.push(`${m.days_since_last_engagement}d since engagement`);
  if (typeof m.forum_attendance_rate_12m === "number")
    parts.push(`forum att ${m.forum_attendance_rate_12m}%`);
  if (m.company_name) parts.push(`${m.company_name}`);
  // Most recent note, if any, gives the assistant outreach context.
  const notes = (m.notes as Array<{ ts?: string; text?: string }> | null) ?? [];
  if (notes.length) {
    const latest = notes.slice().sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))[0];
    if (latest?.text) parts.push(`last note: "${latest.text.replace(/\s+/g, " ").slice(0, 120)}"`);
  }
  return parts.join(" · ");
}
