import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFromEmail, type EmailInput } from "@/lib/llm/extractFromEmail";

export const maxDuration = 60;

const ACTIVE = new Set(["Active", "Grace Period", "Lapsed"]);

interface MemberLite {
  trifecta_member_id: string;
  first_name: string | null;
  last_name: string | null;
  email_primary: string | null;
  company_name: string | null;
  contact_type: string | null;
  membership_status: string | null;
  renewal_intent_response: string | null;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { from?: string; to?: string; subject?: string; body?: string; message_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email: EmailInput = {
    from: String(body.from ?? "").trim(),
    to: String(body.to ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    subject: String(body.subject ?? "").trim(),
    body: String(body.body ?? "").trim(),
  };
  if (!email.from || !email.body) {
    return NextResponse.json({ error: "Sender and body are required." }, { status: 400 });
  }

  // Chapter (RLS-scoped to the caller).
  const { data: chapter } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id")
    .limit(1)
    .single();
  if (!chapter) return NextResponse.json({ error: "No chapter linked" }, { status: 400 });
  const chapterId = chapter.trifecta_chapter_id as string;

  // Active-member roster so the model can resolve target emails (and we can map
  // proposals to member rows). RLS-scoped read.
  const { data: rawMembers } = await supabase
    .from("members")
    .select(
      "trifecta_member_id, first_name, last_name, email_primary, company_name, contact_type, membership_status, renewal_intent_response",
    );
  const members = (rawMembers ?? []) as unknown as MemberLite[];
  const active = members.filter(
    (m) => m.contact_type === "Member" && ACTIVE.has(m.membership_status ?? ""),
  );
  const rosterText = active
    .filter((m) => m.email_primary)
    .map(
      (m) =>
        `${`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()} <${m.email_primary}>` +
        `${m.company_name ? ` — ${m.company_name}` : ""}` +
        `${m.renewal_intent_response ? ` [renewal: ${m.renewal_intent_response}]` : ""}`,
    )
    .join("\n");
  const memberByEmail = new Map(
    members.filter((m) => m.email_primary).map((m) => [m.email_primary!.toLowerCase(), m]),
  );

  // Extract structured proposals.
  let extraction;
  try {
    extraction = await extractFromEmail(email, rosterText);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 500 },
    );
  }

  // Persist via the admin client (RLS allows only SELECT for authenticated).
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: commRow, error: commErr } = await admin
    .from("inbound_communications")
    .insert({
      chapter_id: chapterId,
      kind: "email",
      source_tool: "manual_paste",
      source_message_id: body.message_id ?? randomUUID(),
      sender: email.from,
      recipient_emails: email.to,
      subject: email.subject,
      received_at: nowIso,
      direction: "chair_outbound",
      classification: extraction.classification ?? null,
      ingest_status: "extracted",
      processed_at: nowIso,
    })
    .select("id")
    .single();
  if (commErr || !commRow) {
    return NextResponse.json(
      { error: `Failed to store communication: ${commErr?.message}` },
      { status: 500 },
    );
  }

  // Store each proposal as a pending extraction, resolving the member by email.
  let created = 0;
  let unmatched = 0;
  for (const p of extraction.proposals) {
    const member = p.target_email ? memberByEmail.get(p.target_email.toLowerCase()) : undefined;
    if (!member) unmatched++;
    const { error: exErr } = await admin.from("communication_extractions").insert({
      communication_id: commRow.id,
      chapter_id: chapterId,
      extraction_type: p.extraction_type,
      target_member_id: member?.trifecta_member_id ?? null,
      payload: p.payload ?? {},
      confidence: typeof p.confidence === "number" ? p.confidence : null,
      status: "proposed",
    });
    if (!exErr) created++;
  }

  return NextResponse.json({
    communicationId: commRow.id,
    classification: extraction.classification ?? null,
    proposalsCreated: created,
    unmatched,
  });
}
