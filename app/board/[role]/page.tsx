import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../../dashboard/actions";
import { getRole, TIER_LABELS } from "@/lib/board/roles";
import { computeRoleStatus, type BoardMemberLite, type Tone } from "@/lib/board/status";

const MEMBER_SELECT =
  "trifecta_member_id, contact_type, membership_status, churn_risk_tier, engagement_score_current, " +
  "local_event_attendance_rate_12m, forum_attendance_rate_12m, days_since_last_engagement, " +
  "renewal_intent_response, renewal_status, slp_engagement_status, custom_fields";

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Medium: "bg-amber-100 text-amber-800 ring-amber-200",
  Low: "bg-green-100 text-green-800 ring-green-200",
  Monitor: "bg-gray-100 text-gray-700 ring-gray-200",
};

interface ActionItem {
  id: string;
  text: string;
  due_date?: string | null;
  completed_at?: string | null;
}

interface HolderDetail {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  job_title: string | null;
  membership_status: string | null;
  engagement_score_current: number | null;
  churn_risk_tier: string | null;
  action_items: ActionItem[] | null;
}

export default async function BoardRoleDetailPage({ params }: { params: { role: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const role = getRole(params.role);
  if (!role) notFound();

  const { data: roleVal } = await supabase.rpc("current_user_role");
  const isAdmin = roleVal === "Admin" || roleVal === "ExecutiveDirector";
  if (role.adminOnly && !isAdmin) notFound();

  const { data: rawMembers } = await supabase.from("members").select(MEMBER_SELECT);
  const members = (rawMembers ?? []) as unknown as BoardMemberLite[];
  const status = computeRoleStatus(role.domain, members);

  // Load holder detail for those who are member rows.
  const holderIds = role.holders.map((h) => h.memberId).filter((id): id is string => !!id);
  let holderDetails: HolderDetail[] = [];
  if (holderIds.length > 0) {
    const { data } = await supabase
      .from("members")
      .select(
        "trifecta_member_id, first_name, last_name, company_name, job_title, membership_status, engagement_score_current, churn_risk_tier, action_items",
      )
      .in("trifecta_member_id", holderIds);
    holderDetails = (data ?? []) as unknown as HolderDetail[];
  }
  const detailById = new Map(holderDetails.map((h) => [h.trifecta_member_id, h]));

  // Open action items across all holders.
  const openActions: Array<{ holder: string; action: ActionItem }> = [];
  for (const h of holderDetails) {
    const name = `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim();
    for (const a of (h.action_items ?? []) as ActionItem[]) {
      if (!a.completed_at) openActions.push({ holder: name, action: a });
    }
  }
  openActions.sort((a, b) => (a.action.due_date ?? "9999").localeCompare(b.action.due_date ?? "9999"));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Trifecta Portal</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/board"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              All roles
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-900">
            Home
          </Link>{" "}
          ·{" "}
          <Link href="/board" className="hover:text-gray-900">
            Board
          </Link>
        </nav>

        <section className="mb-6">
          <p className="text-sm uppercase tracking-wide text-gray-500">{TIER_LABELS[role.tier]}</p>
          <h2 className="text-2xl font-semibold text-gray-900">{role.title}</h2>
          <p className="text-sm text-gray-600 max-w-2xl mt-1">{role.blurb}</p>
        </section>

        {/* Holder(s) */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {role.holders.map((h) => {
            const d = h.memberId ? detailById.get(h.memberId) : undefined;
            const inner = (
              <div className="bg-white border border-gray-200 rounded-lg p-5 h-full">
                <div className="text-xs uppercase tracking-wide text-gray-500">Role holder</div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <div className="text-lg font-semibold text-gray-900">{h.name}</div>
                  {d?.engagement_score_current != null && d.churn_risk_tier && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TIER_STYLES[d.churn_risk_tier] ?? "bg-gray-100"}`}
                    >
                      {d.engagement_score_current} · {d.churn_risk_tier}
                    </span>
                  )}
                </div>
                {d && (d.job_title || d.company_name) && (
                  <div className="text-sm text-gray-600 mt-0.5">
                    {[d.job_title, d.company_name].filter(Boolean).join(" · ")}
                  </div>
                )}
                {d?.membership_status && (
                  <div className="text-xs text-gray-500 mt-2">{d.membership_status}</div>
                )}
                {!h.memberId && (
                  <div className="text-xs text-gray-400 italic mt-2">Not a member record</div>
                )}
                {h.memberId && (
                  <div className="text-xs text-blue-600 mt-2 group-hover:text-blue-800">View profile →</div>
                )}
              </div>
            );
            return h.memberId ? (
              <Link key={h.name} href={`/members/${h.memberId}`} className="block group">
                {inner}
              </Link>
            ) : (
              <div key={h.name}>{inner}</div>
            );
          })}
        </div>

        {/* Status */}
        <section className="bg-white border border-gray-200 rounded-lg mb-6">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Status</h3>
            {status.linkTo && (
              <Link href={status.linkTo} className="text-xs text-blue-600 hover:text-blue-800">
                {status.linkLabel ?? "View"} →
              </Link>
            )}
          </div>
          <div className="p-5">
            {status.metrics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {status.metrics.map((m) => (
                  <div key={m.label} className="bg-gray-50 rounded-lg p-4">
                    <div className={`text-2xl font-semibold tabular-nums ${toneClass(m.tone)}`}>
                      {m.value}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{m.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {status.note && (
              <p className={`text-sm text-gray-500 italic ${status.metrics.length ? "mt-4" : ""}`}>
                {status.note}
              </p>
            )}
          </div>
        </section>

        {/* Open board actions */}
        <section className="bg-white border border-gray-200 rounded-lg">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              Open actions{openActions.length > 0 ? ` (${openActions.length})` : ""}
            </h3>
          </div>
          <div className="p-5">
            {openActions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No open action items logged for this role holder.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {openActions.map(({ holder, action }) => (
                  <li key={action.id} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-900">{action.text}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {action.due_date ? `Due ${formatDate(action.due_date)}` : "No date"}
                      {role.holders.length > 1 ? ` · ${holder}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
