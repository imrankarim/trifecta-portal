// Per-chapter, per-source mapping configuration. Lives in
// chapters.data_sources_config[source_name]. See docs/adr/ADR-004.
//
// Architecture summary (full detail in ADR-004):
//
//   1. Connector CODE is generic per source type (HubSpot, Pipedrive, ...).
//   2. Mapping CONFIG is per-chapter data, stored as JSONB on chapters.
//   3. A small TRANSFORMATION library does the per-mapping work.
//   4. Adding a new chapter on a known CRM is a config edit, not new code.
//   5. Phase 3 LLM agents propose mapping configs from the source's
//      discovered schema; humans confirm. This file is the data shape they
//      produce and consume.

/**
 * Names of the built-in transformations the sync layer ships with. Adding a
 * new transform name is a code change (the runtime needs an implementation);
 * authoring a new MAPPING that uses an existing transform is a data change.
 *
 * Keep transforms small, composable, and well-tested — they are the most
 * leveraged code in the connector layer.
 */
export type TransformName =
  // Tier 1 — covers ~80% of typical mappings
  | "direct_copy"            // source value → target, unchanged
  | "enum_map"               // value_map: { sourceValue: targetValue, ... }
  | "enum_map_after_strip"   // strip_pattern: regex, then enum_map
  | "iso_date"               // parse to YYYY-MM-DD
  | "iso_datetime"           // parse to ISO timestamp
  | "bool_from_yes_no"       // "Yes"/"true"/1 → true; "No"/"false"/0 → false

  // Tier 2 — patterns we've seen in real data
  | "bool_from_keyword"      // bool from a custom truthy keyword list
  | "concat"                 // join multiple source fields with separator
  | "phone_normalize"        // strip formatting; emit E.164
  | "email_normalize"        // lowercase, trim
  | "array_of_text"          // multi-select / CSV → TEXT[]
  | "append_to_notes"        // append timestamped entry to members.notes JSONB

  // Tier 3 — domain-specific transforms for known weird shapes
  | "checkbox_years_to_history"     // EO Dallas dallas_bod pattern
  | "multi_select_to_attendance"    // EO Dallas n24_25_learning_event pattern
  | "multi_company_primary"         // primary + spillover into custom_fields
  | "group_to_jsonb"                // bundle a source field-group into JSONB
  | "derive_from_signals";          // multi-field signal-precedence rule engine
                                    // (originally introduced as derive_contact_type;
                                    //  generalized for any signal-derived field)

/**
 * One mapping rule: take a source value, transform it, write it to a target.
 *
 * `target` syntax:
 *   "members.<column>"                — write to a canonical column
 *   "members.custom_fields.<key>"     — write into the JSONB overflow column
 *   "members.notes"                   — append to the notes array (via append_to_notes)
 *   "event_attendance"                — emit records into the event_attendance table
 *   "discard"                         — drop deliberately (documented exclusion)
 *
 * `source` syntax (most are literal source field names; special selectors):
 *   "<field_name>"                    — literal source field
 *   "<prefix>_*"                      — every source field with the prefix
 *   "_group:<groupName>"              — every source field within a named group
 *                                       (e.g. HubSpot's groupName)
 */
export interface FieldMapping {
  source: string;
  target: string;
  transform: TransformName;
  /**
   * Args specific to the transform. Shape varies by transform — runtime
   * validates against the transform's schema. See ADR-004 for examples per
   * transform.
   */
  transform_args?: Record<string, unknown>;

  /** Free-text annotation from the admin / agent who authored this row. */
  notes?: string;
  /** When an LLM agent proposed this row, the agent's confidence (0–1).
   *  Cleared (set null) when a human confirms. */
  proposal_confidence?: number | null;
  /** Who/what authored this row. 'human' | 'starter' | 'agent:<model>'. */
  authored_by?: string;
  /** ISO timestamp this row was last authored or confirmed. */
  authored_at?: string;
}

export interface SourceFieldMappings {
  /** Bump when the shape of FieldMapping changes incompatibly. */
  version: 1;
  /** Reference to a built-in starter mapping pack this config extends. */
  starter_mapping_base?: string;
  /** Snapshot of the source's schema at the time mappings were authored.
   *  Used by Phase 2 schema-drift detection to surface "new properties". */
  discovered_schema?: unknown[];
  discovered_schema_snapshot_at?: string;
  field_mappings: FieldMapping[];
}

export interface ConnectorCredential {
  type: "private_app_token" | "service_key" | "oauth_refresh_token" | "api_key";
  /** Raw credential value. Plaintext in Phase 1 staging — service-role-only
   *  read access is the current control. Supabase Vault wraps this in Phase 2. */
  token: string;
  refresh_token?: string;
  /** ISO timestamp — for OAuth refresh management. */
  expires_at?: string;
}

export interface SourceLastSyncResult {
  started_at: string;
  finished_at: string;
  members_fetched: number;
  members_upserted: number;
  members_failed: number;
  errors: string[];
}

export interface SourceConfig {
  credential: ConnectorCredential;
  /** When this source was first linked to the chapter. */
  linked_at: string;
  enabled: boolean;
  last_sync_at?: string;
  last_sync_result?: SourceLastSyncResult;
  /** The mapping config. Authored once per chapter; iteratively refined. */
  mappings: SourceFieldMappings;
}

/**
 * The full shape of chapters.data_sources_config. Each source the chapter is
 * connected to gets a key. Sources we've enumerated get typed config; unknown
 * sources fall through the open extension.
 */
export interface DataSourcesConfig {
  hubspot?: SourceConfig;
  pipedrive?: SourceConfig;
  gohighlevel?: SourceConfig;
  chapter_pro?: SourceConfig;
  google_sheets?: SourceConfig;
  /** ADR-001 — per-chapter Workspace mailbox for Drive content. */
  google_drive_mailbox?: SourceConfig;
  /** ADR-002 — same mailbox, AI meeting summaries. */
  meeting_ingestion?: SourceConfig;
  [extraSource: string]: SourceConfig | undefined;
}
