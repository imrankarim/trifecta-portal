import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildDigest, renderDigestHTML } from "@/lib/digest/atRiskDigest";

/**
 * Preview the at-risk weekly digest exactly as it would render in email,
 * without sending anything. Admin/ED only.
 *
 * Phase 1 build plan Week 3, Step 5:
 *   "Add a 'Preview Digest' button on /admin that renders what this Monday's
 *    email *would* look like, without sending it. So I can test without
 *    spamming."
 */
export default async function DigestPreviewPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") {
    redirect("/dashboard");
  }

  // Pull the chapter the user belongs to (RLS-scoped, so they only see theirs)
  const { data: chapter } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name")
    .limit(1)
    .single();

  if (!chapter) {
    return (
      <main className="p-8">
        <p className="text-red-600">No chapter found for your user.</p>
      </main>
    );
  }

  const digest = await buildDigest(supabase, chapter.trifecta_chapter_id);
  const html = renderDigestHTML(digest);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin</p>
            <h1 className="text-lg font-semibold text-gray-900">Digest preview · {chapter.chapter_name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {digest.top_risk.length} at-risk · scored {digest.stats.scored_members} of {digest.stats.active_members + digest.stats.on_leave_members} current members
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            ← Back to admin
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-xs text-gray-500 mb-4">
          This is exactly what the weekly Monday email will look like. Nothing has been sent.
        </p>
        <div
          className="bg-white border border-gray-200 rounded-md overflow-hidden"
          // Email HTML is self-contained with inline styles
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
