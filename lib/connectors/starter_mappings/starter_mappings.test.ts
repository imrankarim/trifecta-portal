import { describe, it, expect } from "vitest";
import { STARTER_MAPPINGS, getStarterMapping, HUBSPOT_DEFAULT_V1 } from "./index";
import { implementedTransforms } from "../transformations";

const VALID_TARGET_PREFIXES = [
  "members.",
  "event_attendance",
  "discard",
] as const;

function hasValidTargetPrefix(target: string): boolean {
  return VALID_TARGET_PREFIXES.some((p) => target === p || target.startsWith(p));
}

describe("starter_mappings registry", () => {
  it("exposes hubspot_default_v1", () => {
    expect(getStarterMapping("hubspot_default_v1")).toBe(HUBSPOT_DEFAULT_V1);
  });

  it("returns undefined for unknown starter names", () => {
    expect(getStarterMapping("not_a_real_starter")).toBeUndefined();
  });
});

describe("every starter mapping is internally consistent", () => {
  const implemented = new Set(implementedTransforms());

  for (const [name, mappings] of Object.entries(STARTER_MAPPINGS)) {
    describe(name, () => {
      it("is non-empty", () => {
        expect(mappings.length).toBeGreaterThan(0);
      });

      it("references only implemented transforms", () => {
        const unimplemented = mappings.filter((m) => !implemented.has(m.transform));
        expect(unimplemented).toEqual([]);
      });

      it("uses only valid target prefixes", () => {
        const bad = mappings.filter((m) => !hasValidTargetPrefix(m.target));
        expect(bad).toEqual([]);
      });

      it("has no duplicate source fields (one rule per source)", () => {
        const sources = mappings.map((m) => m.source);
        const dupes = sources.filter((s, i) => sources.indexOf(s) !== i);
        expect(dupes).toEqual([]);
      });

      it("every row declares an authored_by tag", () => {
        const missing = mappings.filter((m) => !m.authored_by);
        expect(missing).toEqual([]);
      });
    });
  }
});

describe("hubspot_default_v1 specifics", () => {
  it("includes the universal HubSpot standard fields", () => {
    const sources = HUBSPOT_DEFAULT_V1.map((m) => m.source);
    // Universal coverage: identity + location + business
    expect(sources).toContain("email");
    expect(sources).toContain("firstname");
    expect(sources).toContain("lastname");
    expect(sources).toContain("mobilephone");
    expect(sources).toContain("city");
    expect(sources).toContain("country");
    expect(sources).toContain("company");
    expect(sources).toContain("jobtitle");
  });

  it("deliberately omits HubSpot system fields that the sync layer handles", () => {
    const sources = HUBSPOT_DEFAULT_V1.map((m) => m.source);
    // hs_object_id is the external ID — handled by the connector, not a mapping
    expect(sources).not.toContain("hs_object_id");
    // createdate / lastmodifieddate drive incremental sync, not member columns
    expect(sources).not.toContain("createdate");
    expect(sources).not.toContain("lastmodifieddate");
  });

  it("deliberately omits ambiguous fields chapters should map themselves", () => {
    const sources = HUBSPOT_DEFAULT_V1.map((m) => m.source);
    // lifecyclestage means different things to different chapters
    expect(sources).not.toContain("lifecyclestage");
    // annualrevenue / numemployees / industry — chapters typically override
    expect(sources).not.toContain("annualrevenue");
    expect(sources).not.toContain("numemployees");
    expect(sources).not.toContain("industry");
  });
});
