import { describe, it, expect } from "vitest";
import {
  deriveScoringInputs,
  computeChapterEventCounts,
  type MemberForScoring,
  type AttendanceEntry,
} from "./deriveScoringInputs";

const asOf = new Date(Date.UTC(2026, 4, 28)); // 2026-05-28, FY 2025-26

// Helper to build attendance entries quickly
function entry(event_type: string, fiscal_year: string, name: string): AttendanceEntry {
  return {
    event_id: `${event_type}:${fiscal_year}:${name.toLowerCase().replace(/\s+/g, "-")}`,
    event_name: name,
    event_type,
    fiscal_year,
    attended: true,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Canonical columns win when populated
// ─────────────────────────────────────────────────────────────────────
describe("canonical columns take precedence", () => {
  it("uses members.forum_attendance_rate_12m when set, ignoring custom_fields", () => {
    const m: MemberForScoring = {
      forum_attendance_rate_12m: 75,
      custom_fields: {
        attendance: {
          forum_2025_26: [entry("forum", "2025-26", "Jan Meeting")],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf });
    expect(inputs.forum_attendance_rate_12m).toBe(75);
  });

  it("falls back to custom_fields when canonical is null", () => {
    const counts = { "forum|2025-26": 10 };
    const m: MemberForScoring = {
      custom_fields: {
        attendance: {
          forum_2025_26: [
            entry("forum", "2025-26", "A"),
            entry("forum", "2025-26", "B"),
            entry("forum", "2025-26", "C"),
          ],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf, chapterEventCounts: counts });
    // 3 attended out of 10 → 30%
    expect(inputs.forum_attendance_rate_12m).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────
// EO Dallas shape — learning + social → local_event_attendance_rate_12m
// ─────────────────────────────────────────────────────────────────────
describe("local event rate combines learning + social", () => {
  it("averages learning and local attendance rates when both buckets present", () => {
    const counts = {
      "learning|2025-26": 10,
      "local|2025-26": 8,
    };
    const m: MemberForScoring = {
      custom_fields: {
        attendance: {
          learning_2025_26: [entry("learning", "2025-26", "A"), entry("learning", "2025-26", "B")],
          local_2025_26: [entry("local", "2025-26", "Holiday Party")],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf, chapterEventCounts: counts });
    // learning: 2/10 = 20%; local: 1/8 = 12.5% → 13%; avg = (20+13)/2 = 16.5 → 17
    expect(inputs.local_event_attendance_rate_12m).toBe(17);
  });

  it("uses fallback denominator when chapterEventCounts not provided", () => {
    const m: MemberForScoring = {
      custom_fields: {
        attendance: {
          local_2025_26: [
            entry("local", "2025-26", "A"),
            entry("local", "2025-26", "B"),
            entry("local", "2025-26", "C"),
          ],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf });
    // 3 attended, fallback denominator = 10 events/yr → 30%
    expect(inputs.local_event_attendance_rate_12m).toBe(30);
  });

  it("returns null when no attendance data anywhere", () => {
    const inputs = deriveScoringInputs({}, { asOf });
    expect(inputs.local_event_attendance_rate_12m).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Rolling 12 months — current + prior fiscal year both count
// ─────────────────────────────────────────────────────────────────────
describe("rolling 12-month window crosses fiscal years", () => {
  it("includes both current and prior FY attendance when asOf is mid-year", () => {
    // asOf = May 2026, FY 2025-26 (current), prior FY 2024-25
    const counts = {
      "local|2024-25": 10,
      "local|2025-26": 10,
    };
    const m: MemberForScoring = {
      custom_fields: {
        attendance: {
          local_2024_25: [entry("local", "2024-25", "Old A"), entry("local", "2024-25", "Old B")],
          local_2025_26: [entry("local", "2025-26", "New A")],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf, chapterEventCounts: counts });
    // Both buckets count: 3 total out of 20 → 15%
    expect(inputs.local_event_attendance_rate_12m).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────
// SLP / WhatsApp normalization
// ─────────────────────────────────────────────────────────────────────
describe("categorical normalization", () => {
  it("accepts valid SLP values", () => {
    expect(deriveScoringInputs({ slp_engagement_status: "Active" }).slp_engagement_status).toBe("Active");
    expect(deriveScoringInputs({ slp_engagement_status: "Occasional" }).slp_engagement_status).toBe("Occasional");
    expect(deriveScoringInputs({ slp_engagement_status: "None" }).slp_engagement_status).toBe("None");
  });

  it("rejects invalid SLP values as null", () => {
    expect(deriveScoringInputs({ slp_engagement_status: "Unknown" }).slp_engagement_status).toBeNull();
  });

  it("accepts valid WhatsApp values", () => {
    expect(deriveScoringInputs({ whatsapp_activity_level: "High" }).whatsapp_activity_level).toBe("High");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Recency — days_since_last_engagement
// ─────────────────────────────────────────────────────────────────────
describe("days_since_last_engagement", () => {
  it("uses canonical value when set", () => {
    expect(deriveScoringInputs({ days_since_last_engagement: 42 }, { asOf }).days_since_last_engagement).toBe(42);
  });

  it("derives from forum_last_attended_date when canonical missing", () => {
    const m: MemberForScoring = { forum_last_attended_date: "2026-04-28" };
    // asOf is 2026-05-28 → 30 days
    expect(deriveScoringInputs(m, { asOf }).days_since_last_engagement).toBe(30);
  });

  it("uses the most recent of multiple canonical date columns", () => {
    const m: MemberForScoring = {
      forum_last_attended_date: "2026-01-15",
      local_event_last_attended_date: "2026-04-01",
      global_event_last_attended_date: "2025-09-12",
    };
    const inputs = deriveScoringInputs(m, { asOf });
    // Most recent is 2026-04-01 → 57 days
    expect(inputs.days_since_last_engagement).toBe(57);
  });

  it("falls back to FY proxy when only custom_fields.attendance present", () => {
    const m: MemberForScoring = {
      custom_fields: {
        attendance: {
          local_2025_26: [entry("local", "2025-26", "Recent")],
        },
      },
    };
    const inputs = deriveScoringInputs(m, { asOf });
    // FY 2025-26 → Jan 1, 2026 proxy → ~147 days back from 2026-05-28
    expect(inputs.days_since_last_engagement).toBeGreaterThan(100);
    expect(inputs.days_since_last_engagement).toBeLessThan(200);
  });

  it("returns null when no engagement data anywhere", () => {
    expect(deriveScoringInputs({}, { asOf }).days_since_last_engagement).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeChapterEventCounts — chapter-wide denominator derivation
// ─────────────────────────────────────────────────────────────────────
describe("computeChapterEventCounts", () => {
  it("counts distinct event_ids per (event_type, fiscal_year) across all members", () => {
    const members: MemberForScoring[] = [
      {
        custom_fields: {
          attendance: {
            local_2025_26: [
              entry("local", "2025-26", "Holiday Party"),
              entry("local", "2025-26", "Spring Social"),
            ],
            learning_2025_26: [entry("learning", "2025-26", "AI Workshop")],
          },
        },
      },
      {
        custom_fields: {
          attendance: {
            local_2025_26: [
              entry("local", "2025-26", "Holiday Party"), // same event_id as member 1
              entry("local", "2025-26", "Summer BBQ"),
            ],
          },
        },
      },
    ];
    const counts = computeChapterEventCounts(members);
    expect(counts["local|2025-26"]).toBe(3); // Holiday Party (dup'd), Spring Social, Summer BBQ
    expect(counts["learning|2025-26"]).toBe(1);
  });

  it("returns empty when no members have attendance data", () => {
    expect(computeChapterEventCounts([{}, {}])).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────
// Realistic EO Dallas-shaped row
// ─────────────────────────────────────────────────────────────────────
describe("realistic EO Dallas member", () => {
  it("produces sensible scoring inputs for a typical row", () => {
    const m: MemberForScoring = {
      contact_type: "Member",
      membership_status: "Active",
      custom_fields: {
        attendance: {
          learning_2024_25: [
            entry("learning", "2024-25", "September - Gray Malin"),
            entry("learning", "2024-25", "November - Rachel Wilson"),
            entry("learning", "2024-25", "February - Breakfast with Champions"),
          ],
          learning_2025_26: [
            entry("learning", "2025-26", "September - Danny Southwick"),
            entry("learning", "2025-26", "October - Rashmi Airan"),
          ],
          social_2025_26: [entry("local", "2025-26", "December - Holiday Fun")],
        },
        forum_name: "Breakthrough",
      },
    };

    const inputs = deriveScoringInputs(m, { asOf });

    // Should have at least learning-derived attendance
    expect(inputs.local_event_attendance_rate_12m).not.toBeNull();
    expect(inputs.local_event_attendance_rate_12m).toBeGreaterThan(0);

    // Other signals unavailable
    expect(inputs.forum_attendance_rate_12m).toBeNull();
    expect(inputs.slp_engagement_status).toBeNull();
    expect(inputs.whatsapp_activity_level).toBeNull();
    expect(inputs.global_event_count_24m).toBeNull();

    // Recency derived from FY proxy
    expect(inputs.days_since_last_engagement).not.toBeNull();
  });
});
