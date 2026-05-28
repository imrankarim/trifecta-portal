// Vercel Cron entry point — runs the HubSpot sync for every chapter that has
// a `hubspot` entry in chapters.data_sources_config.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject anything else.
// Schedule: see vercel.json `crons[]`.
//
// Returns a JSON summary so the run is inspectable in Vercel's logs.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnector, type SyncResult } from "@/lib/jobs/syncConnector";

// 232+ HubSpot records × Supabase round-trips can take well over the default 10s.
export const maxDuration = 300;

// Cron jobs should always hit fresh data.
export const dynamic = "force-dynamic";

type ChapterRun = {
  chapterId: string;
  chapterName: string | null;
  result?: SyncResult;
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
    const config = (ch.data_sources_config ?? {}) as Record<string, unknown>;
    if (!config.hubspot) continue;
    try {
      const result = await syncConnector({
        supabase,
        chapterId: ch.trifecta_chapter_id,
        sourceName: "hubspot",
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
