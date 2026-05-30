import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";
import { ActivityList, type ActivityRow } from "./ActivityList";

interface RawActivity {
  id: string;
  actor_type: string;
  actor_member_id: string | null;
  action: string;
  source: string | null;
  summary: string;
  reversible: boolean;
  reverted_at: string | null;
  created_at: string;
}

export default async function ActivityPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Visible to every board member (not just admins). Undo is gated separately.
  const { data: role } = await supabase.rpc("current_user_role");
  const canUndo = role === "Admin" || role === "ExecutiveDirector";

  const { data: chapters } = await supabase.from("chapters").select("chapter_name").limit(1);
  const chapter = chapters?.[0];

  const { data: rawAct } = await supabase
    .from("system_activity")
    .select("id, actor_type, actor_member_id, action, source, summary, reversible, reverted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const activity = (rawAct ?? []) as unknown as RawActivity[];

  // Resolve actor names.
  const actorIds = Array.from(
    new Set(activity.map((a) => a.actor_member_id).filter((id): id is string => !!id)),
  );
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: mem } = await supabase
      .from("members")
      .select("trifecta_member_id, first_name, last_name")
      .in("trifecta_member_id", actorIds);
    for (const m of mem ?? []) {
      nameById.set(
        m.trifecta_member_id as string,
        `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      );
    }
  }

  const rows: ActivityRow[] = activity.map((a) => ({
    id: a.id,
    actor_type: a.actor_type,
    actorName: a.actor_member_id ? nameById.get(a.actor_member_id) ?? null : null,
    action: a.action,
    source: a.source,
    summary: a.summary,
    reversible: a.reversible,
    reverted_at: a.reverted_at,
    created_at: a.created_at,
    canUndo,
  }));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Trifecta Portal</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Home
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-900">
            ← Home
          </Link>
        </nav>
        <section className="mb-6">
          <p className="text-sm uppercase tracking-wide text-gray-500">
            Activity · {chapter?.chapter_name ?? ""}
          </p>
          <h2 className="text-2xl font-semibold text-gray-900">Activity log</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            Everything Trifecta does — automatically or by a chair — is recorded here for the whole
            board to see. Spot something off? Trace it and undo it.
          </p>
        </section>

        <ActivityList rows={rows} />
      </div>
    </main>
  );
}
