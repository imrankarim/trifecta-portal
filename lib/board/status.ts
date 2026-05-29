import type { BoardDomain } from "./roles";

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface StatusMetric {
  label: string;
  value: string;
  tone: Tone;
}

export interface RoleStatus {
  metrics: StatusMetric[];
  /** Honest note when the role's domain has little or no backing data yet. */
  note?: string;
  linkTo?: string;
  linkLabel?: string;
}

export interface BoardMemberLite {
  trifecta_member_id: string;
  contact_type: string | null;
  membership_status: string | null;
  churn_risk_tier: string | null;
  engagement_score_current: number | null;
  local_event_attendance_rate_12m: number | null;
  forum_attendance_rate_12m: number | null;
  days_since_last_engagement: number | null;
  renewal_intent_response: string | null;
  renewal_status: string | null;
  slp_engagement_status: string | null;
  custom_fields: Record<string, unknown> | null;
}

const ACTIVE = new Set(["Active", "Grace Period", "Lapsed"]);

function isActiveMember(m: BoardMemberLite): boolean {
  return m.contact_type === "Member" && ACTIVE.has(m.membership_status ?? "");
}

function scoreTone(s: number | null): Tone {
  if (s == null) return "neutral";
  if (s >= 60) return "good";
  if (s >= 40) return "warn";
  return "bad";
}

function rateTone(s: number | null): Tone {
  if (s == null) return "neutral";
  if (s >= 60) return "good";
  if (s >= 30) return "warn";
  return "bad";
}

function avg(nums: number[]): number | null {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

export function computeRoleStatus(domain: BoardDomain, members: BoardMemberLite[]): RoleStatus {
  const active = members.filter(isActiveMember);
  const atRisk = active.filter(
    (m) => m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High",
  );
  const avgScore = avg(
    active.map((m) => m.engagement_score_current).filter((s): s is number => s != null),
  );

  switch (domain) {
    case "chapter":
    case "admin": {
      const prospects = members.filter(
        (m) => m.contact_type === "Member" && m.membership_status === "Prospect",
      ).length;
      const sponsors = members.filter((m) => m.contact_type === "Sponsor").length;
      const metrics: StatusMetric[] = [
        { label: "Active members", value: String(active.length), tone: "neutral" },
        { label: "At risk", value: String(atRisk.length), tone: atRisk.length ? "bad" : "good" },
        { label: "Chapter health", value: avgScore != null ? String(avgScore) : "—", tone: scoreTone(avgScore) },
      ];
      if (domain === "admin") {
        metrics.push({ label: "Prospects", value: String(prospects), tone: "neutral" });
        metrics.push({ label: "Sponsors", value: String(sponsors), tone: "neutral" });
      }
      return { metrics, linkTo: "/dashboard/directory", linkLabel: "Open directory" };
    }

    case "membership": {
      const renewalAttn = active.filter(
        (m) =>
          ["WontRenew", "WantToSpeak"].includes(m.renewal_intent_response ?? "") ||
          ["At Risk", "Pending"].includes(m.renewal_status ?? ""),
      ).length;
      const prospects = members.filter(
        (m) => m.contact_type === "Member" && m.membership_status === "Prospect",
      ).length;
      return {
        metrics: [
          { label: "At-risk members", value: String(atRisk.length), tone: atRisk.length ? "bad" : "good" },
          { label: "Renewal attention", value: String(renewalAttn), tone: renewalAttn ? "warn" : "good" },
          { label: "Prospects in pipeline", value: String(prospects), tone: "neutral" },
        ],
        linkTo: "/dashboard/directory",
        linkLabel: "Open directory",
      };
    }

    case "engagement": {
      const disengaged = active.filter(
        (m) =>
          (m.days_since_last_engagement ?? 0) > 180 ||
          (m.local_event_attendance_rate_12m != null && m.local_event_attendance_rate_12m < 30),
      ).length;
      const avgLocal = avg(
        active.map((m) => m.local_event_attendance_rate_12m).filter((s): s is number => s != null),
      );
      return {
        metrics: [
          { label: "Disengaged members", value: String(disengaged), tone: disengaged ? "warn" : "good" },
          { label: "Avg local attendance", value: avgLocal != null ? `${avgLocal}%` : "—", tone: rateTone(avgLocal) },
          { label: "Active members", value: String(active.length), tone: "neutral" },
        ],
        linkTo: "/dashboard/directory",
        linkLabel: "Open directory",
      };
    }

    case "learning": {
      let withLearning = 0;
      const learningEvents = new Set<string>();
      for (const m of members) {
        const att = (m.custom_fields?.attendance ?? null) as Record<string, unknown> | null;
        if (!att) continue;
        let attended = false;
        for (const entries of Object.values(att)) {
          if (!Array.isArray(entries)) continue;
          for (const e of entries as Array<Record<string, unknown>>) {
            if (e?.event_type === "learning") {
              if (typeof e.event_id === "string") learningEvents.add(e.event_id);
              if (e.attended) attended = true;
            }
          }
        }
        if (attended) withLearning++;
      }
      if (learningEvents.size === 0) {
        return {
          metrics: [{ label: "Active members", value: String(active.length), tone: "neutral" }],
          note: "No learning-event attendance has synced yet. Metrics will populate once learning events are tracked.",
        };
      }
      return {
        metrics: [
          { label: "Learning events tracked", value: String(learningEvents.size), tone: "neutral" },
          { label: "Members attending learning", value: String(withLearning), tone: withLearning ? "good" : "warn" },
          { label: "Active members", value: String(active.length), tone: "neutral" },
        ],
      };
    }

    case "forum": {
      const byForum = new Map<string, number[]>();
      for (const m of active) {
        const f = m.custom_fields?.forum_name as string | undefined;
        if (!f || ["Opted Out of Forums", "Looking for Forum"].includes(f)) continue;
        if (!byForum.has(f)) byForum.set(f, []);
        if (m.engagement_score_current != null) byForum.get(f)!.push(m.engagement_score_current);
      }
      const forumAvgs: number[] = [];
      let atRiskForums = 0;
      for (const scores of Array.from(byForum.values())) {
        const a = avg(scores);
        if (a != null) {
          forumAvgs.push(a);
          if (a < 50) atRiskForums++;
        }
      }
      const overall = avg(forumAvgs);
      return {
        metrics: [
          { label: "Forums", value: String(byForum.size), tone: "neutral" },
          { label: "Avg forum engagement", value: overall != null ? String(overall) : "—", tone: scoreTone(overall) },
          { label: "Forums at risk", value: String(atRiskForums), tone: atRiskForums ? "bad" : "good" },
        ],
        linkTo: "/forums",
        linkLabel: "Open forums",
      };
    }

    case "finance": {
      const renewalAttn = active.filter(
        (m) =>
          ["WontRenew", "WantToSpeak"].includes(m.renewal_intent_response ?? "") ||
          ["At Risk", "Pending"].includes(m.renewal_status ?? ""),
      ).length;
      return {
        metrics: [
          { label: "Dues-paying members", value: String(active.length), tone: "neutral" },
          { label: "Renewals needing attention", value: String(renewalAttn), tone: renewalAttn ? "warn" : "good" },
        ],
        note: "Dollar figures aren't connected yet — counts are based on renewal signals in the CRM.",
      };
    }

    case "governance": {
      const former = members.filter(
        (m) => m.contact_type === "Member" && m.membership_status === "Former Member",
      ).length;
      const retention =
        active.length + former > 0 ? Math.round((active.length / (active.length + former)) * 100) : null;
      return {
        metrics: [
          { label: "Active members", value: String(active.length), tone: "neutral" },
          { label: "Former members", value: String(former), tone: "neutral" },
          { label: "Retention", value: retention != null ? `${retention}%` : "—", tone: rateTone(retention) },
        ],
      };
    }

    case "sap": {
      const sponsors = members.filter((m) => m.contact_type === "Sponsor");
      const sapActive = sponsors.filter(
        (m) => String(m.custom_fields?.sap_active ?? "").toLowerCase() === "yes",
      ).length;
      return {
        metrics: [
          { label: "Sponsors (SAPs)", value: String(sponsors.length), tone: "neutral" },
          { label: "Active SAPs", value: String(sapActive || sponsors.length), tone: sponsors.length ? "good" : "warn" },
        ],
        linkTo: "/dashboard/directory?tab=sponsors",
        linkLabel: "View sponsors",
      };
    }

    case "slp": {
      const withSpouse = members.filter(
        (m) => m.custom_fields?.spouse && Object.keys(m.custom_fields.spouse as object).length > 0,
      ).length;
      const slpEngaged = active.filter(
        (m) => m.slp_engagement_status && !/none|no/i.test(m.slp_engagement_status),
      ).length;
      return {
        metrics: [
          { label: "Spouse / partner on file", value: String(withSpouse), tone: "neutral" },
          { label: "SLP-engaged members", value: String(slpEngaged), tone: slpEngaged ? "good" : "warn" },
        ],
        note: "SLP coverage is based on spouse records and SLP engagement flags in the CRM.",
      };
    }

    case "marcomm":
      return {
        metrics: [{ label: "Active members", value: String(active.length), tone: "neutral" }],
        note: "Marketing & communications metrics aren't connected to a data source yet.",
      };

    case "social":
      return {
        metrics: [{ label: "Active members", value: String(active.length), tone: "neutral" }],
        note: "Social / MyEO event data isn't connected yet — this is the audience the role serves.",
      };

    case "accelerator":
      return {
        metrics: [],
        note: "The Accelerator program isn't tracked in Trifecta yet.",
      };

    case "gsea":
      return {
        metrics: [],
        note: "GSEA program data isn't tracked in Trifecta yet.",
      };

    default:
      return { metrics: [] };
  }
}
