# ADR-004 — Connector mapping as data (per-chapter field mappings)

**Status:** Accepted (2026-05-28)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 Week 2 (HubSpot connector reads mappings from config); Phase 2 (admin UI for mappings, schema-drift detection); Phase 3 (LLM agents that propose mappings)
**Related:** [ADR-003 — multi-CRM external IDs](ADR-003-multi-crm-external-ids.md), [v1.1 spec §2.2 DataSource](../Trifecta_Developer_Specification_v1.1.md)
**Supersedes:** none

---

## Context

Trifecta's Phase 1 build target is EO Dallas. The HubSpot inventory we pulled directly from their portal ([docs/hubspot/eo_dallas_custom_properties.md](../hubspot/eo_dallas_custom_properties.md)) shows **652 contact properties — 230 of them EO Dallas customizations**. Each customization reflects something specific about how that chapter operates: how they track membership status, forum assignment, renewal intent, board service, learning events, spouse/SLP engagement, even dietary preferences for events.

The naive design — write a HubSpot connector that hard-codes a mapping from "their `membership_status` enum" to "our `membership_status` enum" — works for EO Dallas. It does not work at scale.

Hundreds of EO chapters use HubSpot. **Each has their own customizations.** Some properties EO Dallas has, EO Houston likely doesn't; some Houston has, EO Atlanta might call by a different name. The same is true across other CRMs (Pipedrive, Go High Level, Chapter Pro), Sheets / Notion-based data, and chapters that have no CRM at all. The variation across chapters is data — not code — and treating it as code means a hand-built integration per chapter, which is the *opposite* of scalable.

ADR-003 addressed half of this: per-source external IDs are rows in `member_external_ids`, not columns on `members`. This ADR addresses the other half: **per-chapter field mappings are stored as data on the chapter, not as code in the connector.**

## Decision

Connector code is **generic per source type**; mapping configuration is **per chapter, stored as JSONB data** on `chapters.data_sources_config[source_name]`. Adding a new chapter on a known CRM is a config row, never new code. The connector reads its mapping from config at sync time and dispatches each rule to a small, named **transformation library**.

### The four layers

```
1. CONNECTOR CODE  (per source type — one-time engineering effort)
   HubSpotConnector, PipedriveConnector, GoHighLevelConnector,
   ChapterProConnector, NativeCRMConnector, GoogleSheetsConnector, …
   Generic: knows how to authenticate, paginate, fetch schema + records.
   Returns a "rich payload" with full schema metadata — no hardcoded mapping.

2. DISCOVERY  (automatic, every sync)
   Snapshot the source's current schema. Compare to last-seen.
   Surface drift (new / renamed / removed properties) for Layer 3 review.

3. MAPPING CONFIG  (per chapter — data, not code)
   chapters.data_sources_config[source].mappings.field_mappings: Mapping[]
   A list of rules: { source, target, transform, transform_args }.
   Edited by admin in Phase 2 UI; proposed by LLM agents in Phase 3.

4. TRANSFORMATION LIBRARY  (named, reusable — shared across all chapters)
   Small set of well-tested named transforms: direct_copy, enum_map,
   iso_date, multi_select_to_attendance, multi_company_primary, etc.
   A mapping references a transform by name + args. Adding a new
   transform is a code change (with tests); using one is data.
```

### The mapping config shape

Full TypeScript types: [lib/connectors/mapping-schema.ts](../../lib/connectors/mapping-schema.ts).

The JSONB shape stored on `chapters.data_sources_config[source_name]`:

```jsonc
{
  "credential": {
    "type": "private_app_token",            // or service_key, oauth_refresh_token, api_key
    "token": "pat-na1-..."                  // Phase 1 plaintext; Vault in Phase 2
  },
  "linked_at": "2026-05-28T00:10:21Z",
  "enabled": true,
  "last_sync_at": "2026-05-28T04:00:00Z",
  "last_sync_result": { /* SourceLastSyncResult */ },

  "mappings": {
    "version": 1,
    "starter_mapping_base": "hubspot_default_v1",
    "discovered_schema_snapshot_at": "2026-05-28T00:10:21Z",
    "discovered_schema": [ /* the full source property list at snapshot time */ ],

    "field_mappings": [
      // ─── Tier 1: HubSpot standard contact fields (direct map) ───
      { "source": "email",     "target": "members.email_primary", "transform": "email_normalize" },
      { "source": "firstname", "target": "members.first_name",    "transform": "direct_copy" },
      { "source": "lastname",  "target": "members.last_name",     "transform": "direct_copy" },
      { "source": "mobilephone","target": "members.phone_mobile", "transform": "phone_normalize" },
      { "source": "company",   "target": "members.company_name",  "transform": "direct_copy" },
      { "source": "jobtitle",  "target": "members.job_title",     "transform": "direct_copy" },
      { "source": "city",      "target": "members.city",          "transform": "direct_copy" },
      { "source": "state",     "target": "members.state_province","transform": "direct_copy" },

      // ─── Enum normalization: their values → our values ───
      {
        "source": "membership_status",
        "target": "members.membership_status",
        "transform": "enum_map",
        "transform_args": {
          "value_map": {
            "Active": "Active",
            "Inactive": "Lapsed",
            "Sabbatical": "On Leave",
            "Alumni": "Alumni",
            "Spouse": "Spouse"
          },
          "default": null
        },
        "notes": "EO Dallas Inactive↔Lapsed; Sabbatical↔On Leave; Spouse handled per ADR-004 design question 2."
      },
      {
        "source": "renewal_status",
        "target": "members.renewal_intent_response",
        "transform": "enum_map_after_strip",
        "transform_args": {
          "strip_pattern": "[💚💛♥️🖤\\s]+",
          "value_map": {
            "Confirmed Renew": "PlanToRenew",
            "Leaning Renew": "PlanToRenew",
            "At Risk": "WantToSpeak",
            "Likely Non-Renew": "WontRenew"
          }
        }
      },

      // ─── Date parsing ───
      { "source": "join_date", "target": "members.join_date_original", "transform": "iso_date" },
      { "source": "birthday",  "target": "members.custom_fields.birthday", "transform": "iso_date" },

      // ─── Boolean combining: two HubSpot bools → one Trifecta bool ───
      {
        "source": "eo_accelerator",
        "target": "members.eoa_member",
        "transform": "bool_from_yes_no"
      },

      // ─── Domain-specific: years multi-select → board_roles_history JSONB ───
      {
        "source": "dallas_bod",
        "target": "members.board_roles_history",
        "transform": "checkbox_years_to_history",
        "transform_args": { "role": "Board Member" }
      },

      // ─── Domain-specific: per-fiscal-year event checkbox → attendance records ───
      {
        "source": "n24_25_learning_event",
        "target": "event_attendance",
        "transform": "multi_select_to_attendance",
        "transform_args": { "event_type": "learning", "fiscal_year": "2024-25" }
      },
      {
        "source": "n25_26_social_event",
        "target": "event_attendance",
        "transform": "multi_select_to_attendance",
        "transform_args": { "event_type": "local", "fiscal_year": "2025-26" }
      },

      // ─── Multi-company: primary → canonical; rest → custom_fields ───
      {
        "source": "company_1_*",
        "target": "members.company_name",
        "transform": "multi_company_primary",
        "transform_args": { "max_companies": 3, "primary_strategy": "highest_revenue" },
        "notes": "ADR-004 design question 1: pick primary, stash rest in custom_fields.additional_companies"
      },

      // ─── Group-to-JSONB: route a whole HubSpot group into custom_fields ───
      {
        "source": "_group:requalification_properties",
        "target": "members.custom_fields.requalification",
        "transform": "group_to_jsonb",
        "notes": "ADR-004 design question 3: capture as snapshot until pattern recurs across chapters"
      },

      // ─── Spouse fields → custom_fields.spouse ───
      { "source": "spouse_first_name", "target": "members.custom_fields.spouse.first_name", "transform": "direct_copy" },
      { "source": "spouse_last_name",  "target": "members.custom_fields.spouse.last_name",  "transform": "direct_copy" },
      { "source": "spouse_phone",      "target": "members.custom_fields.spouse.phone",      "transform": "phone_normalize" },

      // ─── Rich exit-survey text → timestamped note ───
      {
        "source": "why_have_you_decided_to_leave_eo_dallas_",
        "target": "members.notes",
        "transform": "append_to_notes",
        "transform_args": { "tag": "hubspot_exit_survey:leaving_reason" }
      }
    ]
  }
}
```

### Targets the transformation library writes to

| Target prefix | Meaning |
|---|---|
| `members.<column>` | Write to a canonical column on `members`. Must match a real column name. |
| `members.custom_fields.<key>` | Write into the JSONB overflow column. Arbitrary key path; no schema constraint. |
| `members.notes` | Append a timestamped, tagged entry into the `notes` JSONB array. |
| `event_attendance` | Emit one or more records into the (Phase 2) `event_attendance` table. |
| `discard` | Deliberately drop. Documented exclusion. |

## Alternatives considered

### (A) Per-chapter connector code

Write `HubSpotConnectorForDallas`, `HubSpotConnectorForHouston`, etc. Each has hardcoded mappings for that chapter's HubSpot.

**Rejected.** Doesn't scale. ~4–8 hours of developer work per chapter onboarding. At 100 chapters, that's 400–800 hours of work that scales linearly with chapter count.

### (B) Single canonical mapping per source type

One `HubSpotConnector` with one hardcoded mapping for *all* HubSpot chapters. Assume their customizations are uniform.

**Rejected.** Empirically false. EO Dallas has 230 custom properties; EO Houston will have 230 different ones; their `membership_status` enum values may differ; their forum lists will entirely differ. The whole reason chapters use a CRM is to model their own operations.

### (C) Mapping-as-data with per-chapter overflow — **selected**

Generic connector code + per-chapter mapping config + a transformation library + a `custom_fields` JSONB column for true overflow that doesn't fit canonical schema.

## Consequences

### Positive

- **Adding a new HubSpot chapter is a config row, not new code.** Chapter EDs (with AI assistance in Phase 3) can self-author or confirm mappings without developer involvement.
- **Adding a new CRM type is one engineering effort, not N efforts.** PipedriveConnector lands once and serves every Pipedrive chapter forever.
- **Schema growth is evidence-based.** When 30+ chapters have a "custom field" with the same semantic, that's a signal to promote it to canonical schema in the next migration — the data tells us what to standardize.
- **The four design questions from EO Dallas (multi-company, Spouse status, requalification group, SLP/spouse fields)** are resolved without preemptively bloating the canonical schema. Custom_fields holds the long tail until evidence justifies promotion.
- **LLM agents in Phase 3 produce mapping config, not code.** The agents are operating on data they can be evaluated against. Same data shape gates their proposals through a human-confirm step.

### Negative / costs

- **Initial transformation library investment.** Need to implement ~12–16 well-tested transforms before the connector is useful. Mitigated by Tier 1 (direct_copy, enum_map, etc.) covering ~80% of typical mappings; the harder ones are written as we encounter them.
- **Mapping config schema is now part of the maintained surface.** Versioned (`mappings.version: 1`), migrated when shape changes incompatibly. Standard pattern.
- **Custom_fields is unstructured.** Querying `where custom_fields.spouse.first_name = 'Jane'` works but isn't indexed by default. Mitigated by GIN indexing on `custom_fields` if/when query patterns demand it. For now, the structured columns serve all canonical queries.

### Implications for the codebase

Already done:

- `lib/connectors/mapping-schema.ts` — TypeScript types for SourceConfig, FieldMapping, TransformName, DataSourcesConfig.
- `chapters.data_sources_config` JSONB column — already exists from the v1.1 schema. This ADR formalizes its shape.

Forthcoming (Phase 1 Week 2):

- `supabase/migrations/<ts>_members_custom_fields.sql` — add `members.custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb`.
- `supabase/migrations/<ts>_add_spouse_status.sql` — add `Spouse` to the `membership_status` enum.
- `lib/connectors/transformations/index.ts` — implementations of the named transforms.
- `lib/connectors/hubspot/HubSpotConnector.ts` — implementation reading from `data_sources_config.hubspot.mappings`.
- `lib/connectors/starter_mappings/hubspot_default_v1.ts` — default mapping for HubSpot's standard contact properties. Chapters' mapping configs reference this and override only the custom-property mappings.
- `lib/jobs/syncConnector.ts` — generic sync orchestration; takes a `DataSource` instance and a mapping config; emits a `SyncResult`.

### Implications for Phase 1

EO Dallas's HubSpot mapping is **authored as data into `chapters.data_sources_config.hubspot.mappings.field_mappings`**, NOT hardcoded in TypeScript. Even though we have one chapter today. This is the entire load-bearing commitment — once made, every future chapter is a config row. The mapping itself is hand-authored from the HubSpot inventory in [docs/hubspot/eo_dallas_custom_properties.md](../hubspot/eo_dallas_custom_properties.md) and the resolutions of the four design questions.

### Implications for Phase 2

- **Admin UI for viewing/editing mappings** — surfaces field_mappings as a table; allows add/edit/delete with field-level validation against the source's discovered_schema.
- **Schema-drift detection** — periodic comparison of current source schema to discovered_schema; reports new/renamed/removed properties on the chapter's admin page.
- **Starter mappings library** — shipped with code; chapters reference one as `starter_mapping_base` and override only what's different.

### Implications for Phase 3

The LLM agents from the scaling brainstorm slot into the existing data shape with no architectural change:

- **Mapping-proposal agent:** input = (Trifecta canonical schema, source's discovered_schema, an existing starter_mapping_base). Output = an array of `FieldMapping` proposals with `proposal_confidence` scores and `authored_by: "agent:claude-sonnet-4-6"`. Admin reviews in the Phase 2 UI; confirmation clears `proposal_confidence` and sets `authored_by: "human"`.
- **Schema-drift agent:** input = discovered_schema diff. Output = update proposals for affected `FieldMapping` rows.
- **Transformation-generation agent:** input = a source pattern that doesn't fit any existing transform. Output = a proposed new `TransformName` + implementation. Requires human + automated test review before adding to the library.

The agents do not replace human judgment. They reduce a chapter onboarding from "days of developer + designer collaboration" to "an hour of admin review."

## The four EO Dallas design-question resolutions (captured in this ADR for permanence)

1. **Multi-company.** Pick primary (highest revenue if known, else `company_1`) → canonical `company_name` / `annual_revenue_range`. Others to `members.custom_fields.additional_companies`. Promote to a `member_companies` table when ≥30 chapters share the pattern.
2. **Spouse membership status.** Add `Spouse` to the `membership_status` enum. Scoring engine treats it like `Staff` — no engagement score, no churn risk.
3. **Requalification group.** Bundle the entire `requalification_properties` HubSpot group into `members.custom_fields.requalification` via the `group_to_jsonb` transform. Don't canonicalize until pattern recurs.
4. **SLP / spouse contact fields.** Route into `members.custom_fields.spouse`. Existing `slp_name`, `slp_engagement_status`, `slp_programs_count_12m` canonical columns continue to hold SLP engagement status (computed); spouse contact details are conceptually separate.

## Open items

- [ ] Implement and test the initial transformation library (Tier 1 first; Tier 3 as encountered).
- [ ] Author `hubspot_default_v1` starter mapping covering HubSpot's standard contact properties.
- [ ] Migration to add `members.custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb`.
- [ ] Migration to add `Spouse` to the `membership_status` enum.
- [ ] Decide whether to GIN-index `members.custom_fields` (defer until query patterns demand).
- [ ] Phase 2: design the admin UI for mapping editing.
- [ ] Phase 3: prompt design for the mapping-proposal agent; eval harness for proposal accuracy on holdout chapters.
- [ ] Promotion criteria: at what evidence level (number of chapters? consistency of field semantics?) does a `custom_fields.X` value graduate to a canonical column?
