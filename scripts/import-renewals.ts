// Import EO Dallas renewal status from Jon Minjoe's "EO Dallas 2025-2026
// Renewal Tracker" sheet into the (already-existing) renewal fields on members.
//
// The sheet's "Renewed?" column (Yes / No / Maybe / blank) maps to our enums:
//   Yes + note "renewed on…" → renewal_status=Renewed,  intent=PlanToRenew
//   Yes (committed, e.g. board) → renewal_status=Pending, intent=PlanToRenew
//   Maybe (undecided)          → renewal_status=At Risk, intent=WantToSpeak
//   No (not renewing)          → renewal_status=At Risk, intent=WontRenew
//   blank (no answer yet)      → renewal_status=Pending, intent=NoResponse
//
// Notes go into renewal_intent_notes. next_renewal_date is set to EO's year
// start (2026-07-01) for everyone we touch.
//
// The decisions below are the snapshot from the sheet (only rows with an
// explicit Yes/No/Maybe — everyone else defaults to NoResponse). A few board
// members have identity mismatches between the sheet and our DB (different
// email/name), so they're pinned by trifecta_member_id.
//
// Usage:
//   npx tsx scripts/import-renewals.ts            # dry run
//   npx tsx scripts/import-renewals.ts --apply    # write changes

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const EO_DALLAS_CHAPTER_ID = "d9e54e48-d9fe-4e9d-8178-b85bfd95d12c";
const NEXT_RENEWAL_DATE = "2026-07-01";
const SURVEY_YEAR = 2026;
const ACTIVE = new Set(["Active", "Grace Period", "Lapsed"]);

type Flag = "Yes" | "No" | "Maybe";

interface Decision {
  flag: Flag;
  notes: string;
  email?: string;
  /** Pin by member id when the sheet's identity doesn't match our DB. */
  memberId?: string;
}

const DECISIONS: Decision[] = [
  // ── Yes ────────────────────────────────────────────────────────────────
  { flag: "Yes", email: "matt@alertresponse.com", notes: "Renewed 05/29." },
  { flag: "Yes", email: "mike@returnonenergy.com", notes: "On the board next year." },
  { flag: "Yes", email: "curzuasolorzano@gmail.com", notes: "On the board next year." },
  { flag: "Yes", memberId: "71a27906-a813-4cf4-9caf-d9d2b1741524", notes: "On the board next year." }, // Randy Haran
  { flag: "Yes", email: "wes.keyes@bbhh.org", notes: "Renewed on 05/28." },
  { flag: "Yes", email: "rpatel@psbplaw.com", notes: "On the board next year." },
  { flag: "Yes", email: "imran34@gmail.com", notes: "On the board next year." },
  { flag: "Yes", email: "doug@ironsidehr.com", notes: "Renewed on 05/28." },
  { flag: "Yes", memberId: "7612c517-c30f-401e-a467-bd9cdfb05391", notes: "On the board next year." }, // Rob DeVita
  { flag: "Yes", memberId: "c18f896d-3893-45a8-95d2-a17d9364f4b9", notes: "On the board next year." }, // Prince Maliyil (sheet email differs)
  { flag: "Yes", email: "wesley@beeefficient.co.za", notes: "On the board next year." },
  { flag: "Yes", email: "ruthann@rosemarketingsolutions.net", notes: "Renewed on 05/28." },
  { flag: "Yes", email: "ellenchunter@gmail.com", notes: "On the board next year." },
  { flag: "Yes", email: "amy@thepowergroup.com", notes: "Renewed on 05/27." },
  { flag: "Yes", email: "jessica@truepointagency.com", notes: "Renewed on 05/29." },
  { flag: "Yes", email: "gail@gdaspeakers.com", notes: "Renewed on 05/26." },
  { flag: "Yes", memberId: "37926164-1a8b-4ae8-9765-c1f144a6c5d6", notes: "On the board next year." }, // Lily Smith
  { flag: "Yes", email: "morgan@ticketnology.com", notes: "On the board next year." },

  // ── No ─────────────────────────────────────────────────────────────────
  { flag: "No", memberId: "5e54beb7-2069-4623-95ca-226ddc71ea0c", notes: "May go on leave. Moved to LA." }, // Matthew Davidov (sheet email differs)
  { flag: "No", memberId: "4bc1f151-d59c-43ae-8498-591183be0004", notes: "Said he's done back in January." }, // Chad Boudreau (sheet email differs)
  { flag: "No", memberId: "01ba28a8-e129-4430-a045-c84ce0bb8abb", notes: "Told Ruth Ann that EO doesn't seem like the right fit for him (05/20). Confirmed \"out\" with Minjoe on 05/26." }, // Kourosh Abedi (sheet email differs)
  { flag: "No", email: "a@shopankit.com", notes: "Inquired on May 22nd about on-leave membership. Information sent by Minjoe." },
  { flag: "No", email: "omar@boardwalkwealth.com", notes: "Taking \"at least one year off.\" Told Minjoe on May 22, 2026." },
  { flag: "No", email: "faisal@viberestaurants.com", notes: "Going into YPO as his needs have changed. Told Minjoe on May 21, 2026." },
  { flag: "No", email: "jessica@exitfactor.com", notes: "Told Minjoe she was out on February 2nd. Reconfirmed on 05/26." },

  // ── Maybe ──────────────────────────────────────────────────────────────
  { flag: "Maybe", email: "javier@smm.us", notes: "Haven't seen him at anything in two years. Seems very unlikely." },
  { flag: "Maybe", email: "amit@famousandgravy.com", notes: "We're gonna talk about it next week." },
  { flag: "Maybe", email: "vance@yourdedicatedfiduciary.com", notes: "Minjoe is hearing he's out." },
  { flag: "Maybe", email: "dcharney22@hotmail.com", notes: "Should be in. Set up auto-renewal; warned us about needing to put card down twice." },
  { flag: "Maybe", email: "wessel@wallace.co.za", notes: "Reached out to Minjoe about some EO Universities, so seems likely he renews. 05/13" },
  { flag: "Maybe", email: "brad@blackhawkconst.com", notes: "Been to very little and asked Minjoe about potentially joining EO Kansas. Will follow up. 05/22" },
  { flag: "Maybe", email: "michael@toothtraffic.com", notes: "His business partner is out, and Prince theorizes he may be as well. 05/20" },
  { flag: "Maybe", email: "jkelly@bncsystems.com", notes: "Not sure if the Minjoe magic will work a third time — but we'll try. He's great." },
  { flag: "Maybe", memberId: "aa520e97-7100-452c-beee-207d915449a1", notes: "Teddy asked us to flag her for follow-up back in January." }, // Holly McKinney (sheet email differs)
];

function mapFlag(flag: Flag, notes: string): { renewal_status: string; renewal_intent_response: string } {
  switch (flag) {
    case "Yes":
      return /renewed/i.test(notes)
        ? { renewal_status: "Renewed", renewal_intent_response: "PlanToRenew" }
        : { renewal_status: "Pending", renewal_intent_response: "PlanToRenew" };
    case "No":
      return { renewal_status: "At Risk", renewal_intent_response: "WontRenew" };
    case "Maybe":
      return { renewal_status: "At Risk", renewal_intent_response: "WantToSpeak" };
  }
}

function readEnvLocal(): Record<string, string> {
  const text = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i)] = t.slice(i + 1).trim();
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`mode=${apply ? "APPLY (writes)" : "DRY RUN"}\n`);

  const env = readEnvLocal();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: members, error } = await sb
    .from("members")
    .select("trifecta_member_id, first_name, last_name, email_primary, contact_type, membership_status")
    .eq("chapter_id", EO_DALLAS_CHAPTER_ID)
    .eq("contact_type", "Member");
  if (error) throw new Error(error.message);
  const rows = members ?? [];

  const byEmail = new Map(rows.map((m) => [norm(m.email_primary), m]));
  const byId = new Map(rows.map((m) => [m.trifecta_member_id, m]));

  // Resolve each decision to a member.
  const resolved = new Map<string, Decision>(); // member id → decision
  const unmatched: Decision[] = [];
  for (const d of DECISIONS) {
    let m = d.memberId ? byId.get(d.memberId) : undefined;
    if (!m && d.email) m = byEmail.get(norm(d.email));
    if (m) resolved.set(m.trifecta_member_id, d);
    else unmatched.push(d);
  }

  // Build updates for every ACTIVE member (decision → mapped; otherwise NoResponse).
  const updates: Array<{ id: string; name: string; fields: Record<string, unknown>; bucket: string }> = [];
  const bucketCounts: Record<string, number> = {};
  for (const m of rows) {
    if (!ACTIVE.has(m.membership_status ?? "")) continue; // only dues-paying renew this cycle
    const d = resolved.get(m.trifecta_member_id);
    const mapped = d
      ? mapFlag(d.flag, d.notes)
      : { renewal_status: "Pending", renewal_intent_response: "NoResponse" };
    const bucket = mapped.renewal_status === "Renewed" ? "Renewed" : mapped.renewal_intent_response;
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    updates.push({
      id: m.trifecta_member_id,
      name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      bucket,
      fields: {
        renewal_status: mapped.renewal_status,
        renewal_intent_response: mapped.renewal_intent_response,
        renewal_intent_notes: d ? d.notes : null,
        next_renewal_date: NEXT_RENEWAL_DATE,
        renewal_intent_survey_year: SURVEY_YEAR,
      },
    });
  }

  console.log("━".repeat(60));
  console.log(`Active members to update:   ${updates.length}`);
  console.log(`Decisions matched:          ${resolved.size} / ${DECISIONS.length}`);
  console.log("Bucket distribution:");
  for (const [b, n] of Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${b.padEnd(14)} ${n}`);
  }
  console.log("━".repeat(60));

  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} decision(s) did NOT match a member:`);
    for (const d of unmatched) console.log(`  [${d.flag}] ${d.email ?? d.memberId} — ${d.notes.slice(0, 50)}`);
  }

  if (!apply) {
    console.log("\n(dry run — no writes. Run with --apply to write.)");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const u of updates) {
    const { error: upErr } = await sb.from("members").update(u.fields).eq("trifecta_member_id", u.id);
    if (upErr) {
      failed++;
      console.error(`  failed ${u.name}: ${upErr.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\n=== Result === updated ${ok}, failed ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
