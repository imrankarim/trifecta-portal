// Connector-agnostic data shapes returned by DataSource implementations.
//
// These are the "wire format" between any external source (HubSpot, Google
// Sheets, the chapter mailbox in ADR-001/002, the future native CRM) and the
// sync layer that upserts into Trifecta's canonical members / events tables.
//
// Connectors must NOT know about Trifecta's internal UUIDs or row shapes.
// They produce these types; the sync layer translates to canonical state.
//
// See: v1.1 spec §2.2 (DataSource Abstraction Layer), §2.3 (Trifecta-owned PKs),
// §2.4 (eo_global_member_id), §3 (Member field reference).

/**
 * Lowercase, connector-stable identifier of a known source.
 * Adding a new CRM (e.g. 'pipedrive', 'gohighlevel', 'chapter_pro') means
 * adding it here for autocomplete — the storage layer needs no change because
 * member_external_ids keys on source_name as TEXT (see ADR-003).
 *
 * Must match DataSource.sourceName in lib/connectors and member_external_ids.source_name.
 */
export type KnownSourceName =
  | "hubspot"
  | "pipedrive"
  | "gohighlevel"
  | "chapter_pro"
  | "google_sheets"
  | "google_drive_mailbox"
  | "eo_global"
  | "native";

/**
 * External identifiers a connector might know about a member.
 * Trifecta resolves these to its own `trifecta_member_id` via the sync layer.
 * Per v1.1 §2.3 these are always SECONDARY references, never used as PKs.
 *
 * Shape mirrors the member_external_ids table (ADR-003): a flat
 * source_name → external_id map. A given member can have IDs from
 * multiple sources at once.
 *
 * Exception: `eoGlobalMemberId` stays a top-level column on members per
 * v1.1 §2.4 (canonical cross-chapter identifier) — surfaced here as a
 * convenience key, but the canonical location is members.eo_global_member_id.
 */
export type ExternalIds = Partial<Record<KnownSourceName, string>> & {
  /** Open extension point — any source name we haven't enumerated yet still works. */
  [extraSource: string]: string | undefined;
};

/**
 * A raw source record from any connector. Per ADR-004 the connector returns
 * SOURCE-SHAPED data — every property the source has, untransformed. The sync
 * layer applies the chapter's mapping rules (starter + chapter-specific) to
 * turn these into canonical members + custom_fields + notes writes.
 *
 * Connector code does NOT pre-map firstname→first_name or anything else.
 * That's the mapping config's job.
 */
export interface ConnectorRecord {
  /** External identifiers — typically just one (the source's own ID) at fetch time. */
  externalIds: ExternalIds;
  /**
   * Every property this source returned for this record. Keys match the
   * source's own property names (e.g. HubSpot: "firstname", "membership_status",
   * "dallas_bod"). Values are whatever the source's API returned — strings,
   * numbers, arrays, booleans, nulls.
   */
  sourceProperties: Record<string, unknown>;
  /** ISO timestamp — source's notion of last-modified. Used for incremental sync. */
  sourceLastModifiedAt?: string | null;
}

/**
 * Per-property metadata from the source's schema endpoint. Used by the sync
 * layer to populate TransformContext.schema (for transforms like
 * group_to_jsonb) and for Phase 2 schema-drift detection.
 */
export interface SourceProperty {
  /** Redundant when the schema is keyed by name (the typical case); optional for that reason. */
  name?: string;
  label?: string;
  groupName?: string;
  type?: string;       // e.g. HubSpot: "string" | "enumeration" | "number" | "date" | "datetime" | "bool"
  fieldType?: string;  // e.g. HubSpot: "text" | "select" | "radio" | "checkbox" | "textarea" | "booleancheckbox" | "date"
  options?: Array<{ value: string; label: string }>;
}

/** Source schema keyed by property name. Returned by DataSource.discoverSchema(). */
export type SourceSchema = Record<string, SourceProperty>;

/**
 * One attendance event observation per member.
 * The sync layer aggregates these into the per-member rate fields on members.
 */
export interface ConnectorAttendanceRecord {
  memberExternalIds: ExternalIds;
  /** Connector-stable event identifier. */
  eventId: string;
  eventName?: string;
  eventType: "forum" | "local" | "global" | "slp" | "learning" | "other";
  /** ISO date YYYY-MM-DD. */
  eventDate: string;
  attended: boolean;
}

/**
 * Membership pipeline state from a CRM (e.g. HubSpot lifecycle stage).
 * Free-form `stage` string per source; sync layer maps to membership_status enum.
 */
export interface ConnectorPipelineStage {
  memberExternalIds: ExternalIds;
  stage: string;
  enteredAt?: string;
  notes?: string | null;
}

/**
 * A board action to write back to the source. Phase 2+.
 * Per v1.1 §2.2 — Phase 1 HubSpot connector throws NotSupportedError.
 */
export interface OutreachOutcomeWrite {
  /** External ids of the target member (sync layer resolves Trifecta UUID → external ids before calling). */
  memberExternalIds: ExternalIds;
  action: string;
  result: string;
  /** ISO timestamp of when the outreach occurred. */
  performedAt: string;
  notes?: string | null;
}

/**
 * Result envelope returned by the sync layer's run-of-a-connector. Surfaced
 * in the /admin UI and the cron job logs so failures are visible.
 */
export interface SyncResult {
  /** Connector source name, e.g. 'hubspot'. */
  source: string;
  chapterId: string;
  startedAt: string;
  finishedAt: string;
  membersFetched: number;
  membersUpserted: number;
  membersFailed: number;
  errors: string[];
}
