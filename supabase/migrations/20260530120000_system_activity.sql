-- Project Trifecta — chapter-wide system activity log (audit trail).
--
-- The trust backbone for automated actions. Every consequential thing Trifecta
-- does — auto-applied email extractions, proposal accept/reject, manual status
-- overrides, (later) syncs and score recalcs — is recorded here with
-- when / who / what / why. Visible to EVERY board member (not just admin), so
-- if anyone spots something odd they can trace exactly why it happened and undo
-- it. Visibility + reversibility is what makes aggressive auto-apply safe.

CREATE TABLE public.system_activity (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id       UUID         NOT NULL REFERENCES public.chapters(trifecta_chapter_id),
  actor_type       TEXT         NOT NULL DEFAULT 'system',   -- 'system' | 'user'
  actor_member_id  UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  action           TEXT         NOT NULL,                    -- email_extraction_auto_applied | proposal_accepted | proposal_rejected | extraction_undone | ...
  source           TEXT,                                     -- email | sync | scoring | manual
  target_type      TEXT,                                     -- member | chapter | forum | ...
  target_member_id UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  summary          TEXT         NOT NULL,
  detail           JSONB        NOT NULL DEFAULT '{}'::jsonb, -- enough to undo: prior values, appended element ids, source extraction id
  reversible       BOOLEAN      NOT NULL DEFAULT FALSE,
  reverted_at      TIMESTAMPTZ,
  reverted_by      UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.system_activity IS
  'Chapter-wide audit log of automated and operator actions. Board-readable. detail JSONB carries everything needed to undo a reversible action (prior values, appended element ids, source extraction id).';

CREATE INDEX idx_system_activity_chapter_created
  ON public.system_activity (chapter_id, created_at DESC);
CREATE INDEX idx_system_activity_target_member
  ON public.system_activity (target_member_id) WHERE target_member_id IS NOT NULL;

-- RLS: any authenticated board member may READ their chapter's log (trust =
-- everyone can see). Writes are service-role only (logging happens inside
-- server actions / routes via the admin client).
ALTER TABLE public.system_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_activity_select_own_chapter
  ON public.system_activity
  FOR SELECT TO authenticated
  USING (chapter_id = public.current_user_chapter_id());
