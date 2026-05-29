-- Project Trifecta — chair-tracked action items per member.
--
-- Chairs log to-dos against specific members: "follow up on renewal,"
-- "intro to potential sponsor," etc. Each action has a due date and a
-- completed/open lifecycle. Distinct from members.notes (which are
-- timestamped free-form observations); actions are forward-looking
-- commitments.
--
-- Shape of each entry in the JSONB array:
--   {
--     id:          "uuid",
--     text:        "Call Jeff about renewal",
--     created_at:  "ISO timestamp",
--     created_by:  "trifecta_member_id of the chair who logged it",
--     due_date:    "ISO date" (optional),
--     assigned_to: "trifecta_member_id" (optional; null = any chair),
--     completed_at: "ISO timestamp" (null while open),
--     completed_by: "trifecta_member_id" (null while open)
--   }
--
-- Stored on the member row rather than a separate table because:
--   * 99% of queries are "give me the action items for this member"
--   * Volume is small (~5-20 per member at most)
--   * RLS / chapter isolation rides for free on the members row's policies
-- A separate table would be the right shape if we add cross-member views
-- (e.g. "all my open actions") and the JSONB filtering gets noisy. Defer.

ALTER TABLE public.members
  ADD COLUMN action_items JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.members.action_items IS
  'Chair-logged to-dos for this member. Array of action objects. See migration header for shape. Cross-member "my open actions" view derives from this in app code (Phase 3 board-chair home page).';
