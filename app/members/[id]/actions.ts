"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null };

const NOTE_CATEGORIES = [
  "general",
  "outreach",
  "renewal",
  "forum",
  "sponsor",
  "event",
] as const;
type NoteCategory = (typeof NOTE_CATEGORIES)[number];

interface NoteEntry {
  id?: string;
  ts?: string;
  text: string;
  author_id?: string | null;
  category?: NoteCategory;
  source?: string;
  source_field?: string;
}

interface ActionItem {
  id: string;
  text: string;
  created_at: string;
  created_by: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
}

/** Resolve the calling user → their trifecta_member_id (or null if no link). */
async function currentMemberId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("trifecta_member_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data?.trifecta_member_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Notes
// ─────────────────────────────────────────────────────────────────────

export async function addNote(
  memberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    const text = (formData.get("text") as string | null)?.trim();
    const category = formData.get("category") as string | null;
    if (!text) return { error: "Note text is required" };

    const authorId = await currentMemberId(supabase);
    const note: NoteEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      text,
      author_id: authorId,
      category: NOTE_CATEGORIES.includes(category as NoteCategory)
        ? (category as NoteCategory)
        : "general",
    };

    const { data: current, error: readErr } = await supabase
      .from("members")
      .select("notes")
      .eq("trifecta_member_id", memberId)
      .single();
    if (readErr) return { error: readErr.message };
    const existing = (current?.notes ?? []) as NoteEntry[];

    const { error: updErr } = await supabase
      .from("members")
      .update({ notes: [...existing, note] })
      .eq("trifecta_member_id", memberId);
    if (updErr) return { error: updErr.message };

    revalidatePath(`/members/${memberId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
  return { error: null };
}

// ─────────────────────────────────────────────────────────────────────
// Action items
// ─────────────────────────────────────────────────────────────────────

export async function addAction(
  memberId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    const text = (formData.get("text") as string | null)?.trim();
    const dueDate = (formData.get("due_date") as string | null)?.trim() || null;
    if (!text) return { error: "Action text is required" };

    const authorId = await currentMemberId(supabase);
    const action: ActionItem = {
      id: randomUUID(),
      text,
      created_at: new Date().toISOString(),
      created_by: authorId,
      due_date: dueDate,
      assigned_to: authorId, // self-assign for Phase 1
      completed_at: null,
      completed_by: null,
    };

    const { data: current, error: readErr } = await supabase
      .from("members")
      .select("action_items")
      .eq("trifecta_member_id", memberId)
      .single();
    if (readErr) return { error: readErr.message };
    const existing = (current?.action_items ?? []) as ActionItem[];

    const { error: updErr } = await supabase
      .from("members")
      .update({ action_items: [...existing, action] })
      .eq("trifecta_member_id", memberId);
    if (updErr) return { error: updErr.message };

    revalidatePath(`/members/${memberId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
  return { error: null };
}

export async function toggleAction(memberId: string, actionId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: current, error: readErr } = await supabase
    .from("members")
    .select("action_items")
    .eq("trifecta_member_id", memberId)
    .single();
  if (readErr) throw new Error(readErr.message);
  const existing = (current?.action_items ?? []) as ActionItem[];

  const authorId = await currentMemberId(supabase);
  const now = new Date().toISOString();
  const updated = existing.map((a) => {
    if (a.id !== actionId) return a;
    if (a.completed_at) {
      // Re-open
      return { ...a, completed_at: null, completed_by: null };
    }
    // Mark complete
    return { ...a, completed_at: now, completed_by: authorId };
  });

  const { error: updErr } = await supabase
    .from("members")
    .update({ action_items: updated })
    .eq("trifecta_member_id", memberId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath(`/members/${memberId}`);
}
