-- Migration: widen get_itinerary_tree and get_shared_trip_data to include
-- loc_latitude and loc_longitude so the frontend can render map pins from
-- the itinerary tree without a second query.
--
-- Preserves ALL existing columns; lat/lng are new additions only.
-- Do NOT apply this migration yourself — leave it to the project owner via MCP.

-- ============================================================
-- 1. Drop + recreate the 1-arg overload (internal / admin use)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_itinerary_tree(p_trip_id uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid)
RETURNS TABLE(
    day_id uuid,
    day_date date,
    day_sort_order integer,
    day_created_at timestamp with time zone,
    day_active_option_id uuid,
    option_id uuid,
    option_index integer,
    option_starting_city character varying,
    option_ending_city character varying,
    option_created_by character varying,
    option_created_at timestamp with time zone,
    ol_id uuid,
    location_id uuid,
    ol_sort_order integer,
    time_period text,
    loc_name text,
    loc_city text,
    loc_address text,
    loc_google_link text,
    loc_category text,
    loc_note text,
    loc_working_hours text,
    loc_requires_booking text,
    loc_latitude double precision,
    loc_longitude double precision
)
    LANGUAGE sql STABLE
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
        l.latitude         AS loc_latitude,
        l.longitude        AS loc_longitude
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    WHERE d.trip_id = p_trip_id
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

ALTER FUNCTION public.get_itinerary_tree(p_trip_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid) TO service_role;


-- ============================================================
-- 2. Drop + recreate the 2-arg overload (primary, ownership-checked)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid);

CREATE FUNCTION public.get_itinerary_tree(
    p_trip_id uuid,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    day_id uuid,
    day_date date,
    day_sort_order integer,
    day_created_at timestamp with time zone,
    day_active_option_id uuid,
    option_id uuid,
    option_index integer,
    option_starting_city character varying,
    option_ending_city character varying,
    option_created_by character varying,
    option_created_at timestamp with time zone,
    ol_id uuid,
    location_id uuid,
    ol_sort_order integer,
    time_period text,
    loc_name text,
    loc_city text,
    loc_address text,
    loc_google_link text,
    loc_category text,
    loc_note text,
    loc_working_hours text,
    loc_requires_booking text,
    loc_photo_url text,
    loc_user_image_url text,
    loc_attribution_name text,
    loc_attribution_uri text,
    loc_latitude double precision,
    loc_longitude double precision
)
    LANGUAGE sql STABLE
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
        l.user_image_url   AS loc_user_image_url,
        pp.attribution_name AS loc_attribution_name,
        pp.attribution_uri  AS loc_attribution_uri,
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
          SELECT 1 FROM trips t
          WHERE t.trip_id = p_trip_id AND t.user_id = p_user_id
      ))
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

ALTER FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) TO service_role;


-- ============================================================
-- 3. Drop + recreate get_shared_trip_data with lat/lng in itinerary CTE
-- ============================================================

DROP FUNCTION IF EXISTS public.get_shared_trip_data(p_share_token text);

CREATE FUNCTION public.get_shared_trip_data(p_share_token text) RETURNS json
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
      pp.attribution_uri  AS loc_attribution_uri,
      l.latitude         AS loc_latitude,
      l.longitude        AS loc_longitude
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

ALTER FUNCTION public.get_shared_trip_data(p_share_token text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO anon;
GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO service_role;
