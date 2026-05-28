// One-time reconciliation: use Jon's EO Global active-member export as the
// authoritative arbiter for who's currently a paying member.
//
// HubSpot's join_date doesn't get cleared when someone leaves EO, so our
// derive_from_signals "join_date set → Active" rule sweeps in former members
// along with current ones. This script collapses that overshoot:
//
//   - In EO Global's active export → confirmed Active (no change if already)
//   - NOT in the export but Active in Trifecta → demote to Former Member
//   - In EO Global's export but missing from Trifecta entirely → reported
//     for manual chair attention
//
// Also stamps custom_fields.eo_global_confirmed_at = today on confirmed
// matches, so future runs / scoring can show which members carry EO Global
// authority vs HubSpot-only.
//
// Usage:
//   npx tsx scripts/reconcile-against-eo-global.ts            # dry run
//   npx tsx scripts/reconcile-against-eo-global.ts --apply    # write changes

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const EO_DALLAS_CHAPTER_ID = "d9e54e48-d9fe-4e9d-8178-b85bfd95d12c";
const EOG_XLSX = "/tmp/eo-global-import/eo_dallas.xlsx";

function readEnvLocal(): Record<string, string> {
  const text = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

function normName(first: string | null | undefined, last: string | null | undefined): string {
  return `${(first ?? "").trim().toLowerCase()} ${(last ?? "").trim().toLowerCase()}`.trim();
}

interface EogRow {
  first_name: string;
  last_name: string;
  email: string;
  forum_name: string | null;
  join_date: string | null;
}

async function loadEogActive(): Promise<EogRow[]> {
  // Use the same Python-based xlsx loader we used for the sanity check.
  // Easier than pulling in another node xlsx library; we just shell out.
  const { execFileSync } = await import("node:child_process");
  const json = execFileSync(
    "python3",
    [
      "-c",
      `
import json
from openpyxl import load_workbook
wb = load_workbook("${EOG_XLSX}", data_only=True)
ws = wb["EO Member Data"]
rows = list(ws.iter_rows(values_only=True))
header = rows[0]
out = []
for row in rows[1:]:
    rec = dict(zip(header, row))
    email = (rec.get("Email") or "").strip().lower()
    if not email:
        continue
    jd = rec.get("Join Date")
    out.append({
      "first_name": (rec.get("First Name") or "").strip(),
      "last_name": (rec.get("Last Name") or "").strip(),
      "email": email,
      "forum_name": rec.get("Forum Name"),
      "join_date": jd.isoformat()[:10] if hasattr(jd, "isoformat") else None,
    })
print(json.dumps(out))
`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(json);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  console.log(`mode=${apply ? "APPLY (writes)" : "DRY RUN"}\n`);

  const env = readEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Load both sides
  const eog = await loadEogActive();
  console.log(`EO Global active members:  ${eog.length}`);

  const { data: members, error } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, membership_status, custom_fields",
    )
    .eq("chapter_id", EO_DALLAS_CHAPTER_ID)
    .eq("contact_type", "Member");
  if (error) throw new Error(error.message);
  const trif = members ?? [];
  console.log(`Trifecta Members:          ${trif.length}\n`);

  // Build lookup maps
  const eogByEmail = new Map(eog.map((r) => [r.email, r]));
  const eogByName = new Map<string, EogRow[]>();
  for (const r of eog) {
    const key = normName(r.first_name, r.last_name);
    if (!eogByName.has(key)) eogByName.set(key, []);
    eogByName.get(key)!.push(r);
  }

  // Classify each Trifecta member
  const confirmedActive: typeof trif = []; // matched → confirmed Active
  const toDemoteToFormer: typeof trif = []; // currently Active but no EOG match
  const matchedTrifIds = new Set<string>();

  for (const m of trif) {
    const email = (m.email_primary ?? "").trim().toLowerCase();
    let matched: EogRow | undefined = email ? eogByEmail.get(email) : undefined;
    if (!matched) {
      const candidates = eogByName.get(normName(m.first_name, m.last_name)) ?? [];
      if (candidates.length === 1) matched = candidates[0];
    }
    if (matched) {
      confirmedActive.push(m);
      matchedTrifIds.add(m.trifecta_member_id);
    } else if (m.membership_status === "Active") {
      toDemoteToFormer.push(m);
    }
    // Prospects, Former Members, etc. stay as they are.
  }

  // EOG members not represented in Trifecta at all
  const eogMissing: EogRow[] = [];
  const trifEmails = new Set(trif.map((m) => (m.email_primary ?? "").trim().toLowerCase()));
  const trifNames = new Set(trif.map((m) => normName(m.first_name, m.last_name)));
  for (const r of eog) {
    if (trifEmails.has(r.email)) continue;
    if (trifNames.has(normName(r.first_name, r.last_name))) continue;
    eogMissing.push(r);
  }

  console.log("━".repeat(72));
  console.log(`Confirmed Active (matched to EO Global):    ${confirmedActive.length}`);
  console.log(`To demote (Active → Former Member):         ${toDemoteToFormer.length}`);
  console.log(`EOG members not in Trifecta at all:         ${eogMissing.length}`);
  console.log("━".repeat(72));

  if (eogMissing.length > 0) {
    console.log(`\n── EOG members entirely missing from Trifecta — manual review ──`);
    for (const r of eogMissing) {
      console.log(`  ${r.first_name} ${r.last_name} <${r.email}> — joined ${r.join_date ?? "?"}`);
    }
  }

  if (!apply) {
    console.log("\n(dry run — no changes written. Run with --apply to make changes.)");
    return;
  }

  // Apply changes — sequential to avoid Supabase rate limits, but fast in practice
  const today = new Date().toISOString();
  let confirmedCount = 0;
  let demotedCount = 0;
  let failedCount = 0;

  console.log("\nWriting changes…");
  for (const m of confirmedActive) {
    const newCustomFields = {
      ...((m.custom_fields ?? {}) as Record<string, unknown>),
      eo_global_confirmed_at: today,
    };
    const update: Record<string, unknown> = { custom_fields: newCustomFields };
    if (m.membership_status !== "Active") update.membership_status = "Active";
    const { error } = await supabase
      .from("members")
      .update(update)
      .eq("trifecta_member_id", m.trifecta_member_id);
    if (error) {
      failedCount++;
      console.error(`  failed confirm ${m.first_name} ${m.last_name}: ${error.message}`);
    } else {
      confirmedCount++;
    }
  }

  for (const m of toDemoteToFormer) {
    const { error } = await supabase
      .from("members")
      .update({ membership_status: "Former Member", churn_risk_tier: null })
      .eq("trifecta_member_id", m.trifecta_member_id);
    if (error) {
      failedCount++;
      console.error(`  failed demote ${m.first_name} ${m.last_name}: ${error.message}`);
    } else {
      demotedCount++;
    }
  }

  console.log(`\n=== Result ===`);
  console.log(`  Confirmed Active:  ${confirmedCount}`);
  console.log(`  Demoted to Former: ${demotedCount}`);
  console.log(`  Failures:          ${failedCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
