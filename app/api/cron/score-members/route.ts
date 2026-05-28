// Vercel Cron entry point — recomputes engagement scores for every chapter
// in the system. Runs after the nightly HubSpot sync so scores reflect the
// freshest data.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject anything else.
// Schedule: see vercel.json `crons[]`.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreMembers, type ScoreMembersResult } from "@/lib/jobs/scoreMembers";

// Scoring loops over every Member per chapter; ~120 + 12 + 50 + 594 = ~775
// rows for EO Dallas alone. The 300s budget gives us comfortable headroom.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ChapterRun = {
  chapterId: string;
  chapterName: string | null;
  result?: ScoreMembersResult;
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
    .select("trifecta_chapter_id, chapter_name");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const runs: ChapterRun[] = [];
  for (const ch of chapters ?? []) {
    try {
      const result = await scoreMembers({
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
