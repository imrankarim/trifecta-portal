# ADR-001 — Google Drive ingestion access model

**Status:** Accepted (2026-05-26)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 (Week 4 narrow Sheets connector); Phase 2+ (full Drive ingestion)
**Supersedes:** none

---

## Context

Trifecta needs to ingest unstructured data — Google Docs, Sheets, and over time other Drive content — produced by EO chapter board members and paid chapter staff (e.g. Executive Directors). The data lives in many different Google accounts:

- Each board member uses **their own personal Google account** for the EO sheets and docs they work in.
- The paid chapter staff (e.g. Jon Minjoe for EO Dallas) uses **the chapter's own Google account** for most chapter work, and **their personal Google account** for some additional docs.
- This pattern repeats across every chapter in the US.

The product is *useful* only if Trifecta can read this content on an ongoing basis, normalize it, and route the extracted information to the right board-seat areas and the weekly digest. The product is *adoptable* only if board members can let Trifecta read their content without changing their workflow or granting broad access to their personal Drives.

Two access models were considered seriously.

## Decision

**Trifecta uses one real Google Workspace mailbox per chapter** — e.g. `dallas@<trifecta-domain>` — owned by Trifecta. Each board member shares the individual Docs and Sheets that are relevant to their EO work with their chapter's Trifecta mailbox, using Google Drive's standard "Share" dialog. Board members do **not** reorganize their personal Drives, do **not** create dedicated folders, and do **not** grant Trifecta any access to their broader Drive contents.

Trifecta authenticates against each chapter's mailbox via OAuth with a long-lived refresh token, stored encrypted in `chapters.data_sources_config`. Ingestion reads files from `sharedWithMe` via the Drive API and subscribes to the `changes` feed for push notifications on updates.

The domain Trifecta will use will be acquired by the founder and confirmed in a follow-up update to this ADR. Until then, code paths that need a placeholder may use `<trifecta-domain>` or an environment-configured value.

### Update (2026-05-29) — ownership reconfirmed for email ingestion

The Trifecta-owned vs chapter-owned mailbox question was deliberately revisited
when scoping email ingestion (ADR-006). Decision **stands: Trifecta-owned**, and
the same per-chapter Trifecta identity serves both Drive sharing and email
CC/BCC (one identity per chapter, not two). Rationale, weighing onboarding
friction, reliability, and uniformity across hundreds of heterogeneous chapters,
favors Trifecta-owned decisively.

The main counter-argument — chapters distrusting confidential member email routed
to an external `@trifecta` domain — was assessed as a non-issue: **chapters
already CC/BCC a third-party vendor (HubSpot) on prospect and operational
email today**, so copying Trifecta is the same established pattern. A
chapter-branded alias (`trifecta@eochapter.org` → `<chapter>@<trifecta-domain>`)
remains an *optional* nicety for chapters that want a native-looking address, but
is not required for adoption.

### (A) Trifecta service account + shared folder per board member

Each board member would create an "EO – <Chapter>" folder in their personal Drive and share that folder with a Google Cloud service account.

**Rejected.** Board members will not reorganize their personal Drives, and the social cost of asking them to is high. This model also bakes in an awkward onboarding step that we have to teach every new board member at every chapter. Service-account email addresses (e.g. `dallas-chapter@trifecta-staging.iam.gserviceaccount.com`) also look untrustworthy in the standard Google share dialog.

### (B) Per-user OAuth — each board member grants Trifecta `drive.readonly` to their personal Drive

**Rejected.** Granting Trifecta access to a personal Google Drive means Trifecta technically *can* see vacation photos, tax returns, family docs, side-business work, etc. Board members will (correctly) resist. The `drive.file` scope, which is narrower, only sees files explicitly opened through the Trifecta app — useless for our use case.

### (C) Trifecta service account, board members share *individual* files with the service account email

**Rejected** as primary, but technically equivalent under the hood. Lower cost than (D) since service accounts are free, but the service-account email address is a long random string that looks broken in the share dialog. Acceptable as a Phase 1 prototype, but does not give us the **inbound email channel** that (D) does.

### (D) Real Google Workspace mailbox per chapter — **selected**

Real mailbox (`dallas@<trifecta-domain>`), real-looking address in the share dialog, costs ~$6–7/month per chapter on Google Workspace.

Selected for three reasons:

1. **Zero workflow friction for board members.** They share individual docs with a normal-looking email address using the share dialog they already use 50 times a day.
2. **Inbound channel as a sleeper benefit.** Because the mailbox is real, board chairs can email links to it, members can CC it on outreach to other members, and threads can be forwarded into it. These all become engagement signals or context for the LLM agents — *without* changing anyone's behavior. A service account cannot do this.
3. **Cost is negligible.** $6/month/chapter is rounding error against the value of the data being ingested. Even at 100 chapters it's $600/month — still trivial vs. revenue.

## Consequences

### Positive

- Onboarding a chapter to Drive ingestion is one sentence: *"share your EO docs with `<chapter>@<trifecta-domain>`."* No folder creation, no granted access to broader Drive, no OAuth flow on the member's side.
- Strict per-chapter data isolation enforced at the **identity** layer, mirroring Trifecta's RLS chapter-isolation in Postgres. Houston's mailbox cannot see Dallas's docs, period.
- Revocation is symmetric and obvious: a member un-shares a doc and it disappears from Trifecta's view at the next sync.
- The mailbox starts as a Drive-ingestion identity and evolves into a chapter-wide inbound signal channel (forwarded emails, CC'd outreach) without any architectural change.

### Negative / costs

- **Ongoing per-chapter cost.** $6–7/month per chapter for Google Workspace. Budget item to track.
- **Per-chapter provisioning step.** Each new chapter requires creating a Workspace mailbox and storing its refresh token in `data_sources_config`. ~5 minutes manual today; fully automatable later.
- **Domain dependency.** The mailbox address requires Trifecta to own a domain. The founder will acquire one and update this ADR with the chosen domain. Until then, this is a blocker for the actual Workspace setup (but not for writing the connector code, which can read the address from `data_sources_config`).
- **Discovery is push-only by design.** Members share docs *to* Trifecta. Trifecta does not request access to specific docs. The pull case (Trifecta asking for a doc by URL) is technically possible but explicitly out of scope; admins nudge members via human channels instead.

### Implications for the codebase

- The `DataSource` interface (v1.1 §2.2) is the integration point. A `GoogleDriveConnector` will implement it, scoped to one chapter, authenticated as that chapter's mailbox.
- `chapters.data_sources_config` already exists (JSONB, intended for per-connector credentials) — this is where the per-chapter Drive OAuth refresh token lives, encrypted.
- The connector's discovery surface is `files.list?q="sharedWithMe"` + Drive `changes` feed for push notifications.
- A future admin UI surface ("Connected docs" list, with last-ingested-at and detected-board-area, plus an "Ignore" action) makes the model visible and correctable.

### Implications for Phase 1

Phase 1 plan (Week 4) calls for a narrow read-only Google Sheets connector for the EO Dallas forum-participation sheet that Rob and Prince maintain. **That connector will adopt this access model from day one** — even though it reads only one sheet. The chapter shares the sheet with `dallas@<trifecta-domain>`, Trifecta reads via the Drive API authenticated as that mailbox. This validates the access pattern in miniature before Phase 2 scales it to full Drive ingestion.

### Implications for Phase 2+

The full Drive ingestion system (multi-doc, multi-board-seat, LLM-driven extraction and reconciliation) is **deferred to Phase 2 or later**. Its pipeline is sketched here for completeness but not yet built:

1. **Ingest** — Drive API change-feed watcher downloads new/updated shared docs, normalizes (Sheets → CSV, Docs → markdown, PDFs → OCR'd text).
2. **Classify** — LLM categorizes each doc against a finite enum of board seats / functional areas.
3. **Extract** — LLM extracts structured fields against a per-seat JSON schema.
4. **Reconcile** — code merges into Trifecta state with per-field provenance and a configurable conflict policy (likely last-writer-wins by default, weighted-by-source in cases where a canonical owner exists).
5. **Notify** — feeds the weekly digest module (built in Week 3).

The single biggest pre-Phase-2 risk is **the ontology**: the canonical list of board seats and the structured fields Trifecta tracks per seat. Without an ontology, the extractor LLM has no target schema, and output will be inconsistent. This is a domain-expert conversation with Jon Minjoe (and equivalent operators at other chapters), not a coding task. An afternoon of that conversation, captured as a JSON schema per seat in `docs/`, is a prerequisite for Phase 2 work to begin.

## Open items

- [ ] Acquire `trifecta-*.com` (or similar) domain. Update this ADR with the chosen domain. Owner: Imran.
- [ ] Stand up Google Workspace on that domain. Owner: Imran.
- [ ] Create `dallas@<trifecta-domain>` as the first per-chapter mailbox. Validate the share-with-Trifecta flow end-to-end with one personal sheet. Owner: Imran.
- [ ] Draft the board-seat ontology starter template (JSON schema per seat). Use as a structured conversation tool with Jon. Owner: Claude Code at Imran's direction; conversation owner: Imran + Jon.
- [ ] When Week 4 Sheets connector is built, ensure it reads via this mailbox identity, not via a service account or per-user OAuth.
