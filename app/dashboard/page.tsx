import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Medium: "bg-amber-100 text-amber-800 ring-amber-200",
  Low: "bg-green-100 text-green-800 ring-green-200",
  Monitor: "bg-gray-100 text-gray-700 ring-gray-200",
};

// Active-membership lifecycle values for the "Members" tab. On Leave is split
// into its own tab — those members are knowingly absent (sabbatical, up to
// 2 years) and aren't actively engaged, so mixing them with active dues-payers
// muddied the view.
const ACTIVE_MEMBER_STATUSES = new Set(["Active", "Grace Period", "Lapsed"]);

type TabKey = "members" | "on_leave" | "prospects" | "sponsors" | "former";

interface TabDef {
  key: TabKey;
  label: string;
  description: string;
  /** Predicate over a member row to decide tab membership. */
  predicate: (m: { contact_type: string | null; membership_status: string | null }) => boolean;
  /** True if the risk-tier / score columns are meaningful for this tab. */
  showScoring: boolean;
}

const TABS: TabDef[] = [
  {
    key: "members",
    label: "Members",
    description: "Active dues-paying members — Active, Grace Period, Lapsed",
    predicate: (m) =>
      m.contact_type === "Member" && ACTIVE_MEMBER_STATUSES.has(m.membership_status ?? ""),
    showScoring: true,
  },
  {
    key: "on_leave",
    label: "On Leave",
    description: "Members on sabbatical (up to 2 years) — not currently engaged but still members",
    predicate: (m) => m.contact_type === "Member" && m.membership_status === "On Leave",
    showScoring: false, // we deliberately don't score On Leave members
  },
  {
    key: "prospects",
    label: "Prospects",
    description: "Membership Chair's pipeline — not yet members",
    predicate: (m) => m.contact_type === "Member" && m.membership_status === "Prospect",
    showScoring: false,
  },
  {
    key: "sponsors",
    label: "Sponsors",
    description: "Strategic Alliance Partners",
    predicate: (m) => m.contact_type === "Sponsor",
    showScoring: false,
  },
  {
    key: "former",
    label: "Former Members",
    description: "Members no longer with the chapter",
    predicate: (m) =>
      m.contact_type === "Member" && m.membership_status === "Former Member",
    showScoring: true, // scores can stay meaningful for historical view
  },
];

function isTabKey(v: string | undefined): v is TabKey {
  return v != null && TABS.some((t) => t.key === v);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  const isAdmin = role === "Admin" || role === "ExecutiveDirector";

  const activeTab: TabKey = isTabKey(searchParams.tab) ? searchParams.tab : "members";
  const activeTabDef = TABS.find((t) => t.key === activeTab)!;

  // RLS-scoped: returns the one chapter the user belongs to
  const { data: chapters } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name, city, country, eo_region")
    .limit(1);
  const chapter = chapters?.[0];

  // Load all members once; filter + bucket in JS. At 232 rows this is trivial;
  // we'd switch to server-side filtering when chapters scale past ~5k members.
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, contact_type, membership_status, churn_risk_tier, engagement_score_current",
    )
    .order("last_name", { ascending: true });

  const allMembers = members ?? [];
  const counts: Record<TabKey, number> = {
    members: 0,
    on_leave: 0,
    prospects: 0,
    sponsors: 0,
    former: 0,
  };
  for (const m of allMembers) {
    for (const tab of TABS) {
      if (tab.predicate(m)) counts[tab.key]++;
    }
  }
  const visible = allMembers.filter(activeTabDef.predicate);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Trifecta Portal</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!chapter ? (
          <NoChapterNotice email={user.email ?? ""} />
        ) : (
          <>
            <section className="mb-6">
              <p className="text-sm uppercase tracking-wide text-gray-500">Chapter</p>
              <h2 className="text-2xl font-semibold text-gray-900">{chapter.chapter_name}</h2>
              <p className="text-sm text-gray-600">
                {chapter.city}, {chapter.country} · {chapter.eo_region}
              </p>
            </section>

            {/* Tab nav */}
            <nav className="border-b border-gray-200 mb-6" aria-label="Directory segments">
              <div className="flex gap-1 -mb-px">
                {TABS.map((tab) => {
                  const isActive = tab.key === activeTab;
                  return (
                    <Link
                      key={tab.key}
                      href={`/dashboard?tab=${tab.key}`}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        isActive
                          ? "border-blue-600 text-blue-700"
                          : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {tab.label}
                      <span
                        className={`ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {counts[tab.key]}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <section>
              <p className="text-sm text-gray-500 mb-3">{activeTabDef.description}</p>

              {membersError ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
                  Could not load members: {membersError.message}
                </div>
              ) : visible.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-sm text-gray-500">
                  No {activeTabDef.label.toLowerCase()} to show.
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
                        {activeTabDef.showScoring && (
                          <>
                            <th className="text-left px-4 py-3 font-medium">Risk</th>
                            <th className="text-right px-4 py-3 font-medium">Score</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visible.map((m) => (
                        <tr key={m.trifecta_member_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">
                            {m.first_name} {m.last_name}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.email_primary}</td>
                          <td className="px-4 py-3 text-gray-600">{m.company_name ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-600">{m.membership_status ?? "—"}</td>
                          {activeTabDef.showScoring && (
                            <>
                              <td className="px-4 py-3">
                                {m.churn_risk_tier ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TIER_STYLES[m.churn_risk_tier] ?? TIER_STYLES.Monitor}`}
                                  >
                                    {m.churn_risk_tier}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                                {m.engagement_score_current ?? "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function NoChapterNotice({ email }: { email: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-md p-6 text-sm text-amber-900">
      <p className="font-medium mb-2">Your account isn&apos;t linked to a chapter yet.</p>
      <p>
        An admin needs to create a member row in Supabase with{" "}
        <code className="bg-white px-1 py-0.5 rounded border border-amber-300">email_primary = {email}</code>{" "}
        before this dashboard will show data. The auth trigger will link your account on
        next sign-in.
      </p>
    </div>
  );
}
