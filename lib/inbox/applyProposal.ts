// Pure mapping from an accepted email-extraction PROPOSAL to a canonical patch
// on a member. No I/O — the accept action reads the member, applies the patch
// (append to a JSONB array / set scalar columns), and writes back. Keeping this
// pure makes the "killer trio" mapping fully unit-testable.

export type ExtractionType = "action_item" | "renewal_intent" | "pipeline_move";

export interface Proposal {
  extraction_type: ExtractionType;
  /** LLM-produced fields; shape depends on extraction_type. */
  payload: Record<string, unknown>;
  confidence?: number | null;
}

// Mirror the canonical JSONB shapes used by app/members/[id]/actions.ts.
export interface ActionItemEntry {
  id: string;
  text: string;
  created_at: string;
  created_by: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface NoteEntry {
  id: string;
  ts: string;
  text: string;
  author_id?: string | null;
  category?: string;
  source?: string;
}

/** Valid renewal_intent_response enum values (must match the DB enum). */
export const RENEWAL_INTENTS = new Set(["PlanToRenew", "WantToSpeak", "WontRenew", "NoResponse"]);

export interface ApplyContext {
  /** member_id of the chair accepting the proposal. */
  confirmerId: string | null;
  now: string;
  newId: () => string;
  /** provenance label written onto notes, e.g. "email". */
  sourceLabel: string;
}

/** One of these is set depending on the extraction type. */
export interface CanonicalPatch {
  appendActionItem?: ActionItemEntry;
  appendNote?: NoteEntry;
  setRenewal?: { renewal_intent_response: string; renewal_intent_notes: string | null };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Turn an accepted proposal into a canonical patch. Throws on a malformed
 * payload (empty text, unknown renewal intent) — the caller surfaces the error
 * and leaves the proposal un-applied.
 */
export function proposalToCanonical(p: Proposal, ctx: ApplyContext): CanonicalPatch {
  switch (p.extraction_type) {
    case "action_item": {
      const text = str(p.payload.text);
      if (!text) throw new Error("action_item proposal has no text");
      const due = str(p.payload.due_date);
      return {
        appendActionItem: {
          id: ctx.newId(),
          text,
          created_at: ctx.now,
          created_by: ctx.confirmerId,
          due_date: due || null,
          assigned_to: ctx.confirmerId,
          completed_at: null,
          completed_by: null,
        },
      };
    }

    case "renewal_intent": {
      const intent = str(p.payload.intent);
      if (!RENEWAL_INTENTS.has(intent)) {
        throw new Error(`renewal_intent proposal has invalid intent "${intent}"`);
      }
      const note = str(p.payload.note);
      return {
        setRenewal: {
          renewal_intent_response: intent,
          renewal_intent_notes: note || null,
        },
      };
    }

    case "pipeline_move": {
      // Conservative by design: a pipeline/status move is recorded as a NOTE,
      // never a silent membership_status change (that path is guarded — see
      // the sync status-lock). The chair can act on the note manually.
      const summary = str(p.payload.summary) || str(p.payload.text);
      if (!summary) throw new Error("pipeline_move proposal has no summary");
      return {
        appendNote: {
          id: ctx.newId(),
          ts: ctx.now,
          text: summary,
          author_id: ctx.confirmerId,
          category: "outreach",
          source: ctx.sourceLabel,
        },
      };
    }

    default:
      throw new Error(`unknown extraction_type "${(p as Proposal).extraction_type}"`);
  }
}

/** Human-readable one-liner for the review inbox (pure, for display). */
export function describeProposal(p: Proposal): string {
  switch (p.extraction_type) {
    case "action_item": {
      const text = str(p.payload.text) || "(no text)";
      const due = str(p.payload.due_date);
      return `Add action item: "${text}"${due ? ` (due ${due})` : ""}`;
    }
    case "renewal_intent": {
      const intent = str(p.payload.intent);
      const label =
        {
          PlanToRenew: "Will renew",
          WantToSpeak: "Undecided — wants to talk",
          WontRenew: "Not renewing",
          NoResponse: "No response",
        }[intent] ?? intent;
      return `Set renewal intent → ${label}`;
    }
    case "pipeline_move":
      return `Log pipeline note: "${str(p.payload.summary) || str(p.payload.text) || "(no detail)"}"`;
    default:
      return "Unknown proposal";
  }
}
