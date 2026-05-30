"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  proposalToCanonical,
  type Proposal,
  type ActionItemEntry,
  type NoteEntry,
} from "@/lib/inbox/applyProposal";

export type InboxActionState = { error: string | null; ok: boolean };

async function gate() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", supabase, user: null, memberId: null as string | null };

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    return { error: "You don't have permission.", supabase, user, memberId: null };
  }
  const { data: me } = await supabase
    .from("members")
    .select("trifecta_member_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return { error: null, supabase, user, memberId: me?.trifecta_member_id ?? null };
}

export async function rejectExtraction(extractionId: string): Promise<InboxActionState> {
  const g = await gate();
  if (g.error) return { error: g.error, ok: false };

  const admin = createAdminClient();
  const { error } = await admin
    .from("communication_extractions")
    .update({ status: "rejected", confirmed_by: g.memberId, confirmed_at: new Date().toISOString() })
    .eq("id", extractionId)
    .eq("status", "proposed");
  if (error) return { error: error.message, ok: false };

  revalidatePath("/inbox");
  return { error: null, ok: true };
}

export async function acceptExtraction(extractionId: string): Promise<InboxActionState> {
  const g = await gate();
  if (g.error) return { error: g.error, ok: false };

  const admin = createAdminClient();

  const { data: ex, error: exErr } = await admin
    .from("communication_extractions")
    .select("id, extraction_type, payload, confidence, target_member_id, status")
    .eq("id", extractionId)
    .single();
  if (exErr || !ex) return { error: "Proposal not found.", ok: false };
  if (ex.status !== "proposed") return { error: "Already reviewed.", ok: false };
  if (!ex.target_member_id) {
    return { error: "No member matched — can't apply. Reject it instead.", ok: false };
  }

  const proposal: Proposal = {
    extraction_type: ex.extraction_type,
    payload: (ex.payload ?? {}) as Record<string, unknown>,
    confidence: ex.confidence,
  };

  let patch;
  try {
    patch = proposalToCanonical(proposal, {
      confirmerId: g.memberId,
      now: new Date().toISOString(),
      newId: () => randomUUID(),
      sourceLabel: "email",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Malformed proposal", ok: false };
  }

  // Read-modify-write the member's canonical fields (matches members/[id]/actions.ts).
  const memberId = ex.target_member_id as string;
  const { data: member, error: mErr } = await admin
    .from("members")
    .select("notes, action_items")
    .eq("trifecta_member_id", memberId)
    .single();
  if (mErr || !member) return { error: "Member not found.", ok: false };

  const update: Record<string, unknown> = {};
  if (patch.appendActionItem) {
    const existing = (member.action_items ?? []) as ActionItemEntry[];
    update.action_items = [...existing, patch.appendActionItem];
  }
  if (patch.appendNote) {
    const existing = (member.notes ?? []) as NoteEntry[];
    update.notes = [...existing, patch.appendNote];
  }
  if (patch.setRenewal) {
    update.renewal_intent_response = patch.setRenewal.renewal_intent_response;
    if (patch.setRenewal.renewal_intent_notes != null) {
      update.renewal_intent_notes = patch.setRenewal.renewal_intent_notes;
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: upErr } = await admin
      .from("members")
      .update(update)
      .eq("trifecta_member_id", memberId);
    if (upErr) return { error: upErr.message, ok: false };
  }

  const { error: markErr } = await admin
    .from("communication_extractions")
    .update({
      status: "accepted",
      confirmed_by: g.memberId,
      confirmed_at: new Date().toISOString(),
      applied_to_canonical: true,
    })
    .eq("id", extractionId);
  if (markErr) return { error: markErr.message, ok: false };

  revalidatePath("/inbox");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/renewals");
  return { error: null, ok: true };
}
