/**
 * Pure function — turns a Members row into a compact, prompt-ready summary
 * for Claude. We deliberately omit nulls and pretty-print numbers so the LLM
 * doesn't have to parse JSON nor reason about absent fields.
 */

type MemberRow = Record<string, unknown>;

interface BoardRoleEntry {
  role: string;
  start_date: string;
  end_date: string;
}

interface AttendanceEntry {
  event_id: string;
  event_name: string;
  event_type: string;
  fiscal_year: string;
  attended: boolean;
}

interface NoteEntry {
  ts?: string;
  text?: string;
  source?: string;
  category?: string;
}

interface ActionItemEntry {
  id: string;
  text: string;
  due_date?: string | null;
  completed_at?: string | null;
}

export function buildMemberContext(m: MemberRow): string {
  const cf = (m.custom_fields ?? {}) as Record<string, unknown>;
  const lines: string[] = [];

  // ── Identity ────────────────────────────────────────────────────────────
  const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "(no name)";
  lines.push(`# ${fullName}`);
  const idBits: string[] = [];
  if (m.job_title) idBits.push(String(m.job_title));
  if (m.company_name) idBits.push(String(m.company_name));
  if (idBits.length) lines.push(idBits.join(" · "));
  lines.push("");

  // ── Status snapshot ─────────────────────────────────────────────────────
  const status: string[] = [];
  if (m.contact_type) status.push(`Contact type: ${m.contact_type}`);
  if (m.membership_status) status.push(`Membership status: ${m.membership_status}`);
  const years = yearsInEo(m.join_date_original as string | null);
  if (years != null) status.push(`Years in EO: ${years}`);
  if (m.join_date_original) status.push(`Joined: ${m.join_date_original}`);
  if (status.length) {
    lines.push("## Status");
    for (const s of status) lines.push(`- ${s}`);
    lines.push("");
  }

  // ── Engagement score ────────────────────────────────────────────────────
  if (m.engagement_score_current != null || m.churn_risk_tier) {
    lines.push("## Engagement score");
    if (m.engagement_score_current != null)
      lines.push(`- Current score: ${m.engagement_score_current}/100`);
    if (m.churn_risk_tier) lines.push(`- Risk tier: ${m.churn_risk_tier}`);
    if (m.engagement_trend) lines.push(`- Trend: ${m.engagement_trend}`);
    lines.push("");
  }

  // ── Signals ─────────────────────────────────────────────────────────────
  const signals: string[] = [];
  if (m.local_event_attendance_rate_12m != null)
    signals.push(`- Local event attendance (12m): ${m.local_event_attendance_rate_12m}%`);
  if (m.forum_attendance_rate_12m != null)
    signals.push(`- Forum attendance (12m): ${m.forum_attendance_rate_12m}%`);
  if (m.days_since_last_engagement != null)
    signals.push(`- Days since last engagement: ${m.days_since_last_engagement}`);
  if (m.slp_engagement_status) signals.push(`- SLP: ${m.slp_engagement_status}`);
  if (m.whatsapp_activity_level) signals.push(`- WhatsApp activity: ${m.whatsapp_activity_level}`);
  if (m.global_event_count_24m != null)
    signals.push(`- Global event count (24m): ${m.global_event_count_24m}`);
  if (signals.length) {
    lines.push("## Engagement signals");
    lines.push(...signals);
    lines.push("");
  }

  // ── Forum ───────────────────────────────────────────────────────────────
  const forum: string[] = [];
  if (cf.forum_name) forum.push(`- Forum: ${cf.forum_name}`);
  if (m.forum_role) forum.push(`- Role: ${m.forum_role}`);
  if (cf.forum_moderator_name) forum.push(`- Moderator: ${cf.forum_moderator_name}`);
  if (cf.forum_experience_rating != null)
    forum.push(`- Experience rating: ${cf.forum_experience_rating}/10`);
  if (forum.length) {
    lines.push("## Forum");
    lines.push(...forum);
    lines.push("");
  }

  // ── Attendance history (recent FY only — newest 2) ─────────────────────
  const attendance = cf.attendance as Record<string, unknown> | undefined;
  if (attendance) {
    const byFy: Record<string, AttendanceEntry[]> = {};
    for (const entries of Object.values(attendance)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries as AttendanceEntry[]) {
        if (!e?.fiscal_year) continue;
        byFy[e.fiscal_year] ??= [];
        byFy[e.fiscal_year].push(e);
      }
    }
    const fys = Object.keys(byFy).sort().reverse().slice(0, 2);
    if (fys.length) {
      lines.push("## Recent attendance");
      for (const fy of fys) {
        lines.push(`- FY ${fy}: ${byFy[fy].length} events`);
        for (const e of byFy[fy].slice(0, 8)) {
          lines.push(`  - ${e.event_name} (${e.event_type})`);
        }
      }
      lines.push("");
    }
  }

  // ── Board service ───────────────────────────────────────────────────────
  const board = (m.board_roles_history ?? []) as BoardRoleEntry[];
  if (board.length) {
    lines.push("## Board service");
    for (const b of board) {
      lines.push(`- ${b.role} (${yearOf(b.start_date)}–${yearOf(b.end_date)})`);
    }
    lines.push("");
  }

  // ── Renewal ─────────────────────────────────────────────────────────────
  const renewal: string[] = [];
  if (m.renewal_status) renewal.push(`- Status: ${m.renewal_status}`);
  if (m.renewal_intent_response) renewal.push(`- Intent: ${m.renewal_intent_response}`);
  if (renewal.length) {
    lines.push("## Renewal");
    lines.push(...renewal);
    lines.push("");
  }

  // ── On Leave ────────────────────────────────────────────────────────────
  const leave = cf.leave_period as Record<string, unknown> | undefined;
  if (leave) {
    lines.push("## On Leave");
    if (leave.start) lines.push(`- Start: ${leave.start}`);
    if (leave.end) lines.push(`- Return by: ${leave.end}`);
    if (leave.period_raw) lines.push(`- Note: ${leave.period_raw}`);
    lines.push("");
  }

  // ── Open action items ───────────────────────────────────────────────────
  const actions = ((m.action_items ?? []) as ActionItemEntry[]).filter((a) => !a.completed_at);
  if (actions.length) {
    lines.push("## Open action items");
    for (const a of actions.slice(0, 10)) {
      const due = a.due_date ? ` (due ${a.due_date})` : "";
      lines.push(`- ${a.text}${due}`);
    }
    lines.push("");
  }

  // ── Recent notes (newest 8) ─────────────────────────────────────────────
  const notes = ((m.notes ?? []) as NoteEntry[])
    .slice()
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
    .slice(0, 8);
  if (notes.length) {
    lines.push("## Recent notes");
    for (const n of notes) {
      const when = n.ts ? n.ts.slice(0, 10) : "?";
      const src = n.source ? ` [${n.source}]` : "";
      lines.push(`- ${when}${src}: ${(n.text ?? "").replace(/\s+/g, " ").slice(0, 240)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function yearOf(iso: string | null | undefined): string {
  if (!iso) return "?";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "?" : String(d.getUTCFullYear());
}

function yearsInEo(joinDate: string | null): number | null {
  if (!joinDate) return null;
  const d = new Date(joinDate);
  if (isNaN(d.getTime())) return null;
  const years = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years);
}
