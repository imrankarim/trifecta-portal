import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NoteForm } from "./NoteForm";
import { ActionForm } from "./ActionForm";
import { ActionCheckbox } from "./ActionCheckbox";
import { AssistantPanel } from "./AssistantPanel";

const TIER_STYLES: Record<string, { bg: string; fg: string; ring: string }> = {
  Critical: { bg: "bg-red-50", fg: "text-red-700", ring: "ring-red-200" },
  High: { bg: "bg-orange-50", fg: "text-orange-700", ring: "ring-orange-200" },
  Medium: { bg: "bg-amber-50", fg: "text-amber-700", ring: "ring-amber-200" },
  Low: { bg: "bg-green-50", fg: "text-green-700", ring: "ring-green-200" },
  Monitor: { bg: "bg-gray-50", fg: "text-gray-700", ring: "ring-gray-200" },
};

const CONTACT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  Member: { label: "Member", color: "bg-blue-100 text-blue-800 ring-blue-200" },
  Staff: { label: "Staff", color: "bg-purple-100 text-purple-800 ring-purple-200" },
  Spouse: { label: "Spouse", color: "bg-pink-100 text-pink-800 ring-pink-200" },
  Sponsor: { label: "Sponsor", color: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  Other: { label: "Other", color: "bg-gray-100 text-gray-800 ring-gray-200" },
};

type Member = Record<string, unknown>;

interface BoardRoleEntry {
  role: string;
  start_date: string;
  end_date: string;
}

interface AttendanceEntry {
  event_id: string;
  event_name: string;
  event_type: string;
  fiscal_year: string;
  attended: boolean;
}

interface NoteEntry {
  id?: string;
  ts?: string;
  text?: string;
  source?: string;
  source_field?: string;
  author_id?: string | null;
  category?: string;
}

interface ActionItemEntry {
  id: string;
  text: string;
  created_at: string;
  created_by: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
}

interface LeavePeriod {
  start?: string | null;
  end?: string | null;
  period_raw?: string;
  source?: string;
  confirmed_at?: string;
}

export default async function MemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: role } = await supabase.rpc("current_user_role");
  const isAdmin = role === "Admin" || role === "ExecutiveDirector";

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("trifecta_member_id", params.id)
    .single();

  if (!member) notFound();
  const m = member as Member;

  // Pull HubSpot external id for the link-out card
  const { data: extIds } = await supabase
    .from("member_external_ids")
    .select("source_name, external_id, source_metadata")
    .eq("member_id", params.id);

  const customFields = (m.custom_fields ?? {}) as Record<string, unknown>;
  const leavePeriod = customFields.leave_period as LeavePeriod | undefined;
  const eoGlobalConfirmed = customFields.eo_global_confirmed_at as string | undefined;
  const spouse = customFields.spouse as Record<string, unknown> | undefined;
  const boardHistory = (m.board_roles_history ?? []) as BoardRoleEntry[];
  const notes = ((m.notes ?? []) as NoteEntry[])
    .slice()
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  const actionItems = ((m.action_items ?? []) as ActionItemEntry[]).slice().sort((a, b) => {
    // Open actions first (sorted by due date asc, with nulls last), then completed
    if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? 1 : -1;
    const da = a.due_date ?? "9999-12-31";
    const db = b.due_date ?? "9999-12-31";
    return da.localeCompare(db);
  });

  // Collect all attendance entries from custom_fields.attendance.*
  const attendanceByFy: Record<string, AttendanceEntry[]> = {};
  const attendance = customFields.attendance as Record<string, unknown> | undefined;
  if (attendance) {
    for (const entries of Object.values(attendance)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries as AttendanceEntry[]) {
        if (!e?.fiscal_year) continue;
        attendanceByFy[e.fiscal_year] ??= [];
        attendanceByFy[e.fiscal_year].push(e);
      }
    }
  }
  const fiscalYears = Object.keys(attendanceByFy).sort().reverse();

  const contactType = String(m.contact_type ?? "Other");
  const ctLabel = CONTACT_TYPE_LABELS[contactType] ?? CONTACT_TYPE_LABELS.Other;
  const tier = m.churn_risk_tier ? String(m.churn_risk_tier) : null;
  const tierStyle = tier ? TIER_STYLES[tier] : null;
  const score =
    typeof m.engagement_score_current === "number" ? m.engagement_score_current : null;

  const fullName = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  const hubspotId = extIds?.find((e) => e.source_name === "hubspot")?.external_id;
  const yearsInEo = computeYearsInEo(m.join_date_original as string | null);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to dashboard
          </Link>
          {isAdmin && (
            <Link
              href={`/admin/${params.id}`}
              className="text-sm text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50"
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero */}
        <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-gray-900">{fullName || "(no name)"}</h1>
              <p className="text-gray-600 text-sm mt-1">
                {m.job_title ? `${String(m.job_title)} · ` : ""}
                {(m.company_name as string | null) ?? "(no company)"}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${ctLabel.color}`}
                >
                  {ctLabel.label}
                </span>
                {m.membership_status ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200">
                    {String(m.membership_status)}
                  </span>
                ) : null}
                {eoGlobalConfirmed && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200">
                    ✓ EO Global confirmed
                  </span>
                )}
                {yearsInEo != null && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200">
                    {yearsInEo} {yearsInEo === 1 ? "year" : "years"} in EO
                  </span>
                )}
              </div>
            </div>

            {/* Score panel */}
            {score != null && tier && tierStyle && (
              <div className={`text-center ${tierStyle.bg} ${tierStyle.ring} ring-1 ring-inset rounded-lg p-4 min-w-[120px]`}>
                <div className={`text-3xl font-bold ${tierStyle.fg}`}>{score}</div>
                <div className={`text-xs font-medium uppercase tracking-wide ${tierStyle.fg} mt-1`}>{tier}</div>
                {m.engagement_trend ? (
                  <div className="text-xs text-gray-600 mt-1">{String(m.engagement_trend)}</div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* AI assistant */}
        <AssistantPanel memberId={params.id} />

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Engagement breakdown */}
            <Card title="Engagement signals">
              <EngagementBreakdown member={m} />
            </Card>

            {/* Attendance log */}
            {fiscalYears.length > 0 && (
              <Card title="Attendance history">
                <div className="space-y-4">
                  {fiscalYears.map((fy) => (
                    <div key={fy}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                        FY {fy} · {attendanceByFy[fy].length} events
                      </h3>
                      <ul className="space-y-1">
                        {attendanceByFy[fy].map((e) => (
                          <li key={e.event_id} className="flex items-start text-sm">
                            <span className="text-gray-400 mr-2">•</span>
                            <span className="text-gray-900">{e.event_name}</span>
                            <span className="ml-auto text-xs text-gray-500 uppercase">{e.event_type}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Board service */}
            {boardHistory.length > 0 && (
              <Card title="Board service">
                <ol className="space-y-3">
                  {boardHistory.map((b, i) => (
                    <li key={i} className="flex items-start">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{b.role}</div>
                        <div className="text-xs text-gray-500">
                          {formatYear(b.start_date)} – {formatYear(b.end_date)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Action items */}
            <Card title={`Action items${actionItems.length > 0 ? ` (${actionItems.filter((a) => !a.completed_at).length} open)` : ""}`}>
              <div className="mb-4">
                <ActionForm memberId={params.id} />
              </div>
              {actionItems.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  No action items yet. Use the form above to add one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {actionItems.map((a) => (
                    <ActionItemRow key={a.id} action={a} memberId={params.id} />
                  ))}
                </ul>
              )}
            </Card>

            {/* Notes timeline */}
            <Card title={`Notes${notes.length > 0 ? ` (${notes.length})` : ""}`}>
              <div className="mb-4 pb-4 border-b border-gray-100">
                <NoteForm memberId={params.id} />
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  No notes yet. Chair-logged outreach and AI-extracted context (Phase 2)
                  will appear here.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((n, i) => (
                    <NoteRow key={n.id ?? i} note={n} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Contact */}
            <Card title="Contact">
              <dl className="space-y-2 text-sm">
                <DefRow label="Email" value={m.email_primary as string} />
                <DefRow label="Mobile" value={m.phone_mobile as string} />
                {customFields.phone_landline ? (
                  <DefRow label="Phone (landline)" value={String(customFields.phone_landline)} />
                ) : null}
                <DefRow label="LinkedIn" value={m.linkedin_url as string} link />
                <DefRow
                  label="Location"
                  value={[m.city, m.state_province, m.country].filter(Boolean).join(", ")}
                />
              </dl>
            </Card>

            {/* Forum */}
            {(customFields.forum_name || m.forum_role) && (
              <Card title="Forum">
                <dl className="space-y-2 text-sm">
                  <DefRow label="Forum" value={customFields.forum_name as string} />
                  <DefRow label="Role" value={m.forum_role as string} />
                  <DefRow
                    label="Moderator"
                    value={customFields.forum_moderator_name as string}
                  />
                  {customFields.forum_experience_rating != null && (
                    <DefRow
                      label="Experience"
                      value={`${customFields.forum_experience_rating}/10`}
                    />
                  )}
                </dl>
              </Card>
            )}

            {/* On Leave details */}
            {leavePeriod && (
              <Card title="On Leave">
                <dl className="space-y-2 text-sm">
                  {leavePeriod.start && <DefRow label="Start" value={formatDate(leavePeriod.start)} />}
                  {leavePeriod.end && <DefRow label="Return by" value={formatDate(leavePeriod.end)} />}
                  {leavePeriod.period_raw && (
                    <p className="text-xs text-gray-500 italic pt-2">{leavePeriod.period_raw}</p>
                  )}
                </dl>
              </Card>
            )}

            {/* SAP details (Sponsor) */}
            {contactType === "Sponsor" && (
              <Card title="SAP details">
                <dl className="space-y-2 text-sm">
                  <DefRow label="Active" value={customFields.sap_active as string} />
                  <DefRow label="Tier" value={customFields.sap_tier as string} />
                  <DefRow
                    label="Type"
                    value={
                      Array.isArray(customFields.sap_type)
                        ? (customFields.sap_type as string[]).join(", ")
                        : (customFields.sap_type as string)
                    }
                  />
                </dl>
              </Card>
            )}

            {/* Spouse */}
            {spouse && Object.keys(spouse).length > 0 && (
              <Card title="Spouse / Life Partner">
                <dl className="space-y-2 text-sm">
                  <DefRow
                    label="Name"
                    value={[spouse.first_name, spouse.last_name].filter(Boolean).join(" ")}
                  />
                  <DefRow label="Email" value={spouse.email as string} />
                  <DefRow label="Phone" value={spouse.phone as string} />
                </dl>
              </Card>
            )}

            {/* Membership */}
            <Card title="Membership">
              <dl className="space-y-2 text-sm">
                <DefRow label="Join date" value={formatDate(m.join_date_original as string)} />
                <DefRow label="Renewal status" value={m.renewal_status as string} />
                <DefRow label="Renewal intent" value={m.renewal_intent_response as string} />
                <DefRow label="EOA member" value={m.eoa_member as boolean | null} />
              </dl>
            </Card>

            {/* Source */}
            {hubspotId && (
              <Card title="Source">
                <dl className="space-y-2 text-sm">
                  <DefRow label="HubSpot ID" value={String(hubspotId)} />
                </dl>
              </Card>
            )}
          </div>
        </div>

        {/* Custom-fields drilldown — for chairs who want the raw HubSpot picture */}
        {Object.keys(customFields).length > 0 && (
          <details className="mt-6 bg-white border border-gray-200 rounded-lg">
            <summary className="px-6 py-4 text-sm font-medium text-gray-900 cursor-pointer hover:bg-gray-50">
              All custom fields ({Object.keys(customFields).length})
            </summary>
            <div className="px-6 pb-6">
              <pre className="text-xs text-gray-700 bg-gray-50 rounded p-4 overflow-auto">
                {JSON.stringify(customFields, null, 2)}
              </pre>
            </div>
          </details>
        )}
      </div>
    </main>
  );
}

function ActionItemRow({ action, memberId }: { action: ActionItemEntry; memberId: string }) {
  const completed = !!action.completed_at;
  const overdueClass = (() => {
    if (completed) return "";
    if (!action.due_date) return "";
    const today = new Date().toISOString().slice(0, 10);
    if (action.due_date < today) return "text-red-700";
    // Due within 3 days
    const dueDate = new Date(action.due_date);
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    if (dueDate <= soon) return "text-amber-700";
    return "text-gray-600";
  })();

  return (
    <li className="flex items-start gap-3 py-1">
      <div className="pt-0.5">
        <ActionCheckbox memberId={memberId} actionId={action.id} completed={completed} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${completed ? "line-through text-gray-400" : "text-gray-900"}`}>
          {action.text}
        </div>
        <div className="flex items-center gap-3 text-xs mt-0.5">
          {action.due_date && (
            <span className={overdueClass}>
              Due {formatDate(action.due_date)}
            </span>
          )}
          {completed && action.completed_at && (
            <span className="text-gray-400">
              Completed {formatDate(action.completed_at)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function NoteRow({ note }: { note: NoteEntry }) {
  // Sync-authored notes (from append_to_notes during HubSpot sync) have a
  // `source` like "hubspot:exit_survey:leaving_reason" instead of an author.
  const isSync = !!note.source && !note.author_id;
  return (
    <li className="border-l-2 border-gray-200 pl-3 py-0.5">
      <div className="text-sm text-gray-900 whitespace-pre-wrap">{note.text}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
        {note.ts && <span>{formatDateTime(note.ts)}</span>}
        {note.category && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] uppercase tracking-wide">
            {note.category}
          </span>
        )}
        {isSync && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] uppercase tracking-wide">
            from {note.source}
          </span>
        )}
      </div>
    </li>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function DefRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
  link?: boolean;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <div className="flex justify-between gap-2">
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-gray-400">—</dd>
      </div>
    );
  }
  let display: React.ReactNode = String(value);
  if (link && typeof value === "string" && value.startsWith("http")) {
    display = (
      <a className="text-blue-600 hover:text-blue-800 truncate" href={value} target="_blank" rel="noopener noreferrer">
        {value.replace(/^https?:\/\//, "")}
      </a>
    );
  } else if (typeof value === "boolean") {
    display = value ? "Yes" : "No";
  }
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right min-w-0">{display}</dd>
    </div>
  );
}

function EngagementBreakdown({ member }: { member: Member }) {
  const signals: Array<{ label: string; value: string | null; tone: "good" | "warn" | "bad" | "neutral" }> = [
    {
      label: "Local event attendance (12m)",
      value: member.local_event_attendance_rate_12m != null
        ? `${member.local_event_attendance_rate_12m}%`
        : null,
      tone: rateToTone(member.local_event_attendance_rate_12m as number | null),
    },
    {
      label: "Forum attendance (12m)",
      value: member.forum_attendance_rate_12m != null
        ? `${member.forum_attendance_rate_12m}%`
        : null,
      tone: rateToTone(member.forum_attendance_rate_12m as number | null),
    },
    {
      label: "Days since last engagement",
      value: member.days_since_last_engagement != null
        ? `${member.days_since_last_engagement} days`
        : null,
      tone: daysToTone(member.days_since_last_engagement as number | null),
    },
    {
      label: "SLP engagement",
      value: (member.slp_engagement_status as string) ?? null,
      tone: "neutral",
    },
    {
      label: "WhatsApp activity",
      value: (member.whatsapp_activity_level as string) ?? null,
      tone: "neutral",
    },
    {
      label: "Global events (24m)",
      value: member.global_event_count_24m != null
        ? `${member.global_event_count_24m} events`
        : null,
      tone: "neutral",
    },
  ];

  const present = signals.filter((s) => s.value != null);
  const missing = signals.filter((s) => s.value == null);

  return (
    <div className="space-y-3">
      {present.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No engagement signals available yet. Scores will appear as data comes in.
        </p>
      ) : (
        <ul className="space-y-2">
          {present.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{s.label}</span>
              <span className={`font-medium ${signalToneClass(s.tone)}`}>{s.value}</span>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          No data yet for: {missing.map((s) => s.label).join(", ")}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────

function rateToTone(v: number | null): "good" | "warn" | "bad" | "neutral" {
  if (v == null) return "neutral";
  if (v >= 60) return "good";
  if (v >= 30) return "warn";
  return "bad";
}

function daysToTone(d: number | null): "good" | "warn" | "bad" | "neutral" {
  if (d == null) return "neutral";
  if (d <= 60) return "good";
  if (d <= 180) return "warn";
  return "bad";
}

function signalToneClass(tone: "good" | "warn" | "bad" | "neutral"): string {
  switch (tone) {
    case "good":
      return "text-green-700";
    case "warn":
      return "text-amber-700";
    case "bad":
      return "text-red-700";
    default:
      return "text-gray-700";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return String(d.getUTCFullYear());
}

function computeYearsInEo(joinDate: string | null): number | null {
  if (!joinDate) return null;
  const d = new Date(joinDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const years = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years);
}
