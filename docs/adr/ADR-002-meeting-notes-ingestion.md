# ADR-002 — AI meeting-note ingestion via the chapter mailbox

**Status:** Accepted (2026-05-26)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 (none — explicitly deferred); Phase 2+ (build target)
**Related:** [ADR-001 — Google Drive ingestion access model](ADR-001-google-drive-ingestion-access-model.md)
**Supersedes:** none

---

## Context

A substantial share of high-value chapter signal is generated in real-time conversation rather than written down:

- Board chairs holding 1:1s with members about renewal, engagement, or business challenges
- Full board meetings where decisions and action items are agreed
- The Executive Director's operational check-ins
- Sponsorship calls
- Membership Chair recruitment conversations with prospects
- Cross-chapter / regional coordination calls

A growing share of these calls are captured by AI note-takers — Zoom AI Companion, Microsoft Teams Copilot, Google Meet built-in transcription, Otter.ai, Fathom, Fireflies, Granola, Krisp Notes, Read.ai. Each produces structured summaries (action items, decisions, paraphrased highlights, sometimes verbatim quotes) that are emailed or shared post-meeting.

These summaries are *exactly* the structured-signal source Trifecta exists to leverage: who is at risk, what was agreed, what's the next touchpoint, what's the renewal intent. Today this content lives in scattered inboxes and Notion pages and never feeds the chapter's central operational picture. The board chair writes 10 minutes of notes after every call into a sheet that nobody else reads.

The architectural question: how does Trifecta ingest this stream without building bespoke integrations per note-taker, and without violating the confidentiality norms (especially around Forum) that EO members rightly depend on?

## Decision

**Trifecta ingests AI meeting-note summaries through the same per-chapter mailbox that handles Drive content (ADR-001).** Board chairs and the ED configure their note-taker of choice to email or auto-forward each ingest-eligible meeting summary to `<chapter>@<trifecta-domain>`. Trifecta's inbound parser extracts structured signals (action items, member-status comments, sentiment cues, decisions, engagement signals) and routes them to the right Trifecta records — with explicit human-confirmation gating before AI-extracted content overwrites any canonical structured field.

The implementation pipeline mirrors ADR-001's Drive ingestion stages: Ingest → Classify → Extract → Reconcile → Notify. Different parser at stage one (email + attached summary instead of Drive file), same shape downstream.

**Speaker / member attribution is done by email address from the calendar invite**, not by voice diarization. The summary's attendee list — which every supported note-taker includes — maps reliably to `members.email_primary`. Voice-level diarization quality varies by tool and is treated as a bonus, not load-bearing.

**Build timing:** Phase 2. Sibling to the full Drive ingestion pipeline. Phase 1 makes no changes for this — but Phase 1 design choices stay compatible (notes JSONB shape on `members`, mailbox-side architecture, the existing `data_sources_config` JSONB column on `chapters`).

## Alternatives considered

### (A) Build Trifecta-native meeting recording

Trifecta joins meetings as a bot, records, transcribes, summarizes.

**Rejected.** Reproduces functionality that 8+ vendors already do well, ties Trifecta to recording-consent obligations that vary by state, and creates a meeting-fatigue problem (yet another bot in the call). Trifecta's leverage is in synthesis and routing, not capture.

### (B) Direct API integrations with each note-taker

Build OAuth integrations with Otter, Fathom, Granola, Zoom, etc. Pull transcripts via API.

**Rejected as primary, retained as Phase 3 optimization.** The integration matrix is too wide (and shifts every quarter as tools rise and fall) to be the foundation. Email is the universal lowest-common-denominator that every note-taker supports today and will support indefinitely. Once Trifecta sees actual usage patterns and 1–2 dominant tools per chapter, direct APIs for those specific tools can be added as performance / freshness improvements on top of the email funnel.

### (C) Manual paste-in via Trifecta admin UI

Board chair finishes a call, copies the summary, pastes into a Trifecta form.

**Rejected.** Adds friction precisely where the product needs to remove it. The whole point is that the board chair's existing post-meeting workflow (note-taker emails summary) becomes the input — no new action required.

### (D) Email funnel via chapter mailbox — **selected**

Same mailbox as ADR-001. Board chairs forward (or auto-forward) note-taker summaries to it. Trifecta parses. Works with every existing tool and every future tool that supports "send a copy to this email."

## Consequences

### Positive

- **Zero new infrastructure.** The per-chapter Workspace mailbox already exists for Drive ingestion. The note-takers already email summaries. Trifecta just adds an inbound email parser.
- **Tool-agnostic.** Works with whatever the board chair already uses. No integration per tool; no integration breakage when a chair switches tools.
- **Two-person 1:1s are the killer use case.** ED 1:1 with a member or Membership Chair recruitment call → two attendees, high signal density, clean attribution. The product turns "10 minutes writing summary notes" into "30 seconds reviewing AI-extracted notes." This is the kind of feature board chairs tell each other about unprompted.
- **Inbound mailbox channel pays off twice.** Same identity that receives shared Docs receives meeting notes. The product story to chapters becomes coherent: "share what you want Trifecta to know with `<chapter>@<trifecta-domain>` — docs, sheets, meeting summaries, forwarded threads."

### Negative / risks

- **Confidentiality blast radius.** This is the hard one. See dedicated section below.
- **Hallucination risk.** AI summaries paraphrase. "John seems unhappy with his forum" may be the note-taker's interpretation, not John's words. Trifecta must treat AI-extracted content as secondary signal, surfaced for human confirmation before any canonical field (renewal_intent_response, churn_risk_tier override, etc.) is updated.
- **Volume and noise.** ~95% of meeting content is operationally irrelevant. The extractor must aggressively filter to the useful 5% (action items, member status, engagement signals, decisions). Full transcripts are NOT stored — only structured extracts plus a pointer back to the source email message.
- **Per-meeting-type opt-in required.** Board members will not tolerate "every meeting gets ingested by default." Trifecta needs explicit policy: which meeting types are ingest-eligible per chapter, with clear defaults and a visible "what got captured" surface.

### Non-negotiable: Forum confidentiality

**EO Forum operates under GINA confidentiality norms.** What is shared inside a forum stays inside that forum. **Trifecta MUST NOT ingest forum meeting notes, ever.** This is a product-level rule, not a configuration option. The rule manifests as:

1. Forum meetings are NEVER ingest-eligible by default and have no UI path to be enabled.
2. The email parser detects forum-meeting signals (subject lines containing "Forum", note-taker-tagged forum context, specific forum chair email addresses on the attendee list with no non-forum-member attendees) and rejects them on receipt with a clear "this looks like a forum meeting — Trifecta does not ingest forum content" reply to the sender.
3. The chapter onboarding documentation makes this explicit in plain language so that no board chair can plausibly expect otherwise.
4. The detection logic errs heavily on the side of false positives (reject when uncertain). A forum-related summary slipping into Trifecta is a serious product failure; a non-forum summary being rejected and re-routed by the user is a minor inconvenience.

Violating this would not just be a privacy bug — it would terminate the product's social license to operate in EO. Treat with the same gravity as multi-tenant chapter isolation.

### Implications for the codebase

Two new tables proposed for Phase 2:

```
meeting_summaries
  id                 UUID PK
  chapter_id         UUID FK chapters
  source_tool        TEXT       -- 'granola' | 'fathom' | 'otter' | 'zoom_ai' | 'teams_copilot' | 'google_meet' | 'other' | 'unknown'
  received_at        TIMESTAMPTZ
  source_message_id  TEXT       -- email Message-ID, for dedupe
  source_sender      TEXT
  meeting_subject    TEXT
  meeting_started_at TIMESTAMPTZ (nullable; extracted from summary when available)
  attendee_emails    TEXT[]
  attendee_member_ids UUID[]    -- resolved from attendee_emails via members.email_primary lookup
  meeting_type       TEXT       -- 'board' | '1on1_member' | 'sponsor' | 'ed_ops' | 'other' | 'unknown'
  ingest_status      TEXT       -- 'received' | 'classified' | 'extracted' | 'rejected_forum' | 'rejected_policy' | 'error'
  rejection_reason   TEXT (nullable)
  raw_pointer        TEXT       -- pointer to the source email in storage; NOT the body
  processed_at       TIMESTAMPTZ
```

```
meeting_extractions
  id                 UUID PK
  summary_id         UUID FK meeting_summaries
  chapter_id         UUID FK chapters    -- denormalized for RLS / fast filtering
  extraction_type    TEXT       -- 'action_item' | 'status_signal' | 'sentiment' | 'decision' | 'engagement_signal' | 'renewal_intent_hint' | 'sponsor_pipeline'
  target_member_id   UUID FK members (nullable; some extractions are chapter-level)
  payload            JSONB
  confidence         NUMERIC(3,2)
  confirmed_by       UUID FK members (nullable; the human who approved)
  confirmed_at       TIMESTAMPTZ (nullable)
  applied_to_canonical BOOLEAN DEFAULT FALSE  -- did this extraction actually update a canonical field?
  created_at         TIMESTAMPTZ
```

Configuration on `chapters.data_sources_config` (JSONB) gains a `meeting_ingestion` section:

```json
"meeting_ingestion": {
  "enabled": true,
  "allowed_meeting_types": ["board", "1on1_member", "sponsor", "ed_ops"],
  "configured_note_tools": ["granola", "fathom"],
  "forum_keywords_block": ["forum", "GINA"]   // additional chapter-specific safety keywords
}
```

The `GoogleDriveConnector` (Phase 2) and a sibling `MailboxIngestionConnector` (Phase 2) both implement the existing `DataSource` interface, scoped to one chapter, authenticated as that chapter's mailbox.

### Implications for Phase 1

**No code changes.** Phase 1 makes no commitments about meeting ingestion. The only Phase-1-relevant compatibility constraint is:

- The `members.notes` JSONB column (which exists, as an array of `{ts, author_id, text}`) is the natural sink for human-confirmed extractions of the form "ED's notes on Jon from a recent 1:1." Phase 1 should not change this shape in a way that breaks Phase 2 ingestion. Current shape is compatible.

### Implications for Phase 2 sequence

Built **after** the Drive ingestion pipeline, **before** any direct note-taker API integrations:

1. Drive ingestion pipeline lands (ADR-001 implementation).
2. Mailbox email parser added. Initially handles only meeting-note formats from the 3–4 most common note-takers (parse layouts, not API integrations).
3. Forum-detection guardrails in place and tested before any extraction logic runs.
4. Extraction pipeline reuses ADR-001's Classify/Extract/Reconcile stages.
5. Admin UI surface: per-chapter "Recent meeting extractions" with one-click confirm / reject / delete.
6. Only after all of the above lands and has real chapter usage: consider direct API integrations for the 1–2 note-takers that dominate usage.

## Open items

- [ ] Choose initial note-taker layouts to support (likely Granola + Fathom + Zoom AI Companion based on EO-leader usage patterns; validate with Jon).
- [ ] Draft the human-readable chapter policy document explaining what Trifecta does and does not ingest from meetings, for the chapter onboarding flow.
- [ ] Codify the forum-detection ruleset and test it against a corpus of real EO meeting subject lines and attendee patterns before any production ingestion. False-positive bias.
- [ ] Decide whether Trifecta stores any raw extracted text or only structured fields. Recommendation: store only structured extracts + a pointer to the source email message ID; never the full summary body. Revisit if extraction quality demands access to source context.
- [ ] When the board-seat ontology stabilizes (see ADR-001 Open Items), align meeting-extraction `extraction_type` enum values to the seat ontology so extractions route cleanly to seat-area records.
