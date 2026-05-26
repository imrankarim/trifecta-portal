-- Project Trifecta — add 'On Leave' membership status.
-- A member temporarily inactive (sabbatical, leave of absence) who retains
-- their EO membership and chapter affiliation but isn't engaging.
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'On Leave';
