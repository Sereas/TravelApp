-- ============================================================
-- Migration: optimize invite RPCs
-- 2026-04-25
--
-- 1. get_invite_preview: single-query preview (JOIN, no N+1)
-- 2. accept_invitation: remove FOR UPDATE, embed trip_id in
--    ALREADY_MEMBER exception (eliminates 2 extra queries)
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_invite_preview — single query with JOIN
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token_hash text)
RETURNS TABLE(
    trip_name character varying,
    expires_at timestamptz,
    inv_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN i.revoked_at IS NOT NULL THEN NULL
            WHEN i.expires_at < now()     THEN NULL
            ELSE t.trip_name
        END AS trip_name,
        i.expires_at,
        CASE
            WHEN i.revoked_at IS NOT NULL THEN 'revoked'
            WHEN i.expires_at < now()     THEN 'expired'
            ELSE 'active'
        END AS inv_status
    FROM trip_invitations i
    LEFT JOIN trips t ON t.trip_id = i.trip_id
    WHERE i.token_hash = p_token_hash
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_preview(text)
    TO service_role;
REVOKE ALL ON FUNCTION public.get_invite_preview(text)
    FROM authenticated, anon;


-- ------------------------------------------------------------
-- 2. accept_invitation — remove FOR UPDATE, embed trip_id
--    in ALREADY_MEMBER exception
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
    SELECT i.id, i.trip_id, i.role, i.invited_by,
           i.revoked_at, i.expires_at
    INTO v_inv
    FROM trip_invitations i
    WHERE i.token_hash = p_token_hash;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITE_NOT_FOUND';
    END IF;
    IF v_inv.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'INVITE_REVOKED';
    END IF;
    IF v_inv.expires_at < now() THEN
        RAISE EXCEPTION 'INVITE_EXPIRED';
    END IF;

    -- Prevent duplicate membership — embed trip_id for the caller
    IF EXISTS (
        SELECT 1 FROM trip_members
        WHERE trip_members.trip_id = v_inv.trip_id
          AND trip_members.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER:%', v_inv.trip_id::text;
    END IF;

    -- Create membership
    INSERT INTO trip_members (trip_id, user_id, email, role, invited_by)
    VALUES (v_inv.trip_id, p_user_id, p_user_email, v_inv.role, v_inv.invited_by);

    RETURN QUERY SELECT v_inv.trip_id, v_inv.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text)
    TO service_role;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text)
    FROM authenticated, anon;
