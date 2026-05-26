import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: roleRow } = await supabase.rpc("current_user_role");
  if (roleRow !== "Admin" && roleRow !== "ExecutiveDirector") {
    redirect("/dashboard");
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("chapter_name")
    .limit(1)
    .single();

  const { data: members } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, membership_status",
    )
    .order("last_name", { ascending: true });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin</p>
            <h1 className="text-lg font-semibold text-gray-900">
              {chapter?.chapter_name ?? "Trifecta Portal"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
            >
              ← Back to dashboard
            </Link>
            <Link
              href="/admin/new"
              className="bg-gray-900 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-800"
            >
              + New member
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Members</h2>

        {!members || members.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-sm text-gray-500">
            No members yet. Click <span className="font-medium">+ New member</span> to add one.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m) => (
                  <tr key={m.trifecta_member_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {m.first_name} {m.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.email_primary}</td>
                    <td className="px-4 py-3 text-gray-600">{m.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">{m.membership_status}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/${m.trifecta_member_id}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
