import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";

interface MemberRow {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  contact_type: string | null;
  membership_status: string | null;
  engagement_score_current: number | null;
  churn_risk_tier: string | null;
  renewal_status: string | null;
  renewal_intent_response: string | null;
  renewal_intent_notes: string | null;
}

const ACTIVE = new Set(["Active", "Grace Period", "Lapsed"]);

// The board's renewal worldview: five buckets, ordered by how much attention
// they need (action-needed first). EO's year starts July 1; this is the
// late-May/June push.
interface Bucket {
  key: string;
  label: string;
  blurb: string;
  accent: string; // tailwind classes for the header chip
  match: (m: MemberRow) => boolean;
}

const BUCKETS: Bucket[] = [
  {
    key: "wont",
    label: "Not renewing",
    blurb: "Said no — worth a save attempt or a graceful exit.",
    accent: "bg-red-100 text-red-800",
    match: (m) => m.renewal_intent_response === "WontRenew",
  },
  {
    key: "undecided",
    label: "Undecided",
    blurb: "On the fence — a personal conversation moves these.",
    accent: "bg-amber-100 text-amber-800",
    match: (m) => m.renewal_intent_response === "WantToSpeak",
  },
  {
    key: "noresponse",
    label: "No response yet",
    blurb: "Haven't heard back — chase before the July grace period.",
    accent: "bg-gray-100 text-gray-700",
    match: (m) => m.renewal_intent_response === "NoResponse" || m.renewal_intent_response == null,
  },
  {
    key: "will",
    label: "Will renew",
    blurb: "Committed but not yet processed.",
    accent: "bg-blue-100 text-blue-800",
    match: (m) =>
      m.renewal_status !== "Renewed" && m.renewal_intent_response === "PlanToRenew",
  },
  {
    key: "renewed",
    label: "Renewed",
    blurb: "Done — dues secured for the new year.",
    accent: "bg-green-100 text-green-800",
    match: (m) => m.renewal_status === "Renewed",
  },
];

export default async function RenewalsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: chapters } = await supabase.from("chapters").select("chapter_name").limit(1);
  const chapter = chapters?.[0];

  const { data: rawMembers } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, company_name, contact_type, membership_status, " +
        "engagement_score_current, churn_risk_tier, renewal_status, renewal_intent_response, renewal_intent_notes",
    )
    .order("last_name", { ascending: true });

  const members = ((rawMembers ?? []) as unknown as MemberRow[]).filter(
    (m) => m.contact_type === "Member" && ACTIVE.has(m.membership_status ?? ""),
  );

  const buckets = BUCKETS.map((b) => ({ def: b, members: members.filter(b.match) }));
  const total = members.length;
  const renewed = buckets.find((b) => b.def.key === "renewed")?.members.length ?? 0;
  const committed = buckets.find((b) => b.def.key === "will")?.members.length ?? 0;
  const securePct = total > 0 ? Math.round(((renewed + committed) / total) * 100) : 0;

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
            Renewals · {chapter?.chapter_name ?? ""}
          </p>
          <h2 className="text-2xl font-semibold text-gray-900">Renewal pipeline</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            EO&apos;s membership year starts July 1. {securePct}% of {total} active members are
            secured (renewed or committed). Work the left-hand columns before the July grace period.
          </p>
        </section>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
          {buckets.map(({ def, members: list }) => (
            <section key={def.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${def.accent}`}>
                    {def.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{list.length}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">{def.blurb}</p>
              </div>
              <ul className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[60vh]">
                {list.length === 0 ? (
                  <li className="px-4 py-6 text-center text-xs text-gray-400">None</li>
                ) : (
                  list.map((m) => (
                    <li key={m.trifecta_member_id}>
                      <Link
                        href={`/members/${m.trifecta_member_id}`}
                        className="block px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {m.first_name} {m.last_name}
                        </div>
                        {m.company_name && (
                          <div className="text-[11px] text-gray-500 truncate">{m.company_name}</div>
                        )}
                        {m.renewal_intent_notes && (
                          <div className="text-[11px] text-gray-600 mt-1 italic line-clamp-2">
                            “{m.renewal_intent_notes}”
                          </div>
                        )}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
