import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";
import { buildMemberContext } from "./buildContext";

const SYSTEM_PROMPT = `You are an EO chapter board chair's assistant. You analyze members of the Entrepreneurs' Organization (EO) Dallas chapter and produce concise, useful summaries for chapter leaders.

EO context:
- Members are dues-paying entrepreneurs who run companies above a revenue threshold.
- "Forum" is a small confidential peer group every member belongs to — forum attendance is the strongest engagement signal.
- "SLP" is the Sustaining Leadership Program (deeper-engagement track).
- "On Leave" is a sabbatical status (up to 2 years) — these members are not actively engaged but are still members.
- The engagement score is 0-100; tiers are Critical/High/Medium/Low/Monitor with Critical = highest churn risk.
- "Days since last engagement" rising past 180 is concerning.

Writing rules:
- 3 sentences. Maximum. No preamble like "Here is a summary" — start with the member's first name.
- Tone: clear, factual, board-chair-to-board-chair. Not marketing copy. Not corporate.
- Use the supplied data. Do not invent attendance, board roles, or notes that aren't in the context.
- If a key signal is absent from the data, say so briefly rather than guessing.
- Mention the engagement score and risk tier when present.
- If the member is On Leave, lead with that — don't talk about engagement risk.
- If notes exist, weave in the most recent useful signal (renewal intent, life event, board interest, etc.).
- End with a forward-looking observation: a strength, a concern, or a recommended next touch.`;

export interface ExplainResult {
  narrative: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export async function explainMember(member: Record<string, unknown>): Promise<ExplainResult> {
  const client = getAnthropic();
  const context = buildMemberContext(member);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
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
        content: `Here is the data on a member. Write the 3-sentence summary now.\n\n${context}`,
      },
    ],
  });

  const narrative = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return {
    narrative,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}
