import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  proposalToCanonical,
  type Proposal,
  type ActionItemEntry,
  type NoteEntry,
} from "./applyProposal";
import { logActivity } from "../activity/log";

// Shared "apply an accepted/auto-applied extraction to the member's canonical
// record" path, used by BOTH the ingestion route (system auto-apply) and the
// inbox accept action (user accept). It writes canonical, marks the extraction
// applied, and logs a reversible activity entry carrying everything undo needs.
//
// Server-side (does I/O via the admin client); not a pure function.

export interface ExtractionRecord {
  id: string;
  chapter_id: string;
  extraction_type: Proposal["extraction_type"];
  payload: Record<string, unknown> | null;
  confidence: number | null;
  target_member_id: string | null;
}

export interface ApplyOptions {
  /** member_id of the human accepting; null for system auto-apply. */
  confirmerId: string | null;
  actorType: "system" | "user";
  source: string;
}

export async function applyExtractionToMember(
  admin: SupabaseClient,
  ex: ExtractionRecord,
  opts: ApplyOptions,
): Promise<{ ok: boolean; error?: string; activityId?: string }> {
  if (!ex.target_member_id) return { ok: false, error: "No member matched — can't apply." };

  const proposal: Proposal = {
    extraction_type: ex.extraction_type,
    payload: ex.payload ?? {},
    confidence: ex.confidence,
  };

  let patch;
  try {
    patch = proposalToCanonical(proposal, {
      confirmerId: opts.confirmerId,
      now: new Date().toISOString(),
      newId: () => randomUUID(),
      sourceLabel: opts.source,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Malformed proposal" };
  }

  const { data: member, error: mErr } = await admin
    .from("members")
    .select("notes, action_items, renewal_intent_response, renewal_intent_notes, first_name, last_name")
    .eq("trifecta_member_id", ex.target_member_id)
    .single();
  if (mErr || !member) return { ok: false, error: "Member not found." };

  const memberName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "member";
  const update: Record<string, unknown> = {};
  // detail carries everything undo needs to reverse the change.
  const detail: Record<string, unknown> = {
    extraction_id: ex.id,
    extraction_type: ex.extraction_type,
    member_id: ex.target_member_id,
  };
  let summary = "";

  if (patch.appendActionItem) {
    update.action_items = [...((member.action_items ?? []) as ActionItemEntry[]), patch.appendActionItem];
    detail.appended_kind = "action_item";
    detail.appended_id = patch.appendActionItem.id;
    summary = `Added action item for ${memberName}: "${patch.appendActionItem.text}"`;
  }
  if (patch.appendNote) {
    update.notes = [...((member.notes ?? []) as NoteEntry[]), patch.appendNote];
    detail.appended_kind = "note";
    detail.appended_id = patch.appendNote.id;
    summary = `Logged a note for ${memberName}`;
  }
  if (patch.setRenewal) {
    detail.renewal_previous = {
      renewal_intent_response: member.renewal_intent_response,
      renewal_intent_notes: member.renewal_intent_notes,
    };
    update.renewal_intent_response = patch.setRenewal.renewal_intent_response;
    if (patch.setRenewal.renewal_intent_notes != null) {
      update.renewal_intent_notes = patch.setRenewal.renewal_intent_notes;
    }
    summary = `Set renewal intent for ${memberName} → ${patch.setRenewal.renewal_intent_response}`;
  }

  if (Object.keys(update).length > 0) {
    const { error: upErr } = await admin
      .from("members")
      .update(update)
      .eq("trifecta_member_id", ex.target_member_id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  await admin
    .from("communication_extractions")
    .update({
      status: "accepted",
      confirmed_by: opts.confirmerId,
      confirmed_at: new Date().toISOString(),
      applied_to_canonical: true,
    })
    .eq("id", ex.id);

  const activityId = await logActivity(admin, {
    chapterId: ex.chapter_id,
    actorType: opts.actorType,
    actorMemberId: opts.confirmerId,
    action: opts.actorType === "system" ? "email_extraction_auto_applied" : "proposal_accepted",
    source: opts.source,
    targetType: "member",
    targetMemberId: ex.target_member_id,
    summary,
    detail,
    reversible: true,
  });

  return { ok: true, activityId: activityId ?? undefined };
}
