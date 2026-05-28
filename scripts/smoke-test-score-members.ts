// scripts/smoke-test-score-members.ts
//
// Run the scoring engine against real EO Dallas members already in Trifecta.
// Dry-run mode by default — computes scores and shows distribution without
// writing.
//
// Usage:
//   npx tsx scripts/smoke-test-score-members.ts          # dry run
//   npx tsx scripts/smoke-test-score-members.ts --apply  # writes scores back

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scoreMembers } from "../lib/jobs/scoreMembers";

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
  const env = readEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`mode=${apply ? "APPLY (writes)" : "DRY RUN"}\n`);

  const result = await scoreMembers({
    supabase,
    chapterId: EO_DALLAS_CHAPTER_ID,
    dryRun: !apply,
    log: (m) => console.log(`  ${m}`),
  });

  console.log("");
  console.log("=== Result ===");
  console.log(`  total_members:    ${result.totalMembers}`);
  console.log(`  members_scored:   ${result.membersScored}  (Members only)`);
  console.log(`  members_skipped:  ${result.membersSkipped}  (non-Members: Sponsor/Spouse/Staff)`);
  console.log(`  members_failed:   ${result.membersFailed}`);
  console.log("");
  console.log("=== Score stats ===");
  console.log(`  min:    ${result.scoreStats.min}`);
  console.log(`  max:    ${result.scoreStats.max}`);
  console.log(`  mean:   ${result.scoreStats.mean}`);
  console.log(`  median: ${result.scoreStats.median}`);
  console.log("");
  console.log("=== Tier distribution ===");
  for (const tier of ["Critical", "High", "Medium", "Low", "Monitor"] as const) {
    const n = result.tierDistribution[tier];
    const bar = "█".repeat(Math.round(n / 2));
    console.log(`  ${tier.padEnd(9)}  ${String(n).padStart(3)}  ${bar}`);
  }
  console.log("");
  if (result.errors.length > 0) {
    console.log(`=== Errors (first 5 of ${result.errors.length}) ===`);
    for (const e of result.errors.slice(0, 5)) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
