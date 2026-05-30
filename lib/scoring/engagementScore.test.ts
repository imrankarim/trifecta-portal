import { describe, it, expect } from "vitest";
import {
  computeEngagementScore,
  parseScoringWeights,
  tierForScore,
  WEIGHTS,
  TIER_THRESHOLDS,
  type ScoringWeights,
} from "./engagementScore";

// ─────────────────────────────────────────────────────────────────────
// Weight sanity (catches mis-edits during weight tuning)
// ─────────────────────────────────────────────────────────────────────
describe("WEIGHTS", () => {
  it("sums to 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("orders priorities per v1.1 spec (forum > local > slp > whatsapp > global)", () => {
    expect(WEIGHTS.forum_attendance_12m).toBeGreaterThan(WEIGHTS.local_event_attendance_12m);
    expect(WEIGHTS.local_event_attendance_12m).toBeGreaterThan(WEIGHTS.slp_engagement);
    expect(WEIGHTS.slp_engagement).toBeGreaterThan(WEIGHTS.whatsapp_activity);
    expect(WEIGHTS.whatsapp_activity).toBeGreaterThanOrEqual(WEIGHTS.global_event_count_24m);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Tier banding
// ─────────────────────────────────────────────────────────────────────
describe("tierForScore", () => {
  it("classifies score 0 as Critical", () => {
    expect(tierForScore(0)).toBe("Critical");
  });
  it("classifies score 19 as Critical (band [0, 20))", () => {
    expect(tierForScore(19)).toBe("Critical");
  });
  it("classifies score 20 as High (band [20, 40))", () => {
    expect(tierForScore(20)).toBe("High");
  });
  it("classifies score 50 as Medium", () => {
    expect(tierForScore(50)).toBe("Medium");
  });
  it("classifies score 79 as Low (band [60, 80))", () => {
    expect(tierForScore(79)).toBe("Low");
  });
  it("classifies score 80 as Monitor (band [80, 100])", () => {
    expect(tierForScore(80)).toBe("Monitor");
  });
  it("classifies score 100 as Monitor", () => {
    expect(tierForScore(100)).toBe("Monitor");
  });
  it("tier thresholds are non-overlapping and complete", () => {
    expect(TIER_THRESHOLDS.Critical).toBeLessThan(TIER_THRESHOLDS.High);
    expect(TIER_THRESHOLDS.High).toBeLessThan(TIER_THRESHOLDS.Medium);
    expect(TIER_THRESHOLDS.Medium).toBeLessThan(TIER_THRESHOLDS.Low);
    expect(TIER_THRESHOLDS.Low).toBeLessThan(TIER_THRESHOLDS.Monitor);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Edge case: no data at all
// ─────────────────────────────────────────────────────────────────────
describe("computeEngagementScore — no data", () => {
  it("returns neutral score 50 + Monitor tier + 0 confidence when all inputs are null", () => {
    const result = computeEngagementScore({});
    expect(result.score).toBe(50);
    expect(result.tier).toBe("Monitor");
    expect(result.confidence).toBe(0);
    expect(result.signals_present).toEqual([]);
    expect(result.signals_missing.length).toBe(Object.keys(WEIGHTS).length);
  });

  it("treats explicit nulls identically to missing fields", () => {
    const result = computeEngagementScore({
      forum_attendance_rate_12m: null,
      local_event_attendance_rate_12m: null,
      slp_engagement_status: null,
      whatsapp_activity_level: null,
      global_event_count_24m: null,
      days_since_last_engagement: null,
    });
    expect(result.confidence).toBe(0);
    expect(result.signals_present).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Edge case: all-zeros member (totally disengaged but data is complete)
// ─────────────────────────────────────────────────────────────────────
describe("computeEngagementScore — all zeros", () => {
  it("returns score 0 / Critical when every signal is at its low extreme", () => {
    const result = computeEngagementScore({
      forum_attendance_rate_12m: 0,
      local_event_attendance_rate_12m: 0,
      slp_engagement_status: "None",
      whatsapp_activity_level: "None",
      global_event_count_24m: 0,
      days_since_last_engagement: 365,
    });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("Critical");
    expect(result.confidence).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Edge case: perfect engagement
// ─────────────────────────────────────────────────────────────────────
describe("computeEngagementScore — perfect engagement", () => {
  it("returns score 100 / Monitor when every signal is at its high extreme", () => {
    const result = computeEngagementScore({
      forum_attendance_rate_12m: 100,
      local_event_attendance_rate_12m: 100,
      slp_engagement_status: "Active",
      whatsapp_activity_level: "High",
      global_event_count_24m: 12, // saturates the curve
      days_since_last_engagement: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.tier).toBe("Monitor");
    expect(result.confidence).toBeCloseTo(1.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Confidence-aware partial signals
// ─────────────────────────────────────────────────────────────────────
describe("computeEngagementScore — partial signals (the EO Dallas case)", () => {
  it("scores a member with only local_event data (the typical Phase 1 case)", () => {
    const result = computeEngagementScore({
      local_event_attendance_rate_12m: 80,
    });
    // 80% local attendance, no other signals → score ≈ 80 (Low tier),
    // confidence == WEIGHTS.local_event_attendance_12m
    expect(result.score).toBe(80);
    expect(result.tier).toBe("Monitor");
    expect(result.confidence).toBeCloseTo(WEIGHTS.local_event_attendance_12m, 5);
    expect(result.signals_present).toEqual(["local_event_attendance_12m"]);
  });

  it("scores higher when more signals available, holding values equal", () => {
    // Both 50% across all available signals → score should be 50 regardless of how many signals
    const oneSignal = computeEngagementScore({ local_event_attendance_rate_12m: 50 });
    const twoSignals = computeEngagementScore({
      local_event_attendance_rate_12m: 50,
      forum_attendance_rate_12m: 50,
    });
    expect(oneSignal.score).toBe(50);
    expect(twoSignals.score).toBe(50);
    // Confidence should reflect more data
    expect(twoSignals.confidence).toBeGreaterThan(oneSignal.confidence);
  });

  it("does NOT penalize a member for missing signals (only present signals affect the score)", () => {
    const result = computeEngagementScore({ forum_attendance_rate_12m: 100 });
    expect(result.score).toBe(100);
    expect(result.tier).toBe("Monitor");
  });
});

// ─────────────────────────────────────────────────────────────────────
// SLP categorical scoring
// ─────────────────────────────────────────────────────────────────────
describe("SLP categorical scoring", () => {
  it("scores Active SLP as 100", () => {
    expect(computeEngagementScore({ slp_engagement_status: "Active" }).score).toBe(100);
  });
  it("scores Occasional SLP as 50", () => {
    expect(computeEngagementScore({ slp_engagement_status: "Occasional" }).score).toBe(50);
  });
  it("scores None SLP as 0", () => {
    expect(computeEngagementScore({ slp_engagement_status: "None" }).score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// WhatsApp categorical scoring
// ─────────────────────────────────────────────────────────────────────
describe("WhatsApp categorical scoring", () => {
  it("orders High > Medium > Low > None", () => {
    const high = computeEngagementScore({ whatsapp_activity_level: "High" }).score;
    const med = computeEngagementScore({ whatsapp_activity_level: "Medium" }).score;
    const low = computeEngagementScore({ whatsapp_activity_level: "Low" }).score;
    const none = computeEngagementScore({ whatsapp_activity_level: "None" }).score;
    expect(high).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(none);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Global event count curve
// ─────────────────────────────────────────────────────────────────────
describe("global event count curve", () => {
  it("scores 0 events as 0", () => {
    expect(computeEngagementScore({ global_event_count_24m: 0 }).components.global_events).toBe(0);
  });
  it("scores more events higher (sub-linear)", () => {
    const a = computeEngagementScore({ global_event_count_24m: 1 }).components.global_events!;
    const b = computeEngagementScore({ global_event_count_24m: 3 }).components.global_events!;
    const c = computeEngagementScore({ global_event_count_24m: 10 }).components.global_events!;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // Sub-linear: doubling from 5 to 10 should give less than doubling
    const five = computeEngagementScore({ global_event_count_24m: 5 }).components.global_events!;
    expect(c).toBeLessThan(five * 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Recency banding
// ─────────────────────────────────────────────────────────────────────
describe("recency scoring", () => {
  it("scores within 30 days as full recency", () => {
    expect(computeEngagementScore({ days_since_last_engagement: 0 }).components.recency).toBe(100);
    expect(computeEngagementScore({ days_since_last_engagement: 30 }).components.recency).toBe(100);
  });
  it("decays from 100 to 50 between 30 and 90 days", () => {
    expect(computeEngagementScore({ days_since_last_engagement: 60 }).components.recency).toBe(75);
  });
  it("decays from 50 to 0 between 90 and 360 days", () => {
    const at90 = computeEngagementScore({ days_since_last_engagement: 90 }).components.recency;
    const at360 = computeEngagementScore({ days_since_last_engagement: 360 }).components.recency;
    expect(at90).toBe(50);
    expect(at360).toBe(0);
  });
  it("scores beyond 360 days as 0", () => {
    expect(computeEngagementScore({ days_since_last_engagement: 9999 }).components.recency).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Input clamping
// ─────────────────────────────────────────────────────────────────────
describe("input clamping", () => {
  it("clamps percentages above 100 down to 100", () => {
    const result = computeEngagementScore({ forum_attendance_rate_12m: 150 });
    expect(result.components.forum).toBe(100);
    expect(result.score).toBe(100);
  });
  it("clamps negative percentages up to 0", () => {
    const result = computeEngagementScore({ forum_attendance_rate_12m: -10 });
    expect(result.components.forum).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Realistic scenarios
// ─────────────────────────────────────────────────────────────────────
describe("realistic scenarios", () => {
  it("Highly engaged forum member: full forum attendance, half local events", () => {
    const result = computeEngagementScore({
      forum_attendance_rate_12m: 95,
      local_event_attendance_rate_12m: 50,
    });
    // (95*0.35 + 50*0.25) / (0.35+0.25) = 76.25
    expect(result.score).toBeGreaterThan(70);
    expect(result.score).toBeLessThan(85);
    expect(result.tier === "Low" || result.tier === "Monitor").toBe(true);
  });

  it("At-risk member: no forum attendance, occasional local events, no SLP", () => {
    const result = computeEngagementScore({
      forum_attendance_rate_12m: 10,
      local_event_attendance_rate_12m: 20,
      slp_engagement_status: "None",
      whatsapp_activity_level: "Low",
      global_event_count_24m: 0,
      days_since_last_engagement: 120,
    });
    expect(result.tier === "Critical" || result.tier === "High").toBe(true);
    expect(result.confidence).toBeCloseTo(1.0, 5);
  });

  it("Mystery member: just joined, no data yet", () => {
    const result = computeEngagementScore({});
    expect(result.confidence).toBe(0);
    expect(result.tier).toBe("Monitor"); // not Critical — we don't know enough to label them at-risk
  });
});

// ─────────────────────────────────────────────────────────────────────
// Custom per-chapter weights
// ─────────────────────────────────────────────────────────────────────
describe("custom weights", () => {
  const inputs = {
    forum_attendance_rate_12m: 90,
    local_event_attendance_rate_12m: 10,
  };

  it("omitting weights matches passing WEIGHTS explicitly", () => {
    const a = computeEngagementScore(inputs);
    const b = computeEngagementScore(inputs, { ...WEIGHTS });
    expect(b.score).toBe(a.score);
    expect(b.tier).toBe(a.tier);
  });

  it("weighting a signal more pulls the score toward it", () => {
    // Forum 90, local 10. Heavier forum weight → higher score than heavier local.
    const forumHeavy: ScoringWeights = {
      forum_attendance_12m: 0.9,
      local_event_attendance_12m: 0.1,
      slp_engagement: 0,
      whatsapp_activity: 0,
      global_event_count_24m: 0,
      recency_of_last_engagement: 0,
    };
    const localHeavy: ScoringWeights = { ...forumHeavy, forum_attendance_12m: 0.1, local_event_attendance_12m: 0.9 };
    expect(computeEngagementScore(inputs, forumHeavy).score).toBeGreaterThan(
      computeEngagementScore(inputs, localHeavy).score,
    );
  });

  it("un-normalized weights are normalized (only ratios matter)", () => {
    const scaled: ScoringWeights = {
      forum_attendance_12m: 70,
      local_event_attendance_12m: 30,
      slp_engagement: 0,
      whatsapp_activity: 0,
      global_event_count_24m: 0,
      recency_of_last_engagement: 0,
    };
    const fractional: ScoringWeights = { ...scaled, forum_attendance_12m: 0.7, local_event_attendance_12m: 0.3 };
    const a = computeEngagementScore(inputs, scaled);
    const b = computeEngagementScore(inputs, fractional);
    expect(a.score).toBe(b.score);
    expect(a.confidence).toBeCloseTo(b.confidence, 5);
  });
});

describe("parseScoringWeights", () => {
  it("accepts a complete, valid weight set", () => {
    expect(parseScoringWeights({ ...WEIGHTS })).not.toBeNull();
  });
  it("rejects null / non-object / missing keys / negatives / all-zero", () => {
    expect(parseScoringWeights(null)).toBeNull();
    expect(parseScoringWeights("nope")).toBeNull();
    expect(parseScoringWeights({ forum_attendance_12m: 1 })).toBeNull(); // missing keys
    const neg = { ...WEIGHTS, forum_attendance_12m: -1 };
    expect(parseScoringWeights(neg)).toBeNull();
    const zeros = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));
    expect(parseScoringWeights(zeros)).toBeNull();
  });
});
