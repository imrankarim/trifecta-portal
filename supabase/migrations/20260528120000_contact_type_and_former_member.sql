-- Project Trifecta — separate "what kind of person" from "lifecycle stage".
--
-- See: docs/adr/ADR-005-contact-type-lifecycle-separation.md
--
-- The members table had been conflating two orthogonal concerns into one
-- membership_status enum:
--   1. CATEGORY    — Member vs Staff vs Spouse vs Sponsor (what kind of person)
--   2. LIFECYCLE   — Active vs Lapsed vs Former Member vs Prospect (lifecycle state)
--
-- We need to ingest current sponsors, prospective sponsors, and prospective
-- members from HubSpot — none of which fit cleanly under the existing
-- membership_status semantics. Rather than continue overloading the enum,
-- this migration introduces a separate contact_type enum and column.
--
-- After this migration:
--   contact_type           - the category. Required. Defaults to Member.
--   membership_status      - the lifecycle stage. Only meaningful for Members.
--                            NOT NULL constraint dropped so non-Members can leave it null.
--
-- Also renames 'Alumni' → 'Former Member' (user terminology preference).

-- ─────────────────────────────────────────────────────────────────────
-- 1. New contact_type enum + column
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE contact_type AS ENUM (
  'Member',
  'Staff',
  'Spouse',
  'Sponsor',
  'Other'
);

ALTER TABLE public.members
  ADD COLUMN contact_type contact_type NOT NULL DEFAULT 'Member';

COMMENT ON COLUMN public.members.contact_type IS
  'What kind of person this row represents. Separate concern from membership_status (lifecycle stage). For Member, membership_status is meaningful; for other contact_types, membership_status should typically be NULL. See ADR-005.';

CREATE INDEX idx_members_contact_type
  ON public.members (chapter_id, contact_type);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Migrate existing data (set contact_type before nulling status)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.members SET contact_type = 'Staff'  WHERE membership_status = 'Staff';
UPDATE public.members SET contact_type = 'Spouse' WHERE membership_status = 'Spouse';

-- ─────────────────────────────────────────────────────────────────────
-- 3. membership_status becomes optional (only meaningful for Members)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.members ALTER COLUMN membership_status DROP NOT NULL;

UPDATE public.members
   SET membership_status = NULL
 WHERE contact_type <> 'Member';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Rename Alumni → Former Member
-- ─────────────────────────────────────────────────────────────────────

ALTER TYPE membership_status RENAME VALUE 'Alumni' TO 'Former Member';

-- ─────────────────────────────────────────────────────────────────────
-- Phase 2 cleanup, intentionally deferred:
--   Drop the now-redundant 'Staff' and 'Spouse' values from
--   membership_status. Postgres doesn't support dropping enum values
--   directly — requires creating a new enum, swapping, dropping the old.
--   Will tackle when the codebase no longer reads those values.
-- ─────────────────────────────────────────────────────────────────────
