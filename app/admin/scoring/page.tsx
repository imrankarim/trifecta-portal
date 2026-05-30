import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WEIGHTS, parseScoringWeights } from "@/lib/scoring/engagementScore";
import { ScoringWeights } from "./ScoringWeights";

export default async function ScoringConfigPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") redirect("/dashboard");

  const { data: chapter } = await supabase
    .from("chapters")
    .select("chapter_name, scoring_weights")
    .limit(1)
    .single();

  // Initialize sliders from saved weights, else the code defaults (as 0–100).
  const saved = parseScoringWeights(chapter?.scoring_weights);
  const initial: Record<string, number> = saved
    ? saved
    : Object.fromEntries(
        Object.entries(WEIGHTS).map(([k, v]) => [k, Math.round(v * 100)]),
      );
  const usingDefaults = !saved;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Admin · Scoring</p>
            <h1 className="text-lg font-semibold text-gray-900">
              {chapter?.chapter_name ?? "Trifecta Portal"}
            </h1>
          </div>
          <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
            ← Back to admin
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <section className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Engagement score weights</h2>
          <p className="text-sm text-gray-600 max-w-2xl mt-1">
            Tune how much each signal counts toward a member&apos;s engagement score and risk tier.
            Weights are relative — they&apos;re normalized automatically. Saving recalculates every
            member&apos;s score for the chapter.
          </p>
          {usingDefaults && (
            <p className="text-xs text-gray-500 mt-2">Currently using Trifecta&apos;s default weights.</p>
          )}
        </section>

        <ScoringWeights initial={initial} />
      </div>
    </main>
  );
}
