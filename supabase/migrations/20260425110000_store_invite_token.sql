-- ============================================================
-- Migration: store raw invite token for copy-link UX
-- 2026-04-25
--
-- Adds a `token` column so the owner can re-copy existing links.
-- Revokes old tokenless invitations (legacy single-use links).
-- ============================================================

-- 1. Add token column (nullable for backward compat)
ALTER TABLE public.trip_invitations
    ADD COLUMN IF NOT EXISTS token text;

-- 2. Revoke legacy invitations that have no stored token
UPDATE public.trip_invitations
SET revoked_at = now()
WHERE token IS NULL
  AND revoked_at IS NULL;
