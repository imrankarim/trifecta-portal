// syncConnector — orchestrates a sync from one source for one chapter.
//
// Flow:
//   1. Load chapters.data_sources_config[sourceName]
//   2. Instantiate the connector (today: HubSpot only; tomorrow: a registry)
//   3. Discover source schema (for ctx.schema in group_to_jsonb etc.)
//   4. Fetch records via connector.getMembers({ since: last_sync_at })
//   5. Pre-load chapter's existing member_external_ids and email index
//   6. For each record:
//      a. applyMappings → WritePlan
//      b. If WritePlan.contactType is null → skip (ADR-005 sync filter)
//      c. Resolve existing Trifecta member (by external_id, fallback to email)
//      d. Upsert members row with the canonical column writes
//      e. Upsert member_external_ids
//      f. Merge custom_fields (deep merge by key)
//      g. Append notes (dedupe on source+source_field+text)
//   7. Update chapters.data_sources_config[source].last_sync_at + last_sync_result
//
// Pure I/O orchestration — the mapping logic lives in applyMappings.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceSchema } from "../connectors/types";
import type { DataSource } from "../connectors/DataSource";
import type { FieldMapping } from "../connectors/mapping-schema";
import {
  HubSpotConnector,
  type HubSpotConnectorConfig,
} from "../connectors/hubspot/HubSpotConnector";
import { getStarterMapping } from "../connectors/starter_mappings";
import { applyMappings, type NoteEntry, type WritePlan } from "./applyMappings";

export interface SyncResult {
  source: string;
  chapterId: string;
  startedAt: string;
  finishedAt: string;
  recordsFetched: number;
  recordsSkippedNoSignal: number;
  membersInserted: number;
  membersUpdated: number;
  membersFailed: number;
  errors: string[];
}

export interface SyncConnectorOptions {
  supabase: SupabaseClient;
  chapterId: string;
  sourceName: string;
  /** Set to true to compute everything but skip database writes. Useful for first runs / verification. */
  dryRun?: boolean;
  /** Stop after this many fetched records. Useful for staging. Undefined = no limit. */
  maxRecords?: number;
  /** Override for the connector's HTTP client (tests). */
  fetchImpl?: typeof fetch;
  /** Logger for progress messages. Defaults to console.log. */
  log?: (msg: string) => void;
}

/**
 * Main entry point. Idempotent — re-running overwrites the last_sync_result
 * and re-syncs from the prior last_sync_at watermark.
 */
export async function syncConnector(opts: SyncConnectorOptions): Promise<SyncResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const startedAt = new Date().toISOString();
  const result: SyncResult = {
    source: opts.sourceName,
    chapterId: opts.chapterId,
    startedAt,
    finishedAt: "",
    recordsFetched: 0,
    recordsSkippedNoSignal: 0,
    membersInserted: 0,
    membersUpdated: 0,
    membersFailed: 0,
    errors: [],
  };

  try {
    // ── 1. Load chapter config ────────────────────────────────────────
    const { data: chapterRow, error: chapterErr } = await opts.supabase
      .from("chapters")
      .select("trifecta_chapter_id, data_sources_config, eo_region, country")
      .eq("trifecta_chapter_id", opts.chapterId)
      .single();
    if (chapterErr || !chapterRow) {
      throw new Error(`chapter ${opts.chapterId} not found: ${chapterErr?.message ?? "no row"}`);
    }
    const config = (chapterRow.data_sources_config ?? {}) as Record<string, unknown>;
    const sourceConfig = config[opts.sourceName] as
      | {
          private_app_token?: string;
          credential?: { token?: string };
          last_sync_at?: string;
          mappings?: { field_mappings?: FieldMapping[]; starter_mapping_base?: string };
        }
      | undefined;
    if (!sourceConfig) {
      throw new Error(`chapter has no data_sources_config.${opts.sourceName}`);
    }
    const token = sourceConfig.private_app_token ?? sourceConfig.credential?.token;
    if (!token) {
      throw new Error(`no credential found in data_sources_config.${opts.sourceName}`);
    }
    const chapterMappings = sourceConfig.mappings?.field_mappings ?? [];
    const starterName = sourceConfig.mappings?.starter_mapping_base ?? "hubspot_default_v1";
    const starterMappings = getStarterMapping(starterName) ?? [];
    log(`config loaded: ${chapterMappings.length} chapter rules + ${starterMappings.length} starter rules`);

    // Derive the set of source properties we need to fetch (union of all rule sources
    // plus the always-needed metadata fields).
    const propertiesToFetch = derivePropertiesToFetch(chapterMappings, starterMappings);
    log(`will fetch ${propertiesToFetch.length} HubSpot properties per contact`);

    // ── 2. Instantiate connector ──────────────────────────────────────
    const connector = makeConnector(opts.sourceName, {
      chapterId: opts.chapterId,
      token,
      propertiesToFetch,
      fetchImpl: opts.fetchImpl,
    });

    // ── 3. Discover schema (for ctx.schema in group_to_jsonb etc.) ───
    log(`discovering schema...`);
    const schema: SourceSchema = await connector.discoverSchema();
    log(`schema: ${Object.keys(schema).length} properties`);

    // ── 4. Fetch records ──────────────────────────────────────────────
    log(`fetching records (since=${sourceConfig.last_sync_at ?? "none"})...`);
    const records = await connector.getMembers({
      since: sourceConfig.last_sync_at ? new Date(sourceConfig.last_sync_at) : undefined,
    });
    const limitedRecords = opts.maxRecords ? records.slice(0, opts.maxRecords) : records;
    result.recordsFetched = limitedRecords.length;
    log(`fetched ${limitedRecords.length} records${opts.maxRecords ? ` (capped at ${opts.maxRecords})` : ""}`);

    // ── 5. Pre-load existing external_ids + email index ──────────────
    const externalIdIndex = await loadExternalIdIndex(
      opts.supabase,
      opts.chapterId,
      opts.sourceName,
    );
    const emailIndex = await loadEmailIndex(opts.supabase, opts.chapterId);
    log(`pre-loaded ${externalIdIndex.size} external_ids and ${emailIndex.size} emails`);

    // ── 6. Process records ────────────────────────────────────────────
    let i = 0;
    for (const record of limitedRecords) {
      i++;
      if (i % 100 === 0) log(`  ${i}/${limitedRecords.length}...`);

      const plan = applyMappings(record, starterMappings, chapterMappings, schema);

      // ADR-005 sync filter: no contact_type signal → skip
      if (!plan.contactType) {
        result.recordsSkippedNoSignal++;
        continue;
      }

      // Surface plan-level mapping errors but don't abort the record
      for (const err of plan.errors) {
        result.errors.push(
          `[${opts.sourceName}:${record.externalIds.hubspot}] ${err.rule} → ${err.target}: ${err.message}`,
        );
      }

      try {
        if (opts.dryRun) {
          // Count as "would-update" without writing
          const existing = resolveExisting(plan, externalIdIndex, emailIndex);
          if (existing) result.membersUpdated++;
          else result.membersInserted++;
        } else {
          const wasNew = await writeRecord(opts.supabase, opts.chapterId, opts.sourceName, plan, externalIdIndex, emailIndex);
          if (wasNew) result.membersInserted++;
          else result.membersUpdated++;
        }
      } catch (err) {
        result.membersFailed++;
        result.errors.push(
          `[${opts.sourceName}:${record.externalIds.hubspot}] write failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 7. Update last_sync metadata (skip on dry-run) ──────────────
    if (!opts.dryRun) {
      const updatedSourceConfig = {
        ...sourceConfig,
        last_sync_at: startedAt,
        last_sync_result: {
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          records_fetched: result.recordsFetched,
          records_skipped_no_signal: result.recordsSkippedNoSignal,
          members_inserted: result.membersInserted,
          members_updated: result.membersUpdated,
          members_failed: result.membersFailed,
          errors: result.errors.slice(0, 50), // cap to avoid bloating the JSONB
        },
      };
      const newConfig = { ...config, [opts.sourceName]: updatedSourceConfig };
      const { error: updateErr } = await opts.supabase
        .from("chapters")
        .update({ data_sources_config: newConfig })
        .eq("trifecta_chapter_id", opts.chapterId);
      if (updateErr) {
        result.errors.push(`failed to write last_sync metadata: ${updateErr.message}`);
      }
    }
  } catch (err) {
    result.errors.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    result.finishedAt = new Date().toISOString();
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeConnector(
  sourceName: string,
  config: HubSpotConnectorConfig,
): DataSource {
  if (sourceName === "hubspot") {
    return new HubSpotConnector(config);
  }
  throw new Error(`unknown source: ${sourceName} — register it in syncConnector.makeConnector`);
}

/**
 * Walk all mapping rules and produce the set of source property names that
 * any rule reads from. Plus the always-needed metadata (hs_object_id,
 * lastmodifieddate).
 */
function derivePropertiesToFetch(
  chapterMappings: ReadonlyArray<FieldMapping>,
  starterMappings: ReadonlyArray<FieldMapping>,
): string[] {
  const set = new Set<string>(["hs_object_id", "lastmodifieddate"]);
  const merged = [...starterMappings, ...chapterMappings];

  for (const rule of merged) {
    // Special-source rules read from multiple fields via ctx.record. We can't
    // know exactly which ones without parsing the args, but we can scrape the
    // most common patterns.
    if (rule.source.startsWith("_derived:")) {
      // Walk derive_from_signals's rules.condition.field references
      const args = rule.transform_args as
        | {
            rules?: Array<{
              condition?: {
                field?: string;
                any_of?: Array<{ field?: string }>;
              };
            }>;
          }
        | undefined;
      for (const r of args?.rules ?? []) {
        if (r.condition?.field) set.add(r.condition.field);
        for (const cond of r.condition?.any_of ?? []) {
          if (cond.field) set.add(cond.field);
        }
      }
      continue;
    }

    if (rule.source.startsWith("_group:")) {
      // group_to_jsonb reads everything in a HubSpot groupName. We can't
      // enumerate those statically — the connector will need to fetch them.
      // Mitigation: schema is discovered before records, and the sync layer
      // could re-derive properties from schema + group_name. For Phase 1
      // we accept that group-based rules may not include all properties
      // unless they're also referenced by other rules. Document the
      // limitation; production sync would expand here.
      continue;
    }

    if (rule.source.startsWith("_pattern:") || rule.source.endsWith("_*")) {
      // multi_company_primary walks a numbered family. Args specify the
      // prefix template + sub_fields. Expand them.
      const args = rule.transform_args as
        | { prefix_template?: string; max_count?: number; sub_fields?: string[] }
        | undefined;
      if (args?.prefix_template && args.max_count && args.sub_fields) {
        for (let n = 1; n <= args.max_count; n++) {
          const prefix = args.prefix_template.replace("{n}", String(n));
          for (const sub of args.sub_fields) set.add(`${prefix}${sub}`);
        }
      }
      continue;
    }

    set.add(rule.source);
  }

  // Sources for concat
  for (const rule of merged) {
    if (rule.transform === "concat") {
      const args = rule.transform_args as { sources?: string[] } | undefined;
      for (const s of args?.sources ?? []) set.add(s);
    }
  }

  return Array.from(set).sort();
}

async function loadExternalIdIndex(
  supabase: SupabaseClient,
  chapterId: string,
  sourceName: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("member_external_ids")
    .select("member_id, external_id")
    .eq("chapter_id", chapterId)
    .eq("source_name", sourceName);
  if (error) throw new Error(`failed to load external_id index: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(String(row.external_id), String(row.member_id));
  return map;
}

async function loadEmailIndex(
  supabase: SupabaseClient,
  chapterId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("members")
    .select("trifecta_member_id, email_primary")
    .eq("chapter_id", chapterId);
  if (error) throw new Error(`failed to load email index: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.email_primary) map.set(String(row.email_primary).toLowerCase(), String(row.trifecta_member_id));
  }
  return map;
}

function resolveExisting(
  plan: WritePlan,
  externalIdIndex: Map<string, string>,
  emailIndex: Map<string, string>,
): string | null {
  // Try external_id first
  const ext = plan.externalIds.hubspot;
  if (ext && externalIdIndex.has(ext)) return externalIdIndex.get(ext)!;

  // Fall back to email
  const email = (plan.memberColumns.email_primary as string | undefined)?.toLowerCase();
  if (email && emailIndex.has(email)) return emailIndex.get(email)!;

  return null;
}

/**
 * Write or update a member row + external_ids link + custom_fields merge +
 * notes append for one record's plan. Returns true if a new row was created.
 */
async function writeRecord(
  supabase: SupabaseClient,
  chapterId: string,
  sourceName: string,
  plan: WritePlan,
  externalIdIndex: Map<string, string>,
  emailIndex: Map<string, string>,
): Promise<boolean> {
  // We need an EO region for new rows (NOT NULL on schema). Get it from the chapter.
  // (Cached call ideally; for simplicity inline lookup. For 2,500 records this
  // matters — but only on insert path. Most records on re-sync match an existing
  // row and skip this.)
  const existingId = resolveExisting(plan, externalIdIndex, emailIndex);

  let memberId: string;
  let wasNew = false;

  if (existingId) {
    memberId = existingId;
    // Update existing row with the canonical columns + contact_type
    const updates: Record<string, unknown> = { ...plan.memberColumns };
    if (plan.contactType) updates.contact_type = plan.contactType;
    // Guard: membership_status only meaningful for Members (ADR-005). Null it
    // out for Sponsor/Spouse/Staff/Other to prevent rules from accidentally
    // writing lifecycle values to non-Members.
    if (plan.contactType && plan.contactType !== "Member") {
      updates.membership_status = null;
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("members")
        .update(updates)
        .eq("trifecta_member_id", memberId);
      if (error) throw new Error(`UPDATE members: ${error.message}`);
    }
  } else {
    // Insert new row. Need chapter's eo_region and country as fallback defaults.
    const { data: chapterMeta } = await supabase
      .from("chapters")
      .select("eo_region, country")
      .eq("trifecta_chapter_id", chapterId)
      .single();
    const insertPayload: Record<string, unknown> = {
      chapter_id: chapterId,
      contact_type: plan.contactType,
      eo_region: chapterMeta?.eo_region ?? "US Central",
      country: chapterMeta?.country ?? "US",
      ...plan.memberColumns,
      // Required-ish defaults if not provided
      email_primary: plan.memberColumns.email_primary ?? `unknown-${plan.externalIds.hubspot}@trifecta.local`,
      first_name: plan.memberColumns.first_name ?? "Unknown",
      last_name: plan.memberColumns.last_name ?? "Unknown",
    };
    // Guard: membership_status only meaningful for Members (ADR-005).
    if (plan.contactType !== "Member") {
      delete insertPayload.membership_status;
    }
    const { data, error } = await supabase
      .from("members")
      .insert(insertPayload)
      .select("trifecta_member_id")
      .single();
    if (error || !data) throw new Error(`INSERT members: ${error?.message}`);
    memberId = String(data.trifecta_member_id);
    wasNew = true;
    // Keep our indexes warm
    if (insertPayload.email_primary)
      emailIndex.set(String(insertPayload.email_primary).toLowerCase(), memberId);
  }

  // Upsert external_ids link
  if (plan.externalIds.hubspot) {
    const { error: extErr } = await supabase.from("member_external_ids").upsert(
      {
        member_id: memberId,
        chapter_id: chapterId,
        source_name: sourceName,
        external_id: plan.externalIds.hubspot,
      },
      { onConflict: "member_id,source_name" },
    );
    if (extErr) throw new Error(`UPSERT external_ids: ${extErr.message}`);
    externalIdIndex.set(plan.externalIds.hubspot, memberId);
  }

  // Merge custom_fields if any
  if (Object.keys(plan.customFields).length > 0) {
    const { data: current } = await supabase
      .from("members")
      .select("custom_fields")
      .eq("trifecta_member_id", memberId)
      .single();
    const merged = deepMerge(
      (current?.custom_fields ?? {}) as Record<string, unknown>,
      plan.customFields,
    );
    const { error: cfErr } = await supabase
      .from("members")
      .update({ custom_fields: merged })
      .eq("trifecta_member_id", memberId);
    if (cfErr) throw new Error(`UPDATE custom_fields: ${cfErr.message}`);
  }

  // Append notes (with dedupe)
  if (plan.notes.length > 0) {
    const { data: current } = await supabase
      .from("members")
      .select("notes")
      .eq("trifecta_member_id", memberId)
      .single();
    const existing = (current?.notes ?? []) as Array<NoteEntry & { ts?: string }>;
    const newNotes = dedupeNotes(existing, plan.notes);
    if (newNotes.length > 0) {
      const ts = new Date().toISOString();
      const stamped = newNotes.map((n) => ({ ...n, ts }));
      const { error: notesErr } = await supabase
        .from("members")
        .update({ notes: [...existing, ...stamped] })
        .eq("trifecta_member_id", memberId);
      if (notesErr) throw new Error(`UPDATE notes: ${notesErr.message}`);
    }
  }

  return wasNew;
}

/** Deep-merge two plain objects. Arrays and non-objects on the right replace the left. */
function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Filter newNotes against existing — drop any where (source, source_field, text) matches existing. */
function dedupeNotes(
  existing: Array<NoteEntry & { ts?: string }>,
  incoming: NoteEntry[],
): NoteEntry[] {
  const seen = new Set(
    existing.map((n) => `${n.source}|${n.source_field ?? ""}|${n.text}`),
  );
  return incoming.filter((n) => !seen.has(`${n.source}|${n.source_field ?? ""}|${n.text}`));
}
