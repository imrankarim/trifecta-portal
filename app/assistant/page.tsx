import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";
import { Assistant } from "./Assistant";

export default async function AssistantPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: chapters } = await supabase.from("chapters").select("chapter_name").limit(1);
  const chapterName = chapters?.[0]?.chapter_name ?? "your chapter";

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
          <p className="text-sm uppercase tracking-wide text-gray-500">AI Assistant</p>
          <h2 className="text-2xl font-semibold text-gray-900">Ask about {chapterName}</h2>
          <p className="text-sm text-gray-600">
            Answers come from your live chapter data — scores, forums, attendance, and notes.
          </p>
        </section>

        <Assistant />
      </div>
    </main>
  );
}
