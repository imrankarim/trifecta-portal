import type { SupabaseClient } from "@supabase/supabase-js";

// Append an entry to the chapter-wide system activity log. Best-effort: logging
// must never break the action it records, so failures are swallowed (returns
// null) rather than thrown. Pass the service-role (admin) client.

export interface ActivityEntry {
  chapterId: string;
  actorType?: "system" | "user";
  actorMemberId?: string | null;
  action: string;
  source?: string;
  targetType?: string;
  targetMemberId?: string | null;
  summary: string;
  detail?: Record<string, unknown>;
  reversible?: boolean;
}

export async function logActivity(
  admin: SupabaseClient,
  entry: ActivityEntry,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("system_activity")
      .insert({
        chapter_id: entry.chapterId,
        actor_type: entry.actorType ?? "system",
        actor_member_id: entry.actorMemberId ?? null,
        action: entry.action,
        source: entry.source ?? null,
        target_type: entry.targetType ?? null,
        target_member_id: entry.targetMemberId ?? null,
        summary: entry.summary,
        detail: entry.detail ?? {},
        reversible: entry.reversible ?? false,
      })
      .select("id")
      .single();
    if (error) {
      console.error("logActivity failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("logActivity threw:", e);
    return null;
  }
}
