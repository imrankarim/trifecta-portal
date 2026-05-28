// scripts/seed-eo-dallas-hubspot-mapping.ts
//
// Apply EO Dallas's HubSpot field-mapping configuration to the chapters
// table. Reads the canonical authoring document at
// lib/connectors/chapter_configs/eo_dallas_hubspot.ts, builds the
// SourceFieldMappings envelope, and PATCHes
// chapters.data_sources_config.hubspot.mappings.
//
// Idempotent — rerunning overwrites the mappings in full. Other keys on
// data_sources_config.hubspot (credential, linked_at, last_sync_*) are
// preserved.
//
// Usage:
//   npx tsx scripts/seed-eo-dallas-hubspot-mapping.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EO_DALLAS_HUBSPOT_MAPPINGS,
  EO_DALLAS_HUBSPOT_AUTHORED_BY,
} from "../lib/connectors/chapter_configs/eo_dallas_hubspot";
import { HUBSPOT_DEFAULT_V1_NAME } from "../lib/connectors/starter_mappings";
import type { SourceFieldMappings } from "../lib/connectors/mapping-schema";

const EO_DALLAS_CHAPTER_ID = "d9e54e48-d9fe-4e9d-8178-b85bfd95d12c";

function readEnvLocal(): Record<string, string> {
  const text = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

async function main() {
  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  // Fetch the current chapter row so we preserve credential + linked_at
  // and only touch the .mappings sub-object.
  const getResp = await fetch(
    `${url}/rest/v1/chapters?trifecta_chapter_id=eq.${EO_DALLAS_CHAPTER_ID}&select=data_sources_config`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!getResp.ok) {
    throw new Error(`GET chapter failed: HTTP ${getResp.status} ${await getResp.text()}`);
  }
  const rows = (await getResp.json()) as Array<{ data_sources_config: Record<string, unknown> | null }>;
  if (rows.length === 0) {
    throw new Error(`Chapter ${EO_DALLAS_CHAPTER_ID} not found`);
  }
  const existing = rows[0].data_sources_config ?? {};
  const existingHubspot = (existing as Record<string, unknown>).hubspot as Record<string, unknown> | undefined;
  if (!existingHubspot) {
    throw new Error(
      "chapters.data_sources_config.hubspot is unset — credential must be stored before mapping can be applied",
    );
  }

  const mappings: SourceFieldMappings = {
    version: 1,
    starter_mapping_base: HUBSPOT_DEFAULT_V1_NAME,
    discovered_schema_snapshot_at: new Date().toISOString(),
    // discovered_schema deliberately omitted here — sync layer populates it
    // from the live HubSpot schema. Storing the full schema (~600KB) in this
    // seed would bloat the JSONB and go stale.
    field_mappings: EO_DALLAS_HUBSPOT_MAPPINGS,
  };

  const updatedHubspotConfig = {
    ...existingHubspot,
    mappings,
  };

  const updatedDataSourcesConfig = {
    ...existing,
    hubspot: updatedHubspotConfig,
  };

  const patchResp = await fetch(
    `${url}/rest/v1/chapters?trifecta_chapter_id=eq.${EO_DALLAS_CHAPTER_ID}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ data_sources_config: updatedDataSourcesConfig }),
    },
  );
  if (!patchResp.ok) {
    throw new Error(`PATCH failed: HTTP ${patchResp.status} ${await patchResp.text()}`);
  }
  const patched = (await patchResp.json()) as Array<{ data_sources_config: Record<string, unknown> }>;
  const written = (patched[0]?.data_sources_config as { hubspot?: { mappings?: SourceFieldMappings } })
    ?.hubspot?.mappings;

  console.log("Mapping config applied.");
  console.log(`  field_mappings count: ${written?.field_mappings?.length ?? 0}`);
  console.log(`  starter_mapping_base: ${written?.starter_mapping_base}`);
  console.log(`  authored_by:          ${EO_DALLAS_HUBSPOT_AUTHORED_BY}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
