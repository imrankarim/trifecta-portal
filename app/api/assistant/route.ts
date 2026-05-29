import { createClient } from "@/lib/supabase/server";
import { getAnthropic, MODEL } from "@/lib/llm/client";
import { buildChapterContext } from "@/lib/llm/buildChapterContext";

export const maxDuration = 60;

const MEMBER_SELECT =
  "first_name, last_name, company_name, contact_type, membership_status, churn_risk_tier, " +
  "engagement_score_current, days_since_last_engagement, forum_attendance_rate_12m, " +
  "local_event_attendance_rate_12m, notes, custom_fields";

const SYSTEM_PROMPT = `You are the board assistant for an EO (Entrepreneurs' Organization) chapter, inside the Trifecta portal. Board members — volunteers like the President, Membership Chair, and Forum Chairs — ask you questions about their chapter, and you answer using ONLY the chapter data provided in the user's message.

EO context:
- Members are dues-paying entrepreneurs. Every member belongs to a "Forum" — a small confidential peer group; forum attendance is the strongest engagement signal.
- The engagement score is 0–100; risk tiers are Critical/High/Medium/Low/Monitor, where Critical = highest churn risk.
- "On Leave" members are on sabbatical (up to 2 years) — still members, not actively engaged. Don't treat them as churn risks.
- EO's membership year starts July 1; the renewal push runs late May through June.

How to answer:
- Be concrete and actionable. Name specific members and cite their actual numbers (score, risk tier, days since engagement, forum) from the data.
- When asked who to call/prioritize, rank by urgency (Critical first, then lowest scores) and say briefly WHY each one and what action to take.
- If the data doesn't contain something, say so plainly — never invent members, scores, dates, or notes.
- Keep it scannable: short intro sentence, then a numbered list. Use plain text — NO markdown bold, headers, or asterisks (they won't render). Member names on their own can start a line.
- Be warm but efficient — the reader is a busy volunteer.`;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  let question = "";
  try {
    const body = await req.json();
    question = String(body.question ?? "").slice(0, 2000);
  } catch {
    // fall through to empty-check
  }
  if (!question.trim()) {
    return new Response(JSON.stringify({ error: "Ask a question first." }), { status: 400 });
  }

  const { data: chapters } = await supabase.from("chapters").select("chapter_name").limit(1);
  const chapterName = chapters?.[0]?.chapter_name ?? "the chapter";

  const { data: rawMembers } = await supabase.from("members").select(MEMBER_SELECT);
  const context = buildChapterContext(
    (rawMembers ?? []) as unknown as Record<string, unknown>[],
    chapterName,
  );

  let client;
  try {
    client = getAnthropic();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anthropic not configured";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  const anthropicStream = client.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `${context}\n\n---\n\nBoard member's question: ${question}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "stream failed";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
