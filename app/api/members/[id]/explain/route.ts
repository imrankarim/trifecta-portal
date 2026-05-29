import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { explainMember } from "@/lib/llm/explainMember";

// Adaptive thinking + a 600-token response stays well under Vercel's 60s
// default, but the LLM call dominates so we bump the function timeout.
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS scopes this to the user's chapter.
  const { data: member, error } = await supabase
    .from("members")
    .select("*")
    .eq("trifecta_member_id", params.id)
    .single();

  if (error || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  try {
    const result = await explainMember(member as Record<string, unknown>);
    return NextResponse.json({
      narrative: result.narrative,
      usage: {
        input: result.inputTokens,
        output: result.outputTokens,
        cacheRead: result.cacheReadTokens,
        cacheCreation: result.cacheCreationTokens,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
