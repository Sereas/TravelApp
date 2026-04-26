-- ============================================================
-- Migration: multi-use invite links
-- 2026-04-25
--
-- Changes invite links from single-use to multi-use.
-- - Removes consumed_at / consumed_by columns (no longer needed)
-- - Updates accept_invitation RPC to skip consumed check
-- - Updates partial index to only filter on revoked_at
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop consumed_at / consumed_by columns
-- ------------------------------------------------------------
ALTER TABLE public.trip_invitations
    DROP COLUMN IF EXISTS consumed_at,
    DROP COLUMN IF EXISTS consumed_by;

-- ------------------------------------------------------------
-- 2. Recreate partial index (old one referenced consumed_at)
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_trip_invitations_active;

CREATE INDEX idx_trip_invitations_active
    ON trip_invitations (token_hash)
    WHERE revoked_at IS NULL;

-- ------------------------------------------------------------
-- 3. Replace accept_invitation RPC — multi-use version
--    Only checks: revoked, expired, already_member.
--    No consumed check — multiple users can use the same link.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token_hash  text,
    p_user_id     uuid,
    p_user_email  text
)
RETURNS TABLE(trip_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv record;
BEGIN
    -- Lock the invitation row to prevent race conditions
    SELECT i.id, i.trip_id, i.role, i.invited_by,
           i.revoked_at, i.expires_at
    INTO v_inv
    FROM trip_invitations i
    WHERE i.token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITE_NOT_FOUND';
    END IF;
    IF v_inv.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'INVITE_REVOKED';
    END IF;
    IF v_inv.expires_at < now() THEN
        RAISE EXCEPTION 'INVITE_EXPIRED';
    END IF;

    -- Prevent duplicate membership
    IF EXISTS (
        SELECT 1 FROM trip_members
        WHERE trip_members.trip_id = v_inv.trip_id
          AND trip_members.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER';
    END IF;

    -- Create membership (no consumed tracking — link stays active)
    INSERT INTO trip_members (trip_id, user_id, email, role, invited_by)
    VALUES (v_inv.trip_id, p_user_id, p_user_email, v_inv.role, v_inv.invited_by);

    RETURN QUERY SELECT v_inv.trip_id, v_inv.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text)
    TO service_role;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text)
    FROM authenticated, anon;
