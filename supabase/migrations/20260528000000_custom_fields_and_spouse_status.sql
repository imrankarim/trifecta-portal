-- Project Trifecta — overflow column + Spouse membership status.
--
-- See: docs/adr/ADR-004-connector-mapping-as-data.md
--
-- Two changes from the same architectural decision:
--
-- 1. members.custom_fields JSONB — per-chapter overflow for fields that exist
--    in a chapter's source data but don't fit Trifecta's canonical schema
--    (yet). Examples from EO Dallas's HubSpot: dietary restrictions, accountant
--    info, spouse contact details, the entire `requalification_properties`
--    HubSpot group, additional companies beyond the primary. The connector
--    mapping config writes here for unmodeled fields. Evidence-based schema
--    growth: when a custom_fields key appears across many chapters, promote
--    to a canonical column in a future migration.
--
-- 2. 'Spouse' added to membership_status — for partners of EO members who
--    participate in chapter life (events, spousal forums, SLPs) but are not
--    themselves EO members. Scoring engine treats Spouse like Staff: no
--    engagement score, no churn risk. join_date_original / company_name
--    stay optional for Spouse rows (already nullable since the Staff migration).

-- 1. Add custom_fields JSONB
ALTER TABLE public.members
  ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.members.custom_fields IS
  'Per-chapter overflow data — fields from a chapter''s source data that do not (yet) fit Trifecta''s canonical schema. Connector mapping config writes here via the `members.custom_fields.<key>` target syntax. See docs/adr/ADR-004. Promote a key to a canonical column when it appears consistently across many chapters (evidence-based schema growth).';

-- Optional: GIN index for future jsonb querying. Skipped now — add when query
-- patterns demand. See ADR-004 "Open items".
-- CREATE INDEX idx_members_custom_fields ON public.members USING GIN (custom_fields);

-- 2. Add 'Spouse' membership_status
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'Spouse';
