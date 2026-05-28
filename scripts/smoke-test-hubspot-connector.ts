// scripts/smoke-test-hubspot-connector.ts
//
// Read-only end-to-end smoke test against the real EO Dallas HubSpot portal.
// Verifies the HubSpotConnector authenticates, paginates, and returns
// ConnectorRecord[] with the source properties we expect.
//
// Doesn't write anything anywhere. Doesn't apply mappings. Just confirms the
// connector talks to HubSpot correctly.
//
// Usage:
//   npx tsx scripts/smoke-test-hubspot-connector.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HubSpotConnector } from "../lib/connectors/hubspot/HubSpotConnector";

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

async function loadTokenFromDb(supabaseUrl: string, serviceKey: string): Promise<string> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/chapters?trifecta_chapter_id=eq.${EO_DALLAS_CHAPTER_ID}&select=data_sources_config`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!resp.ok) throw new Error(`Supabase GET failed: ${resp.status}`);
  const rows = (await resp.json()) as Array<{ data_sources_config: { hubspot?: { private_app_token?: string } } }>;
  const token = rows[0]?.data_sources_config?.hubspot?.private_app_token;
  if (!token) throw new Error("HubSpot token not found in data_sources_config");
  return token;
}

async function main() {
  const env = readEnvLocal();
  const token = await loadTokenFromDb(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Test 1: discoverSchema
  console.log("→ discoverSchema()");
  const t0 = Date.now();
  const connector = new HubSpotConnector({
    chapterId: EO_DALLAS_CHAPTER_ID,
    token,
    propertiesToFetch: [
      "email", "firstname", "lastname", "mobilephone", "company", "jobtitle",
      "membership_status", "join_date", "renewal_status", "forum",
      "dallas_bod", "eo_accelerator",
    ],
  });

  const schema = await connector.discoverSchema();
  const schemaProps = Object.keys(schema);
  const customProps = schemaProps.filter((p) => {
    // hubspotDefined isn't on SourceProperty but we can infer custom from groupName patterns
    return schema[p].groupName === "contact_activity" ||
           schema[p].groupName === "requalification_properties" ||
           schema[p].groupName === "contactinformation" && p.length > 3;
  });
  console.log(`  ${schemaProps.length} total properties; ms=${Date.now() - t0}`);
  console.log(`  membership_status options:`, schema.membership_status?.options);
  console.log(`  forum options count:`, schema.forum?.options?.length);

  // Test 2: getMembers (full sync)
  console.log("\n→ getMembers()");
  const t1 = Date.now();
  const records = await connector.getMembers();
  console.log(`  fetched ${records.length} contacts in ${Date.now() - t1}ms`);

  if (records.length > 0) {
    const sample = records[0];
    console.log(`  sample externalIds:`, sample.externalIds);
    console.log(`  sample property keys (${Object.keys(sample.sourceProperties).length} total):`);
    console.log(`    ${Object.keys(sample.sourceProperties).slice(0, 12).join(", ")}…`);
    console.log(`  sample sourceLastModifiedAt: ${sample.sourceLastModifiedAt}`);
  }

  // Test 3: getMembers with `since` filter
  if (records.length > 0) {
    console.log("\n→ getMembers({ since: <yesterday> })");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await connector.getMembers({ since: yesterday });
    console.log(`  ${recent.length} contacts modified since ${yesterday.toISOString()}`);
  }

  console.log("\n✓ smoke test passed");
}

main().catch((err) => {
  console.error("✗ smoke test failed:");
  console.error(err);
  process.exit(1);
});
