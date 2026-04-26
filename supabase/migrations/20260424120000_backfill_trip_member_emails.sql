-- ============================================================
-- Migration: backfill trip_members.email from auth.users
-- 2026-04-24
--
-- The initial backfill (20260424100000) populated trip_members
-- from trips but trips has no email column, leaving email NULL
-- for all existing owners. This fills it from auth.users.
-- ============================================================
UPDATE trip_members m
SET email = u.email
FROM auth.users u
WHERE m.user_id = u.id
  AND m.email IS NULL;
