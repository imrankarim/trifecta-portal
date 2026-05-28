import { describe, it, expect } from "vitest";
import { applyTransform, TransformError, implementedTransforms } from "./transformations";

// ---------------------------------------------------------------------------
// direct_copy
// ---------------------------------------------------------------------------
describe("direct_copy", () => {
  it("passes a string through", () => {
    expect(applyTransform("direct_copy", "hello")).toBe("hello");
  });
  it("passes a number through", () => {
    expect(applyTransform("direct_copy", 42)).toBe(42);
  });
  it("normalizes empty string to null", () => {
    expect(applyTransform("direct_copy", "")).toBeNull();
  });
  it("normalizes whitespace-only string to null", () => {
    expect(applyTransform("direct_copy", "   ")).toBeNull();
  });
  it("normalizes null to null", () => {
    expect(applyTransform("direct_copy", null)).toBeNull();
  });
  it("normalizes undefined to null", () => {
    expect(applyTransform("direct_copy", undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// enum_map
// ---------------------------------------------------------------------------
describe("enum_map", () => {
  const args = {
    value_map: {
      Active: "Active",
      Inactive: "Lapsed",
      Sabbatical: "On Leave",
    },
  };

  it("maps a known value", () => {
    expect(applyTransform("enum_map", "Inactive", args)).toBe("Lapsed");
  });
  it("returns null for null input", () => {
    expect(applyTransform("enum_map", null, args)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(applyTransform("enum_map", "", args)).toBeNull();
  });
  it("uses default when value is unknown", () => {
    const argsWithDefault = { ...args, default: null };
    expect(applyTransform("enum_map", "Unmapped", argsWithDefault)).toBeNull();
  });
  it("throws when value is unknown and no default", () => {
    expect(() => applyTransform("enum_map", "Unmapped", args)).toThrow(TransformError);
  });
  it("throws when args.value_map is missing", () => {
    expect(() => applyTransform("enum_map", "x", {})).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// enum_map_after_strip
// ---------------------------------------------------------------------------
describe("enum_map_after_strip", () => {
  // Use a Unicode-aware, leading-anchored pattern so we strip decorative
  // prefixes (emoji + variation selectors + whitespace) without eating
  // interior spaces.
  const args = {
    strip_pattern: "^[\\p{Emoji}\\p{Emoji_Component}\\s]+",
    value_map: {
      "Confirmed Renew": "PlanToRenew",
      "At Risk": "WantToSpeak",
      "Likely Non-Renew": "WontRenew",
    },
  };

  it("strips emoji prefix then maps", () => {
    expect(applyTransform("enum_map_after_strip", "💚 Confirmed Renew", args)).toBe("PlanToRenew");
  });
  it("handles emoji + nbsp combos", () => {
    expect(applyTransform("enum_map_after_strip", "♥️  At Risk", args)).toBe("WantToSpeak");
  });
  it("strips and maps a non-decorated value", () => {
    expect(applyTransform("enum_map_after_strip", "Likely Non-Renew", args)).toBe("WontRenew");
  });
  it("returns null for absent input", () => {
    expect(applyTransform("enum_map_after_strip", "", args)).toBeNull();
  });
  it("throws on invalid regex", () => {
    expect(() =>
      applyTransform("enum_map_after_strip", "x", { ...args, strip_pattern: "[unclosed" }),
    ).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// iso_date
// ---------------------------------------------------------------------------
describe("iso_date", () => {
  it("formats an ISO date string", () => {
    expect(applyTransform("iso_date", "2024-03-15")).toBe("2024-03-15");
  });
  it("extracts date from an ISO datetime", () => {
    expect(applyTransform("iso_date", "2024-03-15T14:23:00Z")).toBe("2024-03-15");
  });
  it("parses US MM/DD/YYYY format", () => {
    expect(applyTransform("iso_date", "03/15/2024")).toBe("2024-03-15");
  });
  it("parses ms-since-epoch", () => {
    const ms = Date.UTC(2024, 2, 15); // March 15, 2024 UTC
    expect(applyTransform("iso_date", ms)).toBe("2024-03-15");
  });
  it("returns null for absent input", () => {
    expect(applyTransform("iso_date", null)).toBeNull();
    expect(applyTransform("iso_date", "")).toBeNull();
  });
  it("throws for unparseable input", () => {
    expect(() => applyTransform("iso_date", "not a date")).toThrow(TransformError);
  });
  it("throws for absurd year", () => {
    expect(() => applyTransform("iso_date", "1750-01-01")).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// iso_datetime
// ---------------------------------------------------------------------------
describe("iso_datetime", () => {
  it("normalizes an ISO datetime", () => {
    expect(applyTransform("iso_datetime", "2024-03-15T14:23:00Z")).toBe("2024-03-15T14:23:00.000Z");
  });
  it("returns null for absent input", () => {
    expect(applyTransform("iso_datetime", "")).toBeNull();
  });
  it("throws on garbage", () => {
    expect(() => applyTransform("iso_datetime", "garbage")).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// bool_from_yes_no
// ---------------------------------------------------------------------------
describe("bool_from_yes_no", () => {
  it("recognizes Yes as true", () => {
    expect(applyTransform("bool_from_yes_no", "Yes")).toBe(true);
  });
  it("recognizes No as false", () => {
    expect(applyTransform("bool_from_yes_no", "No")).toBe(false);
  });
  it("handles boolean primitives unchanged", () => {
    expect(applyTransform("bool_from_yes_no", true)).toBe(true);
    expect(applyTransform("bool_from_yes_no", false)).toBe(false);
  });
  it('recognizes "1"/"0" string forms', () => {
    expect(applyTransform("bool_from_yes_no", "1")).toBe(true);
    expect(applyTransform("bool_from_yes_no", "0")).toBe(false);
  });
  it("returns null for absent input (preserves unknown)", () => {
    expect(applyTransform("bool_from_yes_no", null)).toBeNull();
    expect(applyTransform("bool_from_yes_no", "")).toBeNull();
    expect(applyTransform("bool_from_yes_no", undefined)).toBeNull();
  });
  it("throws on unrecognized values", () => {
    expect(() => applyTransform("bool_from_yes_no", "maybe")).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// email_normalize
// ---------------------------------------------------------------------------
describe("email_normalize", () => {
  it("trims and lowercases", () => {
    expect(applyTransform("email_normalize", "  Foo@BAR.com  ")).toBe("foo@bar.com");
  });
  it("returns null for empty input", () => {
    expect(applyTransform("email_normalize", "")).toBeNull();
    expect(applyTransform("email_normalize", null)).toBeNull();
  });
  it("does not validate format (passes garbage through normalized)", () => {
    expect(applyTransform("email_normalize", "not an email")).toBe("not an email");
  });
});

// ---------------------------------------------------------------------------
// phone_normalize
// ---------------------------------------------------------------------------
describe("phone_normalize", () => {
  it("normalizes a US 10-digit number with default +1", () => {
    expect(applyTransform("phone_normalize", "(972) 555-1212")).toBe("+19725551212");
  });
  it("honors explicit + prefix and strips formatting", () => {
    expect(applyTransform("phone_normalize", "+44 20 7946 0958")).toBe("+442079460958");
  });
  it("treats 11-digit numbers starting with 1 as US", () => {
    expect(applyTransform("phone_normalize", "1-972-555-1212")).toBe("+19725551212");
  });
  it("uses a configurable default country code", () => {
    // 10-digit national-format input + +44 default → E.164 UK number.
    // We don't strip national-prefix '0' — caller can if needed.
    expect(applyTransform("phone_normalize", "20-7946-0958", { default_country_code: "+44" })).toBe(
      "+442079460958",
    );
  });
  it("returns null for absent input", () => {
    expect(applyTransform("phone_normalize", "")).toBeNull();
    expect(applyTransform("phone_normalize", null)).toBeNull();
  });
  it("throws on ambiguous lengths", () => {
    expect(() => applyTransform("phone_normalize", "555-1212")).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — bool_from_keyword
// ---------------------------------------------------------------------------
describe("bool_from_keyword", () => {
  const args = { true_values: ["Confirmed", "Yes", "Y"], false_values: ["Pending", "No", "N"] };

  it("matches a configured true keyword (case-insensitive)", () => {
    expect(applyTransform("bool_from_keyword", "confirmed", args)).toBe(true);
  });
  it("matches a configured false keyword", () => {
    expect(applyTransform("bool_from_keyword", "Pending", args)).toBe(false);
  });
  it("returns null for absent input", () => {
    expect(applyTransform("bool_from_keyword", "", args)).toBeNull();
  });
  it("defaults to false when false_values omitted and value doesn't match true_values", () => {
    expect(applyTransform("bool_from_keyword", "anything else", { true_values: ["Yes"] })).toBe(false);
  });
  it("throws when value matches neither list", () => {
    expect(() => applyTransform("bool_from_keyword", "Maybe", args)).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — concat
// ---------------------------------------------------------------------------
describe("concat", () => {
  const record = { first_name: "Imran", middle: "", last_name: "Karim" };

  it("joins multiple source fields with default space", () => {
    expect(
      applyTransform("concat", null, { sources: ["first_name", "last_name"] }, { record }),
    ).toBe("Imran Karim");
  });
  it("uses a configured separator", () => {
    expect(
      applyTransform(
        "concat",
        null,
        { sources: ["first_name", "last_name"], separator: ", " },
        { record },
      ),
    ).toBe("Imran, Karim");
  });
  it("skips absent intermediate fields", () => {
    expect(
      applyTransform("concat", null, { sources: ["first_name", "middle", "last_name"] }, { record }),
    ).toBe("Imran Karim");
  });
  it("returns null when all sources absent", () => {
    expect(
      applyTransform("concat", null, { sources: ["nope1", "nope2"] }, { record }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — array_of_text
// ---------------------------------------------------------------------------
describe("array_of_text", () => {
  it("splits a semicolon-separated string (HubSpot default)", () => {
    expect(applyTransform("array_of_text", "Vegetarian;Vegan;Nut Allergy", null)).toEqual([
      "Vegetarian",
      "Vegan",
      "Nut Allergy",
    ]);
  });
  it("passes an already-arrayed value through", () => {
    expect(applyTransform("array_of_text", ["A", "B", "C"], null)).toEqual(["A", "B", "C"]);
  });
  it("uses a custom separator", () => {
    expect(applyTransform("array_of_text", "a,b,c", { separator: "," })).toEqual(["a", "b", "c"]);
  });
  it("returns null for absent input", () => {
    expect(applyTransform("array_of_text", "", null)).toBeNull();
  });
  it("filters out empty values from splits", () => {
    expect(applyTransform("array_of_text", "a;;b;", null)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — append_to_notes
// ---------------------------------------------------------------------------
describe("append_to_notes", () => {
  it("builds a note entry with source tag and source_field", () => {
    expect(
      applyTransform(
        "append_to_notes",
        "Forum experience was excellent.",
        { tag: "hubspot:exit_survey" },
        { fieldName: "why_have_you_decided_to_leave_eo_dallas_" },
      ),
    ).toEqual({
      text: "Forum experience was excellent.",
      source: "hubspot:exit_survey",
      source_field: "why_have_you_decided_to_leave_eo_dallas_",
    });
  });
  it("omits source_field when no fieldName in ctx", () => {
    expect(applyTransform("append_to_notes", "x", { tag: "test" })).toEqual({
      text: "x",
      source: "test",
    });
  });
  it("returns null for absent value", () => {
    expect(applyTransform("append_to_notes", "", { tag: "x" })).toBeNull();
  });
  it("throws when tag missing", () => {
    expect(() => applyTransform("append_to_notes", "x", {})).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — checkbox_years_to_history
// ---------------------------------------------------------------------------
describe("checkbox_years_to_history", () => {
  const args = { role: "Board Member" };

  it("parses array of year ranges into board role history", () => {
    const result = applyTransform(
      "checkbox_years_to_history",
      ["2024-2025", "2023-2024"],
      args,
    ) as Array<Record<string, string>>;
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "Board Member", start_date: "2024-07-01", end_date: "2025-06-30" });
    expect(result[1]).toEqual({ role: "Board Member", start_date: "2023-07-01", end_date: "2024-06-30" });
  });
  it("sorts newest first", () => {
    const result = applyTransform(
      "checkbox_years_to_history",
      ["2022-2023", "2025-2026", "2024-2025"],
      args,
    ) as Array<Record<string, string>>;
    expect(result.map((e) => e.start_date)).toEqual(["2025-07-01", "2024-07-01", "2022-07-01"]);
  });
  it("accepts semicolon-separated string form", () => {
    expect(
      applyTransform("checkbox_years_to_history", "2024-2025;2023-2024", args),
    ).toHaveLength(2);
  });
  it("honors custom fiscal-year boundaries", () => {
    const result = applyTransform(
      "checkbox_years_to_history",
      ["2024-2025"],
      { role: "Chair", start_month_day: "01-01", end_month_day: "12-31" },
    ) as Array<Record<string, string>>;
    expect(result[0]).toEqual({ role: "Chair", start_date: "2024-01-01", end_date: "2025-12-31" });
  });
  it("throws on malformed year-range", () => {
    expect(() => applyTransform("checkbox_years_to_history", ["nope"], args)).toThrow(TransformError);
  });
  it("returns null for absent input", () => {
    expect(applyTransform("checkbox_years_to_history", null, args)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — multi_select_to_attendance
// ---------------------------------------------------------------------------
describe("multi_select_to_attendance", () => {
  const args = { event_type: "learning" as const, fiscal_year: "2024-25" };

  it("emits one attendance record per checked option", () => {
    const result = applyTransform(
      "multi_select_to_attendance",
      ["August - Ryan & Chad Estis", "September - Gray Malin"],
      args,
    ) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      event_id: "learning:2024-25:august-ryan-chad-estis",
      event_name: "August - Ryan & Chad Estis",
      event_type: "learning",
      fiscal_year: "2024-25",
      attended: true,
    });
  });
  it("produces deterministic event_ids (re-sync stable)", () => {
    const a = applyTransform("multi_select_to_attendance", ["X"], args) as Array<{ event_id: string }>;
    const b = applyTransform("multi_select_to_attendance", ["X"], args) as Array<{ event_id: string }>;
    expect(a[0].event_id).toBe(b[0].event_id);
  });
  it("returns null for absent input", () => {
    expect(applyTransform("multi_select_to_attendance", null, args)).toBeNull();
  });
  it("rejects an invalid event_type", () => {
    expect(() =>
      applyTransform("multi_select_to_attendance", ["X"], { ...args, event_type: "bogus" as never }),
    ).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — multi_company_primary
// ---------------------------------------------------------------------------
describe("multi_company_primary", () => {
  const record = {
    company_1_dba: "Acme Inc",
    company_1_annual_revenue: 5000000,
    company_1_number_of_full_time_employees: 25,
    company_2_dba: "Side Hustle LLC",
    company_2_annual_revenue: 250000,
    company_3_dba: "",
    company_3_annual_revenue: null,
  };
  const args = {
    prefix_template: "company_{n}_",
    max_count: 3,
    sub_fields: ["dba", "annual_revenue", "number_of_full_time_employees"],
  };

  it("returns records for populated company slots, skipping empty ones", () => {
    const result = applyTransform("multi_company_primary", null, args, { record }) as Array<
      Record<string, unknown>
    >;
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      _index: 1,
      dba: "Acme Inc",
      annual_revenue: 5000000,
      number_of_full_time_employees: 25,
    });
    expect(result[1]).toMatchObject({ _index: 2, dba: "Side Hustle LLC" });
  });
  it("returns null when no company slots populated", () => {
    expect(applyTransform("multi_company_primary", null, args, { record: {} })).toBeNull();
  });
  it("throws when prefix_template missing {n}", () => {
    expect(() =>
      applyTransform("multi_company_primary", null, { ...args, prefix_template: "company_" }, { record }),
    ).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — group_to_jsonb
// ---------------------------------------------------------------------------
describe("group_to_jsonb", () => {
  const schema = {
    accountant_name: { groupName: "requalification_properties" },
    accountant_email: { groupName: "requalification_properties" },
    company_1_dba: { groupName: "requalification_properties" },
    first_name: { groupName: "contactinformation" }, // not in group
  };
  const record = {
    accountant_name: "Jane Doe CPA",
    accountant_email: "jane@cpa.com",
    company_1_dba: "Acme Inc",
    first_name: "Imran",
  };

  it("bundles every property in the named group", () => {
    const result = applyTransform(
      "group_to_jsonb",
      null,
      { group_name: "requalification_properties" },
      { record, schema },
    );
    expect(result).toEqual({
      accountant_name: "Jane Doe CPA",
      accountant_email: "jane@cpa.com",
      company_1_dba: "Acme Inc",
    });
  });
  it("excludes specified keys", () => {
    const result = applyTransform(
      "group_to_jsonb",
      null,
      { group_name: "requalification_properties", exclude_keys: ["company_1_dba"] },
      { record, schema },
    ) as Record<string, unknown>;
    expect(result).not.toHaveProperty("company_1_dba");
    expect(result).toHaveProperty("accountant_name");
  });
  it("returns null when no properties in group have values", () => {
    expect(
      applyTransform(
        "group_to_jsonb",
        null,
        { group_name: "requalification_properties" },
        { record: {}, schema },
      ),
    ).toBeNull();
  });
  it("throws when ctx.schema not provided", () => {
    expect(() =>
      applyTransform("group_to_jsonb", null, { group_name: "x" }, { record }),
    ).toThrow(TransformError);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — derive_contact_type
// ---------------------------------------------------------------------------
describe("derive_contact_type", () => {
  // Realistic EO Dallas signal-precedence rules (matches the mapping config)
  const eoDallasRules = {
    rules: [
      // Strongest signal: SAP record → Sponsor (regardless of other fields)
      { condition: { field: "sap_active_", is_set: true }, emit: "Sponsor" },
      // Explicit Spouse tag
      { condition: { field: "membership_status", value_in: ["Spouse"] }, emit: "Spouse" },
      // Any member-lifecycle status → Member
      {
        condition: {
          field: "membership_status",
          value_in: ["Active", "Inactive", "Sabbatical", "Alumni", "Former Member"],
        },
        emit: "Member",
      },
      // Prospect signals → Member (with Prospect lifecycle, set elsewhere)
      {
        condition: {
          any_of: [
            { field: "application", is_set: true },
            { field: "chapter_consideration_email", is_set: true },
          ],
        },
        emit: "Member",
      },
      // Past board service → Member (likely Former Member)
      {
        condition: { any_of: [{ field: "dallas_bod", is_set: true }, { field: "bod_position", is_set: true }] },
        emit: "Member",
      },
    ],
    default: null,
  };

  it("returns Sponsor for a contact with sap_active_ set (highest precedence)", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { sap_active_: "Yes", membership_status: "Active" },
      }),
    ).toBe("Sponsor");
  });

  it("returns Spouse for Spouse membership_status", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { membership_status: "Spouse" },
      }),
    ).toBe("Spouse");
  });

  it("returns Member for Active membership_status", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { membership_status: "Active" },
      }),
    ).toBe("Member");
  });

  it("returns Member for a prospect via application field", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { application: "Complete" },
      }),
    ).toBe("Member");
  });

  it("returns Member for a former board member without current status", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { dallas_bod: ["2022-2023"] },
      }),
    ).toBe("Member");
  });

  it("returns null for a contact with no matching signals (default null = skip)", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { firstname: "Random", email: "random@x.com" },
      }),
    ).toBeNull();
  });

  it("treats empty arrays as absent for is_set checks", () => {
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { dallas_bod: [] },
      }),
    ).toBeNull();
  });

  it("uses explicit default when provided", () => {
    expect(
      applyTransform(
        "derive_contact_type",
        null,
        { rules: [{ condition: { field: "x", is_set: true }, emit: "Y" }], default: "Other" },
        { record: {} },
      ),
    ).toBe("Other");
  });

  it("throws when rules missing", () => {
    expect(() => applyTransform("derive_contact_type", null, {}, { record: {} })).toThrow(
      TransformError,
    );
  });

  it("rule precedence is strict (first match wins)", () => {
    // Spouse membership + active SAP — Sponsor wins (rule 1 before rule 2)
    expect(
      applyTransform("derive_contact_type", null, eoDallasRules, {
        record: { sap_active_: "Yes", membership_status: "Spouse" },
      }),
    ).toBe("Sponsor");
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe("registry", () => {
  it("exposes all Tier 1, Tier 2, and Tier 3 transforms", () => {
    const names = implementedTransforms().sort();
    expect(names).toEqual(
      [
        // Tier 1
        "bool_from_yes_no",
        "direct_copy",
        "email_normalize",
        "enum_map",
        "enum_map_after_strip",
        "iso_date",
        "iso_datetime",
        "phone_normalize",
        // Tier 2
        "append_to_notes",
        "array_of_text",
        "bool_from_keyword",
        "concat",
        // Tier 3
        "checkbox_years_to_history",
        "derive_contact_type",
        "group_to_jsonb",
        "multi_company_primary",
        "multi_select_to_attendance",
      ].sort(),
    );
  });
  it("throws TransformError for unknown transform name", () => {
    // @ts-expect-error — intentionally passing an invalid transform name
    expect(() => applyTransform("not_a_real_transform", "x")).toThrow(TransformError);
  });
});
