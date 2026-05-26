PROJECT TRIFECTA

  

Developer Specification & Build Guide

  

Version 1.2   •   May 2026   •   CONFIDENTIAL DRAFT

  

Changes in v1.2 (after Ronnie / Fort Worth discovery call, 2026-05-26): Rewrote §1.3 Pilot Context to reflect that EO Fort Worth runs on Go High Level, not HubSpot. Added §2.7 Chapter Process Variance, §2.8 Persistence Through Leadership Change, §2.9 Multi-Chapter Admin View, and §2.10 Event-Driven Engagement as architectural principles. Added Event Calendar feature as Phase 1 deliverable (auto-invite engine, iCal generation, lifecycle automation for new/lapsed members) — entities §4.8 Event, §4.9 EventTypeCatalog, §4.10 EventEligibilityRule, §4.11 EventInvite; connector §5.7 Calendar Integration. Promoted `sap_interactions` to a tracked engagement signal (§3.10). Added §3.14 Spouse Program Participation as a signal distinct from SLP engagement status. Added §4.4 ChapterConfig, §4.5 BoardActionItem, §4.6 BoardRoleCatalog (enumerated board roles including GSEA, Governance, and Mentorship), and §4.7 UserChapterRole (replaces the one-user-one-chapter auth constraint to support multi-chapter users like Ronnie). Reorganised §5 to make Go High Level a Phase 1 connector alongside HubSpot, and added §5.6 Future Connector Roadmap (Pipedrive, Bloom, 90io, Global Board Tracker). Updated Phase 1 deliverables in §6 to include Go High Level, board action item tracker, and Regional Operator multi-chapter view. Updated Phase 2 Board Role Profiles (§6) with the full enumerated role list. Added seven non-negotiable constraints in §8. Added Ronnie-call open questions in §10. Renewal intent survey delivery (§11.2) now respects per-member preferred channel. Added §12 Competitive Landscape.

  

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

12\. Competitive Landscape \[NEW in v1.2\]

  
  

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

  

Initial pilot \[UPDATED v1.2\]: Two chapters with intentionally different tech stacks, to prove the connector model from the start.

  

EO Dallas (primary pilot): HubSpot + Google Sheets + EO Global. They do not use ChapterPro. Jon Minjoe (Executive Director, EO Dallas) is the internal champion and has validated the four core engagement signals: forum participation, event attendance, SLP involvement, and WhatsApp activity.

  

EO Fort Worth (secondary pilot): Go High Level (not HubSpot) + Google Sheets + EO Global. Fort Worth has cycled through Pipedrive → Global HubSpot → Go High Level over three years as board leadership turned over — making them the canonical case for why Trifecta must work above the chapter's CRM, not within it. Cheryl Gillian (member engagement chair) is the operational lead; intro pending via Ronnie. Phase 1 must ship with a working Go High Level connector for the Fort Worth pilot to be live.

  

Multi-chapter strategic context: Ronnie (US Central regional operator, manages roughly 15 chapters including Fort Worth) surfaced the broader tool fragmentation across EO chapters: HubSpot, Go High Level, Pipedrive, Bloom, 90io, and the EO Global board tracker all appear across the chapters she manages. Trifecta's positioning is that the diversity of CRM choices is irrelevant — Trifecta absorbs from whichever system is in place and provides the unified intelligence layer above it. This is not just a Dallas/Fort Worth observation; it's the design centre.

  

The four core engagement signals validated by Jon (forum, attendance, SLP, WhatsApp) are confirmed. The Ronnie call added two further signals that v1.2 promotes to first-class: SAP (Strategic Alliance Partner) engagement (§3.10) and Spouse Program participation as distinct from generic SLP involvement (§3.14). Per-chapter signal weighting is now a non-negotiable (§8) — Dallas and Fort Worth will weight signals differently based on their member approval and forum cultures.

  
  

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

  
  

2.7 Chapter Process Variance \[NEW v1.2\]

  

Every chapter runs its operational processes differently. The Ronnie call surfaced two specific axes of variance with implementation implications:

  

\- Member approval workflow: ranges from a formal board vote on each applicant (Dallas-style) to "breathing + payment" (some chapters approve effectively any qualified applicant who pays). Trifecta must not hardcode an approval flow.

\- Revenue verification: some chapters require an annual CPA signature on the member's $1M+ revenue claim; others run on trust without re-verification. Trifecta must not hardcode a verification policy.

  

Implication: the Chapter entity must carry a `chapter_config` JSON field describing the chapter's onboarding, approval, and renewal verification rules. The engagement scoring engine and renewal intelligence pipeline must read this config rather than assume any single process. New chapters self-configure during onboarding; defaults are sensible but every default must be overridable per chapter.

  

Engagement signal weighting is part of the same configurability surface. Forum attendance may be the highest-weighted signal in Dallas but a lower signal in chapters that don't run formal forums. The scoring engine reads per-chapter weights from `chapter_config.engagement_weights`.

  
  

2.8 Persistence Through Leadership Change \[NEW v1.2\]

  

EO chapter boards turn over annually. New chairs frequently bring in their own preferred tools, abandoning the prior board's system. Fort Worth's three-year journey (Pipedrive → HubSpot → Go High Level) is illustrative, not exceptional. Ronnie's call also surfaced the related failure mode: "Global board tracker filled out once, never revisited" — institutional memory routinely dies when leadership rotates.

  

Trifecta is the persistent layer that survives the rotation. To deliver on that promise:

  

\- Connector swaps are first-class operations. When a chapter migrates from Connector A to Connector B (e.g., Pipedrive to Go High Level), Trifecta migrates the data via the DataSource interface without losing engagement history or board action history.

\- Board action item history (see §4.5) and member outreach history (BoardAction, §4.3) are owned by Trifecta and never lost when the underlying CRM changes.

\- New board members onboard into the existing Trifecta instance — they do not get to choose a new system that abandons the prior board's data. The persistence is the product.

  
  

2.9 Multi-Chapter Admin View \[NEW v1.2\]

  

A single user must be able to log in once and see status across multiple chapters they are responsible for. Ronnie is the canonical case: she operates across roughly 15 EO chapters in US Central and needs a roll-up view rather than 15 separate logins. This is not a Phase 3 nice-to-have. It is a Phase 1 deliverable because (a) Ronnie's intro-to-other-chapters work depends on her experiencing the product as a regional operator, not as a single-chapter board member, and (b) the auth model that supports it is not retrofittable cleanly once chapter-locked accounts exist.

  

Architectural implications:

  

\- Auth is decoupled from Chapter. A user account exists independently of any single chapter. A `user_chapter_roles` table (§4.7) maps a user to one or more chapters with a role per chapter. A user can be Admin in Chapter A, BoardMember in Chapter B, and RegionalOperator (read-only) across Chapters C through M.

\- The current v1.1 model (one `auth_user_id` on a single member record per chapter) is insufficient and must be replaced before any production user is created. Migration plan: add `users` table, add `user_chapter_roles` table, link existing `members.auth_user_id` rows into both during the migration.

\- A new role is added: `RegionalOperator`. Read-only access by default across all chapters in scope; can be granted write access per chapter if needed.

\- Cross-chapter queries must remain row-level secured: a user with access to Chapters A, B, C must never see data from Chapter D in any query path. RLS policies need to read `user_chapter_roles` to determine the access set.

\- Multi-chapter views and single-chapter views are separate UI surfaces. The Regional Operator dashboard is a roll-up across the user's chapter set; drilling into a chapter shows the same single-chapter board view a chapter board member would see.

  

Roll-up view contents (Phase 1 baseline):

  

\- One row per chapter the user has access to.

\- Per chapter: at-risk member count by tier, critical count, renewal pipeline status (count by intent response), open board action items, last sync timestamp per connector.

\- Sort and filter: by chapter name, by region, by at-risk count, by renewal urgency.

\- Click-through: opens the single-chapter board view for that chapter, with breadcrumb back to the roll-up.

  

Cross-chapter analytics (Phase 2):

  

\- Engagement score distribution comparison across the user's chapters.

\- Renewal rate comparison.

\- Identify patterns that travel across chapters (e.g. SAP engagement correlates with renewal everywhere; forum participation correlates only in some).

  
  

2.10 Event-Driven Engagement \[NEW v1.2\]

  

Events are first-class objects in Trifecta, calendar dispatch is first-class behavior, and RSVPs / attendance / no-shows are first-class signals fed back into the engagement score. This is both a feature and an architectural commitment: every event the chapter runs generates engagement data, and that data flows into the same scoring engine that produces the at-risk pipeline.

  

The user-facing problem this solves: EO chapter boards schedule events months in advance, but members don't put them on their calendars in time and attendance suffers. The operational problem this solves for Trifecta: capturing member attendance and intent currently depends on manual HubSpot updates and Google Sheets, which are incomplete and lagging. By owning the invite layer, Trifecta becomes the source of truth for who was invited, who said yes, who said no, and (with attendance confirmation) who actually showed up.

  

Architectural commitments:

  

\- Every event creates engagement data. Sent / Accepted / Declined / Tentative / NoResponse / Attended / NoShow are all distinct status values that feed the scoring engine.

\- The "NoShow after Accepted" signal is the highest-leverage churn predictor this system captures — a member who said yes but didn't come is a stronger churn signal than a member who said no or never responded. It is impossible to capture without owning the invite layer.

\- Auto-invite engine runs on three triggers: (a) event created → invite eligible members immediately, regardless of how far in the future the event is; (b) new member added to chapter → invite to all applicable future events; (c) member status changed to Lapsed or Alumni → revoke future invites.

\- Eligibility is rule-driven and per-chapter configurable (§4.10). The default rules per event type (board events → board roles only; SLP events → all active + spouse; EOA events → EOA-track only) are sensible defaults a chapter can override.

\- Calendar dispatch is universal in Phase 1 via iCal (.ics) attachments — works in any email client, any calendar app. Native Google Calendar API and Microsoft Graph integrations land in Phase 2 for richer RSVP capture and bidirectional sync.

\- Member calendar information lives in dedicated fields (§3.1 — calendar\_email, event\_type\_opt\_outs) separate from primary contact email, because the calendar address is often different from the address used for normal chapter communication.

  

Wedge positioning implication: this feature is the strongest standalone-value entry point Trifecta has. A chapter that does not yet trust the retention engine will adopt Trifecta for the calendar automation alone, and the retention intelligence becomes a follow-on benefit once they're using the platform. Prospects in Ronnie's network should be shown the calendar feature first and the at-risk engine second.

  
  

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

  

\--- Event Calendar Fields (new in v1.2 — see §2.10 and §5.7) ---

  

Field: calendar\_email | Type: String | Required: No | Notes: Email address where calendar invites are sent. Often different from email\_primary — many members route business calendar to a different address. If null, falls back to email\_primary.

Field: calendar\_provider | Type: Enum | Required: No | Notes: Google | Outlook | Apple | iCalGeneric | None. Default: iCalGeneric. Phase 1 uses iCal universally; Phase 2 enables native API integrations for Google/Outlook for richer RSVP capture.

Field: event\_type\_opt\_outs | Type: Array\<String\> | Required: No | Notes: Event types this member has opted out of (e.g. \["Social", "Regional"\]). The auto-invite engine respects these opt-outs and excludes the member from invites for those types. Per-event override possible via EventInvite.revoked\_by\_member field.

  
  

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

Field: slp\_first\_name | Type: String | Required: No | Notes: \[NEW v1.2\] First name (separate field enables personalised invite messaging).

Field: slp\_last\_name | Type: String | Required: No | Notes: \[NEW v1.2\] Last name (may differ from member's last name).

Field: slp\_email | Type: String | Required: No | Notes: \[NEW v1.2\] Spouse / Life Partner's email address. Used for direct calendar invites to spouse-inclusive events (SLP, family-inclusive Social, family-inclusive Learning). When present and the event eligibility rule is spouse-inclusive (§4.10), the auto-invite engine sends a parallel invite to this address with the member's calendar invite. Falls back to member-only invite if null.

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

Field: sap\_interactions | Type: Integer | Required: No | Notes: Count of recorded interactions with Strategic Alliance Partners over the last 12 months. \[PROMOTED in v1.2 from low-priority to tracked engagement signal\] Ronnie flagged SAP engagement as a meaningful retention indicator across the chapters she manages — members who actively engage with SAPs (partner-driven workshops, member discounts, sponsor events) tend to renew at materially higher rates than members who never engage. Include in the engagement score with a per-chapter weight (see §3.11 and §2.7).

  
  

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

  
  

3.14 Spouse Program Participation \[NEW v1.2\]

  

The Ronnie call identified Spouse Program participation as a retention signal distinct from `slp_engagement_status` (§3.8). The existing SLP fields describe whether the spouse/partner is generally engaged. These new fields measure concrete attendance at chapter-run spouse programs, which Ronnie called out as one of the most reliable predictors of long-tenure renewal.

  

Field: spouse\_program\_attendance\_12m | Type: Integer | Required: No | Notes: Count of chapter-organised spouse-specific programs attended by the member's spouse/partner in the last 12 months. Distinct from general SLP engagement (§3.8); this measures concrete attendance, not perceived engagement.

Field: spouse\_program\_last\_attended\_date | Type: Date | Required: No

Field: spouse\_program\_invitations\_12m | Type: Integer | Required: No | Notes: Number of invitations sent to spouse in last 12 months. Combined with attendance count, surfaces low-conversion invitation patterns.

  

Per-chapter caveat (§2.7): Not every chapter runs a formal spouse program. Chapters without one set `spouse_program_attendance_12m` to null and the scoring engine excludes the signal from that chapter's composite score per `chapter_config.engagement_weights`.

  
  

3.15 Event Engagement Signals \[NEW v1.2\]

  

Signals derived from EventInvite (§4.11) status across the past 12 months. These flow into the engagement score (§3.11) with per-chapter weights (§2.7). The highest-leverage signal in this section is the no-show-after-accepted count — see §2.10 for why.

  

Field: events\_invited\_12m | Type: Integer (computed) | Required: No | Notes: Count of EventInvites sent to this member in the last 12 months.

Field: events\_accepted\_12m | Type: Integer (computed) | Required: No | Notes: Count of invites the member accepted.

Field: events\_attended\_12m | Type: Integer (computed) | Required: No | Notes: Count of events the member actually attended (set when attendance is confirmed via QR check-in, manual attendance import, or HubSpot/Go High Level attendance sync).

Field: events\_declined\_12m | Type: Integer (computed) | Required: No | Notes: Count of invites the member declined.

Field: events\_noshow\_after\_accepted\_12m | Type: Integer (computed) | Required: No | Notes: Count of events the member accepted but did not attend. Critical churn signal. Higher than zero is always worth a board conversation.

Field: events\_noresponse\_12m | Type: Integer (computed) | Required: No | Notes: Count of invites the member never responded to. Mild negative signal.

Field: event\_acceptance\_rate\_12m | Type: Float (computed) | Required: No | Notes: events\_accepted\_12m / events\_invited\_12m. Range 0-100. Per-chapter, healthy baseline varies; the scoring engine normalises against chapter median.

Field: event\_attendance\_rate\_12m | Type: Float (computed) | Required: No | Notes: events\_attended\_12m / events\_invited\_12m. Distinct from acceptance rate — a member can accept 90% and attend 30%; that combination is a strong negative signal.

  

These computed fields are updated nightly by the scoring engine. The raw EventInvite records (§4.11) are the source of truth.

  
  

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

  
  

4.4 ChapterConfig \[NEW v1.2\]

  

Stores per-chapter configuration for processes that vary across chapters (see §2.7). One-to-one with Chapter.

  

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: PK; one config per chapter.

Field: approval\_workflow | Type: Enum | Required: Yes | Notes: BoardVote | EDApproval | AutoOnPayment | Other. Describes how new members are approved into the chapter.

Field: revenue\_verification | Type: Enum | Required: Yes | Notes: AnnualCPASignature | OneTimeAtJoin | TrustBased | Other.

Field: engagement\_weights | Type: JSON | Required: Yes | Notes: Per-signal weights for the engagement scoring engine (forum, attendance, slp, whatsapp, sap, spouse\_program, peer\_interactions). Defaults set at chapter onboarding; admin can tune. See §3.11.

Field: renewal\_cycle | Type: JSON | Required: No | Notes: Per-chapter renewal calendar overrides (intent survey send date, response window, renewal deadlines). Falls back to defaults in §11.

Field: spouse\_program\_active | Type: Boolean | Required: Yes | Notes: Does this chapter run a formal spouse program? Controls whether `spouse_program_*` signals are included in the score.

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes

  
  

4.5 BoardActionItem \[NEW v1.2\]

  

Tracks action items generated from board meetings or board chair check-ins, distinct from member-outreach BoardActions (§4.3). Ronnie's call surfaced that "no follow-up on board meeting action items" is one of the most consistent operational failures across chapters — the Global board tracker gets filled out once and never revisited. Trifecta owns this layer because it is the persistent system across leadership turnover (§2.8).

  

Field: action\_item\_id | Type: UUID | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes

Field: meeting\_date | Type: Date | Required: No | Notes: Date of the board meeting or check-in where this item was generated. Null if generated outside a meeting context.

Field: meeting\_type | Type: Enum | Required: No | Notes: BoardMeeting | ChairCheckIn | OneOnOne | Adhoc.

Field: assigned\_to\_member\_id | Type: UUID (FK) | Required: Yes | Notes: Board or committee member responsible for the item.

Field: assigned\_by\_member\_id | Type: UUID (FK) | Required: Yes | Notes: Who assigned it.

Field: description | Type: String | Required: Yes | Notes: What needs to happen.

Field: due\_date | Type: Date | Required: No

Field: status | Type: Enum | Required: Yes | Notes: Open | InProgress | Completed | Cancelled | Stale.

Field: completed\_at | Type: DateTime | Required: No

Field: linked\_member\_id | Type: UUID (FK) | Required: No | Notes: Optional link to a Member this item is about (e.g. "Cheryl to follow up with Michael de Koning re: renewal"). Enables surfacing the action item alongside the member record.

Field: notes | Type: Array\<{ts,author\_id,text}\> | Required: No

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes

  

Behaviour: Open and InProgress items appear in the assignee's weekly digest (§2.6) until completed or cancelled. Items past their due\_date by more than 14 days are flagged Stale and surfaced as a separate digest section. The board chair (or ED) sees an aggregated view across all open items for the chapter. This is the explicit "Board Whisperer-adjacent" feature scope — see §12.3 for positioning relative to Ronnie's tool.

  
  

4.6 BoardRoleCatalog \[NEW v1.2\]

  

The canonical list of EO chapter board roles. The LLM recommendation engine (§6 Phase 2) tailors output per role — President-Elect needs different intelligence than GSEA Chair. The role list below is the v1.2 baseline. Individual chapters may have additional or differently-named roles; the schema accepts free-text overrides but the LLM only has role-specific intelligence profiles for catalog entries.

  

\- President — chapter chair; full board oversight; budget and strategic decisions.

\- President-Elect — incoming chair; succession-oriented; shadow most decisions.

\- Past President — outgoing chair; advisory; mentors President-Elect.

\- Treasurer / VP Finance — chapter financials, dues, vendor management.

\- Membership Chair / VP Membership — recruitment, retention, renewal. Highest-touch role for Trifecta.

\- Forum Officer / VP Forum — forum assignments, chair training, forum health.

\- Events Chair / VP Events — local events, learning events, social calendar.

\- Learning Chair / VP Learning — education programming, speakers, content.

\- Communications Chair / VP Communications — chapter comms, social channels, newsletter.

\- Strategic Alliance Partner Chair (SAP Chair) — partner relationships, sponsorship pipeline, partner-driven member benefits.

\- GSEA Chair (Global Student Entrepreneur Awards) — runs the local GSEA competition; recruits and mentors student entrepreneurs; coordinates with EO Global on regional/global rounds.

\- Governance Chair — bylaws, board operations, succession planning, conflict resolution; sometimes combined with Secretary role.

\- Accelerator Chair — manages the EO Accelerator program for the chapter; bridges Accelerator members into full EO membership.

\- Mentorship Chair — runs the chapter's mentor-mentee pairing program; recruits and trains mentors; oversees new-member onboarding into mentor relationships. Trifecta surfaces mentorship engagement as a retention signal — new members with active mentor relationships renew at materially higher rates, so the Mentorship Chair sees onboarding-completion and mentor-meeting-cadence signals prioritised in their intelligence profile.

\- SLP Chair (Spouse / Life Partner) — runs the chapter's SLP program; coordinates with the global SLP network.

\- Executive Director (ED) — paid staff, not voting board; runs day-to-day operations; reports to the President.

  

Each role has an LLM intelligence profile (Phase 2 deliverable, §6) that defines: which signals are most relevant to this role's decisions, what talking points they should be prompted with, and what their typical weekly digest contains. Profile definitions live in a separate config file, not in this spec.

  

Schema implication: keep `members.board_role_current` as TEXT for flexibility but recognise the catalog above as the canonical values for LLM-tailored intelligence. Chapters with custom role names get generic output until either (a) their role is added to the catalog or (b) they map their custom role to a catalog entry during onboarding.

  
  

4.7 UserChapterRole \[NEW v1.2\]

  

Replaces the v1.1 model where a Supabase Auth user was linked to exactly one Member record (and therefore one Chapter). The new model supports multi-chapter users — primarily Ronnie's Regional Operator case (§2.9), but also board members who move chapters or operate across multiple chapters during a transition.

  

Schema additions:

  

\- New `users` table: `user_id UUID PK, auth_user_id UUID UNIQUE (Supabase Auth), email TEXT UNIQUE, full_name TEXT, created_at, updated_at`.

\- New `user_chapter_roles` table: `user_chapter_role_id UUID PK, user_id UUID FK, chapter_id UUID FK, role app_role NOT NULL, member_id UUID FK NULL (link to the user's Member record in this chapter if they are a member there), granted_at, granted_by UUID FK, revoked_at NULL`.

\- Add `RegionalOperator` to the `app_role` enum.

  

Behavior:

  

\- A user logs in once via Supabase Auth. The app reads `user_chapter_roles` to determine which chapters they have access to and at what role.

\- For a user with a single `user_chapter_roles` row, the app loads the single-chapter board view directly (no roll-up). For multi-chapter users, the app loads the Regional Operator dashboard (§2.9) by default with a chapter switcher.

\- RLS policies on every data table read `user_chapter_roles` to determine the allowed chapter set for the current user. Users with no matching role for a chapter cannot read its data under any query path.

\- The existing `members.auth_user_id` column is deprecated in v1.2 in favour of `user_chapter_roles.member_id` (reverse direction). Migrate during the v1.2 deploy. Keep the old column with a deprecation comment for one release cycle.

  

This is a Phase 1 deliverable (§6) because retrofitting it after production users exist requires data migration on the user table — much riskier than building it correctly from the start.

  
  

4.8 Event \[NEW v1.2\]

  

A scheduled event in a chapter. Source of EventInvite records (§4.11) and engagement signals (§3.15).

  

Field: event\_id | Type: UUID | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: Owning chapter. For multi-chapter regional events, the chapter\_id is the originating chapter and the eligibility rule (§4.10) opens it to other chapters.

Field: event\_type | Type: String (FK to EventTypeCatalog.code) | Required: Yes | Notes: One of the catalog codes in §4.9. Determines default eligibility, default communication template, and scoring weight contribution.

Field: title | Type: String | Required: Yes | Notes: Human-readable title that appears in the calendar invite.

Field: description | Type: String | Required: No | Notes: Free text shown in the invite body. LLM can generate a per-member personalised version on dispatch.

Field: datetime\_start | Type: DateTime | Required: Yes | Notes: Event start with timezone offset.

Field: datetime\_end | Type: DateTime | Required: Yes | Notes: Event end.

Field: timezone | Type: String | Required: Yes | Notes: IANA timezone for the event (e.g. America/Chicago).

Field: location\_physical | Type: String | Required: No | Notes: Physical address or venue name.

Field: location\_virtual\_url | Type: String | Required: No | Notes: Zoom/Teams/Meet link for hybrid or virtual events.

Field: recurrence\_rule | Type: String | Required: No | Notes: iCal RRULE for recurring events (e.g. FREQ=MONTHLY;BYDAY=2TU for second Tuesday monthly). Null for one-off events.

Field: recurrence\_parent\_id | Type: UUID (FK self) | Required: No | Notes: For events generated from a recurring series, links to the parent series event. Allows editing one instance without affecting the series.

Field: eligibility\_rule\_id | Type: UUID (FK) | Required: Yes | Notes: References EventEligibilityRule (§4.10). Determines who gets invited. Each event\_type has a default rule; chapter can override per-event.

Field: status | Type: Enum | Required: Yes | Notes: Draft | Scheduled | Cancelled | Completed.

Field: capacity | Type: Integer | Required: No | Notes: Maximum attendees. Null = unlimited. When set, the auto-invite engine respects a waitlist once capacity is reached.

Field: rsvp\_required\_by | Type: Date | Required: No | Notes: Optional RSVP deadline. Used in invite reminders.

Field: external\_calendar\_event\_ids | Type: JSONB | Required: No | Notes: Provider-specific event IDs for events also synced to Google Calendar / Outlook native APIs in Phase 2 (e.g. `{"google": "...", "outlook": "..."}`).

Field: created\_by\_member\_id | Type: UUID (FK) | Required: Yes | Notes: Board member who scheduled the event.

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes

  
  

4.9 EventTypeCatalog \[NEW v1.2\]

  

The canonical list of EO event types. Each entry has a default eligibility rule and a default scoring weight contribution. Chapters can map their own event labels to a catalog code during onboarding or create chapter-specific custom types (catalog code = "Custom").

  

Catalog entries (code · default eligibility · scoring weight implication):

  

\- Learning · all active members · attendance counts as Learning signal

\- Social · all active members + optional spouse · attendance counts as Social engagement signal

\- ChapterEvent · all active members · default attendance signal

\- BoardMeeting · board members only (excludes general membership) · contributes to board attendance signal, not member engagement

\- ForumMeeting · forum members only (forum\_id-scoped) · contributes to forum\_attendance\_rate (§3.6)

\- GSEA · GSEA Chair + GSEA committee + interested members opted-in · GSEA engagement signal

\- SAP · members opted into SAP partner engagement · contributes to sap\_interactions (§3.10)

\- SLP · all active members + spouse if slp\_email present · contributes to slp\_programs\_count\_12m and spouse\_program\_attendance\_12m (§3.8, §3.14)

\- EOA · Accelerator-track members only · contributes to EOA signals (§3.9)

\- Regional · members across multiple chapters in the same EO region · regional engagement signal

\- Global · members invited to EO Global event · global\_event\_count contribution (§3.7)

\- CommitteeMeeting · committee members of the relevant committee · committee engagement

\- MentorSession · paired mentor + mentee · contributes to mentor-meeting cadence signal (Mentorship Chair profile, §4.6)

\- RenewalConversation · scheduled 1:1 between board member and at-risk member; triggered by Trifecta · contributes to outreach\_count\_90d (§3.12)

\- Custom · chapter-defined · no default signal contribution; must be mapped by chapter admin

  
  

4.10 EventEligibilityRule \[NEW v1.2\]

  

Defines who gets invited to events of a given type. Chapters get a default rule per event type and may override per-event.

  

Field: rule\_id | Type: UUID | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: Rules are per-chapter.

Field: event\_type | Type: String (FK to EventTypeCatalog.code) | Required: Yes

Field: rule\_name | Type: String | Required: Yes | Notes: e.g. "Dallas default Learning eligibility" or "Fort Worth EOA-track restricted".

Field: include\_membership\_statuses | Type: Array\<Enum\> | Required: Yes | Notes: Subset of Active | Grace Period | Lapsed | Alumni | Prospect. Default: \["Active"\].

Field: include\_board\_roles | Type: Array\<String\> | Required: No | Notes: When set, only members with `board_role_current` in this list are eligible. Null = no role restriction.

Field: include\_forum\_ids | Type: Array\<UUID\> | Required: No | Notes: When set, only members in these forums are eligible. Used for ForumMeeting events.

Field: include\_eoa\_track | Type: Boolean | Required: No | Notes: When true, only EOA-track members (eoa\_member = true) are eligible.

Field: include\_sap\_opted\_in | Type: Boolean | Required: No | Notes: When true, only members opted into SAP engagement are eligible.

Field: include\_committee\_memberships | Type: Array\<String\> | Required: No | Notes: When set, only members with these committee memberships are eligible.

Field: spouse\_inclusive | Type: Boolean | Required: Yes | Notes: When true, the auto-invite engine sends a parallel invite to slp\_email if present (§3.8). Default true for SLP and family-inclusive Social events; default false for everything else.

Field: cross\_chapter\_scope | Type: Enum | Required: No | Notes: SingleChapter | SameRegion | Specified | Global. Default: SingleChapter. Used for Regional and Global event types.

Field: cross\_chapter\_ids | Type: Array\<UUID\> | Required: No | Notes: When cross\_chapter\_scope = Specified, the list of chapter\_ids whose members are eligible.

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes

  

The eligibility engine evaluates these rules in order: status filter → role filter → forum filter → eoa filter → sap filter → committee filter → cross-chapter filter. A member meeting all applicable filters is eligible. Spouse inclusion is evaluated separately for invite dispatch (it does not affect member eligibility, only whether slp\_email also receives the invite).

  
  

4.11 EventInvite \[NEW v1.2\]

  

Per-member, per-event invite record. Source of engagement signals (§3.15).

  

Field: invite\_id | Type: UUID | Required: Yes

Field: event\_id | Type: UUID (FK) | Required: Yes

Field: member\_id | Type: UUID (FK) | Required: Yes

Field: chapter\_id | Type: UUID (FK) | Required: Yes | Notes: Denormalised from event for query performance and RLS.

Field: invite\_sent\_at | Type: DateTime | Required: No | Notes: When the invite was dispatched. Null while Pending.

Field: invite\_sent\_to\_email | Type: String | Required: No | Notes: The exact email used (member's calendar\_email or fallback to email\_primary). Logged for debugging delivery failures.

Field: invite\_sent\_to\_spouse | Type: Boolean | Required: Yes | Notes: True if a parallel invite was sent to slp\_email. Default false.

Field: ical\_uid | Type: String | Required: No | Notes: iCal UID used in the .ics attachment. Required for sending updates/cancellations consistent with the original invite.

Field: external\_calendar\_event\_id | Type: String | Required: No | Notes: Provider-specific calendar event ID (Phase 2 — Google/Outlook native sync).

Field: status | Type: Enum | Required: Yes | Notes: Pending | Sent | Accepted | Declined | Tentative | NoResponse | Revoked | Bounced | NoShow. NoShow is set after the event if the member accepted but attendance was not confirmed.

Field: rsvp\_received\_at | Type: DateTime | Required: No | Notes: When the RSVP was captured (via iCal reply, Google/Outlook API, or manual).

Field: attendance\_confirmed | Type: Boolean | Required: No | Notes: True if attendance was confirmed (QR check-in, manual import, or CRM attendance sync).

Field: attendance\_source | Type: Enum | Required: No | Notes: QRCheckin | ManualImport | HubSpotSync | GoHighLevelSync | GoogleSheetsImport | None.

Field: revoked\_at | Type: DateTime | Required: No | Notes: When the invite was revoked (member became Lapsed, event cancelled, member opted out).

Field: revoked\_reason | Type: Enum | Required: No | Notes: MemberLapsed | MemberAlumni | EventCancelled | MemberOptOut | AdminRevoked.

Field: created\_at | Type: DateTime | Required: Yes

Field: updated\_at | Type: DateTime | Required: Yes

  

Lifecycle: created as Pending when the eligibility engine matches the member to the event. Moved to Sent when the invite is dispatched. Updated to Accepted/Declined/Tentative on RSVP. Set to NoShow if accepted but attendance\_confirmed is false 24h after event end. Set to Revoked if member status changes or event is cancelled.

  
  

5\. INTEGRATION ARCHITECTURE

  
  

5.1 HubSpot Connector (Dallas pilot)

  

Phase 1 — Read Only: Pull contacts and attendance every 4 hours. Map HubSpot fields to Trifecta schema at the boundary. Store hubspot\_contact\_id as secondary reference. Do not write back. This is the primary CRM connector for chapters on HubSpot (EO Dallas in Phase 1).

  

Phase 2 — Write Outcomes: When a board member logs an action outcome, write a timestamped note back to the HubSpot contact record to keep both systems consistent.

  

Phase 2 — Write Renewal Intent: When a member's renewal\_intent\_response is set (via survey response), write the response value back to a mapped HubSpot contact property. See Section 11.2 for the HubSpot-specific survey integration path.

  

Phase 4 — Deactivate (optional): For chapters migrating off HubSpot, run the migration tool, then disable the connector. No business logic changes.

  

Never store HubSpot field names (e.g. hs\_lead\_status) in business logic. Map to Trifecta enums at the connector boundary.

  
  

5.2 Go High Level Connector (Fort Worth pilot) \[NEW v1.2\]

  

Phase 1 — Read Only: Pull contacts, opportunities/pipelines, and tag-based engagement signals from Go High Level every 4 hours. Map Go High Level fields to Trifecta schema at the connector boundary. Store the Go High Level contact ID as a secondary reference field on Member (parallel to hubspot\_contact\_id). Do not write back in Phase 1.

  

Phase 2 — Write Outcomes: Same pattern as HubSpot — when a board member logs an action outcome via Trifecta, post a note back to the Go High Level contact to keep both systems consistent.

  

Phase 2 — Write Renewal Intent: For Fort Worth, write renewal\_intent\_response back to a Go High Level custom field on the contact (parallel to the HubSpot path in §11.2). The Tally-or-equivalent form must support webhook delivery to both HubSpot and Go High Level depending on the chapter.

  

Schema addition required (v1.2): Add `gohighlevel_contact_id` to the Member schema (§3.13) as a secondary reference field, indexed, nullable. Better: add a generalised `external_ids JSONB` column to Member (e.g. `{"hubspot": "...", "gohighlevel": "...", "pipedrive": "..."}`) so the schema doesn't require a migration for every new connector. Either approach is acceptable but the JSONB pattern is preferred for future connector additions (§5.6).

  

API specifics to verify (open question §10): rate limits, OAuth flow, webhook capability for real-time updates, custom field creation API, attendance-style event tracking equivalent.

  

Never store Go High Level field names in business logic. Map to Trifecta enums at the connector boundary, same rule as §5.1.

  
  

5.3 Google Sheets Connector

  

Read-only sync every 6 hours. Column-to-field mapping is configurable per chapter (admin sets during onboarding).

Conflict resolution: HubSpot wins if same field exists in both, unless chapter admin overrides.

Google Sheets API requires OAuth 2.0. Store tokens encrypted per chapter.

  
  

5.4 EO Global API Connector

  

Build the connector skeleton now. Activate when access is granted.

Join key: eo\_global\_member\_id. Pre-populate via manual import or email match before API access.

Expected signals: member directory, global event history, renewal dates, chapter transfers.

  
  

5.5 WhatsApp Connector

  

Phase 1 — Manual Input: Admin sets whatsapp\_activity\_level (High / Medium / Low / None) per member via admin UI. Unblocks the signal immediately.

  

Phase 1 Alt — Export Ingestion: WhatsApp group admins export chat history. Trifecta parses the export and computes per-member activity metrics.

  

Phase 3 — WhatsApp Business API: Implement via an approved Business Solution Provider (BSP). Ingest group signals via webhook. Compute activity levels automatically. Also used for delivering urgent alert notifications to board members (see Section 2.6).

  

Do not build a WhatsApp scraper or use unofficial APIs. Use Option A (manual) for Phase 1 and WhatsApp Business API for Phase 3.

  
  

5.6 Future Connector Roadmap \[NEW v1.2\]

  

The Ronnie call surfaced the following CRMs and trackers in active use across EO chapters she manages or interacts with. These are not Phase 1 deliverables. They are stubs in the connector registry so the build-order conversation is explicit and prioritisation isn't ad-hoc when a new pilot chapter signs on.

  

\- Pipedrive Connector: Used by multiple smaller chapters historically. API is mature, OAuth-based. Implement when the first Pipedrive chapter is signed on.

\- Bloom Connector: Used by some chapters (per Ronnie). API documentation and capability to be researched before commitment.

\- 90io Connector: Used by some chapters (per Ronnie). API documentation and capability to be researched before commitment.

\- EO Global Board Tracker Connector: Distinct from the EO Global member API (§5.4). The board tracker is a separate Global system where boards record annual board action items, which Ronnie reports is "filled out once and never revisited." Trifecta's BoardActionItem entity (§4.5) supersedes this in the user's daily workflow but a connector to read existing board tracker entries would smooth onboarding for chapters with historical data there.

  

All future connectors satisfy the same DataSource interface as §5.1 and §5.2. No business logic changes are required to add any of them — only the connector module itself plus a per-chapter config entry.

  
  

5.7 Calendar Integration \[NEW v1.2\]

  

The Calendar Integration is structurally a "writer" connector — Trifecta dispatches invites out, then captures responses back. It does not pull external calendar data into the Member schema (that would be a privacy expansion outside Phase 1 scope). It only manages invites Trifecta itself sent.

  

Phase 1 — iCal Universal Dispatch:

  

\- Auto-Invite Engine: on event create, evaluate the EventEligibilityRule (§4.10) against the chapter's member roster. For each matched member, create an EventInvite row with status = Pending. The engine then generates a per-member .ics file (with stable iCal UID for future updates) and an HTML email containing the iCal as an attachment. Emails dispatch via the chapter's configured outbound provider (SendGrid or SES). Status moves to Sent on successful dispatch.

\- RSVP Capture (iCal): when a recipient replies via their email client, an iCal REPLY message returns to a dedicated inbound address (e.g. invites+\<invite\_id\>@chapter.trifecta.example). Trifecta parses the reply, updates EventInvite.status to Accepted / Declined / Tentative, and records rsvp\_received\_at.

\- Lifecycle Hooks: subscribe to member status change events (Active → Lapsed/Alumni) and member create events. On member creation, run the eligibility engine across all future Scheduled events for the chapter and create Pending invites for matches. On member status leaving Active, find all future EventInvites for the member, set status to Revoked with revoked\_reason = MemberLapsed or MemberAlumni, and dispatch iCal CANCEL messages for each.

\- Event Update / Cancel: when an Event row is updated (datetime change, location change) or cancelled, dispatch iCal updates or CANCEL messages for all non-Revoked invites using the original iCal UID.

\- Personalised Invite Messaging: the LLM (Anthropic Claude API) generates a per-member personalised invite intro using their name, tenure, recent attendance pattern, and sponsor relationship — appended above the standard event body in the HTML email. Falls back to a generic template if the LLM is unavailable.

  

Phase 2 — Native Calendar API:

  

\- Google Calendar API: members with calendar\_provider = Google can authorise a Google Calendar integration. Trifecta creates events directly in their calendar (cleaner UX than .ics attachment, more reliable RSVP capture, supports event update propagation). Store the Google calendar event ID in EventInvite.external\_calendar\_event\_id.

\- Microsoft Graph / Outlook: same pattern for Outlook users. calendar\_provider = Outlook.

\- Bidirectional RSVP: when a member changes their RSVP in their calendar app, the provider API webhooks Trifecta and EventInvite.status updates automatically. Significantly higher RSVP capture rate than iCal-only.

\- Attendance Confirmation: in Phase 2, integrate with HubSpot and Go High Level attendance tracking — when one of those connectors reports attendance for a member at an event, Trifecta sets EventInvite.attendance\_confirmed = true and attendance\_source accordingly. NoShow detection (24h after event end, status = Accepted, attendance\_confirmed = false) triggers a churn-risk signal increase.

  

Phase 3 — Calendar Provider Optimisations:

  

\- Native calendar push notifications via FCM/APNS for urgent event updates.

\- Capacity-aware waitlist promotion: when capacity is reached and a member declines, automatically promote the next waitlisted member to Pending → Sent.

\- Cross-chapter discovery: members can opt into seeing Regional / Global event invitations from chapters they don't belong to (e.g. an EO Dallas member receiving an EO Houston regional event invite if both chapters opt in).

  

Privacy guardrails: Trifecta never reads members' general calendar data — only events Trifecta itself created. Member calendar credentials (if granted in Phase 2) are scoped to a dedicated calendar (e.g. "EO Dallas Events") within the member's provider account, not their primary calendar.

  
  

6\. PHASED BUILD PLAN

  

Do not begin Phase 2 until Phase 1 is stable with live data. Each phase is deliberately scoped to allow validation before increasing investment.

  
  

PHASE 1: DATA AGGREGATION LAYER

Prove the pipeline. Get all signals into one place.

  

Goal: Working data pipeline pulling from HubSpot and Google Sheets, normalised into the Trifecta Member schema, with computed engagement scores and a ranked at-risk list the ED can review.

  

Success criteria: EO Dallas's full member roster is in Trifecta, auto-updated, with engagement scores that the ED agrees reflect reality.

  

Phase 1 Deliverables:

  

\- Database \[UPDATED v1.2\]: Full Member, Chapter, ChapterConfig, Forum, BoardAction, BoardActionItem, Users, UserChapterRoles schemas. Multi-tenancy enforced from day one. Renewal intent fields on Member schema included (populated later). `external_ids` JSONB column on Member to hold per-connector contact IDs (preferred over single-purpose columns — see §5.2). Auth decoupled from Chapter (§4.7) — `user_chapter_roles` supports multi-chapter users from day one. RLS policies read `user_chapter_roles` to determine access set.

\- HubSpot Connector: Read-only contact and attendance sync every 4 hours. hubspot\_contact\_id stored in Member.external\_ids. Used by EO Dallas.

\- Go High Level Connector \[NEW Phase 1 deliverable in v1.2\]: Read-only contact and engagement-tag sync every 4 hours. gohighlevel\_contact\_id stored in Member.external\_ids. Used by EO Fort Worth. This is a Phase 1 deliverable because Fort Worth is a Phase 1 pilot chapter — there is no Phase 1 without it.

\- Google Sheets Connector: Configurable column-mapping. Read-only sync every 6 hours. Conflict resolution defaults to the active CRM connector (HubSpot for Dallas, Go High Level for Fort Worth) per `chapter_config`.

\- Manual WhatsApp Input: Simple admin UI to set activity level per member.

\- Engagement Scoring Engine \[UPDATED v1.2\]: Composite score from: forum attendance rate, local event attendance, SLP engagement, spouse program attendance, WhatsApp activity, SAP interactions, global event history, days since last engagement. Per-chapter signal weights read from `chapter_config.engagement_weights` (§2.7 and §4.4). Range: 0-100. Compute churn\_risk\_tier from score band.

\- Board Action Item Tracker \[NEW v1.2\]: Minimal admin UI for board members and the ED to log meeting action items, assign them, and see status. Open and Stale items surface in the weekly digest (§2.6). This is the persistent-memory layer (§2.8) and the direct response to the Ronnie-call observation that board action items have no follow-up loop in any current system.

\- Regional Operator Multi-Chapter View \[NEW v1.2 — moved into Phase 1\]: A user with `RegionalOperator` role across multiple chapters logs in and lands on a roll-up dashboard showing one row per chapter (at-risk counts by tier, renewal pipeline status, open board action items, last sync timestamps). Click-through to any chapter's standard board view. Read-only by default; can be granted write access per chapter via `user_chapter_roles`. Primary user: Ronnie. Required for Phase 1 because (a) auth model is not cleanly retrofittable, (b) Ronnie's intro conversations with Cheryl, Kim, and her broader network depend on her experiencing the product as a multi-chapter operator. See §2.9 and §4.7.

\- Event Calendar Engine \[NEW v1.2 — Phase 1\]: Full Event Calendar feature ships in Phase 1. Includes: (a) Event creation UI for board members and EDs; (b) EventEligibilityRule editor with per-event-type defaults; (c) auto-invite engine that dispatches iCal invites on event creation; (d) lifecycle hooks that send invites to new members for all applicable future events, and revoke invites when members go Lapsed/Alumni; (e) iCal REPLY parsing for RSVP capture; (f) per-event invite status view; (g) LLM-generated personalised invite messaging; (h) spouse-inclusive invites where event eligibility rule and slp\_email allow. See §2.10 and §5.7. This is the strongest standalone-value wedge in the product and the primary entry point Ronnie's network introductions will see first.

\- At-Risk Report: Ranked list by churn risk tier, delivered to the ED by email digest on a configurable schedule (default: Monday 8am local time). No portal login required.

\- Admin Interface: Minimal web UI for connector config, ChapterConfig setup (approval workflow, revenue verification, engagement weights), WhatsApp level input, member record view, at-risk list review, action outcome logging, and board action item management.

\- Auth: Secure login. Roles: Admin (full access) and Board Member (read + log actions + manage their own assigned action items).

  
  

PHASE 2: INTELLIGENCE LAYER

Make Trifecta the board's advisor, not just a reporter.

  

Goal: Transform the at-risk list into role-specific, actionable intelligence pushed to each board member. The Membership Chair gets different output than the Forum Officer. Each recommendation includes context, talking points, and a suggested action.

  

Success criteria: Board members take actions they attribute to Trifecta's recommendations. The ED can answer 'who should I call this week and why' using only what Trifecta delivers.

  

Phase 2 Deliverables:

  

\- Board Role Profiles \[EXPANDED v1.2\]: Intelligence scope per board seat. Catalog roles defined in §4.6 — President, President-Elect, Past President, Treasurer/VP Finance, Membership Chair, Forum Officer, Events Chair, Learning Chair, Communications Chair, SAP Chair, GSEA Chair, Governance Chair, Accelerator Chair, Mentorship Chair, SLP Chair, Executive Director. Each role receives a role-tailored weekly digest: which members to focus on, which signals matter most for this role's decisions, and what action language to use. GSEA Chair sees Accelerator/student-entrepreneur signals prioritised; Governance Chair sees board action item completeness and board-member tenure rotation; SAP Chair sees partner-engagement signals (§3.10) prioritised; Mentorship Chair sees new-member onboarding completion and mentor-meeting cadence. The Regional Operator role (§4.7) sees a cross-chapter roll-up rather than role-tailored intelligence.

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

  

\[v1.2 Phase 1 Implementation Note — added 2026-05-26\]

  

The Phase 1 build deliberately swaps this section's recommendations for a Next.js 14 (App Router) + Supabase (Postgres + Auth + RLS + Vault) + Vercel (hosting + Cron) + Resend (email) stack. The Claude API model behind the LLMProvider interface is `claude-sonnet-4-6`. See `docs/Trifecta_Phase1_BuildPlan_for_Imran.md` for the full week-by-week build plan and the `trifecta-stack-rationale` memory for the why.

  

Rationale in one paragraph: the Phase 1 builder (Imran Karim) is a non-technical founder using Claude Code as his developer. The recommendations below assume a professional Node.js dev shop. Express + raw Postgres + custom JWT + Render + BullMQ multiplies the ops surface area in a way that is unsustainable for a solo non-technical operator. The substituted stack collapses that surface (auth + database + RLS bundled in Supabase; deploy + cron bundled in Vercel; transactional email in Resend) without compromising any §8 non-negotiable. Every Trifecta UUID, every `eo_global_member_id`, every `chapter_id` on every table, the DataSource and LLMProvider abstractions, multi-chapter `user_chapter_roles`, encrypted credentials, scoring engine unit tests, the Event Calendar engine (§2.10), the auto-invite lifecycle hooks (§5.7) — all preserved and shipping on the Phase 1 stack.

  

Migration safety: nothing in the data model, scoring engine, connector interfaces, or LLM abstraction is Supabase-specific. If a chapter or operator later hires a professional Node.js team for Phase 2+ scale, the recommendations below describe the target architecture, and the existing Phase 1 codebase ports cleanly.

  

The recommendations below remain valid as the reference architecture. Read them as "what the system would look like at multi-chapter Phase 3 scale with a professional team," not "what Phase 1 ships on."

  
  

  
  

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

Constraint \[NEW v1.2\]: Phase 1 ships with two live CRM connectors (HubSpot + Go High Level) | Why: Fort Worth is a Phase 1 pilot chapter and does not use HubSpot. A HubSpot-only Phase 1 fails one of two pilots. This also forces the DataSource abstraction to prove itself before single-tool habits set in.

Constraint \[NEW v1.2\]: Chapter-level processes are configurable, not hardcoded | Why: Member approval workflow, revenue verification, and engagement signal weighting vary across chapters. Hardcoding any of these blocks a pilot chapter from going live (§2.7 and §4.4 ChapterConfig).

Constraint \[NEW v1.2\]: Connector swap is a first-class data-migration operation | Why: Board turnover routinely triggers CRM swaps (Fort Worth: Pipedrive → HubSpot → Go High Level over 3 years). Trifecta's value is being the layer that persists across these changes; the system must support connector swap without data loss in engagement history or board action items (§2.8).

Constraint \[NEW v1.2\]: Renewal intent survey delivery uses per-member preferred channel | Why: Ronnie validated that members must be reached on the channel they actually use. Default delivery channel is email but the system must respect each member's `preferred_channel` (§11.2 updated).

Constraint \[NEW v1.2\]: Auth is decoupled from Chapter; users can hold roles across multiple chapters | Why: Regional operators like Ronnie need a single login covering ~15 chapters. Retrofitting the auth model after production users exist requires a risky data migration. Build `users` + `user_chapter_roles` from day one (§4.7).

Constraint \[NEW v1.2\]: Board role catalog includes GSEA Chair and Governance Chair as first-class | Why: LLM intelligence tailoring relies on the role catalog. Without GSEA and Governance in the catalog (§4.6), those board members receive generic output and the product feels half-built to anyone holding those roles. The full catalog is the v1.2 baseline.

Constraint \[NEW v1.2\]: Event invitations always respect per-member opt-outs and per-event-type eligibility rules | Why: A member who is invited to an event they're not eligible for, or one they explicitly opted out of, instantly damages chapter trust in the system. The auto-invite engine must read `members.event_type_opt_outs` and the EventEligibilityRule (§4.10) on every dispatch — no exceptions, no overrides without explicit admin justification logged. The wedge value (§2.10) depends on the invites being correct and welcome, not noisy.

  
  

9\. RECOMMENDED FIRST SPRINT (WEEKS 1–2)

  

By end of Week 2, the product owner (Imran) should be able to see a live EO Dallas member list and at-risk ranking in a staging environment.

  

1\. Set up the database and run the full schema migration. All tables, all fields, all indexes. Confirm multi-tenancy with a test query. Include all renewal intent fields — null for now.

2\. Build the DataSource interface and HubSpot connector skeleton. Connect to EO Dallas's HubSpot instance, pull the first batch of contacts, print the raw response. Do not transform yet.

3\. Write the HubSpot-to-Trifecta field mapping. Map every HubSpot field used by Dallas to the Trifecta Member schema. Document unmapped fields. Flag any without a clean home.

4\. Load EO Dallas members into the database. Run the first real sync. Verify record count matches HubSpot. Verify hubspot\_contact\_id is stored and indexed.

5\. Build and run the scoring engine on the first real dataset. Output a CSV of members ranked by churn risk. Share with Imran for gut-check against known at-risk members.

6\. Build the Google Sheets connector. Pull Dallas forum tracking data. Map columns using the configurable approach.

7\. Deploy to staging. Live member list and at-risk ranking visible to Imran by end of Week 2.

  

\[v1.2 addendum\] The original first-sprint plan above stays valid for the Dallas pipeline. Add the following Go High Level parallel-track items, ideally targeted for Weeks 3–4 (Sprint 2) so the Dallas pipeline can settle before Fort Worth-specific work begins:

  

\- 2b. Stand up the `external_ids` JSONB column on Member (§5.2). Migrate `hubspot_contact_id` data into it under the `hubspot` key. Keep the legacy column with the comment "deprecated v1.2 — use external\_ids.hubspot" until v1.3.

\- 2c. Stand up the ChapterConfig table (§4.4) and seed default rows for Dallas and Fort Worth. Set Dallas approval\_workflow = BoardVote, Fort Worth approval\_workflow = TBD pending Cheryl intro.

\- 2d. Stand up the BoardActionItem table (§4.5). No UI yet — schema only.

\- 6b. Build the Go High Level connector skeleton against the Fort Worth instance. Same shape as the HubSpot connector. Pull the first batch of contacts, print raw response, do not transform yet.

\- 6c. Write the Go High Level → Trifecta field mapping. Document any signals Go High Level doesn't expose that HubSpot does (and vice versa) — these become Google Sheets responsibilities in Fort Worth.

  
  

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

\- What is the preferred sending channel for the April intent survey message to members — email, WhatsApp, or both? Note: WhatsApp Business API is Phase 3; Phase 2 survey outreach via email is the default. \[v1.2 update: confirm with each chapter at onboarding; respect per-member `preferred_channel` overrides.\]

  

Added in v1.2 (from Ronnie / Fort Worth call):

\- Go High Level API: what are the rate limits, OAuth scopes required, webhook capabilities, and custom field creation API? Needed before Fort Worth Phase 1 build can be scoped accurately. Action: Cheryl Gillian intro (pending via Ronnie) should surface a Go High Level admin contact at Fort Worth.

\- What attendance-tracking equivalent does Go High Level offer compared to HubSpot's events object? May require importing attendance via Google Sheets as the canonical source for Fort Worth in Phase 1.

\- Cheryl Gillian (Fort Worth member engagement chair): what tracking spreadsheets or processes does she currently maintain? Treat as a peer of the Dallas Rob/Prince Google Sheets question.

\- Kim (Colorado, forum management system developer): scope of her tool, data model, integration potential. Trifecta + Kim's tool: complementary, integrable, or overlapping? Decide before building any forum-specific module beyond §3.6.

\- Board Whisperer (Ronnie's weekly check-in tool): collaboration mode (integration / referral) vs. competition mode (Trifecta's BoardActionItem and weekly digest overlap with the Board Whisperer scope). Decide before formal Phase 2 product positioning.

\- PropFuel (built by an EO Boston member, used by some chapters for renewal surveys): full competitive teardown. Are they direct competition in the renewal intent space, or complementary? Does Trifecta integrate their data as a source, replace them as a renewal survey tool, or coexist?

\- For each chapter onboarded: the ChapterConfig (§4.4) values — approval workflow, revenue verification policy, engagement weights, spouse program active y/n. These must be captured at onboarding and reviewed annually.

  

Added in v1.2 (Event Calendar feature, §2.10 / §4.8–§4.11 / §5.7):

\- Outbound email provider: SendGrid vs. SES vs. chapter SMTP. Affects deliverability and iCal REPLY routing. Per-chapter configurable or platform-wide?

\- Inbound RSVP routing: dedicated subdomain (invites.trifecta.example), plus-addressing (invites+\<invite\_id\>@), or per-chapter inbound address? Affects DNS setup and bounce handling.

\- Attendance confirmation in Phase 1: QR check-in app, manual import from chapter sign-in sheets, or rely entirely on Phase 2 HubSpot/Go High Level attendance sync? Without attendance confirmation, the NoShow signal does not fire — and that's the highest-leverage churn signal.

\- Event template library: do chapters want a starter set of common EO event templates (monthly forum, board meeting, GSEA local round, etc.) pre-populated at onboarding?

\- Recurring event editing semantics: when a recurring event's master is edited, should existing invites for past-or-current instances be left alone (default iCal behavior) or also updated? Default to standard iCal semantics unless a chapter requests otherwise.

\- For Dallas pilot: who from the Dallas board will own the event calendar setup in the first 30 days? Need a single owner to seed the EventTypeCatalog mappings and EventEligibilityRule defaults.

  
  

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

  

Delivery \[UPDATED v1.2\]: Phase 2 default is email. The personalised message is generated by the LLM and sent from the ED's email address (or a chapter address, per admin config). Delivery must respect each member's `preferred_channel` (§3.1) — Ronnie's call confirmed that members must be reached on the channel they actually use, and renewal intent is a high-stakes outreach where channel mismatch directly costs response rate. Email is the default fallback if `preferred_channel` is null or set to a channel not yet available (e.g. WhatsApp before the Business API ships in Phase 3). The send path logs the chosen channel and the reason if the chosen channel was a fallback.

  

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

  
  

12\. COMPETITIVE LANDSCAPE \[NEW v1.2\]

  

The Ronnie call expanded the picture of what exists in adjacent or overlapping spaces. The principle for positioning: Trifecta's moat is the cross-platform intelligence layer and the persistence through leadership turnover (§2.8). Any tool that solves one slice (renewal surveys, board check-ins, forum management) is potentially a partner, a data source, or a feature Trifecta absorbs over time — not a head-on competitor at the system level.

  

12.1 ChapterPro

  

A passive member portal used by some EO chapters (Houston, Columbus, Atlanta, Hong Kong per prior research). Approximately $5,500/year per chapter. EO Global handles most of what ChapterPro provides for EO chapters, so the structural need is lower than at YPO chapters. Trifecta is not directly competitive — ChapterPro is a portal, Trifecta is a predictive intelligence + outreach layer. Coexist; integrate read-only if a pilot chapter uses ChapterPro.

  

12.2 PropFuel

  

Built by an EO Boston member; used by some chapters for renewal surveys. Direct overlap with the Phase 2 Renewal Intent Survey (§11). Open question (§10): full competitive teardown before further investment in the renewal survey path. Likely positioning options: (a) integrate PropFuel as a data source for chapters already using it; (b) compete directly with a tighter integration into Trifecta's scoring engine; (c) co-market if the EO Boston relationship can be activated. Decide before April 2027 renewal cycle.

  

12.3 Board Whisperer (Ronnie's tool)

  

Ronnie is building Board Whisperer for weekly board member check-ins. Direct overlap with Trifecta's weekly digest (§2.6) and BoardActionItem tracking (§4.5). The Ronnie call explicitly raised "potential collaboration." Recommended posture: complement, not compete. Concretely: position Trifecta as the data + member-retention engine and Board Whisperer as the board-dynamics + chair-coaching layer; share data via webhook or shared store; surface each other's outputs in the right contexts. Resolve in the next conversation with Ronnie before either tool is positioned publicly to multi-chapter audiences.

  

12.4 Kim's Forum Management System (Colorado)

  

Early-stage tool by Kim at EO Colorado for forum management specifically. Ronnie offered to make the introduction. Forum is a single critical signal in Trifecta (§3.6) — Trifecta does not aim to be a forum management platform. Likely positioning: complementary, with Kim's tool as a candidate Phase 3+ data source for forum-specific signals beyond attendance (meeting health, discussion topics, action items per forum).

  

12.5 Manual Use of Claude or ChatGPT by EDs

  

Some EDs (including Jon at Dallas) already manually prompt LLMs against their HubSpot exports to surface at-risk members. This is the lowest-cost competitor: an ED with prompting skill and HubSpot access can produce a weaker version of Trifecta's at-risk list manually. Within 18 months this manual capability will improve. Trifecta's defence is the cross-platform completeness (HubSpot is one source of many — see §1.2), the persistence layer (§2.8), and the role-specific delivery (§2.6).

  
  

— End of Document —

  

Version 1.2 | May 2026 | CONFIDENTIAL DRAFT

Changes from v1.1: Pilot context rewritten (§1.3) to reflect Fort Worth on Go High Level. Added §2.7 Chapter Process Variance, §2.8 Persistence Through Leadership Change, §2.9 Multi-Chapter Admin View, and §2.10 Event-Driven Engagement as architectural principles. Promoted SAP signal to first-class (§3.10). Added §3.14 Spouse Program Participation and §3.15 Event Engagement Signals. Added calendar fields to §3.1 (calendar\_email, calendar\_provider, event\_type\_opt\_outs) and spouse contact fields to §3.8 (slp\_first\_name, slp\_last\_name, slp\_email). Added §4.4 ChapterConfig, §4.5 BoardActionItem, §4.6 BoardRoleCatalog (includes GSEA, Governance, and Mentorship), §4.7 UserChapterRole (auth decoupled from chapter; supports multi-chapter users), §4.8 Event, §4.9 EventTypeCatalog, §4.10 EventEligibilityRule, and §4.11 EventInvite. Reorganised §5 — added Go High Level as Phase 1 connector (§5.2), renumbered subsequent sections, added §5.6 Future Connector Roadmap and §5.7 Calendar Integration. Updated Phase 1 Deliverables (§6) including Regional Operator multi-chapter view and Event Calendar Engine as Phase 1. Expanded Phase 2 Board Role Profiles to use the full §4.6 catalog. Added eight non-negotiable constraints (§8). Added Ronnie-call and calendar-feature open questions (§10). Updated §11.2 renewal intent delivery to respect per-member preferred channel. Added §12 Competitive Landscape.

  

Changes from v1.0: Communication channel defaults specified (Section 2.6). digest\_channel and urgent\_channel fields added to Member schema (Section 3.1). Renewal intent fields added to Member schema (Section 3.2). HubSpot write-back updated for renewal intent (Section 5.1). Phase 2 and Phase 4 deliverables updated. Non-negotiable constraints updated (Section 8). Open Questions updated (Section 10). Section 11 (Renewals Intelligence Pipeline) added in full.

  