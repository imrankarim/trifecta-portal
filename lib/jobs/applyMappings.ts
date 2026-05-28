// Pure mapping application — turns a source-shaped ConnectorRecord into a
// structured WritePlan that the sync orchestrator then executes against the
// database.
//
// This module is INTENTIONALLY pure: no I/O, no Supabase, no fetch. It's the
// most-tested module in the connector layer because correctness here is what
// keeps Trifecta's canonical state aligned with source data across hundreds
// of chapters running different CRMs.
//
// See: docs/adr/ADR-004 (mapping-as-data); ADR-005 (contact_type derivation).

import type { FieldMapping } from "../connectors/mapping-schema";
import type { ConnectorRecord, SourceSchema } from "../connectors/types";
import {
  applyTransform,
  TransformError,
  type TransformContext,
} from "../connectors/transformations";

/** A note entry as it lands on members.notes (sync layer adds `ts` + dedupes). */
export interface NoteEntry {
  text: string;
  source: string;
  source_field?: string;
}

/**
 * The structured output of applyMappings(). The sync layer translates this
 * into actual Supabase writes.
 */
export interface WritePlan {
  /**
   * Derived contact_type from the source's signals. NULL means "no
   * operational signal in this record" — sync layer skips the whole record.
   */
  contactType: string | null;

  /** Canonical column writes to the `members` row (e.g. first_name, email_primary). */
  memberColumns: Record<string, unknown>;

  /**
   * JSONB merge into members.custom_fields. Sync layer does a deep merge by
   * key path — each rule contributes its own keys; never replaces the blob.
   */
  customFields: Record<string, unknown>;

  /** Notes to append (sync layer adds timestamps and dedupes against existing). */
  notes: NoteEntry[];

  /** External IDs to link in member_external_ids ({ source_name: external_id }). */
  externalIds: Record<string, string>;

  /** Per-rule errors encountered during mapping. Surfaced in SyncResult.errors. */
  errors: Array<{ rule: string; target: string; message: string }>;
}

/**
 * Merge starter mappings + chapter mappings. Chapter overrides starter when
 * both have the same `source` field. Returns the effective rule list in
 * order (starter first, then chapter rules that don't override).
 */
export function mergeMappings(
  starter: ReadonlyArray<FieldMapping>,
  chapter: ReadonlyArray<FieldMapping>,
): FieldMapping[] {
  const chapterSources = new Set(chapter.map((r) => r.source));
  const filteredStarter = starter.filter((r) => !chapterSources.has(r.source));
  return [...filteredStarter, ...chapter];
}

/**
 * Apply all mapping rules to a single source record and produce a WritePlan.
 * Pure function — no I/O.
 */
export function applyMappings(
  record: ConnectorRecord,
  starterMappings: ReadonlyArray<FieldMapping>,
  chapterMappings: ReadonlyArray<FieldMapping>,
  schema: SourceSchema | undefined,
): WritePlan {
  const plan: WritePlan = {
    contactType: null,
    memberColumns: {},
    customFields: {},
    notes: [],
    externalIds: { ...record.externalIds } as Record<string, string>,
    errors: [],
  };

  const rules = mergeMappings(starterMappings, chapterMappings);

  for (const rule of rules) {
    const ctx: TransformContext = {
      record: record.sourceProperties,
      fieldName: rule.source,
      schema,
    };

    let value: unknown;
    try {
      // For derived / wildcard / group sources, the transform reads from
      // ctx.record directly. For literal-source rules, look up the value.
      const literalValue = isSpecialSource(rule.source)
        ? null
        : record.sourceProperties[rule.source];

      value = applyTransform(rule.transform, literalValue, rule.transform_args ?? null, ctx);
    } catch (err) {
      const message = err instanceof TransformError ? err.message : String(err);
      plan.errors.push({
        rule: `${rule.transform}(${rule.source})`,
        target: rule.target,
        message,
      });
      continue;
    }

    // Null/undefined output → skip the write. Preserves any existing value
    // on the canonical column (manual admin edits, prior sync values, etc.).
    if (value === null || value === undefined) continue;

    // Dispatch to the right WritePlan slot based on target syntax.
    dispatch(plan, rule, value);
  }

  return plan;
}

/**
 * Recognize special source selectors used by transforms that don't read from
 * a single literal source field (e.g. derive_from_signals, group_to_jsonb,
 * multi_company_primary). For these, the transform reads from ctx.record
 * directly, and the literal lookup is skipped.
 */
function isSpecialSource(source: string): boolean {
  return (
    source.startsWith("_derived:") ||
    source.startsWith("_group:") ||
    source.startsWith("_pattern:") ||
    source.endsWith("_*")
  );
}

function dispatch(plan: WritePlan, rule: FieldMapping, value: unknown): void {
  const target = rule.target;

  // members.contact_type — derive_from_signals (configured for contact_type) goes here
  if (target === "members.contact_type") {
    plan.contactType = String(value);
    return;
  }

  // members.notes — append to plan.notes
  if (target === "members.notes") {
    if (isNoteEntry(value)) {
      plan.notes.push(value);
    } else if (typeof value === "string" || typeof value === "number") {
      plan.notes.push({
        text: String(value),
        source: (rule.transform_args as { tag?: string } | undefined)?.tag ?? "unknown",
        source_field: rule.source,
      });
    } else {
      plan.errors.push({
        rule: `${rule.transform}(${rule.source})`,
        target,
        message: "expected NoteEntry or string for notes target",
      });
    }
    return;
  }

  // members.custom_fields.<key.path>
  if (target.startsWith("members.custom_fields.")) {
    const path = target.slice("members.custom_fields.".length);
    setDeep(plan.customFields, path, value);
    return;
  }

  // members.<column>
  if (target.startsWith("members.")) {
    const column = target.slice("members.".length);
    plan.memberColumns[column] = value;
    return;
  }

  // event_attendance — Phase 1: route to custom_fields.attendance.<event_type>_<year>
  // The mapping config already uses custom_fields.attendance.* targets explicitly,
  // so this branch is a fallback for any forgotten rules.
  if (target === "event_attendance") {
    plan.customFields["_unrouted_attendance"] ??= [];
    (plan.customFields["_unrouted_attendance"] as unknown[]).push(value);
    return;
  }

  if (target === "discard") {
    return;
  }

  plan.errors.push({
    rule: `${rule.transform}(${rule.source})`,
    target,
    message: `unknown target prefix`,
  });
}

function isNoteEntry(v: unknown): v is NoteEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).text === "string" &&
    typeof (v as Record<string, unknown>).source === "string"
  );
}

/**
 * Set a value at a dot-separated key path inside an object, creating
 * intermediate objects as needed. Mutates `obj`.
 *
 *   setDeep({}, "spouse.first_name", "Jane")
 *   → { spouse: { first_name: "Jane" } }
 */
function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
