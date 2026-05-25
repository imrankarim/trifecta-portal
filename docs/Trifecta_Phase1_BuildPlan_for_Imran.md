# Project Trifecta — Phase 1 Build Plan

**Author:** Drafted for Imran Karim, founder
**Audience:** A non-technical founder building Phase 1 himself using Claude Code
**Based on:** Trifecta Developer Specification v1.1 (May 2026)
**Timeframe:** ~4 weeks to a working, demo-able v1 with EO Dallas data

---

## What this plan is, and what it isn't

This is the version of your spec rewritten for *you* to execute, not for a hired developer. It honors every non-negotiable architectural constraint in v1.1 (the things that would be expensive to undo later), but it makes pragmatic stack choices that a non-technical founder can actually stand up alone with Claude Code.

It is deliberately scoped smaller than the v1.1 "Phase 1 Deliverables." Trying to land the full Phase 1 in one shot is how non-technical founders get stuck halfway through a half-built system with no clean place to stop. Instead, you'll ship something working at the end of *every week*. If you need to stop early — say, because you decide to hire that Vietnam developer after all — you'll stop with a working system, not rubble.

---

## The mindset shift you need first

You've built and scaled companies. You've hired teams, run sales, run marketing. The mental model for *those* tasks is "describe the goal, delegate to a human, review their work." Building with Claude Code is similar but with two important differences:

1. **You are now the product owner *and* the QA.** Claude Code will write the code. It will not decide whether the code does the right thing — you will, by testing it. Plan to spend 60–70% of your build time *using* what's been built, not directing what to build next.
2. **There is no "almost working."** A button either works or it doesn't. A sync job either ran or it didn't. Don't accept "looks right" — accept "I clicked it and saw the result I expected."

If you keep those two things in mind, the rest is recipe.

---

## The stack (a small variation from v1.1, and why)

Your v1.1 spec assumes a professional Node.js shop. For a non-technical founder operating solo with Claude Code, I'm recommending a near-identical stack with one swap that dramatically reduces the operational burden:

| Component | v1.1 spec says | This plan uses | Why the swap |
|---|---|---|---|
| Language | TypeScript on Node.js | TypeScript on Node.js (Next.js) | Same. |
| Framework | Express or Fastify | **Next.js (App Router)** | Combines frontend + backend in one project. One thing to deploy, one thing to debug. |
| Database | PostgreSQL + RLS | PostgreSQL + RLS via **Supabase** | Supabase *is* Postgres with RLS, plus a web UI where you can see your data without writing SQL. Honors every schema constraint in v1.1. |
| Auth | JWT email+password from scratch | **Supabase Auth** | Spec allows "no third-party auth service required in Phase 1" but doesn't forbid one. Building JWT auth from scratch is a week-long detour you don't need. |
| Hosting | Render.com | **Vercel** | Native to Next.js. Free tier through Phase 1. One click to deploy. |
| Job queue | BullMQ | **Vercel Cron + Supabase Edge Functions** | You don't have BullMQ-scale load in Phase 1. Cron is fine. Easy to upgrade later. |
| Secrets | Doppler / Render env | Vercel + Supabase env vars | Built into both platforms. |
| LLM | Claude Sonnet 4.6 | Claude Sonnet 4.6 (same) | Behind the LLMProvider abstraction per spec. |
| Email | Not specified | **Resend** | Cheap, dev-friendly, one API call to send the digest. |

**Every Section 8 "Non-Negotiable Constraint" in your spec is still honored** by this stack: Trifecta UUID PKs, `eo_global_member_id` on the schema from day one, `chapter_id` on every table, DataSource and LLMProvider abstractions, RLS for chapter isolation, encrypted credentials at rest (Supabase handles this), unit tests on the scoring engine. If you later hire a developer who wants to migrate to Render + raw Postgres + custom auth, nothing in the data model or business logic needs to change.

---

## What you'll need before Week 1 (~half a day of setup)

You don't write code in this phase. You create accounts and connect them. Claude Code can help with all of this — open a chat and paste each step.

1. **Install Claude Code on your computer** (claude.ai/code) and verify it runs.
2. **Create accounts** — all free tiers are fine for Phase 1:
   - GitHub (you probably already have one)
   - Supabase (supabase.com)
   - Vercel (vercel.com — sign in with GitHub)
   - Anthropic API console (console.anthropic.com — to get a Claude API key)
   - Resend (resend.com — for sending emails)
3. **Create a new private GitHub repository** called `trifecta` (or whatever you like). Don't initialize it yet — Claude Code will populate it.
4. **Create a new Supabase project** called `trifecta-staging`. Note down the project URL and API keys when prompted.
5. **Create a new Vercel project** linked to your GitHub repo. It'll deploy nothing yet — that's fine.
6. **Have your HubSpot admin credentials handy** (for EO Dallas's HubSpot portal — coordinate with Joel Whitmer). You'll need to create a "Private App" with read access to Contacts. Don't do this yet — wait for Week 2.

That's it for setup. If any of these feel intimidating, open Claude Code and say: *"Walk me through creating a new Supabase project, step by step. I'm a non-technical founder."* It will hold your hand.

---

## Week 1 — The Walking Skeleton

**Goal:** A real, deployed web app at a real URL. You can log in. You can see one screen that says "EO Dallas members" and shows a table of one row (yourself), pulled from a real database. Everything works end-to-end, even if it does almost nothing.

This week proves you can ship anything at all. Many founders stall here. Don't.

### What you ask Claude Code to do, in order:

1. **"Scaffold a new Next.js 14 (App Router, TypeScript) project in this directory. Use Tailwind for styling. Initialize a git repo and connect it to my GitHub remote."**

2. **"Add Supabase to the project. Create a `chapters` and `members` table that match every field in Sections 3 and 4.1 of `Trifecta_Developer_Specification_v1.1`. Use UUIDs as primary keys. Add `chapter_id` as a foreign key on `members`. Enable Row-Level Security on both tables so that users can only see members from their own chapter. Generate the SQL migration files in `/supabase/migrations` and apply them to the Supabase project."**

   → After this, log into your Supabase dashboard, click "Table Editor," and confirm you see both tables with all the fields. Add one row to `chapters` manually (EO Dallas). Add one row to `members` (yourself). This is your gut-check that the schema is correct.

3. **"Add Supabase Auth with email + password. Create a sign-in page. Create a `/dashboard` route that is protected and shows the current user's chapter name and a table of members in that chapter."**

   → Deploy to Vercel. Sign up with your email. Log in. See your one row.

4. **"Add a small admin section under `/admin` (visible only if the user has the `Admin` role) where I can manually add or edit a member."**

   → Add Jon Minjoe and 2–3 other EO Dallas members by hand. Verify they appear in the member list.

**End-of-week check:** You can visit `https://your-app.vercel.app`, log in, and see 4–5 EO Dallas members in a table. The data is real, in a real Postgres database, with multi-tenancy enforced. You took zero shortcuts on the schema.

**What you do daily this week:**
- Morning: open Claude Code, run the next step from the list above.
- After each step: actually click the thing. Verify the thing.
- If something doesn't work: paste the error back into Claude Code and say "this didn't work — what's happening?" It will diagnose. Don't try to debug it yourself.

---

## Week 2 — HubSpot Connector (Read-Only)

**Goal:** Run a sync job. EO Dallas's real HubSpot contacts appear in your members table with all the correct fields mapped.

### What you ask Claude Code to do:

1. **"Create a `DataSource` TypeScript interface matching Section 2.2 of the spec: `getMembers()`, `getAttendanceRecords()`, `getPipelineStages()`, `writeOutcome()`. Put it in `/src/lib/connectors/DataSource.ts`."**

2. **"Implement a `HubSpotConnector` class that satisfies the `DataSource` interface. It reads from the HubSpot Contacts API using a private app token. Store the token in a `chapters.data_sources_config` JSON column (encrypted via Supabase Vault). Map each HubSpot contact field to the corresponding Trifecta Member field per Section 3 of the spec. Crucially: store `hubspot_contact_id` as a *secondary* reference field on the Member row — never use it as the primary key."**

3. **"Create a HubSpot Private App for the EO Dallas portal."**
   → This is a *you* step, not a Claude step. In HubSpot: Settings → Integrations → Private Apps → Create. Grant `crm.objects.contacts.read` scope. Copy the token. Paste it into your Supabase `chapters` row for EO Dallas (manually, in the Table Editor).

4. **"Write a sync function in `/src/jobs/syncHubSpot.ts` that loops over all chapters with an active HubSpot connector, calls `getMembers()`, and upserts each member into the database (matched by `hubspot_contact_id`). Log the number of records synced."**

5. **"Add a manual 'Sync HubSpot' button on the `/admin` page that triggers this sync function. Show the result on screen."**

6. **"Once the manual button works, add a Vercel Cron job that runs the sync every 4 hours."**

7. **"Write unit tests for the field mapping logic. Mock the HubSpot API response. Verify every field per the spec maps to the right Member field."**

**End-of-week check:** Click "Sync HubSpot" on the admin page. Watch the member count jump from 4 to whatever EO Dallas's actual count is. Spot-check a few members against HubSpot — do the names, emails, companies, join dates match? If yes, your data pipeline works.

**Where you might get stuck:** HubSpot has a *lot* of contact properties, and many of them won't have a clean home in the Trifecta schema. Don't try to map all of them. Map the ones the spec calls out, leave the rest unmapped, and note them in a `unmapped_fields.md` file. You'll come back to it.

---

## Week 3 — Scoring Engine + At-Risk Email

**Goal:** Every Monday morning at 8am Central, you (and Jon, if he wants in) receive an email titled "EO Dallas — Top 10 At-Risk Members This Week" with a ranked list.

This is the moment Trifecta starts being *useful*, not just *built*.

### What you ask Claude Code to do:

1. **"Create a `scoring/engagementScore.ts` module with a pure function `computeEngagementScore(member): { score: number; tier: ChurnRiskTier }`. It implements the composite scoring described in Section 6 Phase 1 Deliverables and the Health Score Algorithm Specification. Inputs are the Member fields; output is 0–100 plus a tier. Weight forum attendance highest, then local events, then SLP, then WhatsApp, then global events. Make every weight a named constant at the top of the file so I can tune it without hunting through code. Include 8–10 unit tests covering edge cases (no data, all data, all-zeros, perfect engagement)."**

2. **"Create a scheduled function that runs nightly: for every active member in every chapter, compute their score, save `engagement_score_current`, `engagement_score_prev`, `engagement_trend`, and `churn_risk_tier` to the member record."**

3. **"Create an `EmailDigest` module that builds the weekly at-risk email. For each chapter, pick the top 10 members by churn risk score, format their names + tier + a one-line reason ('low forum attendance, no recent local event') into an HTML email. Send via Resend to the chapter's ED email."**

4. **"Add a Vercel Cron that runs this every Monday at 8am America/Chicago."**

5. **"Add a 'Preview Digest' button on `/admin` that renders what this Monday's email *would* look like, without sending it. So I can test without spamming."**

**End-of-week check:**
1. Click Preview Digest. Read the top-10 list. Do the rankings *feel* right?
2. Show the preview to Jon Minjoe. Ask: "Are these the right members? Anyone surprising? Anyone missing?" His gut is your scoring engine's calibration data.
3. Tweak the weight constants if needed. Re-run.
4. Send yourself the real Monday email.

**This is your validation moment.** If Jon nods at the list, you have a working product. If he frowns at it, you have data on what the scoring is missing — usually it's a signal you haven't ingested yet (WhatsApp, forum participation), which is the Phase 2 problem, not a broken algorithm.

---

## Week 4 — Polish, Demo, and Decide

**Goal:** Stable enough to demo to one more board member (Gail, Matt, or whoever you'd most want as a Phase 2 collaborator). Bug fixes from Jon's review. A clean enough product to either keep building or hand to a developer.

### What you ask Claude Code to do:

1. **"Build a Google Sheets connector implementing the same DataSource interface, scoped to read-only. Configurable column mapping per chapter, stored in `chapters.data_sources_config`. Sync every 6 hours."**

   → This unlocks the forum participation data, which Rob and Prince maintain in Sheets. That data should improve the scoring noticeably.

2. **"Add a simple `/members/[id]` page where I can see a single member's full record, their score history, and any notes."**

3. **"Add a manual 'whatsapp_activity_level' dropdown on the member edit page (High / Medium / Low / None) so I can backfill the WhatsApp signal manually for the 20 most at-risk members."**

4. **"Run a security review of the codebase. Confirm: no secrets in committed files, all chapter queries are filtered by `chapter_id`, RLS is enforced, OAuth tokens are encrypted at rest."**

   → Claude Code's `/security-review` slash command will do this automatically.

5. **"Write a one-page README explaining how to: deploy a change, view the database, trigger a manual sync, view the cron job logs. Save it to the repo root."**

   → This is your handoff document. If you do hire a Vietnam developer in week 5, this is what they read first.

### What you (the human) do this week:

- **Day 1–2:** Demo to Jon. Get his unfiltered reaction. Note what surprises him.
- **Day 3:** Apply the most important fix from Jon's feedback.
- **Day 4:** Demo to a second board member (your choice).
- **Day 5:** Decide.

---

## The decision at the end of Week 4

By Friday of Week 4, you'll be able to answer all seven of the recruiter's questions with real, evidence-backed answers. At that point, you have three live options:

**Option A: Keep building solo for another 4–6 weeks.** You're moving, Jon's seeing value, and you don't need a developer yet. Tackle Phase 2 — the LLM-generated talking points, the renewal intent survey — while building your own confidence and product judgment.

**Option B: Hire one part-time developer in Vietnam for ongoing maintenance and Phase 2.** You have a working v1, a real codebase, real bugs to point at, and a README. The developer onboards in days, not weeks, because the system already exists. Sourcing one good engineer for 20 hours a week is much cheaper and lower-risk than the multi-role team the recruiter was pricing.

**Option C: Pause.** Jon's reaction wasn't enthusiastic enough to justify continuing. You haven't burned money on a developer. You haven't lost months. You've spent ~30 days, learned an enormous amount about your own product, and produced a working artifact you can revive any time.

You couldn't have made this decision in good faith before Week 4. That's the point of doing it this way.

---

## What to avoid

A few specific traps that hit non-technical founders building with AI assistance:

1. **Don't let Claude Code run for hours unsupervised without checking its work.** Review each significant change. Run the thing.
2. **Don't accept "it should work now" — verify it works now.** Open the browser. Click the button. See the result.
3. **Don't skip the unit tests on the scoring engine.** This is the one piece of code where wrong-but-plausible output is worse than no output. Tests catch it.
4. **Don't add features that aren't in this plan.** Scope creep is the #1 reason non-technical founders' projects stall. If something new comes up, write it on a "Phase 2" list and keep moving.
5. **Don't deploy to a `production` URL with real EO data until Week 4.** Use staging only. The spec requires a staging environment; you're already doing the right thing.
6. **Don't try to mirror the v1.1 spec word-for-word in Phase 1.** It was written for a professional developer with months of runway. You are doing the founder version: prove the core, defer the polish.

---

## What to do right now (today)

1. Read this plan once more, end to end.
2. Open Claude Code on your computer.
3. Create the GitHub repo. Create the Supabase project. Create the Vercel project.
4. Open this file in Claude Code and say: *"Read this plan. We're starting Week 1, Step 1. Scaffold the project as described."*
5. Block ~2 hours a day on your calendar for the next four weeks. Mornings are best — your judgment is sharpest.

You're not learning to be a developer. You're directing a developer who happens to be an AI. That is something you already know how to do — you've directed humans your whole career. This is the same skill, applied to a new collaborator.

Good luck. I'll be here when you have questions.

---

*Drafted: May 25, 2026. Based on Trifecta Developer Specification v1.1.*
