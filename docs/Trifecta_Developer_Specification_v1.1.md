PROJECT TRIFECTA

  

Developer Specification & Build Guide

  

Version 1.1   •   May 2026   •   CONFIDENTIAL DRAFT

  

Changes in v1.1: Added communication channel defaults (Section 2.6, Phase 2 Deliverables). Added renewal intent fields to Member schema (Section 3.2). Added Renewals Intelligence Pipeline specification (Section 11). Updated Open Questions.

  

What This Document Is

This specification is the primary briefing document for the developer building Project Trifecta. It covers the product vision, architectural non-negotiables, the full Member data schema, integration strategy, and a phased build plan. Read it in full before writing a single line of code. All architectural decisions in this document are intentional and load-bearing. If you believe a decision should be revisited, flag it before diverging — do not work around it silently.

  
  

TABLE OF CONTENTS

  

Developer Brief: Technical Requirements

1\. Executive Summary

2\. Architectural Principles (Non-Negotiable)

3\. Member Data Schema

4\. Other Core Entities

5\. Integration Architecture

6\. Phased Build Plan

7\. Technology Recommendations

8\. Non-Negotiable Constraints Summary

9\. Recommended First Sprint (Weeks 1–2)

10\. Open Questions to Resolve Before Starting

11\. Renewals Intelligence Pipeline \[NEW in v1.1\]

  
  

DEVELOPER BRIEF: TECHNICAL REQUIREMENTS

  

This section answers the standard questions used to source and screen developer candidates for this project. Share this section — along with the full specification — with any developer, agency, or technical recruiter evaluating fit.

  
  

Architecture & Technology

  

Application type: Multi-tenant SaaS web application. Backend API + admin web UI, with a board member portal added in Phase 2. Core system runs scheduled background sync jobs, an engagement scoring engine, and an AI recommendation engine that pushes output to users via WhatsApp, email, or SMS — not a dashboard they log into.

  

Tech stack: Node.js (TypeScript) strongly preferred. Python acceptable if the developer has stronger Python + async background. PostgreSQL for the database. REST API in Phase 1, GraphQL if the frontend grows complex in Phase 2–3.

  

Frontend / backend frameworks: Backend: Express.js or Fastify (Node.js) / FastAPI (Python). Frontend Phase 1: Next.js or React SPA — minimal admin UI only. Frontend Phase 2+: React, mobile-responsive. React Native if native mobile is prioritised later.

  

Hosting preference: Render.com for Phase 1 (cost-efficient, low ops overhead). Migrate to AWS or GCP at Phase 3 when multi-chapter scale requires it. Avoid over-engineering infrastructure in Phase 1.

  

Preferred database: PostgreSQL. Multi-tenancy enforced via chapter\_id foreign key on every table. Row-level security for chapter data isolation. Must support JSON columns for per-connector config and notes fields.

  
  

Features & Users

  

Main user roles & permissions: Three roles: (1) Admin — full access, manages connector configuration, member records, and board member accounts; (2) Board Member — read access to at-risk intelligence + ability to log outreach actions; (3) Executive Director — same as Admin plus reporting. Roles are per-chapter. Multi-chapter admins (Phase 3+) get a cross-chapter view.

  

Core MVP features: (1) HubSpot + Google Sheets data sync into unified Member records. (2) Engagement scoring engine producing a churn risk ranking. (3) At-risk member digest delivered via email — no login required. Urgent alerts delivered via WhatsApp. (4) Simple admin UI for connector setup, manual WhatsApp activity input, and action outcome logging. (5) Secure login with role-based access.

  

Expected users / traffic: Very low for Phase 1: approximately 20–30 board members per chapter, starting with 1–2 chapters (EO Dallas and EO Fort Worth). No significant concurrent traffic. Scale target: 50–100 chapters within 24 months, each with 20–40 users. Architecture must support multi-tenancy from day one even though initial load is minimal.

  
  

Integrations & AI

  

CRM / third-party integrations: HubSpot (Phase 1: read-only contact and attendance sync; Phase 2: write outcome notes back); Google Sheets (Phase 1: read-only, configurable column mapping); WhatsApp Business API via approved BSP (Phase 3); EO Global API (Phase 4, pending access grant). All integrations must be implemented behind a DataSource abstraction interface — see Section 2.

  

Main data sources: HubSpot (member contacts, event attendance, pipeline stages); Google Sheets (forum participation, renewal tracking — maintained by chapter admins who prefer spreadsheets); WhatsApp (member activity signals, initially entered manually); EO Global portal (global member directory, global event history, renewal dates, chapter transfers — API access pending).

  

AI providers & functionality: Anthropic Claude API (model: claude-sonnet-4-6) as the primary LLM. Used for: generating plain-English member risk summaries, personalised talking points for board members, recommended outreach actions, and drafting personalised renewal intent survey messages. Must be abstracted behind an LLMProvider interface so the model can be swapped to OpenAI GPT-4o or another provider without code changes. No fine-tuning required in Phase 1–2.

  
  

Security & Deployment

  

Authentication method: JWT-based authentication. Email + password for Phase 1. Google SSO as an option in Phase 2. No third-party auth service required in Phase 1 — implement directly. All sessions expire; refresh token rotation required.

  

Security & compliance requirements: All connector API credentials and OAuth tokens encrypted at rest (AES-256 or equivalent). All data in transit over HTTPS only. Row-level security: no chapter can access another chapter's data under any query path. GDPR consent field on Member schema (EU chapters will be onboarded in later phases). No secrets in code or committed env files — all via a secrets manager (Doppler, AWS Secrets Manager, or Render native env secrets). Member data is sensitive business intelligence; a breach ends the product.

  

CI/CD, monitoring & deployment: Yes — required from day one. GitHub Actions for CI/CD: tests must pass on every PR before merge. Error monitoring via Sentry (Phase 1). Job queue health monitoring for scheduled sync jobs. Staging environment required before Phase 1 goes live with EO Dallas data. All database schema migrations must be versioned and reversible. Seed script with anonymised test data required for local development.

  

These answers are a companion to the full specification. All architectural decisions referenced here — DataSource abstraction, LLMProvider interface, multi-tenancy, Strangler Fig — are described in detail in Section 2. A developer who is a strong fit for this project will ask follow-up questions, not just accept the answers above at face value.

  
  

1\. EXECUTIVE SUMMARY

  

Project Trifecta is an AI-powered member retention and board intelligence engine built for Entrepreneurs' Organization (EO) chapters. It aggregates engagement data from every silo a chapter uses — HubSpot, Google Sheets, EO Global, WhatsApp — normalises it into a unified member intelligence layer, and pushes role-specific, actionable recommendations to each board member through their preferred communication channel.

  

The system is designed to become the invisible Chief of Staff for every EO chapter board: proactively surfacing who is at risk of not renewing, why, and exactly what each board member should do about it — without anyone having to log into a portal.

  
  

1.1 The Problem

  

EO chapter boards operate across disconnected silos. Attendance lives in HubSpot. Forum participation lives in spreadsheets. Member sentiment lives in WhatsApp. EO Global event history lives in a separate portal. No one has a complete picture of any individual member's engagement health. By the time someone flags a risk, renewal is already weeks away and the member has mentally left.

  
  

1.2 Why the Algorithm Alone Is Not the Moat

  

A scoring algorithm run against HubSpot data is table stakes. EO Dallas's Executive Director already queries Claude + HubSpot manually to produce a version of this. Within 18 months that capability will be commoditised. Trifecta's moat is the system's completeness:

  

\- Data depth: capturing WhatsApp sentiment, cross-platform history, and signals no single-source tool sees.

\- Role-specific delivery: not a dashboard to log into, but intelligence pushed to the right board member in their preferred channel.

\- Full board coverage: solving every board seat's job, making replacement painful.

\- Multi-chapter network effects: cross-chapter benchmarking only possible with a multi-chapter data footprint.

  
  

1.3 Pilot Context

  

Initial pilot: EO Dallas (primary) and EO Fort Worth. EO Dallas uses HubSpot + Google Sheets + EO Global. They do not use ChapterPro. Jon Minjoe (Executive Director, EO Dallas) is the internal champion and has validated the four core engagement signals: forum participation, event attendance, SLP involvement, and WhatsApp activity.

  
  

2\. ARCHITECTURAL PRINCIPLES (NON-NEGOTIABLE)

  

These are constraints, not preferences. Violating them creates debt that is catastrophic to undo at scale.

  
  

2.1 Strangler Fig Pattern for HubSpot

  

HubSpot is EO Dallas's current system of record. The long-term goal is to replace it for chapters not heavily invested in it. Trifecta must work alongside HubSpot, absorb responsibilities incrementally, and eventually make the HubSpot connector optional — without a big-bang migration.

  

HubSpot is a pluggable connector behind an interface, not a first-class dependency. Its data model must never bleed into Trifecta's core schema.

  
  

2.2 DataSource Abstraction Layer

  

Every external data source must be implemented as a connector satisfying a standard DataSource interface. At minimum, the interface defines:

  

\- getMembers() — returns normalised Member objects

\- getAttendanceRecords() — returns event/forum attendance data

\- getPipelineStages() — returns membership pipeline state

\- writeOutcome(memberId, action, result) — logs a board action back to the source

  

When Trifecta's native CRM is built, it is just another connector implementing this same interface. The scoring and intelligence layers never know which connector is active.

  
  

2.3 Trifecta-Owned Primary Keys

  

Member and Chapter objects use UUIDs generated by Trifecta. External IDs (HubSpot Contact ID, EO Global Member ID) are stored as indexed secondary reference fields. All internal queries use the Trifecta UUID.

  

This is the single most important schema decision. Getting it wrong means a future connector swap requires rewriting business logic and re-keying live data.

  
  

2.4 EO Global ID as Cross-Chapter Deduplication Key

  

Every EO member globally has a unique identifier in the EO Global system. Trifecta must store eo\_global\_member\_id on the Member schema from day one — even if it sits empty until API access is granted or the field is populated manually during onboarding.

  

This enables: member deduplication across chapters, cross-chapter history when members transfer chapters, multi-chapter benchmarking, and a future EO Global partnership conversation. It costs almost nothing to add now and would be catastrophic to retrofit across thousands of records.

  

If EO Global member ID format is unknown, use email address as the fallback deduplication key (EO requires unique email per member globally). Store both.

  
  

2.5 Multi-Tenancy from Day One

  

Every data object — Member, Event, Forum, Score, Action — must be scoped to a Chapter via a chapter\_id foreign key. Never share tables without chapter\_id. All queries must filter by chapter unless explicitly building cross-chapter analytics.

  
  

2.6 Delivery Channel Abstraction \[UPDATED v1.1\]

  

Trifecta's output — pushing intelligence to board members — must support WhatsApp, email, and SMS at minimum. The delivery channel is a per-board-member configuration setting, not hardcoded. Build a Notification abstraction layer mirroring the DataSource pattern.

  

Default Channel Assignments (configurable per board member in settings):

  

Weekly Digest → Email (default)

The weekly digest is a structured, multi-item summary best suited to email format. Board members should be able to switch their digest to WhatsApp or SMS in settings, but email is the default and the recommended format for the digest because it supports richer formatting, is easier to reference later, and does not interrupt in the way a WhatsApp message does.

  

Urgent Alerts → WhatsApp (default)

When a member crosses into Critical Risk tier, a renewal deadline is within 30 days and unresolved, or any other high-urgency signal fires, the alert is delivered via WhatsApp by default. The rationale: board members are more likely to act immediately on a WhatsApp message than an email. Board members who do not use WhatsApp can switch their urgent channel to SMS or email in settings.

  

The Notification abstraction layer must support:

\- notify(boardMemberId, payload, priority: 'digest' | 'urgent' | 'info') — routes to the correct channel based on the board member's configured preferences and the priority level.

\- Per-board-member override: a board member can set digest\_channel and urgent\_channel independently.

\- Fallback logic: if the configured urgent channel fails delivery (e.g. WhatsApp number invalid), fall back to email and log the failure.

\- Delivery schedule: digest delivery time is configurable per board member (default: Monday 8am local time). Urgent alerts fire immediately on trigger.

  
  

3\. MEMBER DATA SCHEMA

  

The Member object is the central entity in Trifecta. Every engagement signal, score, action, and intelligence output is anchored to a Member. Fields marked Required must be present before a record can be considered active. All others are populated incrementally as connectors sync.

  
  

3.1 Identity

  

Field: trifecta\_member\_id | Type: UUID | Required: Yes | Notes: Trifecta-generated PK. Never use external IDs as PK.

Field: eo\_global\_member\_id | Type: String | Required: No | Notes: EO Global unique ID. Indexed, nullable, unique per system. Core to cross-chapter dedup and future API integration.

Field: email\_primary | Type: String | Required: Yes | Notes: Primary email for login and outreach.

Field: emails\_additional | Type: Array\<String\> | Required: No | Notes: Additional email addresses (business, personal, etc.).

Field: first\_name | Type: String | Required: Yes

Field: last\_name | Type: String | Required: Yes

Field: preferred\_name | Type: String | Required: No | Notes: Nickname or preferred first name. EO culture is strongly first-name based.

Field: phone\_mobile | Type: String | Required: No | Notes: Primary mobile. Used for WhatsApp and SMS outreach.

Field: phones\_additional | Type: Array\<{type,number}\> | Required: No | Notes: Additional phones with type labels (office, home, etc.).

Field: preferred\_channel | Type: Enum | Required: No | Notes: WhatsApp | Email | SMS | Phone. Default: Email.

Field: digest\_channel | Type: Enum | Required: No | Notes: Email | WhatsApp | SMS. Default: Email. Controls weekly digest delivery channel.

Field: urgent\_channel | Type: Enum | Required: No | Notes: WhatsApp | SMS | Email. Default: WhatsApp. Controls urgent alert delivery channel.

Field: linkedin\_url | Type: String | Required: No

Field: photo\_url | Type: String | Required: No | Notes: Headshot URL. Used in board-facing member cards.

Field: time\_zone | Type: String | Required: No | Notes: IANA timezone (e.g. America/Chicago). Required for scheduled delivery.

  
  

3.2 EO Membership \[UPDATED v1.1 — renewal intent fields added\]

  

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: FK to Chapter. Every member belongs to exactly one chapter.

Field: membership\_status | Type: Enum | Required: Yes | Notes: Active | Grace Period | Lapsed | Alumni | Prospect.

Field: join\_date\_original | Type: Date | Required: Yes | Notes: First-ever EO join date (any chapter). Used to compute years\_in\_eo.

Field: join\_dates\_history | Type: Array\<Date\> | Required: No | Notes: All join dates if member has rejoined after lapsing. Can be multiple.

Field: rejoin\_dates | Type: Array\<Date\> | Required: No | Notes: Dates of each re-entry after lapsing. Distinct from join\_dates\_history for clarity.

Field: years\_in\_eo | Type: Float (computed) | Required: No | Notes: Derived from join\_date\_original. Updated nightly.

Field: next\_renewal\_date | Type: Date | Required: No | Notes: Upcoming renewal deadline. Critical for churn risk timing.

Field: renewal\_status | Type: Enum | Required: No | Notes: Renewed | Pending | At Risk | Lapsed. Computed or manually set.

Field: sponsor\_member\_id | Type: UUID (FK) | Required: No | Notes: Trifecta Member ID of who recruited them. Sponsors often feel accountability for their recruit.

Field: recruitment\_source | Type: Enum | Required: No | Notes: Peer Referral | Event | Cold Outreach | EO Accelerator | Other.

  

\--- Renewal Intent Survey Fields (new in v1.1) ---

  

Field: renewal\_intent\_response | Type: Enum | Required: No | Notes: PlanToRenew | WantToSpeak | WontRenew | NoResponse. Populated when the member responds to the April intent survey. See Section 11.

Field: renewal\_intent\_survey\_sent\_at | Type: DateTime | Required: No | Notes: Timestamp when the intent survey was sent to this member. Null if not yet sent.

Field: renewal\_intent\_survey\_responded\_at | Type: DateTime | Required: No | Notes: Timestamp of member's response. Used to calculate response rate and identify non-responders.

Field: renewal\_intent\_notes | Type: String | Required: No | Notes: Optional free-text field. Populated if the member adds a comment in the survey form, or if a board member adds context after a follow-up conversation.

Field: renewal\_intent\_survey\_year | Type: Integer | Required: No | Notes: The year of the survey response (e.g. 2026). Allows multi-year tracking without overwriting prior year data — consider normalising into a separate RenewalIntentResponse table at Phase 2 if multi-year history is needed.

  
  

3.3 EO Region & Geography

  

Field: eo\_region | Type: Enum | Required: Yes | Notes: US Central | US East | US West | Canada | Europe | LAC | MEPA | APAC | North Asia | South Asia.

Field: city | Type: String | Required: No

Field: state\_province | Type: String | Required: No

Field: country | Type: String | Required: No | Notes: ISO 3166-1 alpha-2 code.

  
  

3.4 Business Profile

  

Field: company\_name | Type: String | Required: Yes

Field: job\_title | Type: String | Required: No

Field: industry\_vertical | Type: String | Required: No | Notes: EO has industry group classifications. Useful for forum placement and peer benchmarking.

Field: annual\_revenue\_range | Type: Enum | Required: No | Notes: EO qualification threshold is $1M+. Bands: $1M-$5M | $5M-$20M | $20M-$100M | $100M+.

Field: employee\_count\_range | Type: Enum | Required: No | Notes: 1-10 | 11-50 | 51-200 | 201-500 | 500+.

Field: company\_website | Type: String | Required: No

  
  

3.5 Board & Leadership

  

Field: board\_role\_current | Type: String | Required: No | Notes: Current board role title. Null if not on board.

Field: board\_role\_start\_date | Type: Date | Required: No

Field: board\_roles\_history | Type: Array\<{role,chapter\_id,start,end}\> | Required: No | Notes: Full leadership history across chapters and roles.

Field: committee\_memberships | Type: Array\<String\> | Required: No | Notes: Any committee or sub-committee positions.

  
  

3.6 Forum

  

Field: forum\_id | Type: UUID (FK) | Required: No | Notes: FK to Forum entity.

Field: forum\_assignment\_date | Type: Date | Required: No | Notes: Date placed in current forum.

Field: forum\_role | Type: Enum | Required: No | Notes: Member | Chair | Vice Chair | None.

Field: forum\_attendance\_rate\_12m | Type: Float | Required: No | Notes: % of scheduled meetings attended last 12 months. Highest-weighted churn signal.

Field: forum\_attendance\_count\_12m | Type: Integer | Required: No | Notes: Raw count of meetings attended last 12 months.

Field: forum\_last\_attended\_date | Type: Date | Required: No | Notes: Most recent forum meeting attended.

  
  

3.7 Event Engagement

  

Field: local\_event\_attendance\_rate\_12m | Type: Float | Required: No | Notes: % of local chapter events attended last 12 months.

Field: local\_event\_last\_attended\_date | Type: Date | Required: No

Field: global\_event\_count\_lifetime | Type: Integer | Required: No | Notes: Total EO Global events attended over entire membership.

Field: global\_event\_count\_24m | Type: Integer | Required: No | Notes: EO Global events in last 24 months (more predictive than lifetime).

Field: global\_event\_last\_attended\_date | Type: Date | Required: No

Field: learning\_social\_event\_count\_12m | Type: Integer | Required: No | Notes: Learning, social, and micro-events in last 12 months.

  
  

3.8 SLP & Family

  

Field: slp\_name | Type: String | Required: No | Notes: Spouse or Life Partner name.

Field: slp\_engagement\_status | Type: Enum | Required: No | Notes: Active | Occasional | None. Validated leading retention indicator by Jon Minjoe.

Field: slp\_programs\_count\_12m | Type: Integer | Required: No | Notes: SLP-specific programs/events attended in last 12 months.

  
  

3.9 EOA History

  

Field: eoa\_member | Type: Boolean | Required: No | Notes: Was this member ever in EO Accelerator?

Field: eoa\_chapter | Type: String | Required: No | Notes: Chapter where EOA was completed.

Field: eoa\_start\_date | Type: Date | Required: No | Notes: EOA program start date.

Field: eoa\_graduation\_date | Type: Date | Required: No | Notes: Date graduated from EOA into full EO membership.

  
  

3.10 Digital & WhatsApp Signals

  

Field: whatsapp\_activity\_level | Type: Enum | Required: No | Notes: High | Medium | Low | None. Phase 1: manually set. Phase 3: computed by WhatsApp connector.

Field: whatsapp\_last\_active\_date | Type: Date | Required: No | Notes: Approximate date of most recent WhatsApp activity.

Field: whatsapp\_groups | Type: Array\<String\> | Required: No | Notes: Chapter WhatsApp groups this member is in.

Field: myeo\_participation | Type: Boolean | Required: No | Notes: Active in any MyEO community, industry group, or university program?

Field: myeo\_groups | Type: Array\<String\> | Required: No | Notes: Specific MyEO groups.

Field: sap\_interactions | Type: Integer | Required: No | Notes: Count of recorded interactions with Strategic Alliance Partners. Low priority signal; clarify definition with chapter admin.

  
  

3.11 Engagement Score (Computed)

  

Field: engagement\_score\_current | Type: Float 0-100 | Required: No | Notes: Trifecta-computed composite score. Updated on each sync cycle.

Field: engagement\_score\_prev | Type: Float 0-100 | Required: No | Notes: Score from previous period for trend calculation.

Field: engagement\_trend | Type: Enum | Required: No | Notes: Improving | Stable | Declining.

Field: churn\_risk\_tier | Type: Enum | Required: No | Notes: Critical | High | Medium | Low | Monitor.

Field: days\_since\_last\_engagement | Type: Integer (computed) | Required: No | Notes: Days since any positive engagement signal recorded.

Field: score\_last\_calculated\_at | Type: DateTime | Required: No | Notes: Timestamp of most recent score computation.

  
  

3.12 Outreach Tracking

  

Field: outreach\_last\_date | Type: Date | Required: No | Notes: Date of most recent board-initiated outreach.

Field: outreach\_last\_by | Type: UUID (FK) | Required: No | Notes: Trifecta Member ID of board member who reached out.

Field: outreach\_last\_method | Type: Enum | Required: No | Notes: Call | WhatsApp | Email | In Person | Other.

Field: outreach\_last\_outcome | Type: Enum | Required: No | Notes: Connected | No Response | Positive | Needs Follow-up | Resolved.

Field: outreach\_count\_90d | Type: Integer (computed) | Required: No | Notes: Total outreach attempts in last 90 days.

Field: next\_touchpoint\_date | Type: Date | Required: No | Notes: Scheduled next contact (set by board or auto-suggested).

  
  

3.13 Data Management

  

Field: hubspot\_contact\_id | Type: String | Required: No | Notes: HubSpot Contact ID. Secondary reference only — never PK.

Field: data\_sources\_active | Type: Array\<String\> | Required: No | Notes: Connector names contributing data (e.g. hubspot, google\_sheets, eo\_global).

Field: last\_sync\_at | Type: JSON\<connector:ts\> | Required: No | Notes: Per-connector last successful sync timestamp.

Field: data\_completeness\_pct | Type: Float (computed) | Required: No | Notes: % of required + high-value fields populated. Flags thin records.

Field: do\_not\_contact | Type: Boolean | Required: No | Notes: Excludes member from all automated outreach.

Field: gdpr\_consent | Type: Enum | Required: No | Notes: Granted | Pending | Withdrawn. Required for EU chapters.

Field: notes | Type: Array\<{ts,author\_id,text}\> | Required: No | Notes: Timestamped, author-attributed free-text notes from board members.

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes | Notes: Auto-updated on every write.

  
  

4\. OTHER CORE ENTITIES

  
  

4.1 Chapter

  

Field: trifecta\_chapter\_id | Type: UUID | Required: Yes | Notes: Trifecta PK.

Field: eo\_global\_chapter\_id | Type: String | Required: No | Notes: EO Global chapter ID. Nullable until API access granted.

Field: chapter\_name | Type: String | Required: Yes | Notes: e.g. EO Dallas.

Field: eo\_region | Type: Enum | Required: Yes | Notes: US Central | US East | US West | Canada | Europe | LAC | MEPA | APAC | North Asia | South Asia.

Field: city | Type: String | Required: Yes

Field: country | Type: String | Required: Yes

Field: ed\_member\_id | Type: UUID (FK) | Required: No | Notes: Trifecta Member ID of the Executive Director.

Field: hubspot\_portal\_id | Type: String | Required: No | Notes: HubSpot Portal ID for this chapter's instance.

Field: data\_sources\_config | Type: JSON (encrypted) | Required: No | Notes: Per-connector API credentials and config (encrypted at rest).

Field: subscription\_tier | Type: Enum | Required: Yes | Notes: Pilot | Starter | Professional | Enterprise.

Field: active\_since | Type: Date | Required: Yes | Notes: Date chapter onboarded to Trifecta.

  
  

4.2 Forum

  

Field: trifecta\_forum\_id | Type: UUID | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: Every forum belongs to exactly one chapter.

Field: forum\_name | Type: String | Required: Yes | Notes: e.g. Forum A, Forum Blue.

Field: chair\_member\_id | Type: UUID (FK) | Required: No | Notes: Trifecta Member ID of current Forum Chair.

Field: meeting\_frequency | Type: Enum | Required: No | Notes: Monthly | Bi-monthly | Quarterly.

Field: member\_count | Type: Integer (computed) | Required: No

  
  

4.3 BoardAction

  

Tracks every outreach action taken by a board member, whether Trifecta-recommended or manually logged.

  

Field: action\_id | Type: UUID | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes

Field: target\_member\_id | Type: UUID (FK) | Required: Yes | Notes: The member being acted upon.

Field: initiated\_by\_member\_id | Type: UUID (FK) | Required: Yes | Notes: The board member taking action.

Field: action\_type | Type: Enum | Required: Yes | Notes: Call | WhatsApp | Email | In Person | Other.

Field: trifecta\_recommended | Type: Boolean | Required: Yes | Notes: Was this action surfaced by Trifecta's intelligence layer?

Field: outcome | Type: Enum | Required: No | Notes: Connected | No Response | Positive | Needs Follow-up | Resolved.

Field: notes | Type: String | Required: No | Notes: Free-text outcome notes.

Field: action\_date | Type: DateTime | Required: Yes

Field: created\_at | Type: DateTime | Required: Yes

  
  

5\. INTEGRATION ARCHITECTURE

  
  

5.1 HubSpot Connector

  

Phase 1 — Read Only: Pull contacts and attendance every 4 hours. Map HubSpot fields to Trifecta schema at the boundary. Store hubspot\_contact\_id as secondary reference. Do not write back.

  

Phase 2 — Write Outcomes: When a board member logs an action outcome, write a timestamped note back to the HubSpot contact record to keep both systems consistent.

  

Phase 2 — Write Renewal Intent: When a member's renewal\_intent\_response is set (via survey response), write the response value back to a mapped HubSpot contact property. See Section 11.2 for the HubSpot-specific survey integration path.

  

Phase 4 — Deactivate (optional): For chapters migrating off HubSpot, run the migration tool, then disable the connector. No business logic changes.

  

Never store HubSpot field names (e.g. hs\_lead\_status) in business logic. Map to Trifecta enums at the connector boundary.

  
  

5.2 Google Sheets Connector

  

Read-only sync every 6 hours. Column-to-field mapping is configurable per chapter (admin sets during onboarding).

Conflict resolution: HubSpot wins if same field exists in both, unless chapter admin overrides.

Google Sheets API requires OAuth 2.0. Store tokens encrypted per chapter.

  
  

5.3 EO Global API Connector

  

Build the connector skeleton now. Activate when access is granted.

Join key: eo\_global\_member\_id. Pre-populate via manual import or email match before API access.

Expected signals: member directory, global event history, renewal dates, chapter transfers.

  
  

5.4 WhatsApp Connector

  

Phase 1 — Manual Input: Admin sets whatsapp\_activity\_level (High / Medium / Low / None) per member via admin UI. Unblocks the signal immediately.

  

Phase 1 Alt — Export Ingestion: WhatsApp group admins export chat history. Trifecta parses the export and computes per-member activity metrics.

  

Phase 3 — WhatsApp Business API: Implement via an approved Business Solution Provider (BSP). Ingest group signals via webhook. Compute activity levels automatically. Also used for delivering urgent alert notifications to board members (see Section 2.6).

  

Do not build a WhatsApp scraper or use unofficial APIs. Use Option A (manual) for Phase 1 and WhatsApp Business API for Phase 3.

  
  

6\. PHASED BUILD PLAN

  

Do not begin Phase 2 until Phase 1 is stable with live data. Each phase is deliberately scoped to allow validation before increasing investment.

  
  

PHASE 1: DATA AGGREGATION LAYER

Prove the pipeline. Get all signals into one place.

  

Goal: Working data pipeline pulling from HubSpot and Google Sheets, normalised into the Trifecta Member schema, with computed engagement scores and a ranked at-risk list the ED can review.

  

Success criteria: EO Dallas's full member roster is in Trifecta, auto-updated, with engagement scores that the ED agrees reflect reality.

  

Phase 1 Deliverables:

  

\- Database: Full Member, Chapter, Forum, BoardAction schemas. Multi-tenancy enforced from day one. Renewal intent fields on Member schema included (populated later).

\- HubSpot Connector: Read-only contact and attendance sync every 4 hours. hubspot\_contact\_id stored as secondary reference.

\- Google Sheets Connector: Configurable column-mapping. Read-only sync every 6 hours. Conflict resolution defaults to HubSpot.

\- Manual WhatsApp Input: Simple admin UI to set activity level per member.

\- Engagement Scoring Engine: Composite score from: forum attendance rate (highest weight), local event attendance, SLP engagement, WhatsApp activity, global event history, days since last engagement. Range: 0-100. Compute churn\_risk\_tier from score band.

\- At-Risk Report: Ranked list by churn risk tier, delivered to the ED by email digest on a configurable schedule (default: Monday 8am local time). No portal login required.

\- Admin Interface: Minimal web UI for connector config, WhatsApp level input, member record view, at-risk list review, and action outcome logging.

\- Auth: Secure login. Roles: Admin (full access) and Board Member (read + log actions).

  
  

PHASE 2: INTELLIGENCE LAYER

Make Trifecta the board's advisor, not just a reporter.

  

Goal: Transform the at-risk list into role-specific, actionable intelligence pushed to each board member. The Membership Chair gets different output than the Forum Officer. Each recommendation includes context, talking points, and a suggested action.

  

Success criteria: Board members take actions they attribute to Trifecta's recommendations. The ED can answer 'who should I call this week and why' using only what Trifecta delivers.

  

Phase 2 Deliverables:

  

\- Board Role Profiles: Intelligence scope per board seat: President, Membership Chair, Forum Officer, Events Chair, ED. Each role receives different signals and recommended actions.

\- LLM Recommendation Engine: For each at-risk member, generate: plain-English summary of why they are at risk, personalised suggested action for the relevant board member, and tailored talking points based on their history. Use Anthropic Claude or OpenAI API behind an LLMProvider abstraction layer.

\- Preferred Channel Delivery \[UPDATED v1.1\]: Push weekly digests via email (default) and urgent alerts via WhatsApp (default). Each board member can configure digest\_channel and urgent\_channel independently in settings. Urgent alerts fire immediately when a member crosses into Critical Risk or a renewal deadline falls within 30 days. Weekly digests deliver Monday 8am local time by default, configurable. See Section 2.6 for full channel logic.

\- HubSpot Write-Back: When a board member logs an outcome, write a timestamped note back to the HubSpot contact. Also write renewal\_intent\_response back to HubSpot when survey responses are received (see Section 11).

\- Outcome Tracking: Track which recommendations led to actions, which led to positive outcomes. Use to refine scoring weights over time.

\- Renewals Intelligence Pipeline: Deploy April intent survey. See Section 11 for full specification.

  
  

PHASE 3: DELIVERY LAYER + WHATSAPP API

Automate the outreach, not just the intelligence.

  

Goal: Activate the WhatsApp Business API connector for real group activity ingestion, and build automated outreach triggers that push intelligence to board members without waiting for the weekly digest.

  

Phase 3 Deliverables:

  

\- WhatsApp Business API Connector: Via an approved BSP. Ingest group activity signals via webhook. Auto-compute whatsapp\_activity\_level per member. Enable WhatsApp as a delivery channel for urgent board alerts.

\- Automated Outreach Triggers: When a member crosses into High or Critical tier, immediately schedule an outreach task and notify the relevant board member in their preferred channel.

\- Multi-Chapter Onboarding Flow: New chapters self-configure connectors, define board roles, and go live within 48 hours.

\- Cross-Chapter Benchmarking (Alpha): Using eo\_global\_member\_id and anonymised data, surface engagement score distribution and churn rate comparisons across similarly-sized chapters.

  
  

PHASE 4: NATIVE CRM

Replace HubSpot for chapters not invested in it.

  

Goal: For chapters that don't use HubSpot (the majority globally), activate Trifecta's native contact and pipeline management. For Dallas, offer a migration path when the board is ready.

  

Phase 4 Deliverables:

  

\- NativeCRM Connector: Satisfies the same DataSource interface as HubSpot. Reads from and writes to Trifecta's own database. Switching a chapter is a config change, not a migration.

\- HubSpot Migration Tool: Export all HubSpot history into Trifecta's Member schema, validate completeness, deactivate HubSpot connector.

\- Native Recruitment Pipeline: Prospective member tracking for EOA candidates, referrals, and leads. Replaces HubSpot pipeline stages.

\- EO Global API Connector: Activate if access is granted. Backfill eo\_global\_member\_id fields. Surface renewal status, chapter transfer history, global event registrations.

\- Renewal Intent Native Storage: For non-HubSpot chapters, renewal\_intent\_response and related fields are stored and surfaced natively within Trifecta's member record and renewals dashboard.

  
  

7\. TECHNOLOGY RECOMMENDATIONS

  

Recommendations, not mandates. Flag strong objections before diverging.

  
  

7.1 Backend

  

Language: Node.js (TypeScript) or Python. Both have strong HubSpot SDK support and LLM integration libraries.

Database: PostgreSQL. Multi-tenancy via chapter\_id foreign keys. Row-level security for chapter data isolation.

Job Queue: BullMQ (Node) or Celery (Python) for scheduled syncs, async score computation, and digest/alert delivery jobs.

API: REST for Phase 1. GraphQL if the frontend becomes complex in Phase 2-3.

LLM: Anthropic Claude API (claude-sonnet-4-6) or OpenAI GPT-4o. Abstract behind an LLMProvider interface so the model is swappable without code changes.

  
  

7.2 Frontend

  

Phase 1: Minimal admin UI only. Next.js or React SPA.

Phase 2+: Board member portal, web and mobile-responsive. React Native if native mobile is prioritised.

  
  

7.3 Infrastructure & Security

  

Hosting: Render.com for Phase 1 simplicity. Migrate to AWS or GCP at Phase 3 scale.

Secrets: All API keys and connector credentials via a secrets manager (Doppler, AWS Secrets Manager, or Render native env secrets). Never in code or committed env files.

Encryption: All connector credentials encrypted at rest. All data in transit over HTTPS only.

Testing: Unit tests for the scoring engine from day one. All connector code must be mockable. Every schema migration versioned and reversible. Maintain a seed script with anonymised test data.

  
  

8\. NON-NEGOTIABLE CONSTRAINTS SUMMARY

  

Confirm understanding of all the following before writing any code.

  

Constraint: Trifecta UUID as PK on all entities | Why: Enables connector swaps without rewriting business logic or re-keying data.

Constraint: eo\_global\_member\_id on Member from day one | Why: Cross-chapter dedup, future API integration, EO Global partnership leverage.

Constraint: eo\_global\_chapter\_id on Chapter from day one | Why: Same reasons at chapter level.

Constraint: HubSpot implements DataSource interface | Why: Strangler Fig: HubSpot is replaceable without downstream changes.

Constraint: chapter\_id on every data table | Why: Cannot retrofit multi-tenancy cleanly after data exists.

Constraint: No HubSpot field names in business logic | Why: Decouples scoring from the current CRM choice.

Constraint: LLMProvider abstraction | Why: Allows model switching without code rewrites.

Constraint: Notification channel per board member | Why: The delivery layer is a core moat — must be flexible from the start.

Constraint: digest\_channel defaults to Email; urgent\_channel defaults to WhatsApp | Why: Product decision validated in v1.1. Both are configurable per board member but must have correct defaults out of the box.

Constraint: All connector credentials encrypted at rest | Why: Member data is sensitive. A breach ends the product.

Constraint: Unit tests on scoring engine from day one | Why: Scoring is the core business value — must be testable in isolation.

Constraint: Renewal intent fields on Member schema from day one | Why: Renewal survey ships in Phase 2. Schema must exist in Phase 1 (populated as null) to avoid a migration on live data.

  
  

9\. RECOMMENDED FIRST SPRINT (WEEKS 1–2)

  

By end of Week 2, the product owner (Imran) should be able to see a live EO Dallas member list and at-risk ranking in a staging environment.

  

1\. Set up the database and run the full schema migration. All tables, all fields, all indexes. Confirm multi-tenancy with a test query. Include all renewal intent fields — null for now.

2\. Build the DataSource interface and HubSpot connector skeleton. Connect to EO Dallas's HubSpot instance, pull the first batch of contacts, print the raw response. Do not transform yet.

3\. Write the HubSpot-to-Trifecta field mapping. Map every HubSpot field used by Dallas to the Trifecta Member schema. Document unmapped fields. Flag any without a clean home.

4\. Load EO Dallas members into the database. Run the first real sync. Verify record count matches HubSpot. Verify hubspot\_contact\_id is stored and indexed.

5\. Build and run the scoring engine on the first real dataset. Output a CSV of members ranked by churn risk. Share with Imran for gut-check against known at-risk members.

6\. Build the Google Sheets connector. Pull Dallas forum tracking data. Map columns using the configurable approach.

7\. Deploy to staging. Live member list and at-risk ranking visible to Imran by end of Week 2.

  
  

10\. OPEN QUESTIONS TO RESOLVE BEFORE STARTING

  

Resolved in v1.1:

\- Preferred delivery channel for weekly digest: Email (default, configurable).

\- Preferred delivery channel for urgent alerts: WhatsApp (default, configurable).

  

Still open:

\- What is EO Dallas's HubSpot portal ID and which contact properties are actively maintained?

\- Which Google Sheets are in active use, who maintains them, and what is the column structure? (Confirm with Rob and Prince.)

\- Is there a visible EO Global member ID or profile URL in the EO Global admin portal that can be used for manual pre-population?

\- Which WhatsApp groups does the Dallas chapter operate, and who are the admins?

\- Which board member(s) have agreed to be early users of the Phase 2 board intelligence delivery in addition to Jon?

\- Has EO Global indicated any interest or pathway for API access? What was Jon's framing of that request?

\- For the April intent survey: what is the preferred form tool (Tally, Typeform, Google Forms)? The choice affects how responses are routed to HubSpot. See Section 11.4.

\- What custom HubSpot contact property should be created to store renewal\_intent\_response? Does the HubSpot admin (Joel Whitmer) need to create this, or can it be done via API?

\- What is the preferred sending channel for the April intent survey message to members — email, WhatsApp, or both? Note: WhatsApp Business API is Phase 3; Phase 2 survey outreach via email is the default.

  
  

11\. RENEWALS INTELLIGENCE PIPELINE \[NEW — v1.1\]

  
  

11.1 Overview

  

The renewals season (typically mid-May through mid-July) is the highest-stakes operational period for any EO chapter. For EO Dallas, it represents significant potential revenue at risk and consumes a disproportionate amount of the Executive Director's time. The current process is entirely reactive: Jon reaches out manually to each member whose renewal is approaching, with no advance signal about intent.

  

The Renewals Intelligence Pipeline transforms this from a reactive scramble into a proactive, data-driven process by combining two inputs:

  

1\. The year-round Member Health Score (computed continuously from engagement signals — see Health Score Algorithm Specification for full details).

2\. The April Renewal Intent Survey — a proactive outreach sent to all active members in April, before the renewal season begins, asking directly about their renewal plans.

  

Combined, these two inputs give the ED a prioritised call list entering the renewal season: members sorted by likelihood of lapse, with early intent data layered on top of the behavioural score.

  

Key principle: a member with a health score of 78 who responds "I won't be renewing" is a higher intervention priority than a member with a health score of 35 who responds "definitely renewing." The survey response re-ranks the pipeline; it does not replace the score.

  
  

11.2 The April Renewal Intent Survey

  

Purpose: Gather direct renewal intent from every active member before the renewal season begins, giving the ED a four-to-six-week head start on at-risk identification.

  

Timing: Send in April each year. The exact date should be configurable per chapter (default: first Monday of April). Must be sent and response period closed before May 1 so the ranked pipeline is ready at renewal season open.

  

Survey Content: The survey is intentionally brief — three response options and an optional comment field. The LLM generates a personalised introductory message for each member (using their name, tenure, and any notable recent engagement) before linking to the form.

  

Response options:

\- Plan to Renew — I'm planning to renew. No action needed on my part.

\- Want to Speak to Someone — I have questions or would like to talk to a board member before deciding.

\- Won't Be Renewing — I've decided not to renew this year.

  

Optional free-text: "Anything you'd like us to know?" (not required)

  

Delivery: Phase 2 default is email. The personalised message is generated by the LLM and sent from the ED's email address (or a chapter address, per admin config). WhatsApp delivery is available once the WhatsApp Business API connector is live (Phase 3).

  

Non-responders: Members who do not respond within 14 days are flagged as NoResponse in renewal\_intent\_response and added to a follow-up outreach list. The non-response itself is treated as a mild negative signal in the renewal pipeline (not in the core health score).

  
  

11.3 Data Flow

  

Step 1 — Survey Sent: Trifecta generates personalised messages, sends to all active members, and sets renewal\_intent\_survey\_sent\_at on each Member record.

  

Step 2 — Response Received: Member clicks a link in their email and submits the web form. The form is hosted externally (Tally, Typeform, or Google Forms — see Section 11.4). On submission:

\- For HubSpot chapters: form response is routed to HubSpot via native integration or Zapier webhook, populating a custom contact property (renewal\_intent\_response). Trifecta reads the value back via the next HubSpot sync.

\- For non-HubSpot chapters: form response posts directly to the Trifecta API via webhook, writing to renewal\_intent\_response on the Member record.

Both paths set renewal\_intent\_survey\_responded\_at and populate renewal\_intent\_notes if a comment was provided.

  

Step 3 — Pipeline Update: On each sync after responses begin arriving, Trifecta recomputes the Renewal Priority Score (a separate derived field, distinct from the health score) combining:

\- Health score (engagement signal weight)

\- Renewal intent response (intent signal weight)

\- Days until next\_renewal\_date (urgency weight)

  

Step 4 — ED Notification: Once the response window closes (default: 14 days after send), Trifecta pushes a renewal season summary to the ED via email: total response rate, count by response type, and the top 10 highest-priority members to contact first.

  

Step 5 — Ongoing Updates: Through the renewal season (May–July), Trifecta continues monitoring. When a renewal is confirmed (via HubSpot sync or manual log), the member's renewal\_status is updated to Renewed. When a renewal deadline passes without confirmation, an urgent alert fires to the ED via WhatsApp.

  
  

11.4 Form Tool Recommendation

  

Recommended: Tally (tally.so) or Typeform for Phase 2.

  

Tally is preferred for early chapters because:

\- Free tier is generous enough for a small annual survey

\- Native HubSpot and webhook integrations without Zapier required

\- Clean, mobile-friendly form experience appropriate for a member-facing survey

\- Easy to brand to the chapter

  

HubSpot-specific path: Create a custom HubSpot contact property (type: single select, values: PlanToRenew / WantToSpeak / WontRenew / NoResponse). Configure Tally's HubSpot integration to write the form response to this property on submission. Trifecta reads the value on the next HubSpot sync and maps it to renewal\_intent\_response.

  

Non-HubSpot path: Configure Tally's webhook to POST the form submission to a Trifecta API endpoint (POST /api/v1/members/{trifecta\_member\_id}/renewal-intent). The endpoint writes directly to the Member record. The survey link sent to each member must embed their trifecta\_member\_id as a hidden field in the form so Trifecta can match the response to the correct record.

  

Important: The survey link sent to each member must be unique per member (embedding their ID) so responses are automatically matched. Do not rely on email address matching — members may submit from a different email than their primary.

  
  

11.5 Renewal Priority Score

  

The Renewal Priority Score is a derived field computed separately from the health score. It is used only for ranking the renewal season pipeline and is not exposed as a general member health indicator.

  

Inputs and approximate weights (to be tuned based on first-season results):

\- Health Score: 40% weight. Lower scores increase renewal risk.

\- Renewal Intent Response: 40% weight. WontRenew = maximum risk weight. WantToSpeak = high risk weight. NoResponse = moderate risk weight. PlanToRenew = zero risk weight (suppresses from active pipeline).

\- Days Until Renewal: 20% weight. Members renewing in the next 30 days are weighted higher than those renewing in 90 days.

  

Output: A ranked list of all active members, sorted from highest renewal risk to lowest. The ED sees this as "your top 10 members to contact this week," not as a raw score.

  

Key rule: Members who respond PlanToRenew are moved to a monitoring state and removed from the active pipeline unless their health score subsequently drops sharply or their renewal date passes without confirmation.

  
  

11.6 Post-Season Analysis

  

After the renewal season closes (default: August 1), Trifecta automatically generates a Renewal Season Summary for the ED:

  

\- Total members at renewal: count.

\- Renewed: count and %.

\- Lapsed: count and %, broken down by intent response (how many said WontRenew vs. were flagged by score only vs. did not respond).

\- Average health score of members who lapsed vs. renewed — validates the scoring model.

\- Response rate for the April survey.

\- Recommended weight adjustments for next year's algorithm based on outcomes.

  

This output feeds directly into the health score model calibration for the following year.

  
  

— End of Document —

  

Version 1.1 | May 2026 | CONFIDENTIAL DRAFT

Changes from v1.0: Communication channel defaults specified (Section 2.6). digest\_channel and urgent\_channel fields added to Member schema (Section 3.1). Renewal intent fields added to Member schema (Section 3.2). HubSpot write-back updated for renewal intent (Section 5.1). Phase 2 and Phase 4 deliverables updated. Non-negotiable constraints updated (Section 8). Open Questions updated (Section 10). Section 11 (Renewals Intelligence Pipeline) added in full.

  