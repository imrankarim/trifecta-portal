import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../../dashboard/actions";
import { resolveModerator } from "@/lib/forums/resolveModerator";

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Medium: "bg-amber-100 text-amber-800 ring-amber-200",
  Low: "bg-green-100 text-green-800 ring-green-200",
  Monitor: "bg-gray-100 text-gray-700 ring-gray-200",
};

const ROLE_STYLES: Record<string, string> = {
  Chair: "bg-blue-100 text-blue-800 ring-blue-200",
  "Vice Chair": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  Moderator: "bg-purple-100 text-purple-800 ring-purple-200",
};

interface MemberRow {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  email_primary: string | null;
  company_name: string | null;
  contact_type: string | null;
  membership_status: string | null;
  forum_role: string | null;
  churn_risk_tier: string | null;
  engagement_score_current: number | null;
  forum_attendance_rate_12m: number | null;
  custom_fields: Record<string, unknown> | null;
}

export default async function ForumDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const forumName = decodeURIComponent(params.slug);

  const { data: rawMembers } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, contact_type, membership_status, " +
        "forum_role, churn_risk_tier, engagement_score_current, forum_attendance_rate_12m, custom_fields",
    )
    .order("last_name", { ascending: true });

  const all = (rawMembers ?? []) as unknown as MemberRow[];
  const forumMembers = all.filter(
    (m) => (m.custom_fields?.forum_name as string | undefined) === forumName,
  );

  if (forumMembers.length === 0) notFound();

  // Roll-up stats — include all members associated with the forum regardless of status
  const active = forumMembers.filter(
    (m) => m.contact_type === "Member" && ["Active", "Grace Period", "Lapsed"].includes(m.membership_status ?? ""),
  );
  const scores = active.map((m) => m.engagement_score_current).filter((s): s is number => s != null);
  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const attendances = active
    .map((m) => m.forum_attendance_rate_12m)
    .filter((s): s is number => s != null);
  const avgAttendance =
    attendances.length > 0
      ? Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length)
      : null;
  const atRisk = active.filter(
    (m) => m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High",
  );

  // Moderator from any forum member's record — resolved to a clean name + link.
  const moderatorRaw = forumMembers.find((m) => m.custom_fields?.forum_moderator_name)
    ?.custom_fields?.forum_moderator_name as string | undefined;
  const moderator = resolveModerator(moderatorRaw, all);
  // Experience ratings (average over those who have one)
  const ratings = forumMembers
    .map((m) => m.custom_fields?.forum_experience_rating)
    .filter((r): r is number => typeof r === "number");
  const avgRating =
    ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  // Sort members for the table: chairs first, then by engagement score asc (worst on top)
  const sorted = forumMembers.slice().sort((a, b) => {
    const ra = roleRank(a.forum_role);
    const rb = roleRank(b.forum_role);
    if (ra !== rb) return ra - rb;
    return (a.engagement_score_current ?? 999) - (b.engagement_score_current ?? 999);
  });

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
              href="/forums"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              All forums
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
            Home
          </Link>{" "}
          ·{" "}
          <Link href="/forums" className="hover:text-gray-900">
            Forums
          </Link>
        </nav>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">{forumName}</h2>
          <p className="text-sm text-gray-600">
            {active.length} active member{active.length === 1 ? "" : "s"}
            {moderator && (
              <>
                {" · Moderator: "}
                {moderator.memberId ? (
                  <Link
                    href={`/members/${moderator.memberId}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {moderator.name}
                  </Link>
                ) : (
                  <span className="text-gray-700">{moderator.name}</span>
                )}
              </>
            )}
          </p>
        </section>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Avg engagement" value={avgScore != null ? String(avgScore) : "—"} tone={scoreTone(avgScore)} />
          <StatCard
            label="Avg forum attendance"
            value={avgAttendance != null ? `${avgAttendance}%` : "—"}
            tone={rateTone(avgAttendance)}
          />
          <StatCard
            label="At-risk members"
            value={String(atRisk.length)}
            tone={atRisk.length > 0 ? "bad" : "good"}
          />
          <StatCard
            label="Forum rating"
            value={avgRating != null ? `${avgRating}/10` : "—"}
            tone="neutral"
            hint={`from ${ratings.length} response${ratings.length === 1 ? "" : "s"}`}
          />
        </div>

        {/* At-risk callout */}
        {atRisk.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-sm font-medium text-red-900 mb-1">
              {atRisk.length} member{atRisk.length === 1 ? "" : "s"} in this forum {atRisk.length === 1 ? "is" : "are"} at risk.
            </p>
            <p className="text-sm text-red-800">
              The forum&apos;s health depends on everyone showing up. Consider a check-in with
              {" "}
              {atRisk
                .slice(0, 3)
                .map((m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim())
                .join(", ")}
              {atRisk.length > 3 ? `, and ${atRisk.length - 3} more` : ""}.
            </p>
          </div>
        )}

        {/* Members table */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Members ({forumMembers.length})
            </h3>
            <span className="text-xs text-gray-500">Leadership first, then by engagement</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Attendance</th>
                <th className="text-left px-4 py-3 font-medium">Risk</th>
                <th className="text-left px-4 py-3 font-medium w-44">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((m) => (
                <tr key={m.trifecta_member_id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-5 py-3 text-gray-900">
                    <Link
                      href={`/members/${m.trifecta_member_id}`}
                      className="font-medium group-hover:text-blue-700"
                    >
                      {m.first_name} {m.last_name}
                    </Link>
                    {m.company_name && (
                      <div className="text-xs text-gray-500">{m.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.forum_role && m.forum_role !== "Member" && m.forum_role !== "None" ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${ROLE_STYLES[m.forum_role] ?? "bg-gray-100 text-gray-700 ring-gray-200"}`}
                      >
                        {m.forum_role}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Member</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{m.membership_status ?? "—"}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                    {m.forum_attendance_rate_12m != null ? `${m.forum_attendance_rate_12m}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {m.churn_risk_tier ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TIER_STYLES[m.churn_risk_tier] ?? "bg-gray-100"}`}
                      >
                        {m.churn_risk_tier}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <HealthBar score={m.engagement_score_current} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function roleRank(role: string | null): number {
  switch (role) {
    case "Chair":
      return 0;
    case "Vice Chair":
      return 1;
    case "Moderator":
      return 2;
    default:
      return 3;
  }
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

function HealthBar({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const pct = Math.max(0, Math.min(100, score));
  const barColor = score >= 60 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = score >= 60 ? "text-green-700" : score >= 40 ? "text-amber-700" : "text-red-700";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-medium tabular-nums w-7 text-right ${textColor}`}>{score}</span>
    </div>
  );
}

function scoreTone(s: number | null): "good" | "warn" | "bad" | "neutral" {
  if (s == null) return "neutral";
  if (s >= 60) return "good";
  if (s >= 40) return "warn";
  return "bad";
}

function rateTone(s: number | null): "good" | "warn" | "bad" | "neutral" {
  if (s == null) return "neutral";
  if (s >= 60) return "good";
  if (s >= 30) return "warn";
  return "bad";
}
