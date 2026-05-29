import { describe, it, expect } from "vitest";
import {
  selectTopRisk,
  buildReason,
  computeStats,
  renderDigestHTML,
  type DigestMember,
  type DigestData,
} from "./atRiskDigest";

function member(over: Partial<DigestMember> = {}): DigestMember {
  return {
    trifecta_member_id: over.trifecta_member_id ?? "m-" + Math.random(),
    first_name: "X",
    last_name: "Y",
    email_primary: "x@y.com",
    company_name: null,
    membership_status: "Active",
    engagement_score_current: 50,
    engagement_score_prev: null,
    engagement_trend: null,
    churn_risk_tier: null,
    score_last_calculated_at: null,
    custom_fields: null,
    forum_attendance_rate_12m: null,
    local_event_attendance_rate_12m: null,
    slp_engagement_status: null,
    whatsapp_activity_level: null,
    days_since_last_engagement: null,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────
// selectTopRisk
// ─────────────────────────────────────────────────────────────────────
describe("selectTopRisk", () => {
  it("returns only Critical + High members by default (not Medium)", () => {
    const members = [
      member({ churn_risk_tier: "Critical", engagement_score_current: 10 }),
      member({ churn_risk_tier: "High", engagement_score_current: 30 }),
      member({ churn_risk_tier: "Medium", engagement_score_current: 50 }),
      member({ churn_risk_tier: "Low", engagement_score_current: 70 }),
      member({ churn_risk_tier: "Monitor", engagement_score_current: 90 }),
    ];
    expect(selectTopRisk(members).length).toBe(2);
    expect(selectTopRisk(members).map((m) => m.churn_risk_tier)).toEqual(["Critical", "High"]);
  });

  it("sorts Critical above High, then by ascending score (most at-risk first)", () => {
    const members = [
      member({ trifecta_member_id: "1", churn_risk_tier: "High", engagement_score_current: 30 }),
      member({ trifecta_member_id: "2", churn_risk_tier: "Critical", engagement_score_current: 15 }),
      member({ trifecta_member_id: "3", churn_risk_tier: "Critical", engagement_score_current: 5 }),
    ];
    const result = selectTopRisk(members);
    expect(result.map((m) => m.trifecta_member_id)).toEqual(["3", "2", "1"]);
  });

  it("caps the list at limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      member({ trifecta_member_id: String(i), churn_risk_tier: "Critical", engagement_score_current: i }),
    );
    expect(selectTopRisk(many, { limit: 10 }).length).toBe(10);
  });

  it("includeMedium=true pulls Medium into the pool", () => {
    const members = [
      member({ churn_risk_tier: "Critical", engagement_score_current: 10 }),
      member({ churn_risk_tier: "Medium", engagement_score_current: 50 }),
    ];
    expect(selectTopRisk(members, { includeMedium: true }).length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildReason
// ─────────────────────────────────────────────────────────────────────
describe("buildReason", () => {
  it("calls out very low local event attendance", () => {
    const reason = buildReason(
      member({ local_event_attendance_rate_12m: 10, churn_risk_tier: "High" }),
    );
    expect(reason).toContain("local event attendance");
  });

  it("calls out long absence", () => {
    const reason = buildReason(
      member({ days_since_last_engagement: 250, churn_risk_tier: "High" }),
    );
    expect(reason).toContain("250 days");
  });

  it("falls back to score when no specific signals are low", () => {
    const reason = buildReason(
      member({ engagement_score_current: 35, churn_risk_tier: "High" }),
    );
    expect(reason).toMatch(/signals limited|score/i);
  });

  it("combines top two reasons", () => {
    const reason = buildReason(
      member({
        local_event_attendance_rate_12m: 5,
        days_since_last_engagement: 400,
        engagement_trend: "Declining",
      }),
    );
    expect(reason).toContain(";");
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeStats
// ─────────────────────────────────────────────────────────────────────
describe("computeStats", () => {
  it("counts each tier separately", () => {
    const members = [
      member({ churn_risk_tier: "Critical", engagement_score_current: 10 }),
      member({ churn_risk_tier: "Critical", engagement_score_current: 15 }),
      member({ churn_risk_tier: "High" }),
      member({ churn_risk_tier: "Medium" }),
      member({ churn_risk_tier: "Low" }),
      member({ churn_risk_tier: "Monitor" }),
    ];
    const stats = computeStats(members);
    expect(stats.critical_count).toBe(2);
    expect(stats.high_count).toBe(1);
    expect(stats.medium_count).toBe(1);
    expect(stats.low_count).toBe(1);
    expect(stats.monitor_count).toBe(1);
    // All 6 are Active (default in the helper), so active_members = 6.
    expect(stats.active_members).toBe(6);
    expect(stats.on_leave_members).toBe(0);
  });

  it("counts active_members and on_leave_members from membership_status", () => {
    const members = [
      member({ membership_status: "Active" }),
      member({ membership_status: "Active" }),
      member({ membership_status: "On Leave" }),
      member({ membership_status: "Former Member" }), // not counted
      member({ membership_status: "Prospect" }), // not counted
    ];
    const stats = computeStats(members);
    expect(stats.active_members).toBe(2);
    expect(stats.on_leave_members).toBe(1);
  });

  it("counts newly_at_risk (score moved from >=60 to <40)", () => {
    const members = [
      member({ engagement_score_prev: 75, engagement_score_current: 30 }), // newly at risk
      member({ engagement_score_prev: 40, engagement_score_current: 30 }), // already at risk
      member({ engagement_score_prev: 80, engagement_score_current: 70 }), // still fine
    ];
    const stats = computeStats(members);
    expect(stats.newly_at_risk_count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// renderDigestHTML — smoke test
// ─────────────────────────────────────────────────────────────────────
describe("renderDigestHTML", () => {
  it("renders an HTML document with the chapter name", () => {
    const data: DigestData = {
      chapter_name: "EO Dallas",
      generated_at: new Date("2026-05-28T12:00:00Z").toISOString(),
      top_risk: [
        {
          ...member({
            first_name: "Amy",
            last_name: "Power",
            company_name: "The Power Group",
            churn_risk_tier: "Critical",
            engagement_score_current: 15,
          }),
          reason: "only 10% local event attendance; no engagement in 250 days",
        },
      ],
      stats: {
        active_members: 177,
        on_leave_members: 0,
        scored_members: 176,
        critical_count: 33,
        high_count: 22,
        medium_count: 19,
        low_count: 4,
        monitor_count: 98,
        newly_at_risk_count: 3,
      },
    };
    const html = renderDigestHTML(data);
    expect(html).toContain("EO Dallas");
    expect(html).toContain("Amy");
    expect(html).toContain("Power");
    expect(html).toContain("Critical");
    expect(html).toContain("15"); // score
    expect(html).toContain("only 10% local event");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("shows empty-state when no at-risk members", () => {
    const data: DigestData = {
      chapter_name: "Test",
      generated_at: new Date().toISOString(),
      top_risk: [],
      stats: {
        active_members: 10,
        on_leave_members: 0,
        scored_members: 10,
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 5,
        monitor_count: 5,
        newly_at_risk_count: 0,
      },
    };
    const html = renderDigestHTML(data);
    expect(html).toContain("No at-risk members this week");
  });

  it("escapes HTML in member fields", () => {
    const data: DigestData = {
      chapter_name: "Test",
      generated_at: new Date().toISOString(),
      top_risk: [
        {
          ...member({
            first_name: "<script>",
            last_name: "alert('xss')</script>",
          }),
          reason: "test",
        },
      ],
      stats: {
        active_members: 1,
        on_leave_members: 0,
        scored_members: 1,
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 0,
        monitor_count: 0,
        newly_at_risk_count: 0,
      },
    };
    const html = renderDigestHTML(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
