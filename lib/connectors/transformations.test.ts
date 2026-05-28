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
// Registry
// ---------------------------------------------------------------------------
describe("registry", () => {
  it("exposes the Tier 1 + utility transforms", () => {
    const names = implementedTransforms().sort();
    expect(names).toEqual(
      [
        "bool_from_yes_no",
        "direct_copy",
        "email_normalize",
        "enum_map",
        "enum_map_after_strip",
        "iso_date",
        "iso_datetime",
        "phone_normalize",
      ].sort(),
    );
  });
  it("throws TransformError for unknown transform name", () => {
    // @ts-expect-error — intentionally passing an invalid transform name
    expect(() => applyTransform("not_a_real_transform", "x")).toThrow(TransformError);
  });
});
