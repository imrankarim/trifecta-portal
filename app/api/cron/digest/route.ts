// Vercel Cron entry point — sends the weekly at-risk digest to every chapter
// that has digest delivery configured.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject anything else.
// Schedule: see vercel.json `crons[]`.
//
// Recipient resolution is in sendDigest():
//   1. chapters.data_sources_config.digest.recipients (explicit list)
//   2. fallback: all Admin/ExecutiveDirector members in the chapter

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDigest, type SendDigestResult } from "@/lib/digest/sendDigest";

// Each chapter's send is one Resend API call + a stamp write; fast.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ChapterRun = {
  chapterId: string;
  chapterName: string | null;
  result?: SendDigestResult;
  error?: string;
};

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: chapters, error } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, chapter_name, data_sources_config");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const runs: ChapterRun[] = [];
  for (const ch of chapters ?? []) {
    // Skip chapters that have explicitly disabled the digest. Default is "enabled."
    const digestConfig = ((ch.data_sources_config ?? {}) as Record<string, unknown>).digest as
      | { enabled?: boolean }
      | undefined;
    if (digestConfig?.enabled === false) continue;

    try {
      const result = await sendDigest({
        supabase,
        chapterId: ch.trifecta_chapter_id,
      });
      runs.push({
        chapterId: ch.trifecta_chapter_id,
        chapterName: ch.chapter_name ?? null,
        result,
      });
    } catch (e) {
      runs.push({
        chapterId: ch.trifecta_chapter_id,
        chapterName: ch.chapter_name ?? null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), runs });
}
