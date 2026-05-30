import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "./client";

export interface EmailInput {
  from: string;
  to: string[];
  subject: string;
  body: string;
}

export interface RawProposal {
  extraction_type: "action_item" | "renewal_intent" | "pipeline_move";
  /** Email of the member this is about — must be copied from the supplied roster. */
  target_email: string;
  payload: Record<string, unknown>;
  confidence: number;
}

export interface ExtractionResult {
  classification?: string;
  proposals: RawProposal[];
  usage?: { input: number; output: number };
}

// NOTE on forum content: ADR-002/006 originally made forum-exclusion a hard
// rule (a keyword block + LLM guard). It was removed 2026-05-30 — the blunt
// keyword block discarded operationally-useful, non-confidential forum signals
// (a failing forum, members joining/leaving/moving forums). The decision is
// deliberate and reversible; if chapters ask for it, reintroduce a content-aware
// guard (exclude confidential forum *discussion content*, keep operational meta).

const SYSTEM_PROMPT = `You extract structured, actionable signals from a board chair's operational email at an EO (Entrepreneurs' Organization) chapter, for the Trifecta portal. You output PROPOSALS only — they are recorded for the board with a full audit trail and can be undone. Be conservative: only propose something you're confident a board member would want recorded.

Extract ONLY these three types:
1. action_item — a concrete follow-up task. payload: { "text": string, "due_date"?: "YYYY-MM-DD" }
2. renewal_intent — the member's stance on renewing their EO membership. payload: { "intent": one of "PlanToRenew" | "WantToSpeak" | "WontRenew" | "NoResponse", "note": short reason }
3. pipeline_move — a change in a member/prospect's status or pipeline stage (e.g. prospect ready to apply, member considering leaving, member moving forums). payload: { "summary": short description }

Rules:
- Resolve who each proposal is about by copying their exact email from the ROSTER provided in the user message into target_email. NEVER invent a member or an email. If you can't match someone to the roster, omit that proposal.
- Do not invent facts, dates, or intent not supported by the email. If nothing actionable is present, return an empty proposals array.
- confidence is 0.0–1.0 reflecting how clearly the email supports the proposal.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "propose_extractions",
  description: "Return any extracted proposals from the email.",
  input_schema: {
    type: "object",
    properties: {
      classification: {
        type: "string",
        description:
          "one of: prospect_outreach | renewal_conversation | sponsor_cultivation | cross_chair_coordination | member_followup | introduction | other",
      },
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            extraction_type: {
              type: "string",
              enum: ["action_item", "renewal_intent", "pipeline_move"],
            },
            target_email: { type: "string", description: "member email copied from the roster" },
            payload: { type: "object", description: "fields per the extraction_type" },
            confidence: { type: "number" },
          },
          required: ["extraction_type", "target_email", "payload", "confidence"],
        },
      },
    },
    required: ["proposals"],
  },
};

export async function extractFromEmail(
  email: EmailInput,
  rosterText: string,
): Promise<ExtractionResult> {
  const client = getAnthropic();
  const userContent = [
    "## Chapter roster (resolve target_email from here only)",
    rosterText,
    "",
    "## Email",
    `From: ${email.from}`,
    `To: ${email.to.join(", ")}`,
    `Subject: ${email.subject}`,
    "",
    email.body,
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "propose_extractions" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return { proposals: [] };

  const input = toolUse.input as { classification?: string; proposals?: RawProposal[] };
  return {
    classification: input.classification,
    proposals: Array.isArray(input.proposals) ? input.proposals : [],
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
