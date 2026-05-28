import { describe, it, expect } from "vitest";
import {
  EO_DALLAS_HUBSPOT_MAPPINGS,
  EO_DALLAS_HUBSPOT_AUTHORED_BY,
} from "./eo_dallas_hubspot";
import { implementedTransforms } from "../transformations";

const VALID_TARGET_PREFIXES = ["members.", "event_attendance", "discard"] as const;

function hasValidTargetPrefix(target: string): boolean {
  return VALID_TARGET_PREFIXES.some((p) => target === p || target.startsWith(p));
}

describe("EO_DALLAS_HUBSPOT_MAPPINGS", () => {
  const implemented = new Set(implementedTransforms());

  it("is non-empty", () => {
    expect(EO_DALLAS_HUBSPOT_MAPPINGS.length).toBeGreaterThan(0);
  });

  it("references only implemented transforms", () => {
    const unimplemented = EO_DALLAS_HUBSPOT_MAPPINGS.filter((m) => !implemented.has(m.transform));
    expect(unimplemented).toEqual([]);
  });

  it("uses only valid target prefixes", () => {
    const bad = EO_DALLAS_HUBSPOT_MAPPINGS.filter((m) => !hasValidTargetPrefix(m.target));
    expect(bad).toEqual([]);
  });

  it("has no duplicate source fields", () => {
    const sources = EO_DALLAS_HUBSPOT_MAPPINGS.map((m) => m.source);
    const dupes = sources.filter((s, i) => sources.indexOf(s) !== i);
    expect(dupes).toEqual([]);
  });

  it("every row declares the same authored_by tag", () => {
    const authors = EO_DALLAS_HUBSPOT_MAPPINGS.map((m) => m.authored_by);
    const unique = new Set(authors);
    expect(unique.size).toBe(1);
    expect(authors[0]).toBe(EO_DALLAS_HUBSPOT_AUTHORED_BY);
  });

  it("includes the headline canonical mappings (membership, renewal, board, EOA)", () => {
    const targets = EO_DALLAS_HUBSPOT_MAPPINGS.map((m) => m.target);
    expect(targets).toContain("members.membership_status");
    expect(targets).toContain("members.renewal_intent_response");
    expect(targets).toContain("members.board_roles_history");
    expect(targets).toContain("members.eoa_member");
    expect(targets).toContain("members.recruitment_source");
    expect(targets).toContain("members.annual_revenue_range");
    expect(targets).toContain("members.join_date_original");
    expect(targets).toContain("members.forum_role");
  });

  it("routes the requalification group via group_to_jsonb", () => {
    const row = EO_DALLAS_HUBSPOT_MAPPINGS.find(
      (m) => m.target === "members.custom_fields.requalification",
    );
    expect(row).toBeDefined();
    expect(row?.transform).toBe("group_to_jsonb");
  });

  it("walks the multi-company family with multi_company_primary", () => {
    const row = EO_DALLAS_HUBSPOT_MAPPINGS.find((m) => m.transform === "multi_company_primary");
    expect(row).toBeDefined();
    expect(row?.target).toBe("members.custom_fields.additional_companies");
  });

  it("handles the per-fiscal-year event multi-selects", () => {
    const attendanceRules = EO_DALLAS_HUBSPOT_MAPPINGS.filter(
      (m) => m.transform === "multi_select_to_attendance",
    );
    expect(attendanceRules.length).toBeGreaterThanOrEqual(4);
    // Each attendance rule needs both event_type and fiscal_year args
    for (const r of attendanceRules) {
      expect(r.transform_args).toMatchObject({ event_type: expect.any(String), fiscal_year: expect.any(String) });
    }
  });

  it("carries the renewal-status emoji-strip rule from ADR-004", () => {
    const row = EO_DALLAS_HUBSPOT_MAPPINGS.find((m) => m.source === "renewal_status");
    expect(row?.transform).toBe("enum_map_after_strip");
    expect(row?.transform_args).toMatchObject({
      strip_pattern: expect.stringContaining("Emoji"),
    });
  });

  it("preserves exit-survey textareas as notes (≥10 rules)", () => {
    const noteRules = EO_DALLAS_HUBSPOT_MAPPINGS.filter((m) => m.target === "members.notes");
    expect(noteRules.length).toBeGreaterThanOrEqual(10);
    // Every note rule must have a tag
    for (const r of noteRules) {
      expect(r.transform).toBe("append_to_notes");
      expect(r.transform_args).toMatchObject({ tag: expect.any(String) });
    }
  });
});
