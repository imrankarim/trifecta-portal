import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";
import { describeProposal, type Proposal } from "@/lib/inbox/applyProposal";
import { PasteEmailForm } from "./PasteEmailForm";
import { ProposalActions } from "./ProposalActions";

interface CommRef {
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  classification: string | null;
}

interface ExtractionRow {
  id: string;
  communication_id: string;
  extraction_type: Proposal["extraction_type"];
  payload: Record<string, unknown> | null;
  confidence: number | null;
  target_member_id: string | null;
  created_at: string;
  inbound_communications: CommRef | null;
}

const TYPE_BADGE: Record<string, string> = {
  action_item: "bg-blue-100 text-blue-800",
  renewal_intent: "bg-amber-100 text-amber-800",
  pipeline_move: "bg-purple-100 text-purple-800",
};

export default async function InboxPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  if (role !== "Admin" && role !== "ExecutiveDirector") redirect("/dashboard");

  const { data: rawEx } = await supabase
    .from("communication_extractions")
    .select(
      "id, communication_id, extraction_type, payload, confidence, target_member_id, created_at, " +
        "inbound_communications(subject, sender, received_at, classification)",
    )
    .eq("status", "proposed")
    .order("created_at", { ascending: false });
  const extractions = (rawEx ?? []) as unknown as ExtractionRow[];

  // Resolve target member names (separate query to avoid multi-FK embed ambiguity).
  const memberIds = Array.from(
    new Set(extractions.map((e) => e.target_member_id).filter((id): id is string => !!id)),
  );
  const nameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: mem } = await supabase
      .from("members")
      .select("trifecta_member_id, first_name, last_name")
      .in("trifecta_member_id", memberIds);
    for (const m of mem ?? []) {
      nameById.set(
        m.trifecta_member_id as string,
        `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      );
    }
  }

  // Group by communication, newest first.
  const groups = new Map<string, { comm: CommRef | null; items: ExtractionRow[] }>();
  for (const e of extractions) {
    if (!groups.has(e.communication_id)) {
      groups.set(e.communication_id, { comm: e.inbound_communications, items: [] });
    }
    groups.get(e.communication_id)!.items.push(e);
  }

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

      <div className="max-w-5xl mx-auto px-6 py-8">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-900">
            ← Home
          </Link>
        </nav>
        <section className="mb-6">
          <p className="text-sm uppercase tracking-wide text-gray-500">AI Inbox</p>
          <h2 className="text-2xl font-semibold text-gray-900">Proposed updates</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            Trifecta reads the operational email you already CC it on and proposes updates — it
            never changes a record without your approval. Review and accept what&apos;s right.
          </p>
        </section>

        <div className="mb-6">
          <PasteEmailForm />
        </div>

        {groups.size === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
            No pending proposals. Forward an email above to see Trifecta extract from it.
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(groups.values()).map(({ comm, items }) => (
              <section key={items[0].communication_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="text-sm font-medium text-gray-900">
                    {comm?.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    from {comm?.sender ?? "unknown"}
                    {comm?.classification ? ` · ${comm.classification.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
                <ul className="divide-y divide-gray-100">
                  {items.map((e) => {
                    const proposal: Proposal = {
                      extraction_type: e.extraction_type,
                      payload: e.payload ?? {},
                      confidence: e.confidence,
                    };
                    const memberName = e.target_member_id ? nameById.get(e.target_member_id) : null;
                    return (
                      <li key={e.id} className="px-5 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${TYPE_BADGE[e.extraction_type] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {e.extraction_type.replace(/_/g, " ")}
                            </span>
                            {typeof e.confidence === "number" && (
                              <span className="text-[11px] text-gray-400">
                                {Math.round(e.confidence * 100)}% confidence
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-900 mt-1">{describeProposal(proposal)}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {e.target_member_id && memberName ? (
                              <>
                                for{" "}
                                <Link
                                  href={`/members/${e.target_member_id}`}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  {memberName}
                                </Link>
                              </>
                            ) : (
                              <span className="text-amber-700">no member matched</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <ProposalActions extractionId={e.id} canApply={!!e.target_member_id} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
