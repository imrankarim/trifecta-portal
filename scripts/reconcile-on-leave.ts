// One-time reconciliation: apply Jon's EO Global on-leave export so the
// 13 chapter members currently on sabbatical land in the On Leave bucket
// (and get automatically skipped by at-risk scoring per the prior fix).
//
// The export is name-only (no email column), so we match by case-insensitive
// "first last" tokens. Ambiguous matches (multiple Trifecta rows with the
// same name) and unmatched names are reported for chair manual review,
// never blindly applied.
//
// Each matched member gets:
//   membership_status = 'On Leave'
//   churn_risk_tier   = NULL  (mirrors the On Leave scoring skip)
//   custom_fields.leave_period.start (ISO date if known)
//   custom_fields.leave_period.end   (ISO date if known)
//   custom_fields.leave_period.confirmed_at = today
//   custom_fields.leave_period.source = 'eo_global_on_leave_export_2026_05'
//
// Usage:
//   npx tsx scripts/reconcile-on-leave.ts            # dry run
//   npx tsx scripts/reconcile-on-leave.ts --apply    # write changes

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const EO_DALLAS_CHAPTER_ID = "d9e54e48-d9fe-4e9d-8178-b85bfd95d12c";
const XLSX = "/tmp/eo-global-import/eo_dallas_on_leave.xlsx";
const SOURCE_TAG = "eo_global_on_leave_export_2026_05";

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

interface LeaveRow {
  name: string;
  period_raw: string;
  start_date: string | null; // ISO YYYY-MM-DD or null
  end_date: string | null;
}

function loadLeaveRows(): LeaveRow[] {
  const json = execFileSync(
    "python3",
    [
      "-c",
      `
import json, re
from openpyxl import load_workbook
wb = load_workbook("${XLSX}", data_only=True)
ws = wb["Sheet1"]
out = []
for row in ws.iter_rows(min_row=2, values_only=True):
    name = row[1]
    period = row[2]
    if not name: continue
    name = str(name).strip()
    period_str = str(period).strip() if period else ""

    # Parse "On leave: <start> to <end>" or "On leave until: <end>"
    start_iso = end_iso = None
    m = re.match(r"^On leave:\\s*(.+?)\\s+to\\s+(.+?)\\s*$", period_str)
    if m:
        try:
            from datetime import datetime
            start_iso = datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
            end_iso   = datetime.strptime(m.group(2), "%B %d, %Y").date().isoformat()
        except ValueError: pass
    else:
        m2 = re.match(r"^On leave until:\\s*(.+?)\\s*$", period_str)
        if m2:
            try:
                from datetime import datetime
                end_iso = datetime.strptime(m2.group(1), "%B %d, %Y").date().isoformat()
            except ValueError: pass

    out.append({
        "name": name,
        "period_raw": period_str,
        "start_date": start_iso,
        "end_date":   end_iso,
    })
print(json.dumps(out))
`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(json);
}

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

interface TrifMember {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  membership_status: string | null;
  contact_type: string | null;
  custom_fields: Record<string, unknown> | null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  console.log(`mode=${apply ? "APPLY (writes)" : "DRY RUN"}\n`);

  const env = readEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const leaveRows = loadLeaveRows();
  console.log(`On-leave members in EO Global export: ${leaveRows.length}`);
  console.log(`Date-parse coverage: ${leaveRows.filter(r => r.end_date).length} have end_date, ${leaveRows.filter(r => r.start_date).length} have start_date\n`);

  // Load all Member-type Trifecta rows for this chapter
  const { data: members, error } = await supabase
    .from("members")
    .select("trifecta_member_id, first_name, last_name, membership_status, contact_type, custom_fields")
    .eq("chapter_id", EO_DALLAS_CHAPTER_ID)
    .in("contact_type", ["Member"]);
  if (error) throw new Error(error.message);
  const trif: TrifMember[] = (members ?? []) as TrifMember[];

  // Build a name → members[] index (case-insensitive "first last")
  const byName = new Map<string, TrifMember[]>();
  for (const m of trif) {
    const k = normalize(`${m.first_name ?? ""} ${m.last_name ?? ""}`);
    if (!k.trim()) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(m);
  }

  const matched: Array<{ row: LeaveRow; member: TrifMember }> = [];
  const ambiguous: Array<{ row: LeaveRow; count: number }> = [];
  const unmatched: LeaveRow[] = [];

  for (const r of leaveRows) {
    const k = normalize(r.name);
    const candidates = byName.get(k) ?? [];
    if (candidates.length === 1) {
      matched.push({ row: r, member: candidates[0] });
    } else if (candidates.length > 1) {
      ambiguous.push({ row: r, count: candidates.length });
    } else {
      unmatched.push(r);
    }
  }

  console.log("━".repeat(72));
  console.log(`Matched (exactly one Trifecta row by name): ${matched.length}`);
  console.log(`Ambiguous (multiple Trifecta rows):         ${ambiguous.length}`);
  console.log(`Unmatched (no Trifecta row at all):         ${unmatched.length}`);
  console.log("━".repeat(72));

  if (matched.length > 0) {
    console.log("\n── Matched — will be set to On Leave ──");
    for (const { row, member } of matched) {
      const currentStatus = member.membership_status ?? "(null)";
      const start = row.start_date ?? "?";
      const end = row.end_date ?? "?";
      console.log(`  ${row.name.padEnd(28)} ${currentStatus.padEnd(15)} → On Leave  (${start} → ${end})`);
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n── Ambiguous (won't auto-apply, chair review) ──`);
    for (const { row, count } of ambiguous) {
      console.log(`  ${row.name} — ${count} Trifecta rows match this name`);
    }
  }
  if (unmatched.length > 0) {
    console.log(`\n── Unmatched (no Trifecta row, chair adds manually) ──`);
    for (const r of unmatched) {
      console.log(`  ${r.name} — ${r.period_raw}`);
    }
  }

  if (!apply) {
    console.log("\n(dry run — no changes written. Run with --apply.)");
    return;
  }

  console.log("\nWriting changes…");
  const today = new Date().toISOString();
  let success = 0, failed = 0;

  for (const { row, member } of matched) {
    const newCustomFields = {
      ...((member.custom_fields ?? {}) as Record<string, unknown>),
      leave_period: {
        start: row.start_date,
        end: row.end_date,
        period_raw: row.period_raw,
        confirmed_at: today,
        source: SOURCE_TAG,
      },
    };
    const { error: updErr } = await supabase
      .from("members")
      .update({
        membership_status: "On Leave",
        churn_risk_tier: null,
        custom_fields: newCustomFields,
      })
      .eq("trifecta_member_id", member.trifecta_member_id);
    if (updErr) {
      failed++;
      console.error(`  failed ${row.name}: ${updErr.message}`);
    } else {
      success++;
    }
  }

  console.log(`\n=== Result ===`);
  console.log(`  Set to On Leave: ${success}`);
  console.log(`  Failures:        ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
