// scripts/count-eo-dallas-members.ts
//
// Sanity-check categorization of EO Dallas's HubSpot contacts against
// the chapter's actual known membership counts (~130-140 active).
//
// Read-only. No database writes. Pulls every contact from HubSpot, applies
// the derive_contact_type rules, then breaks down what each Member-classified
// contact's lifecycle status would be — under the strict rule (HubSpot's
// value only) and under the fallback rule ("infer Active when status empty
// but join_date is set").
//
// Usage:
//   npx tsx scripts/count-eo-dallas-members.ts

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

// Properties we need to evaluate derive_contact_type + fallback.
const PROPS = [
  "email",
  "firstname",
  "lastname",
  "membership_status",
  "application",
  "chapter_consideration_email",
  "sap_active_",
  "dallas_bod",
  "bod_position",
  "join_date",
  "company",
];

function isAbsent(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/** Mirrors the EO Dallas derive_contact_type rules from the mapping config. */
function deriveContactType(p: Record<string, unknown>): string | null {
  if (!isAbsent(p.sap_active_)) return "Sponsor";
  if (p.membership_status === "Spouse") return "Spouse";
  if (
    p.membership_status === "Active" ||
    p.membership_status === "Inactive" ||
    p.membership_status === "Sabbatical" ||
    p.membership_status === "Alumni"
  ) {
    return "Member";
  }
  if (!isAbsent(p.application) || !isAbsent(p.chapter_consideration_email)) return "Member";
  if (!isAbsent(p.dallas_bod) || !isAbsent(p.bod_position)) return "Member";
  return null;
}

async function main() {
  const env = readEnvLocal();
  // Reuse the stored token from data_sources_config
  const tokenResp = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/chapters?trifecta_chapter_id=eq.${EO_DALLAS_CHAPTER_ID}&select=data_sources_config`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  const rows = (await tokenResp.json()) as Array<{ data_sources_config: { hubspot?: { private_app_token?: string } } }>;
  const token = rows[0]?.data_sources_config?.hubspot?.private_app_token;
  if (!token) throw new Error("no HubSpot token in chapters.data_sources_config");

  const connector = new HubSpotConnector({
    chapterId: EO_DALLAS_CHAPTER_ID,
    token,
    propertiesToFetch: PROPS,
  });

  console.log("fetching all EO Dallas HubSpot contacts (may take ~10s)...");
  const records = await connector.getMembers();
  console.log(`fetched ${records.length} contacts\n`);

  // Categorize
  const stats = {
    total: records.length,
    skipped_no_signal: 0,
    sponsor: 0,
    spouse: 0,
    member_total: 0,
    member_status_active: 0,
    member_status_inactive: 0,
    member_status_sabbatical: 0,
    member_status_alumni: 0,
    member_status_empty_with_join_date: 0,
    member_status_empty_no_join_date: 0,
  };

  // Breakdown by signal source for the "empty membership_status" members
  const memberSignalSource: Record<string, number> = {
    via_dallas_bod_only: 0,
    via_bod_position_only: 0,
    via_application_only: 0,
    via_chapter_consideration_email_only: 0,
    via_multiple: 0,
  };

  for (const r of records) {
    const p = r.sourceProperties;
    const ct = deriveContactType(p);

    if (ct === null) {
      stats.skipped_no_signal++;
      continue;
    }
    if (ct === "Sponsor") {
      stats.sponsor++;
      continue;
    }
    if (ct === "Spouse") {
      stats.spouse++;
      continue;
    }

    // Member
    stats.member_total++;
    const ms = String(p.membership_status ?? "").trim();
    const hasJoinDate = !isAbsent(p.join_date);

    if (ms === "Active") stats.member_status_active++;
    else if (ms === "Inactive") stats.member_status_inactive++;
    else if (ms === "Sabbatical") stats.member_status_sabbatical++;
    else if (ms === "Alumni") stats.member_status_alumni++;
    else if (ms === "") {
      if (hasJoinDate) stats.member_status_empty_with_join_date++;
      else stats.member_status_empty_no_join_date++;
    }

    // For empty-status members, what signal made them a Member?
    if (ms === "") {
      const sigs = {
        dallas_bod: !isAbsent(p.dallas_bod),
        bod_position: !isAbsent(p.bod_position),
        application: !isAbsent(p.application),
        chapter_consideration_email: !isAbsent(p.chapter_consideration_email),
      };
      const count = Object.values(sigs).filter(Boolean).length;
      if (count >= 2) memberSignalSource.via_multiple++;
      else if (sigs.dallas_bod) memberSignalSource.via_dallas_bod_only++;
      else if (sigs.bod_position) memberSignalSource.via_bod_position_only++;
      else if (sigs.application) memberSignalSource.via_application_only++;
      else if (sigs.chapter_consideration_email) memberSignalSource.via_chapter_consideration_email_only++;
    }
  }

  console.log("=== Top-level breakdown ===");
  console.log(`  Total HubSpot contacts:               ${stats.total}`);
  console.log(`  Skipped (no operational signal):      ${stats.skipped_no_signal}`);
  console.log(`  → would land in Trifecta:             ${stats.total - stats.skipped_no_signal}`);
  console.log("");
  console.log("=== Contact type breakdown ===");
  console.log(`  Sponsor:                              ${stats.sponsor}`);
  console.log(`  Spouse:                               ${stats.spouse}`);
  console.log(`  Member:                               ${stats.member_total}`);
  console.log("");
  console.log("=== Member lifecycle breakdown ===");
  console.log(`  membership_status='Active':           ${stats.member_status_active}`);
  console.log(`  membership_status='Inactive' (→Lapsed):${stats.member_status_inactive}`);
  console.log(`  membership_status='Sabbatical':       ${stats.member_status_sabbatical}`);
  console.log(`  membership_status='Alumni' (→Former): ${stats.member_status_alumni}`);
  console.log(`  membership_status=''  + join_date set: ${stats.member_status_empty_with_join_date}`);
  console.log(`  membership_status=''  + no join_date: ${stats.member_status_empty_no_join_date}`);
  console.log("");
  console.log("=== Active count under each rule ===");
  console.log(`  RULE (a) — Active only when HubSpot says Active:`);
  console.log(`    Active count:                       ${stats.member_status_active}`);
  console.log("");
  console.log(`  RULE (b) — Active when HubSpot says Active OR (empty + has join_date):`);
  console.log(`    Active count:                       ${stats.member_status_active + stats.member_status_empty_with_join_date}`);
  console.log("");
  console.log("=== Where 'empty membership_status' Members come from ===");
  console.log(`  via dallas_bod only:                  ${memberSignalSource.via_dallas_bod_only}`);
  console.log(`  via bod_position only:                ${memberSignalSource.via_bod_position_only}`);
  console.log(`  via application only:                 ${memberSignalSource.via_application_only}`);
  console.log(`  via chapter_consideration_email only: ${memberSignalSource.via_chapter_consideration_email_only}`);
  console.log(`  via multiple signals:                 ${memberSignalSource.via_multiple}`);
  console.log("");
  console.log(`Comparison to known truth: EO Dallas has ~130-140 current active members.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
