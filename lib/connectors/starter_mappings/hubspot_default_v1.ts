// hubspot_default_v1 — the safe, universal baseline mapping for HubSpot's
// standard contact properties. Every HubSpot chapter starts from this and
// adds chapter-specific custom-property mappings on top.
//
// Inclusion criteria for this starter pack:
//   1. The HubSpot property exists in essentially every HubSpot portal.
//   2. The mapping is unambiguous across chapters (a "city" is always a city).
//   3. The transform is from Tier 1 (already-implemented, well-tested).
//
// Things that LOOK universal but were deliberately omitted:
//   - `lifecyclestage` / `lead_status` — HubSpot funnel concepts; chapters
//     interpret these inconsistently. Map per-chapter to membership_status.
//   - `numemployees`, `annualrevenue`, `industry` — chapters often override
//     with custom enums (EO Dallas does). Map per-chapter.
//   - `createdate`, `lastmodifieddate` — system metadata; handled by the
//     sync layer for incremental sync, not stored on the member row.
//   - `hs_object_id` — the HubSpot Contact ID is the external_id; handled
//     implicitly by the connector and stored in member_external_ids
//     (see ADR-003). NOT a mapping rule.
//
// See: docs/adr/ADR-004-connector-mapping-as-data.md

import type { FieldMapping } from "../mapping-schema";

export const HUBSPOT_DEFAULT_V1: ReadonlyArray<FieldMapping> = [
  // ── Identity ────────────────────────────────────────────────────────────
  {
    source: "email",
    target: "members.email_primary",
    transform: "email_normalize",
    notes: "HubSpot standard. Trim + lowercase before write.",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "firstname",
    target: "members.first_name",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "lastname",
    target: "members.last_name",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "mobilephone",
    target: "members.phone_mobile",
    transform: "phone_normalize",
    transform_args: { default_country_code: "+1" },
    notes: "Default to +1 since most US chapters; override per chapter if not US.",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "phone",
    target: "members.custom_fields.phone_landline",
    transform: "phone_normalize",
    transform_args: { default_country_code: "+1" },
    notes:
      "Trifecta has no canonical landline column. Store in custom_fields. Promote if it shows up at scale.",
    authored_by: "starter:hubspot_default_v1",
  },

  // ── Location ────────────────────────────────────────────────────────────
  {
    source: "city",
    target: "members.city",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "state",
    target: "members.state_province",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "country",
    target: "members.country",
    transform: "direct_copy",
    notes:
      "Spec says ISO 3166-1 alpha-2; HubSpot stores free text. Starter does direct copy — chapters with messy data add an enum_map override.",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "address",
    target: "members.custom_fields.street_address",
    transform: "direct_copy",
    notes: "Trifecta has no street address canonical column. Store in custom_fields.",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "zip",
    target: "members.custom_fields.zip",
    transform: "direct_copy",
    notes: "Trifecta has no postal code canonical column. Store in custom_fields.",
    authored_by: "starter:hubspot_default_v1",
  },

  // ── Business ────────────────────────────────────────────────────────────
  {
    source: "company",
    target: "members.company_name",
    transform: "direct_copy",
    notes:
      "HubSpot tracks one company per contact; chapter overrides handle multi-company patterns via multi_company_primary.",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "jobtitle",
    target: "members.job_title",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
  {
    source: "website",
    target: "members.company_website",
    transform: "direct_copy",
    authored_by: "starter:hubspot_default_v1",
  },
];

/** Version tag used in chapter configs (mappings.starter_mapping_base). */
export const HUBSPOT_DEFAULT_V1_NAME = "hubspot_default_v1" as const;
