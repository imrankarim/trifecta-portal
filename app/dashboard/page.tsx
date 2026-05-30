import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { buildReason, type DigestMember } from "@/lib/digest/atRiskDigest";

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Medium: "bg-amber-100 text-amber-800 ring-amber-200",
  Low: "bg-green-100 text-green-800 ring-green-200",
  Monitor: "bg-gray-100 text-gray-700 ring-gray-200",
};

const ACTIVE_STATUSES = new Set(["Active", "Grace Period", "Lapsed"]);

interface ActivityRow {
  id: string;
  actor_type: string;
  action: string;
  summary: string;
  created_at: string;
  reverted_at: string | null;
}

// What a chair sees first thing Monday: this week's priorities, not a table.
// Five widgets that ALL link through to /members/[id] for actionable drill-in:
//   1. My Open Actions   — across all members, sorted by due date
//   2. Top At-Risk       — Critical + High tier members needing outreach
//   3. Renewal Attention — explicit intent to leave or speak about renewal
//   4. Forum Health      — forums with lowest avg engagement
//   5. Recently Added    — last 30 days of new contacts

interface ActionItem {
  id: string;
  text: string;
  due_date?: string | null;
  assigned_to?: string | null;
  completed_at?: string | null;
  created_at: string;
}

interface MemberRow {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  email_primary: string | null;
  company_name: string | null;
  contact_type: string | null;
  membership_status: string | null;
  churn_risk_tier: string | null;
  engagement_score_current: number | null;
  engagement_score_prev: number | null;
  engagement_trend: string | null;
  renewal_intent_response: string | null;
  renewal_status: string | null;
  custom_fields: Record<string, unknown> | null;
  forum_attendance_rate_12m: number | null;
  local_event_attendance_rate_12m: number | null;
  slp_engagement_status: string | null;
  whatsapp_activity_level: string | null;
  days_since_last_engagement: number | null;
  action_items: ActionItem[] | null;
  created_at: string | null;
}

export default async function DashboardHome() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  const isAdmin = role === "Admin" || role === "ExecutiveDirector";

  // Resolve the calling user → their member row (for "my actions")
  const { data: me } = await supabase
    .from("members")
    .select("trifecta_member_id, first_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name, city, country, eo_region")
    .limit(1);
  const chapter = chapters?.[0];

  if (!chapter) {
    return <NoChapterNotice email={user.email ?? ""} />;
  }

  // One read of everything we need. EO Dallas: 831 rows × ~20 fields → ~150KB.
  // Acceptable; revisit when chapters exceed 5k members.
  const { data: rawMembers } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, contact_type, membership_status, " +
        "churn_risk_tier, engagement_score_current, engagement_score_prev, engagement_trend, " +
        "renewal_intent_response, renewal_status, custom_fields, " +
        "forum_attendance_rate_12m, local_event_attendance_rate_12m, slp_engagement_status, whatsapp_activity_level, days_since_last_engagement, " +
        "action_items, created_at",
    )
    .eq("chapter_id", chapter.trifecta_chapter_id);
  const members = (rawMembers ?? []) as unknown as MemberRow[];

  // Pre-compute widget data once
  const myActions = collectMyActions(members, me?.trifecta_member_id ?? null);
  const topAtRisk = collectTopAtRisk(members);
  const renewalAttn = collectRenewalAttention(members);
  const forumHealth = collectForumHealth(members);
  const recentlyAdded = collectRecentlyAdded(members);
  const renewals = collectRenewalBuckets(members);

  // Headline chapter metrics for the stat strip.
  const activeMembers = members.filter(
    (m) => m.contact_type === "Member" && ACTIVE_STATUSES.has(m.membership_status ?? ""),
  );
  const scores = activeMembers
    .map((m) => m.engagement_score_current)
    .filter((s): s is number => s != null);
  const chapterHealth = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  // Inbox + activity — quick reads (RLS-scoped to the caller's chapter).
  const { count: pendingProposals } = await supabase
    .from("communication_extractions")
    .select("id", { count: "exact", head: true })
    .eq("status", "proposed");
  const { data: rawActivity } = await supabase
    .from("system_activity")
    .select("id, actor_type, action, summary, created_at, reverted_at")
    .order("created_at", { ascending: false })
    .limit(6);
  const recentActivity = (rawActivity ?? []) as unknown as ActivityRow[];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Trifecta Portal</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
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
            <Link
              href="/renewals"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Renewals
            </Link>
            <Link
              href="/board"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Board
            </Link>
            <Link
              href="/activity"
              className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
            >
              Activity
            </Link>
            <Link
              href="/assistant"
              className="text-sm text-white bg-indigo-600 border border-indigo-600 px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
            >
              ✨ Assistant
            </Link>
            {isAdmin && (
              <Link
                href="/inbox"
                className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                Inbox
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm text-gray-700 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                Admin
              </Link>
            )}
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Greeting */}
        <section className="mb-6">
          <p className="text-sm uppercase tracking-wide text-gray-500">{chapter.chapter_name}</p>
          <h2 className="text-2xl font-semibold text-gray-900">
            {me?.first_name ? `Hi, ${me.first_name}.` : "Welcome."}
          </h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Here&apos;s what needs your attention this week.
          </p>
        </section>

        {/* Headline stats — each tile links into its deeper view */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
          <Stat
            label="Active members"
            value={String(activeMembers.length)}
            href="/dashboard/directory"
          />
          <Stat
            label="At risk"
            value={String(topAtRisk.length)}
            tone={topAtRisk.length ? "bad" : "good"}
            href="/dashboard/directory"
          />
          <Stat
            label="Renewals secured"
            value={`${renewals.securedPct}%`}
            tone={renewals.securedPct >= 60 ? "good" : renewals.securedPct >= 40 ? "warn" : "bad"}
            hint={`${renewals.renewed + renewals.will}/${renewals.total}`}
            href="/renewals"
          />
          <Stat
            label="Chapter health"
            value={chapterHealth != null ? String(chapterHealth) : "—"}
            tone={chapterHealth == null ? "neutral" : chapterHealth >= 60 ? "good" : chapterHealth >= 40 ? "warn" : "bad"}
            href="/board"
          />
          {isAdmin && (
            <Stat
              label="To review"
              value={String(pendingProposals ?? 0)}
              tone={(pendingProposals ?? 0) > 0 ? "warn" : "neutral"}
              hint="AI proposals"
              href="/inbox"
            />
          )}
        </div>

        {/* Widget grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Widget title="My open actions" badge={myActions.length} link={null}>
            {myActions.length === 0 ? (
              <EmptyState>
                No open actions. Open a member to log a follow-up.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {myActions.slice(0, 8).map((item) => (
                  <li key={`${item.member.trifecta_member_id}-${item.action.id}`} className="py-2.5">
                    <Link
                      href={`/members/${item.member.trifecta_member_id}`}
                      className="block hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-900 truncate">{item.action.text}</span>
                        <DueBadge dueDate={item.action.due_date} />
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {item.member.first_name} {item.member.last_name}
                        {item.member.company_name ? ` · ${item.member.company_name}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Top at-risk this week" badge={topAtRisk.length}>
            {topAtRisk.length === 0 ? (
              <EmptyState>🎉 No at-risk members.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {topAtRisk.slice(0, 8).map((m) => (
                  <li key={m.trifecta_member_id} className="py-2.5">
                    <Link
                      href={`/members/${m.trifecta_member_id}`}
                      className="block hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {m.first_name} {m.last_name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {m.churn_risk_tier && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TIER_STYLES[m.churn_risk_tier] ?? ""}`}
                            >
                              {m.churn_risk_tier}
                            </span>
                          )}
                          <span className="text-sm text-gray-700 tabular-nums w-7 text-right">
                            {m.engagement_score_current ?? "—"}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{buildReason(toDigest(m))}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Renewals" link="/renewals">
            <RenewalBar buckets={renewals} />
            {renewalAttn.length === 0 ? (
              <p className="text-sm text-gray-500 italic mt-4">No one flagged as undecided or leaving.</p>
            ) : (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1">
                  Needs a conversation
                </div>
                <ul className="divide-y divide-gray-100">
                  {renewalAttn.slice(0, 6).map((m) => (
                    <li key={m.trifecta_member_id} className="py-2.5">
                      <Link
                        href={`/members/${m.trifecta_member_id}`}
                        className="block hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {m.first_name} {m.last_name}
                          </span>
                          <RenewalChip intent={m.renewal_intent_response} status={m.renewal_status} />
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{m.company_name ?? ""}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Widget>

          <Widget title="Recent activity" link="/activity">
            {recentActivity.length === 0 ? (
              <EmptyState>
                Nothing yet. As Trifecta acts — auto-applying email updates, syncing — it shows here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentActivity.map((a) => (
                  <li key={a.id} className="py-2.5">
                    <div className={`text-sm ${a.reverted_at ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {a.summary}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {a.actor_type === "system" ? "Trifecta" : "A chair"} · {formatRelative(a.created_at)}
                      {a.reverted_at ? " · undone" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Forum health" badge={forumHealth.length} link="/forums">
            {forumHealth.length === 0 ? (
              <EmptyState>
                Forum data not yet populated. Sync once forums are mapped.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {forumHealth.slice(0, 8).map((f) => (
                  <li key={f.forum} className="py-2.5">
                    <Link
                      href={`/forums/${encodeURIComponent(f.forum)}`}
                      className="block hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900 truncate">{f.forum}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-gray-500 tabular-nums">{f.size} members</span>
                          <span
                            className={`text-sm tabular-nums font-medium w-7 text-right ${forumScoreClass(f.avgScore)}`}
                          >
                            {f.avgScore}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Recently added" badge={recentlyAdded.length}>
            {recentlyAdded.length === 0 ? (
              <EmptyState>No new contacts in the last 30 days.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentlyAdded.slice(0, 8).map((m) => (
                  <li key={m.trifecta_member_id} className="py-2.5">
                    <Link
                      href={`/members/${m.trifecta_member_id}`}
                      className="block hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {m.first_name} {m.last_name}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {formatRelative(m.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {m.membership_status ?? m.contact_type ?? ""}
                        {m.company_name ? ` · ${m.company_name}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Widget>

          <Widget title="Browse directory" link="/dashboard/directory">
            <div className="text-sm text-gray-600 leading-relaxed">
              The full chapter directory — Members, On Leave, Prospects, Sponsors, Former
              Members — with filtering and search.
            </div>
            <Link
              href="/dashboard/directory"
              className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Browse all members →
            </Link>
          </Widget>
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Widget data collectors
// ────────────────────────────────────────────────────────────────────────

function collectMyActions(
  members: MemberRow[],
  myId: string | null,
): Array<{ member: MemberRow; action: ActionItem }> {
  if (!myId) return [];
  const out: Array<{ member: MemberRow; action: ActionItem }> = [];
  for (const m of members) {
    const items = (m.action_items ?? []) as ActionItem[];
    for (const a of items) {
      // "Mine" = assigned to me, OR assigned to nobody (any chair can claim)
      const isMine = a.assigned_to === myId || a.assigned_to == null;
      if (!isMine) continue;
      if (a.completed_at) continue;
      out.push({ member: m, action: a });
    }
  }
  out.sort((a, b) => {
    const da = a.action.due_date ?? "9999-12-31";
    const db = b.action.due_date ?? "9999-12-31";
    return da.localeCompare(db);
  });
  return out;
}

function collectTopAtRisk(members: MemberRow[]): MemberRow[] {
  const pool = members.filter(
    (m) =>
      m.contact_type === "Member" &&
      m.membership_status === "Active" &&
      (m.churn_risk_tier === "Critical" || m.churn_risk_tier === "High"),
  );
  pool.sort((a, b) => {
    const ta = a.churn_risk_tier === "Critical" ? 0 : 1;
    const tb = b.churn_risk_tier === "Critical" ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return (a.engagement_score_current ?? 999) - (b.engagement_score_current ?? 999);
  });
  return pool;
}

function collectRenewalAttention(members: MemberRow[]): MemberRow[] {
  return members
    .filter(
      (m) =>
        m.contact_type === "Member" &&
        m.membership_status === "Active" &&
        m.renewal_intent_response != null &&
        ["WontRenew", "WantToSpeak"].includes(m.renewal_intent_response),
    )
    .sort((a, b) => {
      // WontRenew is the most urgent
      const ra = a.renewal_intent_response === "WontRenew" ? 0 : 1;
      const rb = b.renewal_intent_response === "WontRenew" ? 0 : 1;
      return ra - rb;
    });
}

function collectForumHealth(
  members: MemberRow[],
): Array<{ forum: string; size: number; avgScore: number }> {
  const byForum = new Map<string, { scores: number[]; count: number }>();
  for (const m of members) {
    if (m.contact_type !== "Member") continue;
    if (m.membership_status !== "Active") continue;
    const forum = (m.custom_fields?.forum_name as string | undefined) ?? null;
    if (!forum) continue;
    if (!byForum.has(forum)) byForum.set(forum, { scores: [], count: 0 });
    const entry = byForum.get(forum)!;
    entry.count++;
    if (m.engagement_score_current != null) entry.scores.push(m.engagement_score_current);
  }
  const out: Array<{ forum: string; size: number; avgScore: number }> = [];
  for (const [forum, entry] of Array.from(byForum.entries())) {
    if (entry.scores.length === 0) continue;
    const avg = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
    out.push({ forum, size: entry.count, avgScore: Math.round(avg) });
  }
  out.sort((a, b) => a.avgScore - b.avgScore); // worst first
  return out;
}

function collectRecentlyAdded(members: MemberRow[]): MemberRow[] {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return members
    .filter((m) => m.created_at && m.created_at > cutoff)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

interface RenewalBuckets {
  renewed: number;
  will: number;
  undecided: number;
  noResponse: number;
  wont: number;
  total: number;
  securedPct: number;
}

function collectRenewalBuckets(members: MemberRow[]): RenewalBuckets {
  const active = members.filter(
    (m) => m.contact_type === "Member" && ACTIVE_STATUSES.has(m.membership_status ?? ""),
  );
  let renewed = 0;
  let will = 0;
  let undecided = 0;
  let wont = 0;
  let noResponse = 0;
  for (const m of active) {
    if (m.renewal_status === "Renewed") renewed++;
    else if (m.renewal_intent_response === "PlanToRenew") will++;
    else if (m.renewal_intent_response === "WantToSpeak") undecided++;
    else if (m.renewal_intent_response === "WontRenew") wont++;
    else noResponse++;
  }
  const total = active.length;
  const securedPct = total ? Math.round(((renewed + will) / total) * 100) : 0;
  return { renewed, will, undecided, noResponse, wont, total, securedPct };
}

// ────────────────────────────────────────────────────────────────────────
// UI primitives
// ────────────────────────────────────────────────────────────────────────

function Widget({
  title,
  badge,
  link,
  children,
}: {
  title: string;
  badge?: number;
  link?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {title}
          {badge != null && badge > 0 && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              {badge}
            </span>
          )}
        </h3>
        {link && (
          <Link href={link} className="text-xs text-blue-600 hover:text-blue-800">
            View all →
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 italic">{children}</p>;
}

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
  href,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  hint?: string;
  href?: string;
}) {
  const valueClass = {
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-700",
    neutral: "text-gray-900",
  }[tone];
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
      {inner}
    </Link>
  ) : (
    <div className="bg-white border border-gray-200 rounded-lg p-4">{inner}</div>
  );
}

function RenewalBar({ buckets }: { buckets: RenewalBuckets }) {
  const segs = [
    { n: buckets.renewed, label: "Renewed", color: "bg-green-500" },
    { n: buckets.will, label: "Will renew", color: "bg-blue-500" },
    { n: buckets.undecided, label: "Undecided", color: "bg-amber-500" },
    { n: buckets.noResponse, label: "No response", color: "bg-gray-300" },
    { n: buckets.wont, label: "Not renewing", color: "bg-red-500" },
  ];
  const total = buckets.total || 1;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
        {segs.map(
          (s) =>
            s.n > 0 && (
              <div key={s.label} className={s.color} style={{ width: `${(s.n / total) * 100}%` }} title={`${s.label}: ${s.n}`} />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`inline-block w-2 h-2 rounded-full ${s.color}`} />
            {s.label} <span className="tabular-nums font-medium text-gray-900">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DueBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) {
    return <span className="text-xs text-gray-400 shrink-0">No date</span>;
  }
  const today = new Date().toISOString().slice(0, 10);
  const overdue = dueDate < today;
  const soonCutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueSoon = !overdue && dueDate <= soonCutoff;
  const display = formatRelative(dueDate);
  const cls = overdue
    ? "bg-red-50 text-red-700 ring-red-200"
    : dueSoon
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-gray-50 text-gray-600 ring-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset shrink-0 ${cls}`}
    >
      {overdue ? "Overdue · " : "Due "}
      {display}
    </span>
  );
}

function RenewalChip({
  intent,
  status,
}: {
  intent: string | null;
  status: string | null;
}) {
  if (intent === "WontRenew") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 shrink-0">
        Won&apos;t renew
      </span>
    );
  }
  if (intent === "WantToSpeak") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 shrink-0">
        Wants to talk
      </span>
    );
  }
  if (status === "At Risk") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 shrink-0">
        At risk
      </span>
    );
  }
  if (status === "Pending") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200 shrink-0">
        Pending
      </span>
    );
  }
  return null;
}

function forumScoreClass(score: number): string {
  if (score < 30) return "text-red-700";
  if (score < 50) return "text-amber-700";
  return "text-green-700";
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffDays = Math.round((d.getTime() - now) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toDigest(m: MemberRow): DigestMember {
  return {
    trifecta_member_id: m.trifecta_member_id,
    first_name: m.first_name ?? "",
    last_name: m.last_name ?? "",
    email_primary: m.email_primary ?? "",
    company_name: m.company_name,
    membership_status: m.membership_status,
    engagement_score_current: m.engagement_score_current,
    engagement_trend:
      m.engagement_trend === "Improving" || m.engagement_trend === "Declining" || m.engagement_trend === "Stable"
        ? m.engagement_trend
        : null,
    churn_risk_tier:
      m.churn_risk_tier && ["Critical", "High", "Medium", "Low", "Monitor"].includes(m.churn_risk_tier)
        ? (m.churn_risk_tier as DigestMember["churn_risk_tier"])
        : null,
    score_last_calculated_at: null,
    engagement_score_prev: m.engagement_score_prev,
    custom_fields: m.custom_fields,
    forum_attendance_rate_12m: m.forum_attendance_rate_12m,
    local_event_attendance_rate_12m: m.local_event_attendance_rate_12m,
    slp_engagement_status: m.slp_engagement_status,
    whatsapp_activity_level: m.whatsapp_activity_level,
    days_since_last_engagement: m.days_since_last_engagement,
  };
}

function NoChapterNotice({ email }: { email: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-md bg-amber-50 border border-amber-200 rounded-md p-6 text-sm text-amber-900">
        <p className="font-medium mb-2">Your account isn&apos;t linked to a chapter yet.</p>
        <p>
          An admin needs to create a member row in Supabase with{" "}
          <code className="bg-white px-1 py-0.5 rounded border border-amber-300">
            email_primary = {email}
          </code>{" "}
          before this dashboard will show data.
        </p>
      </div>
    </main>
  );
}
