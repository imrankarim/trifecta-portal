# ADR-003 — Multi-CRM external IDs via `member_external_ids`

**Status:** Accepted (2026-05-26)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 (schema + connector layer); Phase 2+ (every additional CRM connector inherits this shape)
**Related:** [v1.1 §2.2 DataSource](../Trifecta_Developer_Specification_v1.1.md), [v1.1 §2.3 Trifecta-owned PKs](../Trifecta_Developer_Specification_v1.1.md), [v1.1 §2.4 EO Global ID](../Trifecta_Developer_Specification_v1.1.md), [ADR-001 — Drive ingestion](ADR-001-google-drive-ingestion-access-model.md)
**Supersedes:** none

---

## Context

Trifecta Phase 1 builds against EO Dallas's HubSpot portal. The v1.1 schema, written for that single chapter, modeled the HubSpot contact ID as a dedicated column on `members`:

```sql
hubspot_contact_id TEXT,
CONSTRAINT members_hubspot_chapter_uq UNIQUE (chapter_id, hubspot_contact_id),
CREATE INDEX idx_members_hubspot_contact_id ON members (hubspot_contact_id) WHERE hubspot_contact_id IS NOT NULL;
```

That works for one chapter. It does not scale to the multi-chapter reality:

- **Many chapters don't use HubSpot.** They use Pipedrive, Go High Level, Chapter Pro, Airtable, a Google Sheet, or no CRM at all.
- **Some chapters use multiple sources for the same member.** A chapter could have HubSpot for current members and a Google Sheet for the recruitment pipeline, with the same person appearing in both.
- **Chapters change CRMs.** A move from one CRM to another should be a connector swap, not a data migration.

Hard-coding `hubspot_contact_id` as a column biases the entire schema toward one specific CRM, and a future schema migration to add `pipedrive_person_id`, `gohighlevel_contact_id`, `chapter_pro_member_id` (etc.) leads to column sprawl, sparse data, and per-source business-logic branches throughout the codebase.

This ADR fixes the gap before any connector code is written. The `DataSource` interface in [lib/connectors/DataSource.ts](../../lib/connectors/DataSource.ts) is already CRM-agnostic; only the storage layer needed alignment.

## Decision

**Move all per-source external identifiers — except `eo_global_member_id` — out of dedicated columns and into a new normalized table `member_external_ids`.** Per-source IDs become rows keyed by `source_name`, not columns. Adding a new CRM requires no schema change.

`eo_global_member_id` stays a top-level column on `members`, indexed and nullable-unique, because it has unique global meaning per v1.1 §2.4 — it is the canonical cross-chapter dedup key, not just one source's identifier.

### Schema shape

```sql
CREATE TABLE public.member_external_ids (
  member_id        UUID         NOT NULL REFERENCES members(trifecta_member_id) ON DELETE CASCADE,
  chapter_id       UUID         NOT NULL REFERENCES chapters(trifecta_chapter_id),
  source_name      TEXT         NOT NULL,                       -- 'hubspot' | 'pipedrive' | 'gohighlevel' | 'chapter_pro' | ...
  external_id      TEXT         NOT NULL,
  source_metadata  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  linked_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (member_id, source_name),
  UNIQUE (chapter_id, source_name, external_id)
);
```

Indexes on `(chapter_id, source_name)` and `(source_name, external_id)`. RLS enables `SELECT` for the row's chapter only; `INSERT`/`UPDATE`/`DELETE` are service-role only (sync jobs and admin operations).

### Code shape

`lib/connectors/types.ts` defines `ExternalIds` as a flat `source_name → external_id` map, mirroring the table exactly:

```ts
export type KnownSourceName =
  | "hubspot" | "pipedrive" | "gohighlevel" | "chapter_pro"
  | "google_sheets" | "google_drive_mailbox" | "eo_global" | "native";

export type ExternalIds = Partial<Record<KnownSourceName, string>> & {
  [extraSource: string]: string | undefined;
};
```

`KnownSourceName` provides autocomplete for the sources we've enumerated; the open extension allows new sources without a code change.

## Alternatives considered

### (A) Add a new column per CRM as chapters onboard

Keep `hubspot_contact_id`. Add `pipedrive_person_id`, `gohighlevel_contact_id`, etc. as needed.

**Rejected.** Schema migration per new CRM is exactly the friction we're trying to eliminate. Causes sparse columns, query verbosity ("which of these eight ID columns is populated?"), and per-source code branches. The v1.1 spec's §2 emphasis on the DataSource abstraction implicitly assumes a generic storage layer too, but the original schema didn't deliver on that.

### (B) Single generic `external_ids` JSONB column on members

`members.external_ids JSONB DEFAULT '{}'::jsonb`, holding `{hubspot: "...", pipedrive: "..."}`.

**Rejected.** Querying by external ID requires GIN indexes on JSONB keys, which work but are less efficient than B-tree on a normalized column for the lookup pattern `WHERE source = 'hubspot' AND external_id = 'X'`. JSONB also doesn't naturally enforce per-(chapter, source) uniqueness — which is operationally important to prevent duplicate sync inserts.

### (C) `member_external_ids` normalized table — **selected**

Properly normalized, indexable per-source, enforces uniqueness, scales to arbitrary sources without schema change. The conventional shape.

## Consequences

### Positive

- **Adding a new CRM is a connector implementation + config change, never a schema change.** `PipedriveConnector implements DataSource`, drop it in `lib/connectors/`, set `chapters.data_sources_config.pipedrive = {api_key: ...}`, and the existing sync orchestration just works.
- **One member can have IDs in multiple sources simultaneously.** A member appearing in both HubSpot (current state) and Google Sheets (historical pipeline) gets two rows in `member_external_ids` and one row in `members`. Trifecta's queries continue to use the Trifecta UUID; cross-source reconciliation is connector logic, not schema logic.
- **Chapter CRM migrations are just connector swaps.** New chapter onboards on Pipedrive, switches to HubSpot 18 months later: deactivate `pipedrive` in `data_sources_config`, activate `hubspot`, let the sync rebuild. Existing `member_external_ids` rows for `pipedrive` stay as history; new `hubspot` rows accumulate.
- **The recruiter test is passed visibly.** Anyone evaluating the codebase looking for "did they design for the multi-CRM reality?" finds this ADR plus the table plus the type, immediately.

### Negative / costs

- **One join required for cross-source lookup.** Finding "the member whose HubSpot ID is X" is `SELECT m.* FROM members m JOIN member_external_ids x ON x.member_id = m.trifecta_member_id WHERE x.source_name = 'hubspot' AND x.external_id = 'X'`. Indexed on both sides; negligible cost in practice.
- **One extra table to keep in sync.** `member_external_ids` updates and `members` updates need atomic transactions during sync. Standard pattern; not novel.
- **`source_name` values are unenforced TEXT.** A typo in a connector's `sourceName` ("hubspott") would silently create unfindable rows. Mitigated by `KnownSourceName` autocomplete in TypeScript and by a soft check in the sync layer that warns on unknown source names. Could become a Postgres enum if it stabilizes; not worth doing yet.

### Implications for the codebase

Already done as part of this ADR's landing:

- `supabase/migrations/20260526230000_member_external_ids.sql` — creates the table with RLS, backfills any existing `hubspot_contact_id` values, drops the old column + constraint + index. Applied to staging.
- `lib/connectors/types.ts` — `ExternalIds` is now a source-name-keyed map with `KnownSourceName` enum for autocomplete.
- `lib/connectors/DataSource.ts` — unchanged. Interface was already CRM-agnostic.

Forthcoming, when the HubSpot connector lands (Week 2):

- The sync layer inserts to `member_external_ids` keyed on `(member_id, 'hubspot')` rather than updating `members.hubspot_contact_id`.
- The connector's `ConnectorMember.externalIds.hubspot` value is consumed via `ExternalIds["hubspot"]` lookup, not a per-source field.
- Per-chapter connector config in `chapters.data_sources_config` follows the shape `{hubspot: {private_app_token, last_sync_at, sync_interval_hours}, ...}` — already a generic per-source bag, no change needed.

### Implications for Phase 1

None beyond what's already done. The HubSpot connector and sync function will be written against the new table from day one — no transitional double-writes, no temporary back-compat.

### Implications for Phase 2+

Phase 2 connectors inherit this shape directly:

- `GoogleDriveConnector` (ADR-001) — `source_name = 'google_drive_mailbox'`, `external_id = Drive file id` for docs that map to members (most won't), or stored on `meeting_summaries.source_message_id` for emails (ADR-002).
- `PipedriveConnector` / `GoHighLevelConnector` / `ChapterProConnector` — same pattern as `HubSpotConnector`.
- `NativeCRMConnector` — `source_name = 'native'`, `external_id = trifecta_member_id` (degenerate but uniform).

## Open items

- [ ] When the second CRM connector lands (Phase 2+), revisit whether `source_name` should be promoted from TEXT to a Postgres enum. Defer until the set of source names stabilizes.
- [ ] When `members.eo_global_member_id` is populated (currently nullable, awaiting either EO Global API access or manual entry), confirm that the `source_name = 'eo_global'` row in `member_external_ids` is NOT also created — that field stays exclusively on `members` per v1.1 §2.4. Document in code comments at the sync layer.
