# ADR-006 — Email correspondence ingestion via the chapter mailbox (ambient-context layer)

**Status:** Accepted (2026-05-28)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 (zero code — design captured to keep schema choices compatible); Phase 2+ (build target, alongside Drive ingestion and meeting-note parsing)
**Related:** [ADR-001 — Drive ingestion (per-chapter mailbox)](ADR-001-google-drive-ingestion-access-model.md); [ADR-002 — AI meeting-note ingestion (forum-exclusion rule)](ADR-002-meeting-notes-ingestion.md); [ADR-005 — contact_type vs membership_status](ADR-005-contact-type-lifecycle-separation.md)
**Supersedes:** none — extends and generalizes ADR-002's schema (`meeting_summaries` → `inbound_communications`)

---

## Context

Most CRMs offer a "BCC this address to log the email" feature. HubSpot does it. Pipedrive does it. They all do roughly the same thing: parse the email, find the contact by email address, attach the email body as a note on that contact's timeline. That's it.

The founder's stated frustration with HubSpot's version: *"it's really just a data dump that I need to manually go back and look at in their contact record later. It does not update the pipeline stage or add to a weekly digest or really help me in any way."*

The opportunity is the gap between **logging** and **synthesis**. A board chair's typical week contains dozens of emails to prospects, sponsors, members, fellow chairs. That correspondence carries enormous signal — pipeline movements, renewal intent, action items, sentiment, referrals, topic interest, cross-chair coordination. Logging it preserves the raw material; synthesizing it produces operational intelligence the chair would otherwise have to reconstruct manually (and usually doesn't).

Trifecta's chapter mailbox (ADR-001 / ADR-002) is already part of the architecture, already ingesting Drive content and AI meeting summaries. This ADR extends the same mailbox to general correspondence and commits to the synthesis layer that makes the feature meaningfully different from existing CRM BCC features.

## Decision

Board chairs CC or BCC their chapter's Trifecta mailbox (`<chapter>@<trifecta-domain>`) on any operationally pertinent email — outreach to prospects, sponsor cultivation, renewal conversations, cross-chair coordination, intros, follow-ups. Trifecta parses, classifies, extracts structured signals via LLM, and surfaces them in three places:

1. **Per-chair digest** (synthesized story, not raw inbox)
2. **Pipeline state proposals** (one-click confirm to update canonical fields)
3. **Action-item tracking** (extracted commitments with due dates)

Same per-chapter Workspace mailbox as ADR-001 / ADR-002. Same five-stage pipeline (Ingest → Classify → Extract → Reconcile → Notify). Email-specific parser at Ingest; LLM extractors at Classify and Extract.

### The product proposition

> *"BCC `dallas@trifecta-portal.app` on any pertinent email. Trifecta does the rest: extracts intent, updates pipelines, queues your follow-ups, surfaces what matters in your weekly digest. You stop maintaining a separate to-do list — Trifecta builds one from the work you're already doing."*

The chair adds **zero** new work. They CC the system on emails they're already sending. Trifecta synthesizes ambient context the chair would otherwise have to reconstruct from memory or scattered notes.

### Why email is the highest-value inbound stream

Compare ingestion-volume per chair per week:

- **Meetings** (ADR-002 source): 1–3 per week, 30–60 minutes each, captured by note-takers if the chair runs one
- **Drive docs** (ADR-001 source): a handful per week of active edits
- **Email**: typically 30–100+ touches per week per board chair

Email is where the chapter actually operates day-to-day. The intelligence layer extracts more total signal per week from email than from any other source — *if* the synthesis is good enough that chairs trust it. Hence the emphasis below on hallucination guardrails and human-confirmation gating.

## Alternatives considered

### (A) Don't build it — meeting notes + Drive ingestion + manual data entry is enough

**Rejected.** Meeting-note ingestion captures 1–3 hours of conversation per week per chair. Email captures the connective tissue between those moments. Without email, Trifecta would have a useful but partial view of chapter operations.

### (B) Build a dumb BCC logger (HubSpot's shape)

Email lands on the contact's timeline as a note. No extraction, no synthesis, no pipeline updates.

**Rejected.** This is exactly the experience the founder identified as not-good-enough. Building it would create the wrong product expectation (Trifecta as "another CRM that logs emails") and undermine the differentiated value Trifecta is meant to deliver.

### (C) Require explicit forwarding with annotation rather than CC/BCC

Chairs forward emails to the system with explicit context: *"This prospect is at the Application Sent stage now — please update."* No ambient capture; only explicit submission.

**Rejected.** Adds friction at the moment of work, which is exactly when chairs are busiest. Defeats the "ambient context" value proposition. Forwarding remains *supported* (the parser handles it), but it's not the primary mechanism.

### (D) CC/BCC ingestion with LLM extraction layer — **selected**

The chair's workflow doesn't change. The system does the synthesis. Hallucination guardrails ensure trust.

## Consequences

### Positive

- **Trifecta becomes the ambient context layer for the chapter.** The board operates as one team without anyone manually copying tasks between systems.
- **Pipeline state stays current automatically.** Sponsorship Chair sees "Imran is talking to potential sponsor X" without having to ask Imran. Membership Chair sees "Jon connected with prospect Y."
- **The at-risk digest gets dramatically richer signal.** Renewal-intent hints from real conversations feed scoring; the digest stops being "based on attendance alone."
- **Replaces 5–10 minutes of HubSpot UI work per touch.** Pipeline advancement, note-writing, follow-up scheduling — all derived from the email the chair was already sending.
- **Cross-chair coordination becomes free.** Email mentions "Jon should follow up after I make the intro" → Trifecta surfaces in Jon's queue with attribution to Imran. No more "did you remember to tell Jon?"
- **Closes referral loops most chapters never close.** Six months after Mike introduced Sarah, Sarah joins. Mike gets a thank-you nudge because the referral attribution was captured at intro time.
- **Programming becomes evidence-based.** Five members mentioning M&A interest in casual emails → Learning Chair sees the pattern, not just individual data points.

### Negative / risks

- **The trust threshold is high.** If the LLM extractions are wrong or feel surveillance-y, chairs stop CC'ing the system. The synthesis has to feel useful from day one. Hence the kill-switch architecture: visible "Recent ingestions" page, one-click delete, opt-in per chapter, hallucination guardrails everywhere.
- **Recipients don't know they're being logged.** Standard CRM BCC pattern — but worth being explicit in chapter onboarding documentation. Recipients should expect that their emails to board chairs may be logged in the chapter's operational system.
- **Personal / off-topic threads will get CC'd by accident.** A chair will eventually CC the mailbox on a personal thread, an HR matter, or a legal exchange. Mitigation: visible audit log + one-click deletion + LLM-side detection of likely-personal content (low confidence, surface for review, don't apply extractions).
- **The forum-confidentiality rule extends here with full force** (see below).

### Non-negotiable: forum confidentiality rule extends

**ADR-002's forum-exclusion rule applies in full** to email correspondence as well as meeting summaries:

1. If a board chair *also* sits in a forum and accidentally CC/BCCs the chapter mailbox on a forum-related thread, the parser MUST detect and reject it.
2. Detection signals identical to ADR-002:
   - Subject contains "Forum" / "GINA"
   - Recipient list looks like a forum roster (cross-reference members.forum_id for the chair)
   - Content contains typical forum-confidentiality markers
3. Rejected emails: parser does NOT store the body; produces a bounce-style notification to the sender explaining that forum content cannot be ingested.
4. **Bias hard toward false-positive rejection.** A non-forum email being rejected and re-routed by the user is a minor inconvenience. A forum email slipping into Trifecta is a serious product failure.

This is a product-level rule, not a configuration option, mirroring ADR-002.

### Implications for the codebase

**Schema generalization.** The `meeting_summaries` / `meeting_extractions` table names from ADR-002 are kind-specific. With this ADR they generalize to:

```sql
inbound_communications
  id                 UUID PK
  chapter_id         UUID FK chapters
  kind               TEXT       -- 'email' | 'meeting_summary' | 'drive_doc'
  source_tool        TEXT       -- 'gmail' | 'outlook' | 'fathom' | 'otter' | 'granola' | ...
  source_message_id  TEXT       -- RFC 5322 Message-ID for emails; doc id for Drive; etc.
  source_thread_id   TEXT       -- RFC 5322 thread-id; null for non-threaded kinds
  sender             TEXT
  recipient_emails   TEXT[]     -- TO + CC; BCC invisible to us (we ARE the BCC)
  subject            TEXT
  received_at        TIMESTAMPTZ
  sent_at            TIMESTAMPTZ NULL   -- emails: from Date header; meetings: meeting start
  direction          TEXT       -- 'chair_outbound' | 'inbound_to_chair' | 'internal_board' | 'unknown'
  classification     TEXT       -- 'prospect_outreach' | 'renewal_conversation' |
                                -- 'sponsor_cultivation' | 'cross_chair_coordination' |
                                -- 'member_followup' | 'introduction' | 'other'
  attendee_member_ids UUID[]    -- resolved from recipient_emails via members.email_primary
  meeting_type       TEXT       -- only set when kind='meeting_summary'
  ingest_status      TEXT       -- 'received' | 'classified' | 'extracted' | 'rejected_forum' |
                                -- 'rejected_policy' | 'error'
  rejection_reason   TEXT NULL
  raw_pointer        TEXT       -- pointer to body in object storage; NOT the body itself
  processed_at       TIMESTAMPTZ
```

```sql
communication_extractions
  id                  UUID PK
  communication_id    UUID FK inbound_communications
  chapter_id          UUID FK chapters    -- denormalized for RLS / fast filtering
  extraction_type     TEXT       -- 'action_item' | 'pipeline_move' | 'renewal_intent_hint' |
                                 -- 'sentiment_score' | 'topic_tag' | 'sponsor_pipeline' |
                                 -- 'referral_attribution' | 'cross_chair_routing'
  target_member_id    UUID NULL FK members
  payload             JSONB
  confidence          NUMERIC(3,2)
  confirmed_by        UUID NULL FK members
  confirmed_at        TIMESTAMPTZ NULL
  applied_to_canonical BOOLEAN DEFAULT FALSE
  created_at          TIMESTAMPTZ
```

Per-chapter config under `chapters.data_sources_config.email_ingestion`:

```jsonc
{
  "email_ingestion": {
    "enabled": true,
    "mailbox_address": "dallas@trifecta-portal.app",
    "allowed_directions": ["chair_outbound", "inbound_to_chair", "internal_board"],
    "forum_keywords_block": ["forum", "GINA"],   // chapter-specific safety keywords
    "auto_apply_threshold": null,                 // null = always require human confirmation
                                                  // (per ADR-002 hallucination policy)
    "configured_chair_addresses": ["jon@eodallas.org", "imran34@gmail.com", "..."]
  }
}
```

**Three Phase 2 connectors** all implement `DataSource` and feed the same pipeline:

1. `DriveDocConnector` (ADR-001) — Drive change-feed watcher
2. `MeetingNoteParser` (ADR-002) — email parser specialized to known note-taker layouts (Granola, Fathom, Otter, Zoom AI Companion, Teams Copilot)
3. `EmailParser` (this ADR) — general RFC 5322 email parser; threading via Message-ID + In-Reply-To; sender/recipient resolution via `members.email_primary`

### Implications for Phase 1

**Zero code changes.** Phase 1 makes no commitments about email ingestion. The compatibility constraints are minimal:

- The proposed `inbound_communications` / `communication_extractions` tables don't exist yet. When Phase 2 lands them, the existing `members.notes` JSONB column (which already holds free-form `{ts, source, text}` entries) remains the natural sink for human-confirmed extractions of the form "ED's outreach call notes."
- The `derive_contact_type` transform (ADR-005) handles the case of a new prospect first encountered via email — same auto-creation logic that handles a new prospect first encountered via HubSpot. The email source produces a `ConnectorRecord` with `externalIds.email_communications` (or similar); the same sync orchestration upserts it.

### Implications for Phase 2 (sequence)

**Build order for Phase 2** (informed by leverage and trust):

1. **Drive ingestion pipeline** lands first (ADR-001 implementation). Establishes the mailbox identity, the credential flow, the chapter onboarding pattern.
2. **`MeetingNoteParser`** (ADR-002 implementation). Email parser specialized to note-taker layouts. Adds value with relatively scoped extraction (action items + decisions per meeting).
3. **Forum-confidentiality guardrails** explicitly tested against a corpus of real EO meeting/email subject lines and attendee patterns BEFORE the next step runs in production.
4. **`EmailParser`** (this ADR). General correspondence ingestion. Initially with a narrow set of extraction types — see "killer trio" below.
5. **Admin UI for confirmation queue.** "Recent extractions awaiting your confirm/reject." This is the trust-anchor surface and must ship simultaneously with extraction.
6. **Cross-chair routing + weekly synthesized digests.** The differentiated value-add.

### The killer trio (Phase 2 EmailParser launch scope)

The ten capabilities in the design doc are a menu, not a Phase 2 launch list. **Launch with three; defer the rest.**

1. **Renewal intent detection** — feeds the at-risk digest (Phase 1 Week 3 launches the digest; Phase 2 email-ingestion makes its signal vastly richer).
2. **Action-item extraction** — the personal-to-do-list-from-your-own-emails experience. The capability board chairs tell other board chairs about.
3. **Pipeline auto-advancement with one-click confirm** — the visible-magic moment that establishes trust. Replaces 5–10 minutes of HubSpot UI work per touch.

The other seven (sentiment trends, cross-chair routing, sponsor pipeline auto-pop, referral attribution, topic tagging, programming alignment, member-direct messages to the mailbox) are real and worth doing — but Phase 3, after the killer trio earns the trust budget required for the more ambient/predictive features.

### Implications for Phase 3+

The structured `communication_extractions` table is the foundation for:

- **Per-chair weekly synthesized digest.** Not "here's a list of activity" — "here's the synthesized narrative of your week, here are the next 3 things to act on."
- **Sentiment trend analysis.** A member's email tone over 6 months becomes a real signal alongside attendance and forum participation.
- **Cross-chair team-mind layer.** The board operates with shared context without anyone having to manually share it.
- **Programming alignment.** Aggregate topic-interest signals across the chapter inform programming decisions.

## Open items

- [ ] Phase 2: choose initial parser library (Node.js `mailparser` is the obvious choice).
- [ ] Phase 2: design the confirm/reject admin UI before writing any auto-applying extraction logic. Trust-anchor surface ships first.
- [ ] Phase 2: codify the forum-confidentiality detection ruleset for emails (extends ADR-002's). Test against a real corpus before any production ingestion.
- [ ] Phase 2: decide whether to store any extracted body text or only structured extractions + Message-ID pointer. Strong default: pointer only, never body. Revisit if extraction quality demands access to source context for debugging.
- [ ] Phase 2: chapter onboarding documentation describing what is and isn't ingested via email — for chair use, for HR/legal review, and for the chapter's own consent norms.
- [ ] When implementing, validate that `inbound_communications.kind` generalizes cleanly. If meeting summaries develop kind-specific concerns the unified table can't handle elegantly, split it (but only with evidence).
- [ ] Phase 3: define the "synthesized weekly digest" LLM prompt template. The narrative format is what differentiates this from "here are the entries from this week."
