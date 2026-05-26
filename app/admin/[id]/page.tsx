import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberForm } from "../MemberForm";

export default async function EditMemberPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    redirect("/dashboard");
  }

  const { data: member } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, email_primary, first_name, last_name, preferred_name, phone_mobile, job_title, linkedin_url, company_name, city, state_province, membership_status, join_date_original",
    )
    .eq("trifecta_member_id", params.id)
    .single();

  if (!member) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin</p>
            <h1 className="text-lg font-semibold text-gray-900">
              Edit {member.first_name} {member.last_name}
            </h1>
          </div>
          <Link
            href="/admin"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <MemberForm mode="edit" initial={member} />
      </div>
    </main>
  );
}
