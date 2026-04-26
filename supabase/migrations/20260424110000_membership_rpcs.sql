-- ============================================================
-- Migration: membership RPCs
-- 2026-04-24
--
-- Adds RPCs for membership-based access verification,
-- trip listing, trip creation, and invitation acceptance.
-- Modifies get_itinerary_tree (2-arg) to check trip_members.
-- ============================================================

-- ------------------------------------------------------------
-- 1. verify_member_access
--    Replaces verify_resource_chain for membership-aware access.
--    Returns the user's actual role ('owner'/'editor') or NULL.
--    Checks trip_members instead of trips.user_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_member_access(
    p_trip_id   uuid,
    p_user_id   uuid,
    p_min_role  text DEFAULT 'editor',
    p_day_id    uuid DEFAULT NULL,
    p_option_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT m.role
    FROM trip_members m
    WHERE m.trip_id = p_trip_id
      AND m.user_id = p_user_id
      AND CASE p_min_role
            WHEN 'editor' THEN m.role IN ('owner', 'editor')
            WHEN 'owner'  THEN m.role = 'owner'
            ELSE FALSE
          END
      AND (
          p_day_id IS NULL
          OR EXISTS (
              SELECT 1 FROM trip_days d
              WHERE d.day_id = p_day_id
                AND d.trip_id = p_trip_id
          )
      )
      AND (
          p_option_id IS NULL
          OR EXISTS (
              SELECT 1 FROM day_options o
              WHERE o.option_id = p_option_id
                AND o.day_id = p_day_id
          )
      )
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_member_access(uuid, uuid, text, uuid, uuid)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.verify_member_access(uuid, uuid, text, uuid, uuid)
    FROM anon;


-- ------------------------------------------------------------
-- 2. list_user_trips
--    Returns all trips the user is a member of, with their role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_user_trips(p_user_id uuid)
RETURNS TABLE(
    trip_id      uuid,
    trip_name    character varying,
    start_date   date,
    end_date     date,
    created_at   timestamptz,
    role         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        t.trip_id,
        t.trip_name,
        t.start_date,
        t.end_date,
        t.created_at,
        m.role
    FROM trips t
    JOIN trip_members m ON m.trip_id = t.trip_id
    WHERE m.user_id = p_user_id
    ORDER BY t.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_trips(uuid)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_user_trips(uuid)
    FROM anon;


-- ------------------------------------------------------------
-- 3. create_trip_with_owner
--    Atomic: creates trip + owner membership row in one tx.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_trip_with_owner(
    p_trip_name  character varying,
    p_start_date date DEFAULT NULL,
    p_end_date   date DEFAULT NULL,
    p_user_id    uuid DEFAULT NULL,
    p_user_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trip_id uuid;
BEGIN
    INSERT INTO trips (trip_name, start_date, end_date, user_id)
    VALUES (p_trip_name, p_start_date, p_end_date, p_user_id)
    RETURNING trip_id INTO v_trip_id;

    INSERT INTO trip_members (trip_id, user_id, email, role, invited_by)
    VALUES (v_trip_id, p_user_id, p_user_email, 'owner', p_user_id);

    RETURN v_trip_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trip_with_owner(character varying, date, date, uuid, text)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_trip_with_owner(character varying, date, date, uuid, text)
    FROM anon;


-- ------------------------------------------------------------
-- 4. accept_invitation
--    Atomic: validates token, consumes it, creates membership.
--    Raises exceptions for invalid states.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token_hash  text,
    p_user_id     uuid,
    p_user_email  text
)
RETURNS TABLE(trip_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv record;
BEGIN
    -- Lock the invitation row to prevent concurrent acceptance
    SELECT i.id, i.trip_id, i.role, i.invited_by,
           i.consumed_at, i.revoked_at, i.expires_at
    INTO v_inv
    FROM trip_invitations i
    WHERE i.token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITE_NOT_FOUND';
    END IF;
    IF v_inv.consumed_at IS NOT NULL THEN
        RAISE EXCEPTION 'INVITE_CONSUMED';
    END IF;
    IF v_inv.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'INVITE_REVOKED';
    END IF;
    IF v_inv.expires_at < now() THEN
        RAISE EXCEPTION 'INVITE_EXPIRED';
    END IF;

    -- Check if already a member
    IF EXISTS (
        SELECT 1 FROM trip_members
        WHERE trip_members.trip_id = v_inv.trip_id
          AND trip_members.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER';
    END IF;

    -- Consume the invitation
    UPDATE trip_invitations
    SET consumed_at = now(), consumed_by = p_user_id
    WHERE id = v_inv.id;

    -- Create membership (use v_inv directly, no re-query)
    INSERT INTO trip_members (trip_id, user_id, email, role, invited_by)
    VALUES (v_inv.trip_id, p_user_id, p_user_email, v_inv.role, v_inv.invited_by);

    RETURN QUERY SELECT v_inv.trip_id, v_inv.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text)
    FROM anon;


-- ------------------------------------------------------------
-- 5. Modify get_itinerary_tree (2-arg) — check trip_members
--    instead of trips.user_id.
--    The 1-arg overload (used by shared trips) is unchanged.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid, uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
    day_id uuid, day_date date, day_sort_order integer,
    day_created_at timestamp with time zone, day_active_option_id uuid,
    option_id uuid, option_index integer,
    option_starting_city character varying, option_ending_city character varying,
    option_created_by character varying, option_created_at timestamp with time zone,
    ol_id uuid, location_id uuid, ol_sort_order integer, time_period text,
    loc_name text, loc_city text, loc_address text, loc_google_link text,
    loc_category text, loc_note text, loc_working_hours text,
    loc_requires_booking text,
    loc_photo_url text, loc_user_image_url text, loc_user_image_crop jsonb,
    loc_attribution_name text, loc_attribution_uri text,
    loc_useful_link text, loc_latitude double precision, loc_longitude double precision
)
LANGUAGE sql STABLE AS $$
    SELECT
        d.day_id,
        d.date             AS day_date,
        d.sort_order       AS day_sort_order,
        d.created_at       AS day_created_at,
        d.active_option_id AS day_active_option_id,
        o.option_id,
        o.option_index,
        o.starting_city    AS option_starting_city,
        o.ending_city      AS option_ending_city,
        o.created_by       AS option_created_by,
        o.created_at       AS option_created_at,
        ol.id              AS ol_id,
        ol.location_id,
        ol.sort_order      AS ol_sort_order,
        ol.time_period,
        l.name             AS loc_name,
        l.city             AS loc_city,
        l.address          AS loc_address,
        l.google_link      AS loc_google_link,
        l.category         AS loc_category,
        l.note             AS loc_note,
        l.working_hours    AS loc_working_hours,
        l.requires_booking AS loc_requires_booking,
        pp.photo_url       AS loc_photo_url,
        l.user_image_url   AS loc_user_image_url,
        l.user_image_crop  AS loc_user_image_crop,
        pp.attribution_name AS loc_attribution_name,
        pp.attribution_uri  AS loc_attribution_uri,
        l.useful_link      AS loc_useful_link,
        l.latitude         AS loc_latitude,
        l.longitude        AS loc_longitude
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    LEFT JOIN place_photos pp      ON pp.google_place_id = l.google_place_id
    WHERE d.trip_id = p_trip_id
      AND (p_user_id IS NULL OR EXISTS (
          SELECT 1 FROM trip_members m
          WHERE m.trip_id = p_trip_id AND m.user_id = p_user_id
      ))
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) FROM anon;
