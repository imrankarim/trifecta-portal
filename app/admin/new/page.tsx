import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberForm } from "../MemberForm";

export default async function NewMemberPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin</p>
            <h1 className="text-lg font-semibold text-gray-900">New member</h1>
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
        <MemberForm mode="create" />
      </div>
    </main>
  );
}
