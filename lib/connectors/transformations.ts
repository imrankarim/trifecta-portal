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
  // Tier 2 and Tier 3 land in subsequent commits.
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
