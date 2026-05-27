// The DataSource abstraction — every external system that Trifecta reads from
// or writes to (HubSpot, Google Sheets, the chapter mailbox per ADR-001/002,
// the future native CRM) implements this interface.
//
// Per v1.1 §2.2:
//   "Every external data source must be implemented as a connector satisfying
//    a standard DataSource interface."
//
// The scoring and intelligence layers never know which connector is active
// — they consume canonical Trifecta state, which the sync layer populates
// from any DataSource. This is the Strangler Fig pattern that lets us swap
// HubSpot for the native CRM later without rewriting business logic.

import type {
  ConnectorMember,
  ConnectorAttendanceRecord,
  ConnectorPipelineStage,
  OutreachOutcomeWrite,
} from "./types";

export interface DataSource {
  /**
   * Stable connector identifier. Used in logs, audit trails, and the
   * `data_sources_active` array on the Member row.
   * Examples: 'hubspot' | 'google_sheets' | 'google_drive_mailbox' | 'native'.
   */
  readonly sourceName: string;

  /**
   * The Trifecta chapter this connector instance is scoped to.
   * Connector instances are NEVER shared across chapters — mirrors the
   * RLS chapter-isolation rule and ADR-001's per-chapter mailbox model.
   */
  readonly chapterId: string;

  /**
   * Return all member records the source knows about.
   * @param opts.since — if provided, return only records modified at or after this timestamp.
   *                    Connectors that don't support incremental sync may ignore this and return all.
   * @returns normalized ConnectorMember[]. Empty array if connector has no members.
   */
  getMembers(opts?: { since?: Date }): Promise<ConnectorMember[]>;

  /**
   * Return event / forum attendance records.
   * @returns ConnectorAttendanceRecord[]. Empty array if connector doesn't expose attendance.
   */
  getAttendanceRecords(opts?: { since?: Date }): Promise<ConnectorAttendanceRecord[]>;

  /**
   * Return membership pipeline / lifecycle stage observations.
   * @returns ConnectorPipelineStage[]. Empty array if connector doesn't expose pipeline.
   */
  getPipelineStages(): Promise<ConnectorPipelineStage[]>;

  /**
   * Write a board action back to the source (e.g. "logged outreach call,
   * outcome positive"). Phase 2+. Phase 1 implementations throw NotSupportedError.
   */
  writeOutcome(outcome: OutreachOutcomeWrite): Promise<void>;
}

/**
 * Thrown when a connector is asked to perform an operation it doesn't yet
 * support (typically writeOutcome in Phase 1, or capability methods on
 * read-only connectors).
 */
export class NotSupportedError extends Error {
  constructor(method: string, sourceName: string) {
    super(`${sourceName} connector does not support ${method}`);
    this.name = "NotSupportedError";
  }
}

/**
 * Thrown when a connector's per-chapter credentials are missing or malformed
 * (typically a missing api token in chapters.data_sources_config). The sync
 * layer catches this and records it in SyncResult.errors rather than crashing.
 */
export class ConnectorConfigError extends Error {
  constructor(sourceName: string, detail: string) {
    super(`${sourceName} connector: ${detail}`);
    this.name = "ConnectorConfigError";
  }
}
