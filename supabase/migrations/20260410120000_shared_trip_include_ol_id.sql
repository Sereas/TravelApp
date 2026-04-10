-- ============================================================================
-- Migration: get_shared_trip_data — include ol.id in itinerary_rows
--
-- Bug: the public shared trip endpoint returned option_locations only by
-- their underlying location_id, not by their option_location row id. The
-- frontend route display (in ItineraryRouteManager) matches route stops
-- by option_location row id, so stops resolved to "?" in the shared view
-- while rendering correctly in the authenticated /trips/[id] view.
--
-- Root cause: the SELECT inside get_shared_trip_data's itinerary_rows CTE
-- projected `ol.location_id` but not `ol.id`. When the shared_trips.py
-- endpoint passes these rows to the shared `_rpc_rows_to_tree_data`
-- helper, the helper looked for `ol_id` and found nothing, falling back
-- to the underlying `location_id`. `ItineraryRoute.option_location_ids`
-- (fetched separately via get_itinerary_routes) correctly holds
-- option_location row ids, so the frontend `find()` never matched and
-- rendered "?" for every stop name.
--
-- Fix: add `ol.id AS ol_id` to the itinerary_rows projection, matching
-- the authenticated `get_itinerary_tree(p_trip_id, p_user_id)` RPC which
-- already exposes `ol_id` for the same reason.
--
-- No frontend or Python changes required: `_rpc_rows_to_tree_data`
-- already reads `r.get("ol_id")`. With this column present the shared
-- view automatically matches route stops to locations.
-- ============================================================================

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
      d.date           AS day_date,
      d.sort_order     AS day_sort_order,
      d.created_at     AS day_created_at,
      o.option_id,
      o.option_index,
      o.starting_city  AS option_starting_city,
      o.ending_city    AS option_ending_city,
      o.created_at     AS option_created_at,
      ol.id            AS ol_id,
      ol.location_id,
      ol.sort_order    AS ol_sort_order,
      ol.time_period,
      l.name           AS loc_name,
      l.city           AS loc_city,
      l.address        AS loc_address,
      l.google_link    AS loc_google_link,
      l.category       AS loc_category,
      l.note           AS loc_note,
      l.working_hours  AS loc_working_hours,
      l.requires_booking AS loc_requires_booking,
      pp.photo_url     AS loc_photo_url,
      l.user_image_url AS loc_user_image_url,
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

-- Re-assert the anon grant — `CREATE OR REPLACE` preserves it, but restating
-- is cheap and protects against drift.
GRANT EXECUTE ON FUNCTION public.get_shared_trip_data(text) TO anon;
