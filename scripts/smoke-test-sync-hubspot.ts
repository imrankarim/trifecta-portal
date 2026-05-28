// scripts/smoke-test-sync-hubspot.ts
//
// Runs the syncConnector for EO Dallas's HubSpot. By default, DRY RUN —
// computes everything (fetch, mapping, entity resolution) but writes nothing.
//
// Flags:
//   --apply         Actually write to the database. Without this, dry run.
//   --limit=N       Stop after N fetched records. Default: 50 for dry-run safety.
//
// Usage:
//   npx tsx scripts/smoke-test-sync-hubspot.ts                # dry run, 50 records
//   npx tsx scripts/smoke-test-sync-hubspot.ts --limit=200    # dry run, 200 records
//   npx tsx scripts/smoke-test-sync-hubspot.ts --apply        # apply, 50 records
//   npx tsx scripts/smoke-test-sync-hubspot.ts --apply --limit=99999  # full sync

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { syncConnector } from "../lib/jobs/syncConnector";

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
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

  const env = readEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`mode=${apply ? "APPLY (writes)" : "DRY RUN"}, limit=${limit}`);
  console.log("");

  const result = await syncConnector({
    supabase,
    chapterId: EO_DALLAS_CHAPTER_ID,
    sourceName: "hubspot",
    dryRun: !apply,
    maxRecords: limit,
    log: (m) => console.log(`  ${m}`),
  });

  console.log("");
  console.log("=== SyncResult ===");
  console.log(`  records_fetched:           ${result.recordsFetched}`);
  console.log(`  records_skipped_no_signal: ${result.recordsSkippedNoSignal}`);
  console.log(`  members_inserted:          ${result.membersInserted}`);
  console.log(`  members_updated:           ${result.membersUpdated}`);
  console.log(`  members_failed:            ${result.membersFailed}`);
  console.log(`  duration:                  ${new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()}ms`);
  console.log("");

  if (result.errors.length > 0) {
    console.log(`=== Errors (first 10 of ${result.errors.length}) ===`);
    for (const e of result.errors.slice(0, 10)) console.log(`  ${e}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error("smoke test failed:");
  console.error(err);
  process.exit(1);
});
