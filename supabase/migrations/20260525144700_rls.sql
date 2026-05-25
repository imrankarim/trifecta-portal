-- Project Trifecta — Row-Level Security policies
-- Honors v1.1 §2.5 (Multi-tenancy from day one) and §8 (RLS for chapter data isolation):
--   "No chapter can access another chapter's data under any query path."
-- ---------------------------------------------------------------------------
-- Helper: resolve the current user's chapter and role via their member row.
-- SECURITY DEFINER + STABLE so RLS policies can call these without recursion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_chapter_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT chapter_id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS app_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_chapter_id IS 'Returns the chapter_id of the calling authenticated user, by joining auth.uid() to the members table. Used by RLS policies. SECURITY DEFINER to bypass RLS on the lookup itself.';
COMMENT ON FUNCTION public.current_user_role IS 'Returns the app_role of the calling authenticated user. NULL if user has no linked member row.';

-- Lock down EXECUTE on these helpers to authenticated users only.
REVOKE ALL ON FUNCTION public.current_user_chapter_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role()       FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_chapter_id() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_user_role()       TO authenticated;

-- ---------------------------------------------------------------------------
-- Link auth.users -> public.members on sign-up by matching email.
-- Lets an admin pre-create a member row before the user signs up; on first
-- login the trigger links them. v1.1 §2.5 chapter isolation enforced from
-- the moment they log in.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.members
     SET auth_user_id = NEW.id
   WHERE LOWER(email_primary) = LOWER(NEW.email)
     AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default — that's how the server-side sync
-- jobs (HubSpot, Google Sheets) and admin operations will read/write. The
-- policies below govern *anon* and *authenticated* roles only.

-- ---------------------------------------------------------------------------
-- chapters policies
-- ---------------------------------------------------------------------------

-- SELECT: user can see exactly the chapter they belong to.
CREATE POLICY chapters_select_own
  ON public.chapters
  FOR SELECT
  TO authenticated
  USING (trifecta_chapter_id = public.current_user_chapter_id());

-- UPDATE: only Admin or ED of that chapter can update.
CREATE POLICY chapters_update_admin
  ON public.chapters
  FOR UPDATE
  TO authenticated
  USING (
    trifecta_chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() IN ('Admin', 'ExecutiveDirector')
  )
  WITH CHECK (
    trifecta_chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() IN ('Admin', 'ExecutiveDirector')
  );

-- INSERT/DELETE on chapters: server-side only (service role bypasses RLS).
-- No policy = no access for anon/authenticated.

-- ---------------------------------------------------------------------------
-- members policies
-- ---------------------------------------------------------------------------

-- SELECT: any authenticated user can see members in their own chapter.
CREATE POLICY members_select_own_chapter
  ON public.members
  FOR SELECT
  TO authenticated
  USING (chapter_id = public.current_user_chapter_id());

-- INSERT: only Admin or ED, and only into their own chapter.
CREATE POLICY members_insert_admin
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() IN ('Admin', 'ExecutiveDirector')
  );

-- UPDATE: only Admin or ED of that chapter.
CREATE POLICY members_update_admin
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() IN ('Admin', 'ExecutiveDirector')
  )
  WITH CHECK (
    chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() IN ('Admin', 'ExecutiveDirector')
  );

-- A user can always update their *own* member row (for self-service profile
-- edits in Phase 2). Restricts which columns via app logic / column grants.
CREATE POLICY members_update_self
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- DELETE: only Admin in their own chapter.
CREATE POLICY members_delete_admin
  ON public.members
  FOR DELETE
  TO authenticated
  USING (
    chapter_id = public.current_user_chapter_id()
    AND public.current_user_role() = 'Admin'
  );
