// Send the at-risk weekly digest via Resend.
//
// Composition:
//   buildDigest()       — load + shape data (atRiskDigest.ts)
//   renderDigestHTML()  — produce email-safe HTML (atRiskDigest.ts)
//   sendDigest()        — pick recipients, send via Resend, stamp the chapter
//
// Recipient resolution (in priority order):
//   1. opts.recipients (explicit, for tests / manual sends)
//   2. chapters.data_sources_config.digest.recipients (per-chapter override)
//   3. All Admin/ExecutiveDirector members in the chapter
//
// Hallucination / spam guardrail: empty top_risk lists still send a friendly
// "no at-risk members this week" email (per ADR-002 design — chairs should
// know the system is alive). Adjust `skip_empty` to suppress if needed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildDigest, renderDigestHTML } from "./atRiskDigest";

export interface SendDigestOptions {
  supabase: SupabaseClient;
  chapterId: string;
  /** Explicit recipient list — overrides per-chapter config + admin auto-resolve. */
  recipients?: string[];
  /** Don't actually call Resend; return what would happen. */
  dryRun?: boolean;
  /** Override the Resend "from" address. Defaults to env.RESEND_FROM. */
  from?: string;
  /** When true, suppresses send if top_risk is empty (default false). */
  skipEmpty?: boolean;
}

export interface SendDigestResult {
  chapterId: string;
  chapterName: string;
  recipients: string[];
  topRiskCount: number;
  sentAt: string;
  resendId?: string;
  skipped?: "empty" | "no_recipients" | "no_api_key" | "dry_run";
  error?: string;
}

const DEFAULT_FROM = "Trifecta <onboarding@resend.dev>";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export async function sendDigest(opts: SendDigestOptions): Promise<SendDigestResult> {
  const digest = await buildDigest(opts.supabase, opts.chapterId);
  const html = renderDigestHTML(digest);
  const subject = `${digest.chapter_name} — Top At-Risk Members · ${formatDate(digest.generated_at)}`;

  const recipients = await resolveRecipients(opts);

  const result: SendDigestResult = {
    chapterId: opts.chapterId,
    chapterName: digest.chapter_name,
    recipients,
    topRiskCount: digest.top_risk.length,
    sentAt: new Date().toISOString(),
  };

  if (opts.skipEmpty && digest.top_risk.length === 0) {
    result.skipped = "empty";
    return result;
  }

  if (recipients.length === 0) {
    result.skipped = "no_recipients";
    result.error = "No recipients resolved";
    return result;
  }

  if (opts.dryRun) {
    result.skipped = "dry_run";
    return result;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    result.skipped = "no_api_key";
    result.error = "RESEND_API_KEY is not configured";
    return result;
  }

  const resend = new Resend(apiKey);
  const from = opts.from ?? process.env.RESEND_FROM ?? DEFAULT_FROM;

  try {
    const r = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
    });
    if (r.error) {
      result.error = r.error.message;
    } else if (r.data) {
      result.resendId = r.data.id;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  // Stamp the chapter with last_digest_sent_at + last_digest_result for audit
  if (!result.error) {
    try {
      const { data: ch } = await opts.supabase
        .from("chapters")
        .select("data_sources_config")
        .eq("trifecta_chapter_id", opts.chapterId)
        .single();
      const config = (ch?.data_sources_config ?? {}) as Record<string, unknown>;
      const digestConfig = (config.digest ?? {}) as Record<string, unknown>;
      const updated = {
        ...config,
        digest: {
          ...digestConfig,
          last_sent_at: result.sentAt,
          last_recipients: recipients,
          last_resend_id: result.resendId,
          last_top_risk_count: result.topRiskCount,
        },
      };
      await opts.supabase
        .from("chapters")
        .update({ data_sources_config: updated })
        .eq("trifecta_chapter_id", opts.chapterId);
    } catch {
      // Audit-stamp failure is non-fatal — the email was already sent.
    }
  }

  return result;
}

async function resolveRecipients(opts: SendDigestOptions): Promise<string[]> {
  // 1. Explicit
  if (opts.recipients && opts.recipients.length > 0) {
    return opts.recipients;
  }

  // 2. Per-chapter config override
  const { data: chapter } = await opts.supabase
    .from("chapters")
    .select("data_sources_config")
    .eq("trifecta_chapter_id", opts.chapterId)
    .single();
  const digestConfig = ((chapter?.data_sources_config ?? {}) as Record<string, unknown>).digest as
    | { recipients?: string[] }
    | undefined;
  if (digestConfig?.recipients && digestConfig.recipients.length > 0) {
    return digestConfig.recipients;
  }

  // 3. Admin + ED members
  const { data } = await opts.supabase
    .from("members")
    .select("email_primary,role")
    .eq("chapter_id", opts.chapterId)
    .in("role", ["Admin", "ExecutiveDirector"]);
  return ((data ?? []) as Array<{ email_primary: string | null }>)
    .map((r) => (r.email_primary ?? "").trim())
    .filter((e) => e.length > 0);
}
