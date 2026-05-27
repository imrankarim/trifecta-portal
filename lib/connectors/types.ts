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
 * The minimum useful shape every connector should return per member.
 * Unknown fields are `null` (or `undefined` for optionals) — never empty strings.
 * EO-specific fields (membership_status, join_date_original, ...) are only
 * populated when the source actually has them (e.g. HubSpot custom properties).
 */
export interface ConnectorMember {
  externalIds: ExternalIds;

  // §3.1 Identity
  emailPrimary: string;
  emailsAdditional?: string[];
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  phoneMobile?: string | null;
  linkedinUrl?: string | null;

  // §3.3 Geography
  city?: string | null;
  stateProvince?: string | null;
  /** ISO 3166-1 alpha-2. Sync layer normalizes other formats. */
  country?: string | null;

  // §3.4 Business
  companyName?: string | null;
  jobTitle?: string | null;
  industryVertical?: string | null;
  companyWebsite?: string | null;

  // §3.2 EO Membership — only populated when source has it
  membershipStatus?: string | null;
  /** ISO date string YYYY-MM-DD. */
  joinDateOriginal?: string | null;

  // Sync metadata
  /** ISO timestamp — source's notion of last-modified. Used for incremental sync. */
  sourceLastModifiedAt?: string | null;
}

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
