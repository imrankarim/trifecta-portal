-- Project Trifecta — email correspondence ingestion (ambient-context layer).
--
-- See: docs/adr/ADR-006-email-correspondence-ingestion.md
--
-- Board chairs CC/BCC the chapter's Trifecta mailbox on operational email.
-- Trifecta parses each message, runs an LLM extraction, and produces PROPOSALS
-- (the "killer trio": action items, renewal-intent hints, pipeline/status
-- moves). Proposals are NEVER applied silently — a chair reviews and accepts
-- each one (hallucination guardrail, per ADR-002/ADR-006). A strict
-- forum-exclusion rule rejects any forum-related content before extraction.
--
-- This generalizes ADR-002's kind-specific meeting tables into two tables:
--   inbound_communications   — one row per ingested message (any kind)
--   communication_extractions — the proposed structured signals (0..N per message)

-- ---------------------------------------------------------------------------
-- 1. inbound_communications — one row per ingested message
-- ---------------------------------------------------------------------------

CREATE TABLE public.inbound_communications (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id          UUID         NOT NULL REFERENCES public.chapters(trifecta_chapter_id),
  kind                TEXT         NOT NULL DEFAULT 'email',         -- 'email' | 'meeting_summary' | 'drive_doc'
  source_tool         TEXT,                                          -- 'gmail' | 'outlook' | 'fathom' | ...
  source_message_id   TEXT,                                         -- RFC 5322 Message-ID (dedupe key)
  source_thread_id    TEXT,
  sender              TEXT,
  recipient_emails    TEXT[]       NOT NULL DEFAULT '{}',           -- TO + CC; BCC invisible (we ARE the BCC)
  subject             TEXT,
  received_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ,
  direction           TEXT         NOT NULL DEFAULT 'unknown',      -- chair_outbound | inbound_to_chair | internal_board | unknown
  classification      TEXT,                                         -- prospect_outreach | renewal_conversation | ...
  attendee_member_ids UUID[]       NOT NULL DEFAULT '{}',
  ingest_status       TEXT         NOT NULL DEFAULT 'received',     -- received | classified | extracted | rejected_forum | rejected_policy | error
  rejection_reason    TEXT,
  raw_pointer         TEXT,                                         -- pointer to stored body (NOT the body itself)
  processed_at        TIMESTAMPTZ
);

COMMENT ON TABLE public.inbound_communications IS
  'One row per ingested communication (email / meeting summary / drive doc). See docs/adr/ADR-006. Forum-related content is rejected (ingest_status=rejected_forum) and never extracted.';
COMMENT ON COLUMN public.inbound_communications.source_message_id IS
  'Dedupe key — re-ingesting the same message must not create duplicate rows.';
COMMENT ON COLUMN public.inbound_communications.raw_pointer IS
  'Pointer to the message body in object storage, not the body itself. Strong default: store structured extractions + pointer, never the raw body.';

CREATE INDEX idx_inbound_comm_chapter_received
  ON public.inbound_communications (chapter_id, received_at DESC);
CREATE UNIQUE INDEX idx_inbound_comm_dedupe
  ON public.inbound_communications (chapter_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. communication_extractions — the proposed structured signals
-- ---------------------------------------------------------------------------

CREATE TABLE public.communication_extractions (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id     UUID         NOT NULL REFERENCES public.inbound_communications(id) ON DELETE CASCADE,
  chapter_id           UUID         NOT NULL REFERENCES public.chapters(trifecta_chapter_id),  -- denormalized for RLS without a join
  extraction_type      TEXT         NOT NULL,                       -- action_item | renewal_intent | pipeline_move
  target_member_id     UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  payload              JSONB        NOT NULL DEFAULT '{}'::jsonb,
  confidence           NUMERIC(3,2),                                -- 0.00–1.00, advisory only (never gates an auto-write)
  status               TEXT         NOT NULL DEFAULT 'proposed',    -- proposed | accepted | rejected
  confirmed_by         UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  confirmed_at         TIMESTAMPTZ,
  applied_to_canonical BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.communication_extractions IS
  'LLM-proposed structured signals from inbound_communications. status=proposed until a human accepts/rejects. confidence is advisory only — proposals are NEVER auto-applied (ADR-006 hallucination guardrail).';

CREATE INDEX idx_comm_extractions_chapter_status
  ON public.communication_extractions (chapter_id, status);
CREATE INDEX idx_comm_extractions_communication
  ON public.communication_extractions (communication_id);
CREATE INDEX idx_comm_extractions_target_member
  ON public.communication_extractions (target_member_id) WHERE target_member_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS — same chapter-isolation pattern as members/member_external_ids.
--    SELECT for authenticated (own chapter); writes are service-role only
--    (ingestion route + accept/reject actions use the admin client).
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbound_communications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbound_comm_select_own_chapter
  ON public.inbound_communications
  FOR SELECT TO authenticated
  USING (chapter_id = public.current_user_chapter_id());

CREATE POLICY comm_extractions_select_own_chapter
  ON public.communication_extractions
  FOR SELECT TO authenticated
  USING (chapter_id = public.current_user_chapter_id());

-- Per-chapter email-ingestion config (mailbox address, forum-keyword overrides,
-- configured chair addresses) lives in chapters.data_sources_config.email_ingestion
-- (mapping-as-data, ADR-004) — no new columns.
