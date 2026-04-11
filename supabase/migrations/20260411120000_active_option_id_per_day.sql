-- ============================================================================
-- Migration: persist the "active option" per day
--
-- Motivation: today, the user's currently-selected option per day lives only
-- in React state — so a logout/reload (or a shared-trip viewer) always lands
-- on the Main option (option_index = 1), even if the owner had an Alternative
-- active before leaving. We persist the selection as `trip_days.active_option_id`
-- so (a) the owner's last pick survives logout/login, and (b) shared viewers
-- see whatever the owner currently has active.
--
-- Changes:
--   1. `trip_days.active_option_id` nullable FK to `day_options(option_id)`.
--      `ON DELETE SET NULL` so deleting the active option restores the
--      "Main-or-first" fallback automatically — no application-level cleanup
--      needed.
--   2. Both overloads of `get_itinerary_tree` project `d.active_option_id` in
--      the day row so the frontend can read it.
--   3. `get_shared_trip_data` projects `d.active_option_id` in the
--      `itinerary_rows` CTE so shared viewers see the owner's current pick.
--   4. `move_option_to_day` clears `trip_days.active_option_id` on the source
--      day if it was pointing at the option being moved — the FK itself is
--      still valid (the option row still exists) but the pointer is now
--      semantically stale (option belongs to a different day).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column
-- ----------------------------------------------------------------------------
ALTER TABLE public.trip_days
  ADD COLUMN IF NOT EXISTS active_option_id uuid NULL
  REFERENCES public.day_options(option_id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. get_itinerary_tree (1-param overload) — add active_option_id
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid)
RETURNS TABLE(
    day_id               uuid,
    day_date             date,
    day_sort_order       integer,
    day_created_at       timestamptz,
    day_active_option_id uuid,
    option_id            uuid,
    option_index         integer,
    option_starting_city varchar,
    option_ending_city   varchar,
    option_created_by    varchar,
    option_created_at    timestamptz,
    ol_id                uuid,
    location_id          uuid,
    ol_sort_order        integer,
    time_period          text,
    loc_name             text,
    loc_city             text,
    loc_address          text,
    loc_google_link      text,
    loc_category         text,
    loc_note             text,
    loc_working_hours    text,
    loc_requires_booking text
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
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
        l.requires_booking AS loc_requires_booking
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    WHERE d.trip_id = p_trip_id
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

-- DROP + CREATE resets grants to PostgreSQL defaults, so re-establish the
-- live grant set (authenticated + service_role only; no anon) to match the
-- hardening applied in migration 20260401100000_restrict_anon_rpc_grants.
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_itinerary_tree(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_itinerary_tree(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. get_itinerary_tree (2-param overload w/ ownership check) — add active_option_id
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid, uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
    day_id               uuid,
    day_date             date,
    day_sort_order       integer,
    day_created_at       timestamptz,
    day_active_option_id uuid,
    option_id            uuid,
    option_index         integer,
    option_starting_city varchar,
    option_ending_city   varchar,
    option_created_by    varchar,
    option_created_at    timestamptz,
    ol_id                uuid,
    location_id          uuid,
    ol_sort_order        integer,
    time_period          text,
    loc_name             text,
    loc_city             text,
    loc_address          text,
    loc_google_link      text,
    loc_category         text,
    loc_note             text,
    loc_working_hours    text,
    loc_requires_booking text,
    loc_photo_url        text,
    loc_user_image_url   text
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
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
        l.user_image_url   AS loc_user_image_url
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    LEFT JOIN place_photos pp      ON pp.google_place_id = l.google_place_id
    WHERE d.trip_id = p_trip_id
      AND (p_user_id IS NULL OR EXISTS (
          SELECT 1 FROM trips t
          WHERE t.trip_id = p_trip_id AND t.user_id = p_user_id
      ))
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

-- DROP + CREATE resets grants to PostgreSQL defaults, so re-establish the
-- live grant set (authenticated + service_role only; no anon) to match the
-- hardening applied in migration 20260401100000_restrict_anon_rpc_grants.
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. get_shared_trip_data — add day_active_option_id in itinerary_rows CTE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_trip_data(p_share_token text)
RETURNS json
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_trip_id UUID;
  v_trip JSON;
  v_locations JSON;
  v_itinerary_rows JSON;
BEGIN
  SELECT ts.trip_id INTO v_trip_id
  FROM trip_shares ts
  WHERE ts.share_token = p_share_token
    AND ts.is_active = true
    AND (ts.expires_at IS NULL OR ts.expires_at > now());

  IF v_trip_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'trip_name', t.trip_name,
    'start_date', t.start_date,
    'end_date', t.end_date
  ) INTO v_trip
  FROM trips t
  WHERE t.trip_id = v_trip_id;

  SELECT COALESCE(json_agg(row_to_json(loc_q)), '[]'::json) INTO v_locations
  FROM (
    SELECT
      l.location_id AS id,
      l.name,
      l.city,
      l.address,
      l.google_link,
      l.category,
      l.note,
      l.working_hours,
      l.requires_booking,
      l.latitude,
      l.longitude,
      l.google_place_id,
      pp.photo_url AS image_url,
      l.user_image_url,
      pp.attribution_name,
      pp.attribution_uri
    FROM locations l
    LEFT JOIN place_photos pp ON pp.google_place_id = l.google_place_id
    WHERE l.trip_id = v_trip_id
    ORDER BY l.created_at
  ) loc_q;

  SELECT COALESCE(json_agg(row_to_json(itin_q)), '[]'::json) INTO v_itinerary_rows
  FROM (
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
      pp.attribution_name AS loc_attribution_name,
      pp.attribution_uri  AS loc_attribution_uri
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    LEFT JOIN place_photos pp     ON pp.google_place_id = l.google_place_id
    WHERE d.trip_id = v_trip_id
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST
  ) itin_q;

  RETURN json_build_object(
    'trip', v_trip,
    'locations', v_locations,
    'itinerary_rows', v_itinerary_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_trip_data(text) TO anon;

-- ----------------------------------------------------------------------------
-- 5. move_option_to_day — clear stale active_option_id on source day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_option_to_day(
    p_option_id     uuid,
    p_source_day_id uuid,
    p_target_day_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- 0. If the source day had this option as its "active" selection, clear
    --    the pointer — the option is about to leave this day, so the
    --    reference would be semantically stale (the FK would still be valid
    --    because the option row survives, just on a different day). The
    --    frontend fallback (option_index = 1) takes over cleanly.
    UPDATE trip_days
    SET active_option_id = NULL
    WHERE day_id = p_source_day_id
      AND active_option_id = p_option_id;

    -- 1. Park the option at index 0 so it doesn't conflict
    UPDATE day_options
    SET option_index = 0
    WHERE option_id = p_option_id;

    -- 2. Renumber remaining source-day options starting from 1
    WITH ranked AS (
        SELECT option_id,
               ROW_NUMBER() OVER (ORDER BY option_index) AS new_index
        FROM day_options
        WHERE day_id = p_source_day_id
          AND option_id != p_option_id
          AND option_index > 0
    )
    UPDATE day_options d
    SET option_index = -(r.new_index)
    FROM ranked r
    WHERE d.option_id = r.option_id;

    UPDATE day_options
    SET option_index = -option_index
    WHERE day_id = p_source_day_id
      AND option_id != p_option_id
      AND option_index < 0;

    -- 3. If source day has no remaining options, create an empty main
    IF NOT EXISTS (
        SELECT 1 FROM day_options
        WHERE day_id = p_source_day_id AND option_id != p_option_id
    ) THEN
        INSERT INTO day_options (day_id, option_index)
        VALUES (p_source_day_id, 1);
    END IF;

    -- 4. Bump all target-day option indexes by 1 (negate trick for uniqueness)
    UPDATE day_options
    SET option_index = -option_index
    WHERE day_id = p_target_day_id;

    UPDATE day_options
    SET option_index = (-option_index) + 1
    WHERE day_id = p_target_day_id AND option_index < 0;

    -- 5. Move the option to the target day as main (index 1)
    UPDATE day_options
    SET day_id = p_target_day_id, option_index = 1
    WHERE option_id = p_option_id;
END;
$$;
