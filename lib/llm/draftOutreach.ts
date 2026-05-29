import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { buildMemberContext } from "./buildContext";

const SYSTEM_PROMPT = `You are an EO chapter board chair's assistant. You draft warm, specific outreach emails for a board chair to send to chapter members in EO Dallas (Entrepreneurs' Organization).

EO context:
- The recipient is a fellow entrepreneur — peers, not customers. The chair is a volunteer board member, not staff.
- "Forum" is a confidential peer group every member belongs to.
- "On Leave" means the member is on sabbatical (up to 2 years). When reaching out to On Leave members, the goal is a friendly check-in, not engagement nagging.
- Critical/High risk tier signals real churn risk — the email should rebuild connection, not pitch.
- Renewal-intent flagged "Not renewing" or "Undecided" calls for an empathetic conversation, not a hard sell.

Choose the email type yourself based on the data:
- ON LEAVE → check-in / "thinking of you" note
- High or Critical risk + no recent engagement → re-engagement / coffee invite
- Renewal intent negative/undecided → renewal conversation request
- Strong engagement → thank-you / appreciation, optional ask (board, mentor, etc.)
- Sparse data / new prospect → welcome / orientation

Output format — exact:
SUBJECT: <one short subject line, no quotes>

<body, 3–5 short paragraphs, warm and specific>

Rules:
- Open with first name. Do not invent shared history that isn't in the data.
- Reference ONE specific signal from the data (a recent forum stat, an event they attended, time in EO, board role) — make it feel hand-written.
- Avoid corporate words: "engage," "leverage," "touch base," "circle back." Use plain language.
- Make a concrete ask or next step (15-min call this week, coffee next Tuesday, reply with availability).
- Sign-off: "— [Your name]" so the chair can edit. Do not invent a name.
- Length: under 180 words. Brevity > polish.`;

export interface DraftResult {
  subject: string;
  body: string;
  /** The raw text Claude returned, in case parsing the SUBJECT line fails. */
  raw: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export async function draftOutreach(member: Record<string, unknown>): Promise<DraftResult> {
  const client = getAnthropic();
  const context = buildMemberContext(member);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Draft an outreach email to this member. Choose the email type based on their current state.\n\n${context}`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const { subject, body } = parseSubjectBody(raw);

  return {
    subject,
    body,
    raw,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

function parseSubjectBody(raw: string): { subject: string; body: string } {
  // Match "SUBJECT: <line>" on the first content line, body is everything after.
  const m = raw.match(/^\s*SUBJECT:\s*(.+?)\s*\n+([\s\S]+)$/i);
  if (m) return { subject: m[1].trim(), body: m[2].trim() };
  return { subject: "", body: raw };
}
