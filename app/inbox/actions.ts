"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyExtractionToMember, type ExtractionRecord } from "@/lib/inbox/applyExtraction";
import { logActivity } from "@/lib/activity/log";

export type InboxActionState = { error: string | null; ok: boolean };

async function gate() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", memberId: null as string | null };

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    return { error: "You don't have permission.", memberId: null };
  }
  const { data: me } = await supabase
    .from("members")
    .select("trifecta_member_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return { error: null, memberId: me?.trifecta_member_id ?? null };
}

export async function rejectExtraction(extractionId: string): Promise<InboxActionState> {
  const g = await gate();
  if (g.error) return { error: g.error, ok: false };

  const admin = createAdminClient();
  const { data: ex } = await admin
    .from("communication_extractions")
    .select("id, chapter_id, target_member_id, extraction_type")
    .eq("id", extractionId)
    .single();

  const { error } = await admin
    .from("communication_extractions")
    .update({ status: "rejected", confirmed_by: g.memberId, confirmed_at: new Date().toISOString() })
    .eq("id", extractionId)
    .eq("status", "proposed");
  if (error) return { error: error.message, ok: false };

  if (ex) {
    await logActivity(admin, {
      chapterId: ex.chapter_id,
      actorType: "user",
      actorMemberId: g.memberId,
      action: "proposal_rejected",
      source: "email",
      targetType: "member",
      targetMemberId: ex.target_member_id,
      summary: `Rejected a proposed ${String(ex.extraction_type).replace(/_/g, " ")}`,
      reversible: false,
    });
  }

  revalidatePath("/inbox");
  revalidatePath("/activity");
  return { error: null, ok: true };
}

export async function acceptExtraction(extractionId: string): Promise<InboxActionState> {
  const g = await gate();
  if (g.error) return { error: g.error, ok: false };

  const admin = createAdminClient();
  const { data: ex, error: exErr } = await admin
    .from("communication_extractions")
    .select("id, chapter_id, extraction_type, payload, confidence, target_member_id, status")
    .eq("id", extractionId)
    .single();
  if (exErr || !ex) return { error: "Proposal not found.", ok: false };
  if (ex.status !== "proposed") return { error: "Already reviewed.", ok: false };

  const res = await applyExtractionToMember(admin, ex as ExtractionRecord, {
    confirmerId: g.memberId,
    actorType: "user",
    source: "email",
  });
  if (!res.ok) return { error: res.error ?? "Could not apply.", ok: false };

  revalidatePath("/inbox");
  revalidatePath("/activity");
  if (ex.target_member_id) revalidatePath(`/members/${ex.target_member_id}`);
  revalidatePath("/renewals");
  return { error: null, ok: true };
}
