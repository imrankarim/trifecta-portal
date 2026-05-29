import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";
import { BOARD_ROLES, TIER_LABELS, type BoardRoleDef, type BoardTier } from "@/lib/board/roles";
import { computeRoleStatus, type BoardMemberLite, type Tone } from "@/lib/board/status";

const MEMBER_SELECT =
  "trifecta_member_id, contact_type, membership_status, churn_risk_tier, engagement_score_current, " +
  "local_event_attendance_rate_12m, forum_attendance_rate_12m, days_since_last_engagement, " +
  "renewal_intent_response, renewal_status, slp_engagement_status, custom_fields";

const TIER_ORDER: BoardTier[] = ["leadership", "core", "extended"];

export default async function BoardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  const isAdmin = role === "Admin" || role === "ExecutiveDirector";

  const { data: chapters } = await supabase
    .from("chapters")
    .select("chapter_name")
    .limit(1);
  const chapter = chapters?.[0];

  const { data: rawMembers } = await supabase.from("members").select(MEMBER_SELECT);
  const members = (rawMembers ?? []) as unknown as BoardMemberLite[];

  const visibleRoles = BOARD_ROLES.filter((r) => isAdmin || !r.adminOnly);

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
            <Link
              href="/forums"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Forums
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
            Board · {chapter?.chapter_name ?? ""}
          </p>
          <h2 className="text-2xl font-semibold text-gray-900">Board roles</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            Every role, visible to every board member — open any role to see who holds it and
            what&apos;s happening in their area. Shared awareness across the board.
          </p>
        </section>

        {TIER_ORDER.map((tier) => {
          const roles = visibleRoles.filter((r) => r.tier === tier);
          if (roles.length === 0) return null;
          return (
            <section key={tier} className="mb-8">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                {TIER_LABELS[tier]}
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map((r) => (
                  <RoleCard key={r.key} role={r} members={members} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function RoleCard({ role, members }: { role: BoardRoleDef; members: BoardMemberLite[] }) {
  const status = computeRoleStatus(role.domain, members);
  const shown = status.metrics.slice(0, 3);

  return (
    <Link
      href={`/board/${role.key}`}
      className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
            {role.title}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {role.holders.map((h) => h.name).join(" & ")}
          </div>
        </div>
        {role.adminOnly && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200 shrink-0">
            Admin
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{role.blurb}</p>

      {shown.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {shown.map((mtr) => (
            <div key={mtr.label}>
              <div className={`text-lg font-semibold tabular-nums leading-none ${toneClass(mtr.tone)}`}>
                {mtr.value}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">{mtr.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-gray-400 italic">No connected data yet</p>
      )}
    </Link>
  );
}

function toneClass(tone: Tone): string {
  switch (tone) {
    case "good":
      return "text-green-700";
    case "warn":
      return "text-amber-700";
    case "bad":
      return "text-red-700";
    default:
      return "text-gray-900";
  }
}
