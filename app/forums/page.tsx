import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";
import { resolveModerator, type ResolvedModerator } from "@/lib/forums/resolveModerator";

interface MemberRow {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  email_primary: string | null;
  contact_type: string | null;
  membership_status: string | null;
  forum_role: string | null;
  churn_risk_tier: string | null;
  engagement_score_current: number | null;
  forum_attendance_rate_12m: number | null;
  custom_fields: Record<string, unknown> | null;
}

interface ForumSummary {
  name: string;
  slug: string;
  size: number;
  moderator: ResolvedModerator | null;
  avgScore: number | null;
  avgAttendance: number | null;
  atRiskCount: number;
}

export default async function ForumsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: chapters } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name, city, country, eo_region")
    .limit(1);
  const chapter = chapters?.[0];

  const { data: rawMembers } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, contact_type, membership_status, " +
        "forum_role, churn_risk_tier, engagement_score_current, forum_attendance_rate_12m, custom_fields",
    );
  const members = (rawMembers ?? []) as unknown as MemberRow[];

  const forums = aggregateForums(members);

  const totalForums = forums.length;
  const totalMembers = forums.reduce((acc, f) => acc + f.size, 0);
  const scored = forums.filter((f) => f.avgScore != null);
  const overallAvg =
    scored.length > 0
      ? Math.round(scored.reduce((acc, f) => acc + (f.avgScore ?? 0), 0) / scored.length)
      : null;
  const forumsAtRisk = forums.filter((f) => f.avgScore != null && f.avgScore < 50).length;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
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
            <Link
              href="/dashboard/directory"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Directory
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-900">
            ← Home
          </Link>
        </nav>
        <section className="mb-6">
          <p className="text-sm uppercase tracking-wide text-gray-500">
            Forums · {chapter?.chapter_name ?? ""}
          </p>
          <h2 className="text-2xl font-semibold text-gray-900">All forums</h2>
          <p className="text-sm text-gray-600">
            The backbone of EO — every member belongs to one. Sorted so the forums that need
            attention surface first.
          </p>
        </section>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Forums" value={String(totalForums)} />
          <StatCard label="Members in forums" value={String(totalMembers)} />
          <StatCard
            label="Avg engagement"
            value={overallAvg != null ? String(overallAvg) : "—"}
            tone={scoreTone(overallAvg)}
          />
          <StatCard
            label="Forums at risk"
            value={String(forumsAtRisk)}
            tone={forumsAtRisk > 0 ? "bad" : "good"}
            hint="Avg score below 50"
          />
        </div>

        {/* Forum table inside portal card chrome */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {totalForums} forum{totalForums === 1 ? "" : "s"}
            </h3>
            <span className="text-xs text-gray-500">Lowest engagement first</span>
          </div>

          {forums.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No forums found. Members will appear here once forum assignments are synced.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Forum</th>
                  <th className="text-left px-4 py-3 font-medium">Moderator</th>
                  <th className="text-center px-4 py-3 font-medium">Members</th>
                  <th className="text-center px-4 py-3 font-medium">At risk</th>
                  <th className="text-left px-4 py-3 font-medium w-56">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {forums.map((f) => (
                  <tr key={f.name} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-3">
                      <Link
                        href={`/forums/${encodeURIComponent(f.slug)}`}
                        className="text-gray-900 font-medium group-hover:text-blue-700"
                      >
                        {f.name}
                      </Link>
                      {f.avgAttendance != null && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {f.avgAttendance}% avg forum attendance
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {f.moderator ? (
                        f.moderator.memberId ? (
                          <Link
                            href={`/members/${f.moderator.memberId}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {f.moderator.name}
                          </Link>
                        ) : (
                          f.moderator.name
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-700">{f.size}</td>
                    <td className="px-4 py-3 text-center">
                      {f.atRiskCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
                          {f.atRiskCount}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <HealthBar score={f.avgScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}

function aggregateForums(members: MemberRow[]): ForumSummary[] {
  const byForum = new Map<
    string,
    { size: number; scores: number[]; attendances: number[]; atRiskCount: number; moderator: string | null }
  >();

  for (const m of members) {
    if (m.contact_type !== "Member") continue;
    const status = m.membership_status ?? "";
    if (!["Active", "Grace Period", "Lapsed"].includes(status)) continue;

    const forumName = m.custom_fields?.forum_name as string | undefined;
    if (!forumName) continue;

    if (!byForum.has(forumName)) {
      byForum.set(forumName, { size: 0, scores: [], attendances: [], atRiskCount: 0, moderator: null });
    }
    const entry = byForum.get(forumName)!;
    entry.size++;
    if (m.engagement_score_current != null) entry.scores.push(m.engagement_score_current);
    if (m.forum_attendance_rate_12m != null) entry.attendances.push(m.forum_attendance_rate_12m);
    if (m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High") entry.atRiskCount++;
    const mod = m.custom_fields?.forum_moderator_name as string | undefined;
    if (mod && !entry.moderator) entry.moderator = mod;
  }

  const out: ForumSummary[] = [];
  for (const [name, entry] of Array.from(byForum.entries())) {
    out.push({
      name,
      slug: name,
      size: entry.size,
      moderator: resolveModerator(entry.moderator, members),
      avgScore:
        entry.scores.length > 0
          ? Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length)
          : null,
      avgAttendance:
        entry.attendances.length > 0
          ? Math.round(entry.attendances.reduce((a, b) => a + b, 0) / entry.attendances.length)
          : null,
      atRiskCount: entry.atRiskCount,
    });
  }
  out.sort((a, b) => {
    if (a.avgScore == null && b.avgScore == null) return a.name.localeCompare(b.name);
    if (a.avgScore == null) return 1;
    if (b.avgScore == null) return -1;
    return a.avgScore - b.avgScore;
  });
  return out;
}

function HealthBar({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-gray-400">No score yet</span>;
  }
  const pct = Math.max(0, Math.min(100, score));
  const barColor =
    score >= 60 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor =
    score >= 60 ? "text-green-700" : score >= 40 ? "text-amber-700" : "text-red-700";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-medium tabular-nums w-7 text-right ${textColor}`}>
        {score}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  hint?: string;
}) {
  const valueClass = {
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-700",
    neutral: "text-gray-900",
  }[tone ?? "neutral"];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function scoreTone(s: number | null): "good" | "warn" | "bad" | "neutral" {
  if (s == null) return "neutral";
  if (s >= 60) return "good";
  if (s >= 40) return "warn";
  return "bad";
}
