import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Medium: "bg-amber-100 text-amber-800 ring-amber-200",
  Low: "bg-green-100 text-green-800 ring-green-200",
  Monitor: "bg-gray-100 text-gray-700 ring-gray-200",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  const isAdmin = role === "Admin" || role === "ExecutiveDirector";

  // RLS-scoped: returns the one chapter the user belongs to (or zero rows if
  // their auth user isn't linked to a member yet).
  const { data: chapters } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name, city, country, eo_region")
    .limit(1);
  const chapter = chapters?.[0];

  // RLS-scoped: returns only members in the user's own chapter.
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, membership_status, churn_risk_tier, engagement_score_current",
    )
    .order("last_name", { ascending: true });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Trifecta Portal</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!chapter ? (
          <NoChapterNotice email={user.email ?? ""} />
        ) : (
          <>
            <section className="mb-8">
              <p className="text-sm uppercase tracking-wide text-gray-500">Chapter</p>
              <h2 className="text-2xl font-semibold text-gray-900">{chapter.chapter_name}</h2>
              <p className="text-sm text-gray-600">
                {chapter.city}, {chapter.country} · {chapter.eo_region}
              </p>
            </section>

            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">Members</h3>
                <p className="text-sm text-gray-500">
                  {members?.length ?? 0} {(members?.length ?? 0) === 1 ? "member" : "members"}
                </p>
              </div>

              {membersError ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
                  Could not load members: {membersError.message}
                </div>
              ) : !members || members.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-sm text-gray-500">
                  No members in this chapter yet.
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Name</th>
                        <th className="text-left px-4 py-3 font-medium">Email</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Risk</th>
                        <th className="text-right px-4 py-3 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {members.map((m) => (
                        <tr key={m.trifecta_member_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">
                            {m.first_name} {m.last_name}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.email_primary}</td>
                          <td className="px-4 py-3 text-gray-600">{m.membership_status}</td>
                          <td className="px-4 py-3">
                            {m.churn_risk_tier ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TIER_STYLES[m.churn_risk_tier] ?? TIER_STYLES.Monitor}`}
                              >
                                {m.churn_risk_tier}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {m.engagement_score_current ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function NoChapterNotice({ email }: { email: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-md p-6 text-sm text-amber-900">
      <p className="font-medium mb-2">Your account isn&apos;t linked to a chapter yet.</p>
      <p>
        An admin needs to create a member row in Supabase with{" "}
        <code className="bg-white px-1 py-0.5 rounded border border-amber-300">email_primary = {email}</code>{" "}
        before this dashboard will show data. The auth trigger will link your account on
        next sign-in.
      </p>
    </div>
  );
}
