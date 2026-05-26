-- Project Trifecta — support paid chapter staff (e.g. Executive Director) in the directory.
--
-- Background: most chapters have ~1 paid staff person (the ED) who appears in the
-- portal directory and may have an Admin/ED app_role for login, but is not an EO
-- member of the chapter. They have no membership join date and may have no company.
-- See v1.1 spec §3.2 (EO Membership fields) — these were defined for actual members.
--
-- Decision: extend membership_status with a 'Staff' value, and relax NOT NULL on
-- the two columns that don't apply to staff. The scoring engine (Week 3) will skip
-- rows where membership_status = 'Staff' so they never get an engagement score.

-- 1. Add 'Staff' to the membership_status enum.
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'Staff';

-- 2. Relax NOT NULL on member-only fields so staff rows can omit them.
ALTER TABLE public.members ALTER COLUMN join_date_original DROP NOT NULL;
ALTER TABLE public.members ALTER COLUMN company_name       DROP NOT NULL;

COMMENT ON COLUMN public.members.join_date_original IS
  'Original date this person joined EO as a chapter member. NULL for non-member rows (membership_status = Staff).';
COMMENT ON COLUMN public.members.company_name IS
  'Member''s primary company. NULL for non-member rows (membership_status = Staff).';
