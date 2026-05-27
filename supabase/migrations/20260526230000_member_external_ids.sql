-- Project Trifecta — generalize external IDs across CRMs.
--
-- See: docs/adr/ADR-003-multi-crm-external-ids.md
--
-- Many EO chapters do not use HubSpot. They use Pipedrive, Go High Level,
-- Chapter Pro, an Airtable, a spreadsheet, or nothing. Hard-coding
-- members.hubspot_contact_id as a column biases the schema toward HubSpot
-- and causes column sprawl as we add CRMs (pipedrive_person_id,
-- gohighlevel_contact_id, chapter_pro_member_id, ...).
--
-- This migration replaces the per-source column with a generic
-- member_external_ids table. Per-source IDs become rows, not columns.
-- A given member can have IDs in arbitrarily many sources simultaneously
-- without any schema change.
--
-- What stays a top-level column on members:
--   eo_global_member_id — canonical cross-chapter identifier per v1.1 §2.4.
--   It has unique meaning across all EO chapters, not just one source.

-- ---------------------------------------------------------------------------
-- 1. New table
-- ---------------------------------------------------------------------------

CREATE TABLE public.member_external_ids (
  member_id        UUID         NOT NULL REFERENCES public.members(trifecta_member_id) ON DELETE CASCADE,
  chapter_id       UUID         NOT NULL REFERENCES public.chapters(trifecta_chapter_id),
  source_name      TEXT         NOT NULL,                       -- 'hubspot' | 'pipedrive' | 'gohighlevel' | 'chapter_pro' | 'google_sheets' | ...
  external_id      TEXT         NOT NULL,                       -- whatever id that source uses for this person
  source_metadata  JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- per-source extras (e.g. HubSpot lifecycle stage cache, sheet row range, etc.)
  linked_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (member_id, source_name),
  UNIQUE (chapter_id, source_name, external_id)
);

COMMENT ON TABLE  public.member_external_ids IS
  'Per-source external identifiers for members. Generic across CRMs and other connectors. See docs/adr/ADR-003.';
COMMENT ON COLUMN public.member_external_ids.source_name IS
  'Lowercase connector identifier. Must match DataSource.sourceName in lib/connectors.';
COMMENT ON COLUMN public.member_external_ids.chapter_id IS
  'Denormalized from members.chapter_id for RLS and chapter-scoped uniqueness. Enforced consistent by the sync layer.';
COMMENT ON COLUMN public.member_external_ids.source_metadata IS
  'Open JSONB bag for source-specific extras (lifecycle stages, sheet ranges, custom property snapshots). Do NOT put credentials here — credentials live on chapters.data_sources_config.';

CREATE INDEX idx_mei_chapter_source       ON public.member_external_ids (chapter_id, source_name);
CREATE INDEX idx_mei_source_external_id   ON public.member_external_ids (source_name, external_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — same chapter-isolation pattern as members
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_external_ids ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users see only rows for members in their own chapter.
CREATE POLICY mei_select_own_chapter
  ON public.member_external_ids
  FOR SELECT
  TO authenticated
  USING (chapter_id = public.current_user_chapter_id());

-- INSERT/UPDATE/DELETE: service role only (sync jobs and admin operations).
-- No policy for authenticated → no access. Service role bypasses RLS by default.

-- ---------------------------------------------------------------------------
-- 3. Backfill from the existing hubspot_contact_id column
-- ---------------------------------------------------------------------------

INSERT INTO public.member_external_ids (member_id, chapter_id, source_name, external_id)
SELECT trifecta_member_id, chapter_id, 'hubspot', hubspot_contact_id
FROM public.members
WHERE hubspot_contact_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Drop the HubSpot-specific column, constraint, and index
-- ---------------------------------------------------------------------------

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_hubspot_chapter_uq;
DROP INDEX IF EXISTS public.idx_members_hubspot_contact_id;
ALTER TABLE public.members DROP COLUMN hubspot_contact_id;
