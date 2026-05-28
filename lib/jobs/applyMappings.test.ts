import { describe, it, expect } from "vitest";
import { applyMappings, mergeMappings, type WritePlan } from "./applyMappings";
import type { FieldMapping } from "../connectors/mapping-schema";
import type { ConnectorRecord } from "../connectors/types";

// ─────────────────────────────────────────────────────────────────────
// mergeMappings — chapter overrides starter by source field
// ─────────────────────────────────────────────────────────────────────
describe("mergeMappings", () => {
  it("returns starter rules verbatim when chapter is empty", () => {
    const starter: FieldMapping[] = [
      { source: "email", target: "members.email_primary", transform: "email_normalize" },
    ];
    expect(mergeMappings(starter, [])).toEqual(starter);
  });

  it("chapter rules with the same source override starter rules", () => {
    const starter: FieldMapping[] = [
      { source: "email", target: "members.email_primary", transform: "email_normalize" },
      { source: "firstname", target: "members.first_name", transform: "direct_copy" },
    ];
    const chapter: FieldMapping[] = [
      { source: "email", target: "members.email_primary", transform: "direct_copy" }, // override
    ];
    const merged = mergeMappings(starter, chapter);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.source === "email")?.transform).toBe("direct_copy");
    expect(merged.find((r) => r.source === "firstname")?.transform).toBe("direct_copy");
  });

  it("chapter rules with new sources extend the starter list", () => {
    const starter: FieldMapping[] = [
      { source: "email", target: "members.email_primary", transform: "email_normalize" },
    ];
    const chapter: FieldMapping[] = [
      { source: "membership_status", target: "members.membership_status", transform: "enum_map", transform_args: { value_map: {} } },
    ];
    expect(mergeMappings(starter, chapter)).toHaveLength(2);
  });

  it("preserves order: starter first, then chapter", () => {
    const starter: FieldMapping[] = [{ source: "a", target: "members.a", transform: "direct_copy" }];
    const chapter: FieldMapping[] = [{ source: "b", target: "members.b", transform: "direct_copy" }];
    expect(mergeMappings(starter, chapter).map((r) => r.source)).toEqual(["a", "b"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// applyMappings — dispatch by target
// ─────────────────────────────────────────────────────────────────────
const baseRecord = (props: Record<string, unknown> = {}): ConnectorRecord => ({
  externalIds: { hubspot: "12345" },
  sourceProperties: props,
});

describe("applyMappings — canonical columns", () => {
  it("writes a direct_copy result to members.<column>", () => {
    const plan = applyMappings(
      baseRecord({ firstname: "Jon" }),
      [{ source: "firstname", target: "members.first_name", transform: "direct_copy" }],
      [],
      undefined,
    );
    expect(plan.memberColumns).toEqual({ first_name: "Jon" });
  });

  it("skips writes when the transform returns null (preserves existing data)", () => {
    const plan = applyMappings(
      baseRecord({ firstname: "" }), // absent value
      [{ source: "firstname", target: "members.first_name", transform: "direct_copy" }],
      [],
      undefined,
    );
    expect(plan.memberColumns).toEqual({});
  });

  it("normalizes via email_normalize", () => {
    const plan = applyMappings(
      baseRecord({ email: "  Foo@BAR.com  " }),
      [{ source: "email", target: "members.email_primary", transform: "email_normalize" }],
      [],
      undefined,
    );
    expect(plan.memberColumns).toEqual({ email_primary: "foo@bar.com" });
  });
});

describe("applyMappings — contact_type derivation (sync filter)", () => {
  const rules: FieldMapping[] = [
    {
      source: "_derived:signals",
      target: "members.contact_type",
      transform: "derive_contact_type",
      transform_args: {
        rules: [
          { condition: { field: "sap_active_", is_set: true }, emit: "Sponsor" },
          { condition: { field: "membership_status", value_in: ["Active"] }, emit: "Member" },
        ],
        default: null,
      },
    },
  ];

  it("sets plan.contactType when signals match", () => {
    const plan = applyMappings(
      baseRecord({ membership_status: "Active" }),
      [],
      rules,
      undefined,
    );
    expect(plan.contactType).toBe("Member");
  });

  it("returns plan.contactType=null when no signal matches (sync layer will skip)", () => {
    const plan = applyMappings(
      baseRecord({ firstname: "Random", email: "random@x.com" }),
      [],
      rules,
      undefined,
    );
    expect(plan.contactType).toBeNull();
  });

  it("Sponsor signal takes precedence over Active membership_status", () => {
    const plan = applyMappings(
      baseRecord({ sap_active_: "Yes", membership_status: "Active" }),
      [],
      rules,
      undefined,
    );
    expect(plan.contactType).toBe("Sponsor");
  });
});

describe("applyMappings — custom_fields (nested key paths)", () => {
  it("writes to a top-level custom_fields key", () => {
    const plan = applyMappings(
      baseRecord({ birthday: "1980-07-15" }),
      [{ source: "birthday", target: "members.custom_fields.birthday", transform: "iso_date" }],
      [],
      undefined,
    );
    expect(plan.customFields).toEqual({ birthday: "1980-07-15" });
  });

  it("writes to a nested custom_fields path", () => {
    const plan = applyMappings(
      baseRecord({ spouse_first_name: "Jane", spouse_last_name: "Doe" }),
      [
        { source: "spouse_first_name", target: "members.custom_fields.spouse.first_name", transform: "direct_copy" },
        { source: "spouse_last_name", target: "members.custom_fields.spouse.last_name", transform: "direct_copy" },
      ],
      [],
      undefined,
    );
    expect(plan.customFields).toEqual({
      spouse: { first_name: "Jane", last_name: "Doe" },
    });
  });

  it("group_to_jsonb routes a whole group into one custom_fields key", () => {
    const schema = {
      accountant_name: { groupName: "requalification_properties" },
      accountant_email: { groupName: "requalification_properties" },
    };
    const plan = applyMappings(
      baseRecord({ accountant_name: "Jane CPA", accountant_email: "jane@cpa.com" }),
      [],
      [
        {
          source: "_group:requalification_properties",
          target: "members.custom_fields.requalification",
          transform: "group_to_jsonb",
          transform_args: { group_name: "requalification_properties" },
        },
      ],
      schema,
    );
    expect(plan.customFields).toEqual({
      requalification: { accountant_name: "Jane CPA", accountant_email: "jane@cpa.com" },
    });
  });
});

describe("applyMappings — notes (append)", () => {
  it("collects multiple append_to_notes outputs", () => {
    const plan = applyMappings(
      baseRecord({
        why_leaving: "Cost too high",
        what_change: "Lower dues",
      }),
      [],
      [
        {
          source: "why_leaving",
          target: "members.notes",
          transform: "append_to_notes",
          transform_args: { tag: "hubspot:exit_survey:leaving" },
        },
        {
          source: "what_change",
          target: "members.notes",
          transform: "append_to_notes",
          transform_args: { tag: "hubspot:exit_survey:change" },
        },
      ],
      undefined,
    );
    expect(plan.notes).toHaveLength(2);
    expect(plan.notes[0]).toEqual({
      text: "Cost too high",
      source: "hubspot:exit_survey:leaving",
      source_field: "why_leaving",
    });
    expect(plan.notes[1].source).toBe("hubspot:exit_survey:change");
  });

  it("skips note when the source field is empty", () => {
    const plan = applyMappings(
      baseRecord({ why_leaving: "" }),
      [],
      [
        {
          source: "why_leaving",
          target: "members.notes",
          transform: "append_to_notes",
          transform_args: { tag: "test" },
        },
      ],
      undefined,
    );
    expect(plan.notes).toEqual([]);
  });
});

describe("applyMappings — externalIds", () => {
  it("carries externalIds from the source record through to the plan", () => {
    const plan = applyMappings(
      { externalIds: { hubspot: "99999" }, sourceProperties: {} },
      [],
      [],
      undefined,
    );
    expect(plan.externalIds).toEqual({ hubspot: "99999" });
  });
});

describe("applyMappings — errors are collected, not thrown", () => {
  it("logs transform errors and continues with other rules", () => {
    const plan = applyMappings(
      baseRecord({ membership_status: "UnknownValue", email: "ok@x.com" }),
      [],
      [
        {
          source: "membership_status",
          target: "members.membership_status",
          transform: "enum_map",
          transform_args: { value_map: { Active: "Active" } }, // no default → throws on unknown
        },
        { source: "email", target: "members.email_primary", transform: "email_normalize" },
      ],
      undefined,
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].target).toBe("members.membership_status");
    // The successful rule still wrote
    expect(plan.memberColumns).toEqual({ email_primary: "ok@x.com" });
  });

  it("logs an error for an unknown target prefix", () => {
    const plan = applyMappings(
      baseRecord({ x: "y" }),
      [],
      [{ source: "x", target: "bogus.target", transform: "direct_copy" }],
      undefined,
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].message).toContain("unknown target prefix");
  });
});

describe("applyMappings — starter + chapter merge in practice", () => {
  const starter: FieldMapping[] = [
    { source: "email", target: "members.email_primary", transform: "email_normalize" },
    { source: "firstname", target: "members.first_name", transform: "direct_copy" },
    { source: "lastname", target: "members.last_name", transform: "direct_copy" },
  ];

  it("applies starter rules when no chapter override exists", () => {
    const plan = applyMappings(
      baseRecord({ email: "JON@X.com", firstname: "Jon", lastname: "Minjoe" }),
      starter,
      [],
      undefined,
    );
    expect(plan.memberColumns).toEqual({
      email_primary: "jon@x.com",
      first_name: "Jon",
      last_name: "Minjoe",
    });
  });

  it("chapter override replaces a starter rule on the same source", () => {
    const chapter: FieldMapping[] = [
      // Suppose this chapter wants to NOT normalize email — keep as-is
      { source: "email", target: "members.email_primary", transform: "direct_copy" },
    ];
    const plan = applyMappings(
      baseRecord({ email: "JON@X.com", firstname: "Jon", lastname: "Minjoe" }),
      starter,
      chapter,
      undefined,
    );
    expect(plan.memberColumns.email_primary).toBe("JON@X.com"); // not lowercased
    expect(plan.memberColumns.first_name).toBe("Jon"); // starter still applied
  });
});

// ─────────────────────────────────────────────────────────────────────
// Realistic end-to-end shape using EO Dallas's actual rules
// ─────────────────────────────────────────────────────────────────────
describe("applyMappings — realistic EO Dallas record", () => {
  it("produces a coherent WritePlan for a current Active member", () => {
    const record: ConnectorRecord = {
      externalIds: { hubspot: "42" },
      sourceProperties: {
        email: "active.member@example.com",
        firstname: "Active",
        lastname: "Member",
        company: "Member Co",
        membership_status: "Active",
        join_date: "2020-07-01",
        eo_accelerator: "No",
        renewal_status: "💚 Confirmed Renew",
      },
      sourceLastModifiedAt: "2026-05-01T12:00:00Z",
    };

    const starter: FieldMapping[] = [
      { source: "email", target: "members.email_primary", transform: "email_normalize" },
      { source: "firstname", target: "members.first_name", transform: "direct_copy" },
      { source: "lastname", target: "members.last_name", transform: "direct_copy" },
      { source: "company", target: "members.company_name", transform: "direct_copy" },
    ];

    const chapter: FieldMapping[] = [
      {
        source: "_derived:signals",
        target: "members.contact_type",
        transform: "derive_contact_type",
        transform_args: {
          rules: [{ condition: { field: "membership_status", value_in: ["Active"] }, emit: "Member" }],
          default: null,
        },
      },
      {
        source: "membership_status",
        target: "members.membership_status",
        transform: "enum_map",
        transform_args: { value_map: { Active: "Active", Inactive: "Lapsed" } },
      },
      {
        source: "join_date",
        target: "members.join_date_original",
        transform: "iso_date",
      },
      {
        source: "eo_accelerator",
        target: "members.eoa_member",
        transform: "bool_from_yes_no",
      },
      {
        source: "renewal_status",
        target: "members.renewal_intent_response",
        transform: "enum_map_after_strip",
        transform_args: {
          strip_pattern: "^[\\p{Emoji}\\p{Emoji_Component}\\s]+",
          value_map: { "Confirmed Renew": "PlanToRenew" },
        },
      },
    ];

    const plan = applyMappings(record, starter, chapter, undefined);

    expect(plan.contactType).toBe("Member");
    expect(plan.memberColumns).toEqual({
      email_primary: "active.member@example.com",
      first_name: "Active",
      last_name: "Member",
      company_name: "Member Co",
      membership_status: "Active",
      join_date_original: "2020-07-01",
      eoa_member: false,
      renewal_intent_response: "PlanToRenew",
    });
    expect(plan.customFields).toEqual({});
    expect(plan.notes).toEqual([]);
    expect(plan.externalIds).toEqual({ hubspot: "42" });
    expect(plan.errors).toEqual([]);
  });

  it("returns contactType=null for a record with no operational signal (sync layer will skip)", () => {
    const record: ConnectorRecord = {
      externalIds: { hubspot: "99" },
      sourceProperties: { email: "random@x.com", firstname: "Random" },
    };
    const plan = applyMappings(
      record,
      [],
      [
        {
          source: "_derived:signals",
          target: "members.contact_type",
          transform: "derive_contact_type",
          transform_args: {
            rules: [
              { condition: { field: "membership_status", is_set: true }, emit: "Member" },
            ],
            default: null,
          },
        },
      ],
      undefined,
    );
    expect(plan.contactType).toBeNull();
  });
});
