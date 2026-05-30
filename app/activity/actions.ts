"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type UndoState = { error: string | null; ok: boolean };

/**
 * Reverse a reversible activity entry: remove an appended note/action item by
 * id, or restore the prior renewal values. Marks the entry reverted and flips
 * the source extraction back to rejected so it doesn't read as applied.
 */
export async function undoActivity(activityId: string): Promise<UndoState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: false };
  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    return { error: "You don't have permission to undo.", ok: false };
  }
  const { data: me } = await supabase
    .from("members")
    .select("trifecta_member_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const myId = me?.trifecta_member_id ?? null;

  const admin = createAdminClient();
  const { data: act, error: actErr } = await admin
    .from("system_activity")
    .select("id, reversible, reverted_at, target_member_id, detail")
    .eq("id", activityId)
    .single();
  if (actErr || !act) return { error: "Activity not found.", ok: false };
  if (!act.reversible) return { error: "This action can't be undone.", ok: false };
  if (act.reverted_at) return { error: "Already undone.", ok: false };

  const detail = (act.detail ?? {}) as {
    appended_kind?: "note" | "action_item";
    appended_id?: string;
    renewal_previous?: { renewal_intent_response: string | null; renewal_intent_notes: string | null };
    extraction_id?: string;
  };
  const memberId = act.target_member_id as string | null;

  if (memberId) {
    if (detail.appended_kind === "note" && detail.appended_id) {
      const { data: m } = await admin.from("members").select("notes").eq("trifecta_member_id", memberId).single();
      const notes = ((m?.notes ?? []) as Array<{ id?: string }>).filter((n) => n.id !== detail.appended_id);
      await admin.from("members").update({ notes }).eq("trifecta_member_id", memberId);
    } else if (detail.appended_kind === "action_item" && detail.appended_id) {
      const { data: m } = await admin.from("members").select("action_items").eq("trifecta_member_id", memberId).single();
      const items = ((m?.action_items ?? []) as Array<{ id?: string }>).filter((a) => a.id !== detail.appended_id);
      await admin.from("members").update({ action_items: items }).eq("trifecta_member_id", memberId);
    } else if (detail.renewal_previous) {
      await admin
        .from("members")
        .update({
          renewal_intent_response: detail.renewal_previous.renewal_intent_response,
          renewal_intent_notes: detail.renewal_previous.renewal_intent_notes,
        })
        .eq("trifecta_member_id", memberId);
    }
  }

  await admin
    .from("system_activity")
    .update({ reverted_at: new Date().toISOString(), reverted_by: myId })
    .eq("id", activityId);

  if (detail.extraction_id) {
    await admin
      .from("communication_extractions")
      .update({ status: "rejected", applied_to_canonical: false })
      .eq("id", detail.extraction_id);
  }

  revalidatePath("/activity");
  if (memberId) revalidatePath(`/members/${memberId}`);
  revalidatePath("/renewals");
  return { error: null, ok: true };
}
