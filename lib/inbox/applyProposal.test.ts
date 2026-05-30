import { describe, it, expect } from "vitest";
import { proposalToCanonical, describeProposal, type ApplyContext } from "./applyProposal";

const ctx: ApplyContext = {
  confirmerId: "chair-1",
  now: "2026-05-30T12:00:00.000Z",
  newId: () => "fixed-id",
  sourceLabel: "email",
};

describe("proposalToCanonical — action_item", () => {
  it("maps text + due_date to a canonical action item", () => {
    const patch = proposalToCanonical(
      { extraction_type: "action_item", payload: { text: "Call Jeff about renewal", due_date: "2026-06-06" } },
      ctx,
    );
    expect(patch.appendActionItem).toMatchObject({
      id: "fixed-id",
      text: "Call Jeff about renewal",
      created_at: ctx.now,
      created_by: "chair-1",
      due_date: "2026-06-06",
      assigned_to: "chair-1",
      completed_at: null,
    });
  });

  it("omits due_date when absent (null, not empty string)", () => {
    const patch = proposalToCanonical({ extraction_type: "action_item", payload: { text: "Follow up" } }, ctx);
    expect(patch.appendActionItem?.due_date).toBeNull();
  });

  it("throws on empty text", () => {
    expect(() => proposalToCanonical({ extraction_type: "action_item", payload: {} }, ctx)).toThrow();
  });
});

describe("proposalToCanonical — renewal_intent", () => {
  it("sets a valid intent + note", () => {
    const patch = proposalToCanonical(
      { extraction_type: "renewal_intent", payload: { intent: "WontRenew", note: "Going into YPO" } },
      ctx,
    );
    expect(patch.setRenewal).toEqual({
      renewal_intent_response: "WontRenew",
      renewal_intent_notes: "Going into YPO",
    });
  });

  it("rejects an unknown intent (guards the enum)", () => {
    expect(() =>
      proposalToCanonical({ extraction_type: "renewal_intent", payload: { intent: "Maybe" } }, ctx),
    ).toThrow();
  });
});

describe("proposalToCanonical — pipeline_move", () => {
  it("records a NOTE, never a silent status change", () => {
    const patch = proposalToCanonical(
      { extraction_type: "pipeline_move", payload: { summary: "Prospect ready to apply" } },
      ctx,
    );
    expect(patch.appendNote).toMatchObject({
      text: "Prospect ready to apply",
      category: "outreach",
      source: "email",
      author_id: "chair-1",
    });
    // crucially, no status mutation is expressed by the patch
    expect(patch.setRenewal).toBeUndefined();
    expect(patch.appendActionItem).toBeUndefined();
  });
});

describe("describeProposal", () => {
  it("humanizes each type", () => {
    expect(describeProposal({ extraction_type: "renewal_intent", payload: { intent: "WontRenew" } })).toContain(
      "Not renewing",
    );
    expect(describeProposal({ extraction_type: "action_item", payload: { text: "X", due_date: "2026-06-01" } })).toContain(
      "due 2026-06-01",
    );
    expect(describeProposal({ extraction_type: "pipeline_move", payload: { summary: "moved" } })).toContain("moved");
  });
});
