// Named, reusable transformations referenced by connector mapping configs.
// See: docs/adr/ADR-004-connector-mapping-as-data.md
//
// This file is the entire transformation library — small, deliberately so.
// Adding a NEW transform here is a code change (with tests). Authoring a
// MAPPING that uses an existing transform is a data change (per chapter,
// stored in chapters.data_sources_config).
//
// Transforms are pure functions:  (sourceValue, args, ctx) → outputValue.
// They throw `TransformError` on bad input or args. The sync layer catches
// these and surfaces them in the per-chapter `last_sync_result.errors` list.

import type { TransformName } from "./mapping-schema";

/** Loose context handed to every transform. Most don't need it. */
export interface TransformContext {
  /** The full source record — lets a transform peek at related fields if needed. */
  record?: Record<string, unknown>;
  /** Source field name — included in error messages for debuggability. */
  fieldName?: string;
  /**
   * Per-source-property metadata, keyed by property name. Populated by the
   * sync layer from the source's discovered_schema. Lets transforms like
   * group_to_jsonb know which source fields belong to a given group.
   */
  schema?: Record<
    string,
    {
      groupName?: string;
      type?: string;
      fieldType?: string;
      label?: string;
      options?: Array<{ value: string; label: string }>;
    }
  >;
}

export class TransformError extends Error {
  constructor(public readonly transform: string, message: string, public readonly fieldName?: string) {
    super(
      fieldName
        ? `[${transform}] ${fieldName}: ${message}`
        : `[${transform}] ${message}`,
    );
    this.name = "TransformError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True for the values that map cleanly to "no value" — null, undefined, or "" after trim. */
function isAbsent(v: unknown): v is null | undefined | "" {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

/** Read an arg as a typed object, throwing if it's missing or wrong shape. */
function requireArgs<T extends object>(
  transform: TransformName,
  args: unknown,
  fieldName: string | undefined,
  description: string,
): T {
  if (args === null || args === undefined || typeof args !== "object") {
    throw new TransformError(transform, `requires args: ${description}`, fieldName);
  }
  return args as T;
}

// ---------------------------------------------------------------------------
// Tier 1 — covers ~80% of typical mappings
// ---------------------------------------------------------------------------

/** Pass the value through unchanged, normalizing absent values to null. */
function direct_copy(value: unknown): unknown {
  if (isAbsent(value)) return null;
  return value;
}

/**
 * Exact-value lookup in a value_map. Unmatched values fall back to `default`
 * if provided, or throw.
 *
 * args:
 *   { value_map: { "SourceVal": "TargetVal", ... }, default?: <any> | null }
 */
interface EnumMapArgs {
  value_map: Record<string, unknown>;
  default?: unknown;
}
function enum_map(value: unknown, args: unknown, ctx: TransformContext = {}): unknown {
  if (isAbsent(value)) return null;
  const a = requireArgs<EnumMapArgs>("enum_map", args, ctx.fieldName, "{ value_map, default? }");
  if (!a.value_map || typeof a.value_map !== "object") {
    throw new TransformError("enum_map", "args.value_map must be an object", ctx.fieldName);
  }
  const key = String(value);
  if (Object.prototype.hasOwnProperty.call(a.value_map, key)) {
    return a.value_map[key];
  }
  if ("default" in a) {
    return a.default;
  }
  throw new TransformError(
    "enum_map",
    `value "${key}" not in value_map and no default provided`,
    ctx.fieldName,
  );
}

/**
 * Strip a regex pattern from the source string, then run enum_map.
 * Useful for source values that decorate their canonical key (e.g. HubSpot's
 * renewal_status: "💚 Confirmed Renew", "♥️ At Risk", ...).
 *
 * args:
 *   { strip_pattern: "<regex source>", value_map: {...}, default?: <any> }
 */
interface EnumMapAfterStripArgs extends EnumMapArgs {
  strip_pattern: string;
}
function enum_map_after_strip(value: unknown, args: unknown, ctx: TransformContext = {}): unknown {
  if (isAbsent(value)) return null;
  const a = requireArgs<EnumMapAfterStripArgs>(
    "enum_map_after_strip",
    args,
    ctx.fieldName,
    "{ strip_pattern, value_map, default? }",
  );
  if (typeof a.strip_pattern !== "string") {
    throw new TransformError(
      "enum_map_after_strip",
      "args.strip_pattern must be a regex source string",
      ctx.fieldName,
    );
  }
  let rx: RegExp;
  try {
    rx = new RegExp(a.strip_pattern, "gu");
  } catch (e) {
    throw new TransformError(
      "enum_map_after_strip",
      `invalid strip_pattern regex: ${(e as Error).message}`,
      ctx.fieldName,
    );
  }
  const stripped = String(value).replace(rx, "").trim();
  return enum_map(stripped, { value_map: a.value_map, default: a.default }, ctx);
}

/**
 * Parse various inputs to an ISO date string (YYYY-MM-DD).
 * Accepts: ISO 8601 strings, US-format "MM/DD/YYYY", milliseconds-since-epoch (number).
 */
function iso_date(value: unknown, _args: unknown, ctx: TransformContext = {}): string | null {
  if (isAbsent(value)) return null;
  const d = parseDate(value);
  if (!d || !isReasonableDate(d)) {
    throw new TransformError("iso_date", `cannot parse "${String(value)}" as a date`, ctx.fieldName);
  }
  return formatYMD(d);
}

/**
 * Parse to a full ISO 8601 timestamp (UTC). Same input set as iso_date.
 */
function iso_datetime(value: unknown, _args: unknown, ctx: TransformContext = {}): string | null {
  if (isAbsent(value)) return null;
  const d = parseDate(value);
  if (!d || !isReasonableDate(d)) {
    throw new TransformError(
      "iso_datetime",
      `cannot parse "${String(value)}" as a datetime`,
      ctx.fieldName,
    );
  }
  return d.toISOString();
}

/**
 * Yes/No → boolean. Accepts common variations. Returns null for absent values
 * — preserves "we don't know" rather than asserting false.
 *
 * Truthy: true, "true", "True", "yes", "Yes", "Y", "y", 1, "1"
 * Falsy:  false, "false", "False", "no", "No", "N", "n", 0, "0"
 */
function bool_from_yes_no(value: unknown, _args: unknown, ctx: TransformContext = {}): boolean | null {
  if (isAbsent(value)) return null;
  if (typeof value === "boolean") return value;
  const v = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  throw new TransformError(
    "bool_from_yes_no",
    `cannot interpret "${String(value)}" as Yes/No`,
    ctx.fieldName,
  );
}

/**
 * Normalize an email: trim + lowercase. Doesn't validate — caller can if needed.
 */
function email_normalize(value: unknown): string | null {
  if (isAbsent(value)) return null;
  return String(value).trim().toLowerCase();
}

/**
 * Best-effort E.164 phone normalization.
 * - Strips formatting characters
 * - Honors an explicit "+" prefix (assumed already country-coded)
 * - Otherwise prepends the args.default_country_code (default "+1") if length matches a national number
 *
 * Limitations: not libphonenumber. Good enough for staging US data; revisit
 * if/when we encounter many international chapters.
 *
 * args: { default_country_code?: string }  // e.g. "+1", "+44"
 */
interface PhoneNormalizeArgs {
  default_country_code?: string;
}
function phone_normalize(value: unknown, args: unknown, ctx: TransformContext = {}): string | null {
  if (isAbsent(value)) return null;
  const a = (args ?? {}) as PhoneNormalizeArgs;
  const defaultCc = a.default_country_code ?? "+1";

  const raw = String(value).trim();
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      throw new TransformError("phone_normalize", `unexpected length for "${raw}"`, ctx.fieldName);
    }
    return `+${digits}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCc}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 0) return null;
  throw new TransformError(
    "phone_normalize",
    `cannot normalize "${raw}" — got ${digits.length} digits and no country code`,
    ctx.fieldName,
  );
}

// ---------------------------------------------------------------------------
// Internal date parsing helpers
// ---------------------------------------------------------------------------

function parseDate(value: unknown): Date | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Date(value);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;
    // ISO-ish: let Date try
    const isoTry = new Date(s);
    if (!isNaN(isoTry.getTime())) return isoTry;
    // US M/D/Y or MM/DD/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, mm, dd, yyyy] = m;
      const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function isReasonableDate(d: Date): boolean {
  const y = d.getUTCFullYear();
  return y >= 1900 && y <= 2100;
}

function formatYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Tier 2 — supporting transforms
// ---------------------------------------------------------------------------

/**
 * Boolean from a configurable keyword list. Case-insensitive matching.
 * Returns null for absent values; throws for unrecognized.
 *
 * args: { true_values: string[], false_values?: string[] }
 */
interface BoolFromKeywordArgs {
  true_values: string[];
  false_values?: string[];
}
function bool_from_keyword(value: unknown, args: unknown, ctx: TransformContext = {}): boolean | null {
  if (isAbsent(value)) return null;
  const a = requireArgs<BoolFromKeywordArgs>(
    "bool_from_keyword",
    args,
    ctx.fieldName,
    "{ true_values, false_values? }",
  );
  if (!Array.isArray(a.true_values)) {
    throw new TransformError("bool_from_keyword", "args.true_values must be an array", ctx.fieldName);
  }
  const v = String(value).trim().toLowerCase();
  if (a.true_values.some((t) => t.toLowerCase() === v)) return true;
  if (Array.isArray(a.false_values) && a.false_values.some((f) => f.toLowerCase() === v)) {
    return false;
  }
  // Default falsy if false_values not specified
  if (!a.false_values) {
    return false;
  }
  throw new TransformError(
    "bool_from_keyword",
    `value "${v}" matched neither true_values nor false_values`,
    ctx.fieldName,
  );
}

/**
 * Join multiple source fields into one string. Reads each source from
 * ctx.record. Absent values are skipped. Returns null if all sources absent.
 *
 * args: { sources: string[], separator?: string }
 *
 * The `value` argument is ignored (we use ctx.record); the mapping rule's
 * `source` field is documentation only when this transform is in play.
 */
interface ConcatArgs {
  sources: string[];
  separator?: string;
}
function concat(_value: unknown, args: unknown, ctx: TransformContext = {}): string | null {
  const a = requireArgs<ConcatArgs>("concat", args, ctx.fieldName, "{ sources, separator? }");
  if (!Array.isArray(a.sources)) {
    throw new TransformError("concat", "args.sources must be an array of source field names", ctx.fieldName);
  }
  const sep = a.separator ?? " ";
  const parts: string[] = [];
  for (const key of a.sources) {
    const v = ctx.record?.[key];
    if (!isAbsent(v)) parts.push(String(v).trim());
  }
  if (parts.length === 0) return null;
  return parts.join(sep);
}

/**
 * Multi-select / CSV → TEXT[].
 * Accepts an already-arrayed value (HubSpot enumeration/checkbox returns these
 * as semicolon-separated strings) or a string we split on `separator`.
 *
 * args: { separator?: string }   // default ";"  (HubSpot's convention)
 */
interface ArrayOfTextArgs {
  separator?: string;
}
function array_of_text(value: unknown, args: unknown): string[] | null {
  if (isAbsent(value)) return null;
  const a = (args ?? {}) as ArrayOfTextArgs;
  const sep = a.separator ?? ";";
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((s) => s.length > 0);
  }
  return String(value)
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build a structured note entry to be appended to members.notes JSONB.
 * The TRANSFORM returns the note record; the SYNC LAYER is responsible for
 * adding `ts` (now) and deduping against existing notes by (source, source_field, text).
 *
 * args: { tag: string }
 */
interface AppendToNotesArgs {
  tag: string;
}
interface NoteEntry {
  text: string;
  source: string;
  source_field?: string;
}
function append_to_notes(value: unknown, args: unknown, ctx: TransformContext = {}): NoteEntry | null {
  if (isAbsent(value)) return null;
  const a = requireArgs<AppendToNotesArgs>("append_to_notes", args, ctx.fieldName, "{ tag }");
  if (typeof a.tag !== "string" || a.tag.trim() === "") {
    throw new TransformError("append_to_notes", "args.tag must be a non-empty string", ctx.fieldName);
  }
  return {
    text: String(value),
    source: a.tag,
    ...(ctx.fieldName ? { source_field: ctx.fieldName } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tier 3 — domain-specific transforms for known weird patterns
// ---------------------------------------------------------------------------

/**
 * Parse a multi-select of year-range strings ("2025-2026", "2024-2025", ...)
 * into a board_roles_history JSONB array. Pattern observed on EO Dallas
 * HubSpot's `dallas_bod` field.
 *
 * Each year range "YYYY1-YYYY2" → { role, start_date: "YYYY1-07-01", end_date: "YYYY2-06-30" }
 * (EO fiscal year is July to June.)
 *
 * args: { role: string, start_month_day?: string, end_month_day?: string }
 *       defaults: start_month_day "07-01", end_month_day "06-30"
 */
interface CheckboxYearsToHistoryArgs {
  role: string;
  start_month_day?: string; // "MM-DD"
  end_month_day?: string;   // "MM-DD"
}
interface BoardRoleEntry {
  role: string;
  start_date: string;
  end_date: string;
}
function checkbox_years_to_history(
  value: unknown,
  args: unknown,
  ctx: TransformContext = {},
): BoardRoleEntry[] | null {
  if (isAbsent(value)) return null;
  const a = requireArgs<CheckboxYearsToHistoryArgs>(
    "checkbox_years_to_history",
    args,
    ctx.fieldName,
    "{ role, start_month_day?, end_month_day? }",
  );
  if (typeof a.role !== "string" || a.role.trim() === "") {
    throw new TransformError("checkbox_years_to_history", "args.role required", ctx.fieldName);
  }
  const startMD = a.start_month_day ?? "07-01";
  const endMD = a.end_month_day ?? "06-30";

  const items = Array.isArray(value)
    ? value
    : String(value)
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

  const entries: BoardRoleEntry[] = [];
  for (const raw of items) {
    const m = String(raw).match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (!m) {
      throw new TransformError(
        "checkbox_years_to_history",
        `expected "YYYY-YYYY" year-range, got "${raw}"`,
        ctx.fieldName,
      );
    }
    const [, y1, y2] = m;
    entries.push({
      role: a.role,
      start_date: `${y1}-${startMD}`,
      end_date: `${y2}-${endMD}`,
    });
  }
  // Sort newest first by start_date desc — stable shape for downstream code
  entries.sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
  return entries;
}

/**
 * Multi-select of event labels → array of attendance records.
 * Pattern observed on EO Dallas HubSpot's `n24_25_learning_event`,
 * `n25_26_social_event`, etc. — per-fiscal-year multi-select where each
 * checked option is "MMM - Speaker Name" or similar.
 *
 * Emits one attendance record per checked option. The sync layer writes
 * these into the (Phase 2) event_attendance table.
 *
 * args: { event_type: "forum"|"local"|"global"|"slp"|"learning"|"other", fiscal_year: string }
 */
interface MultiSelectToAttendanceArgs {
  event_type: "forum" | "local" | "global" | "slp" | "learning" | "other";
  fiscal_year: string;
}
interface AttendanceRecord {
  event_id: string;
  event_name: string;
  event_type: string;
  fiscal_year: string;
  attended: true;
}
const VALID_EVENT_TYPES = new Set(["forum", "local", "global", "slp", "learning", "other"]);
function multi_select_to_attendance(
  value: unknown,
  args: unknown,
  ctx: TransformContext = {},
): AttendanceRecord[] | null {
  if (isAbsent(value)) return null;
  const a = requireArgs<MultiSelectToAttendanceArgs>(
    "multi_select_to_attendance",
    args,
    ctx.fieldName,
    "{ event_type, fiscal_year }",
  );
  if (!VALID_EVENT_TYPES.has(a.event_type)) {
    throw new TransformError(
      "multi_select_to_attendance",
      `event_type "${a.event_type}" invalid; must be one of ${Array.from(VALID_EVENT_TYPES).join(", ")}`,
      ctx.fieldName,
    );
  }
  if (typeof a.fiscal_year !== "string" || a.fiscal_year.trim() === "") {
    throw new TransformError(
      "multi_select_to_attendance",
      "args.fiscal_year required",
      ctx.fieldName,
    );
  }
  const items = Array.isArray(value)
    ? value
    : String(value)
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

  return items.map((item) => {
    const name = String(item);
    // Deterministic event_id so re-sync doesn't create duplicates.
    const event_id = `${a.event_type}:${a.fiscal_year}:${slugify(name)}`;
    return {
      event_id,
      event_name: name,
      event_type: a.event_type,
      fiscal_year: a.fiscal_year,
      attended: true,
    };
  });
}

/**
 * Walk a numbered-suffix family of source fields (company_1_*, company_2_*, …)
 * and bundle each iteration into a structured record. Pattern observed on EO
 * Dallas's `requalification_properties` multi-company tracking
 * (company_1_annual_revenue, company_1_dba, company_1_number_of_full_time_employees, …).
 *
 * Reads from ctx.record. The `value` argument is ignored — the source field
 * in the mapping rule is documentation only.
 *
 * args: { prefix_template: "company_{n}_", max_count: number, sub_fields: string[] }
 *       prefix_template uses {n} as the index placeholder.
 *       sub_fields lists what to extract per company (e.g. ["annual_revenue", "dba"]).
 *
 * Returns an array of records (one per non-empty company iteration), or null
 * if no records were populated.
 */
interface MultiCompanyPrimaryArgs {
  prefix_template: string;
  max_count: number;
  sub_fields: string[];
}
function multi_company_primary(
  _value: unknown,
  args: unknown,
  ctx: TransformContext = {},
): Array<Record<string, unknown>> | null {
  const a = requireArgs<MultiCompanyPrimaryArgs>(
    "multi_company_primary",
    args,
    ctx.fieldName,
    "{ prefix_template, max_count, sub_fields }",
  );
  if (!a.prefix_template.includes("{n}")) {
    throw new TransformError(
      "multi_company_primary",
      "args.prefix_template must include {n} placeholder",
      ctx.fieldName,
    );
  }
  if (!Array.isArray(a.sub_fields) || a.sub_fields.length === 0) {
    throw new TransformError(
      "multi_company_primary",
      "args.sub_fields must be a non-empty array",
      ctx.fieldName,
    );
  }
  const records: Array<Record<string, unknown>> = [];
  for (let n = 1; n <= a.max_count; n++) {
    const prefix = a.prefix_template.replace("{n}", String(n));
    const record: Record<string, unknown> = {};
    let hasAny = false;
    for (const field of a.sub_fields) {
      const key = `${prefix}${field}`;
      const v = ctx.record?.[key];
      if (!isAbsent(v)) {
        record[field] = v;
        hasAny = true;
      }
    }
    if (hasAny) {
      record._index = n;
      records.push(record);
    }
  }
  return records.length > 0 ? records : null;
}

/**
 * Bundle every source property belonging to a named group into one JSONB
 * object. Pattern observed on EO Dallas's `requalification_properties`
 * HubSpot group (21 properties).
 *
 * Requires ctx.schema with `groupName` metadata per property — supplied by
 * the sync layer from the source's discovered_schema snapshot.
 *
 * args: { group_name: string, exclude_keys?: string[] }
 */
interface GroupToJsonbArgs {
  group_name: string;
  exclude_keys?: string[];
}
function group_to_jsonb(
  _value: unknown,
  args: unknown,
  ctx: TransformContext = {},
): Record<string, unknown> | null {
  const a = requireArgs<GroupToJsonbArgs>(
    "group_to_jsonb",
    args,
    ctx.fieldName,
    "{ group_name, exclude_keys? }",
  );
  if (typeof a.group_name !== "string" || a.group_name.trim() === "") {
    throw new TransformError("group_to_jsonb", "args.group_name required", ctx.fieldName);
  }
  if (!ctx.schema) {
    throw new TransformError(
      "group_to_jsonb",
      "ctx.schema not provided — sync layer must pass source property metadata",
      ctx.fieldName,
    );
  }
  const exclude = new Set(a.exclude_keys ?? []);
  const out: Record<string, unknown> = {};
  for (const [propName, meta] of Object.entries(ctx.schema)) {
    if (meta.groupName !== a.group_name) continue;
    if (exclude.has(propName)) continue;
    const v = ctx.record?.[propName];
    if (!isAbsent(v)) out[propName] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Internal helpers (Tier 3)
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------------------------
// Registry + dispatch
// ---------------------------------------------------------------------------

type TransformImpl = (value: unknown, args: unknown, ctx: TransformContext) => unknown;

const REGISTRY: Partial<Record<TransformName, TransformImpl>> = {
  // Tier 1
  direct_copy,
  enum_map,
  enum_map_after_strip,
  iso_date,
  iso_datetime,
  bool_from_yes_no,
  email_normalize,
  phone_normalize,
  // Tier 2
  bool_from_keyword,
  concat,
  array_of_text,
  append_to_notes,
  // Tier 3
  checkbox_years_to_history,
  multi_select_to_attendance,
  multi_company_primary,
  group_to_jsonb,
};

/**
 * Dispatch entry point used by the sync layer. Looks up the transform by name
 * and applies it. Throws TransformError if the name is unknown.
 */
export function applyTransform(
  name: TransformName,
  value: unknown,
  args: unknown = null,
  ctx: TransformContext = {},
): unknown {
  const fn = REGISTRY[name];
  if (!fn) {
    throw new TransformError(name, `transform not implemented yet`, ctx.fieldName);
  }
  return fn(value, args, ctx);
}

/** Returns the set of transform names currently implemented. */
export function implementedTransforms(): TransformName[] {
  return Object.keys(REGISTRY) as TransformName[];
}
