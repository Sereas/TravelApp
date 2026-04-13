-- Add useful_link column to locations table
ALTER TABLE public.locations ADD COLUMN useful_link text;
COMMENT ON COLUMN public.locations.useful_link IS 'Optional user-supplied URL (booking, menu, video, etc). Validated as http/https in Python.';

-- Update get_itinerary_tree (1-param) to include useful_link
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid);
CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid)
RETURNS TABLE(
    day_id uuid, day_date date, day_sort_order integer,
    day_created_at timestamp with time zone, day_active_option_id uuid,
    option_id uuid, option_index integer,
    option_starting_city character varying, option_ending_city character varying,
    option_created_by character varying, option_created_at timestamp with time zone,
    ol_id uuid, location_id uuid, ol_sort_order integer, time_period text,
    loc_name text, loc_city text, loc_address text, loc_google_link text,
    loc_category text, loc_note text, loc_working_hours text, loc_requires_booking text,
    loc_useful_link text,
    loc_latitude double precision, loc_longitude double precision
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
        l.useful_link      AS loc_useful_link,
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
ALTER FUNCTION public.get_itinerary_tree(uuid) OWNER TO postgres;

-- Update get_itinerary_tree (2-param) to include useful_link
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
    loc_category text, loc_note text, loc_working_hours text, loc_requires_booking text,
    loc_photo_url text, loc_user_image_url text,
    loc_attribution_name text, loc_attribution_uri text,
    loc_useful_link text,
    loc_latitude double precision, loc_longitude double precision
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
          SELECT 1 FROM trips t
          WHERE t.trip_id = p_trip_id AND t.user_id = p_user_id
      ))
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;
ALTER FUNCTION public.get_itinerary_tree(uuid, uuid) OWNER TO postgres;

-- Update get_shared_trip_data to include useful_link in both subqueries
CREATE OR REPLACE FUNCTION public.get_shared_trip_data(p_share_token text) RETURNS json
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
      l.useful_link,
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
      l.useful_link      AS loc_useful_link,
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
ALTER FUNCTION public.get_shared_trip_data(text) OWNER TO postgres;

-- Re-grant execute to anon/authenticated (matches existing grants)
GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_trip_data(text) TO anon;
GRANT ALL ON FUNCTION public.get_shared_trip_data(text) TO authenticated;
