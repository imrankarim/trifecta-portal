# ADR-005 — Separate `contact_type` (category) from `membership_status` (lifecycle)

**Status:** Accepted (2026-05-28)
**Owners:** Imran Karim (founder)
**Phase impact:** Phase 1 Week 2 (schema + UI + EO Dallas mapping config + sync filter); Phase 2+ (every chapter inherits this shape)
**Related:** [ADR-004 — Connector mapping as data](ADR-004-connector-mapping-as-data.md); [v1.1 §3.2 EO Membership fields](../Trifecta_Developer_Specification_v1.1.md)
**Supersedes:** none
**Implementation note (2026-05-28):** The transform was initially named `derive_from_signals`. After validating empirically that EO Dallas's HubSpot leaves `membership_status` empty for every contact (sanity check found 0 explicit Actives across 2,501 records), the same rule engine was reused to derive `membership_status` via a fallback chain — so the transform was renamed to `derive_from_signals` to reflect its general nature. References below use the current name.

---

## Context

Before this ADR, `members.membership_status` was a single enum jamming two orthogonal concerns into one field:

1. **Category** — *what kind of person is this row?* Member, paid staff (ED), spouse of a member, sponsor, etc.
2. **Lifecycle** — *what stage are they at within that category?* Active, Lapsed, Prospect, Alumni, On Leave, etc.

The original schema modelled only the lifecycle (Active / Grace Period / Lapsed / Alumni / Prospect). When we added the Trifecta-Dallas use case for paid staff (`Staff`) and spouses (`Spouse`) earlier in Phase 1, we extended `membership_status` with values that aren't really *statuses* — they're *categories*. This worked for one chapter and two non-member rows.

The real constraint surfaced when planning the EO Dallas HubSpot sync:

- The Membership Chair needs **prospective members** in Trifecta — they're the recruitment pipeline.
- The SAP Chair needs **current sponsors and prospective sponsors** — they're the sponsorship pipeline.
- Past board members tagged in HubSpot's `dallas_bod` but with no current membership status — they're chapter alumni, important context for the board.

These cohorts have no clean home in the conflated enum. Continuing to extend it (`Sponsor`, `Sponsor-Prospect`, etc.) would compound the design flaw and make the eventual untangling much harder once 2,501 rows (and every future chapter's contacts) are in the table.

This ADR untangles the two concerns before the first HubSpot sync runs.

## Decision

**Add a new `contact_type` enum column on `members`** that captures the category, leaving `membership_status` to capture only the lifecycle stage for *Members*.

```sql
CREATE TYPE contact_type AS ENUM ('Member', 'Staff', 'Spouse', 'Sponsor', 'Other');

ALTER TABLE public.members
  ADD COLUMN contact_type contact_type NOT NULL DEFAULT 'Member';

-- membership_status loses NOT NULL — only Members carry a status
ALTER TABLE public.members ALTER COLUMN membership_status DROP NOT NULL;

-- Renamed for clarity per user terminology preference
ALTER TYPE membership_status RENAME VALUE 'Alumni' TO 'Former Member';
```

After this change:

| `contact_type` | `membership_status` (when applicable) |
|---|---|
| `Member` | `Active` / `On Leave` / `Grace Period` / `Lapsed` / `Former Member` / `Prospect` |
| `Staff` | typically `null` (e.g. paid ED) |
| `Spouse` | typically `null` (partner of a member) |
| `Sponsor` | typically `null` (sponsor company contact) |
| `Other` | typically `null` (catch-all for inscrutable cases) |

The `Staff` and `Spouse` values remain in the underlying `membership_status` enum for backward compatibility — Postgres makes dropping enum values painful (requires create-new-enum, swap, drop-old). We stop reading them in code; Phase 2 schema cleanup formally removes them.

### Sync filter changes

The HubSpot sync no longer filters on "membership_status is set." Instead, it computes `contact_type` via a multi-signal **`derive_from_signals`** transform that reads several source fields by precedence:

1. `sap_active_` set → `Sponsor`
2. `membership_status` == `Spouse` → `Spouse`
3. `membership_status` ∈ {Active, Inactive, Sabbatical, Alumni} → `Member`
4. `application` set OR `chapter_consideration_email` set → `Member` (lifecycle = `Prospect`)
5. `dallas_bod` set OR `bod_position` set → `Member` (likely `Former Member`)
6. (no rule matched) → **null** → sync skips this contact

Contacts that produce a null `contact_type` are noise (vendor leads, event RSVPs from non-members, marketing prospects who never engaged). They stay in HubSpot but don't sync into Trifecta. Estimated reduction: ~2,501 → ~800-1,500 EO Dallas contacts make it into the directory.

The transform is generic (a small rule engine — `is_set`, `value_in`, `any_of` conditions; ordered rules with a configurable default). Other chapters and other CRMs use the same transform with their own per-source rules in `data_sources_config`.

### Alumni → Former Member rename

User terminology preference. "Alumni" in EO parlance can imply warm engaged former members; the Membership Chair tracks both warm alumni and members who simply left. "Former Member" is the more neutral, accurate label for what the lifecycle value actually represents.

Single Postgres `ALTER TYPE membership_status RENAME VALUE 'Alumni' TO 'Former Member'`. No data migration needed (no rows currently have that value).

## Alternatives considered

### (A) Keep the conflated enum; add `Sponsor` + `Sponsor-Prospect` values

Pragmatic: ~30 minutes of work, no schema split. Conceptually still wrong: keeps two concerns in one field and pushes the cleanup to Phase 2 with much more data in flight.

**Rejected.** Easier *now*, harder *later*. We have 2 rows; the cost of doing it right is trivial. The cost of fixing it in Phase 2 with thousands of rows across multiple chapters compounds.

### (B) Pre-filter at the connector layer to only "membership_status set" contacts

Skip prospects, sponsors, and former board members entirely.

**Rejected** as the user pushed back on this — those are exactly the cohorts that matter to the Membership and SAP board roles. The whole point of Trifecta is to serve those board functions.

### (C) Use a JSONB `roles: string[]` field instead of a single enum

A contact could be `["Member", "Sponsor"]` (a member of one chapter who also sponsors another, etc.).

**Rejected.** Premature complexity. No real-world case yet where a single Trifecta row needs multiple categories simultaneously. JSONB also loses the cheap indexing of an enum column. Easy to add later if evidence demands.

### (D) Add `contact_type` enum, decouple from `membership_status` — **selected**

The principled cleanup. ~2-3 hours of focused work, done before the first sync.

## Consequences

### Positive

- **Schema correctly represents the domain.** Every future query, dashboard, scoring rule, and digest filter has a clean axis: "give me all Members" vs "give me all Sponsors."
- **Sync filter is principled.** "Contacts of operational interest" is the union of signals, not a single field. The filter is a transform — same machinery as everything else.
- **Existing data migrates cleanly.** Jon (was `membership_status='Staff'`) → `contact_type='Staff'`, `membership_status=null`. No backfill scripts needed.
- **EO Dallas's HubSpot fields map naturally.** The `derive_from_signals` rule engine encodes their domain knowledge as configuration, not code.
- **Phase 3 LLM mapping-proposal agent gets simpler.** The agent emits two clean values (category + lifecycle) instead of a single overloaded enum.
- **Future schema growth has the right place.** Adding `Sponsor` tiers later, or `Vendor` as a category, or `Alumni-Warm` vs `Alumni-Cold` as lifecycle nuances — each fits in the right axis.

### Negative / costs

- **`membership_status` still carries deprecated `Staff` and `Spouse` values** until a Phase 2 cleanup migration that swaps the enum out properly. Code paths now ignore them; the values exist purely as cruft.
- **Form UI is slightly more nested.** Contact type → conditionally show status → conditionally require join date + company. Two extra dropdown states for the admin. Worth it for the data quality.
- **The `derive_from_signals` rule engine is a more complex transform than the rest of the Tier 3 set.** Documented carefully; tested with realistic EO Dallas inputs. New transforms of this shape (multi-field signal-based derivations) will reuse the same engine.

### Implications for the codebase

Already done as part of landing this ADR:

- `supabase/migrations/20260528120000_contact_type_and_former_member.sql` — adds the enum, the column with `NOT NULL DEFAULT 'Member'`, the chapter-scoped index, migrates Jon, drops `NOT NULL` on `membership_status`, renames `Alumni` → `Former Member`. Applied to staging.
- `lib/connectors/transformations.ts` — adds the `derive_from_signals` transform with a small rule engine (`is_set`, `value_in`, `any_of`). 10 new tests, 125 total passing.
- `lib/connectors/chapter_configs/eo_dallas_hubspot.ts` — adds the contact_type derivation rule at the top of the field-mapping list; updates the `membership_status` value_map for the Alumni rename. Re-seeded to `chapters.data_sources_config.hubspot.mappings`.
- `app/admin/MemberForm.tsx` + `app/admin/actions.ts` + `app/admin/page.tsx` + `app/admin/[id]/page.tsx` — contact_type dropdown, conditional membership_status, list view shows the new column.

Coming in the next commits:

- `lib/jobs/syncConnector.ts` — orchestration that skips contacts when `derive_from_signals` returns null, applies the rest of the mapping rules, upserts into `members` + `member_external_ids` + `members.custom_fields` + `members.notes`.

### Implications for Phase 1

The Week 2 HubSpot sync runs against the new shape. The 2,501 EO Dallas contacts get filtered through `derive_from_signals` and the operationally-relevant subset lands in `members` with correct category + lifecycle.

### Implications for Phase 2+

- New chapters inherit the structure. Their `derive_from_signals` rule lists encode their own domain knowledge as data.
- Schema cleanup migration to drop deprecated `Staff` / `Spouse` from `membership_status`.
- Potential addition of more contact_type values (`Vendor`, `Alumni` if we ever distinguish warm-engaged former members from cold churned ones, etc.) — each landing as a Postgres `ADD VALUE`, no schema redesign.
- Dashboard view evolves to show per-category counts and filters.

## Open items

- [ ] Phase 2 cleanup migration: drop deprecated `Staff` / `Spouse` values from `membership_status` enum.
- [ ] Decide whether `contact_type` should be optional/derived on `member_external_ids` for cases where the same person is a Sponsor in one chapter and a Member in another (cross-chapter scenarios are still Phase 3+).
- [ ] When the second chapter onboards, validate that the rule-engine shape generalizes. If it doesn't, that's the signal to evolve the transform or add a chapter-specific override mechanism.
