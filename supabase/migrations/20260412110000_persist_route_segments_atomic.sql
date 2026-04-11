-- Phase 4: atomic route_segments persist — replaces sequential delete+insert+update.
-- Wraps DELETE route_segments + INSERT route_segments + UPDATE option_routes totals
-- in a single transaction so the UI never sees a partially-written state.
CREATE OR REPLACE FUNCTION persist_route_segments(
  p_route_id       uuid,
  p_segment_rows   jsonb,
  p_total_duration integer,
  p_total_distance integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Defense in depth: fail loudly if the route doesn't exist, so a caller
  -- that accidentally bypassed upstream ownership checks can't silently
  -- delete+recreate segments under a non-existent route_id.
  IF NOT EXISTS (SELECT 1 FROM option_routes WHERE route_id = p_route_id) THEN
    RAISE EXCEPTION 'ROUTE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Clear old segments for this route
  DELETE FROM route_segments WHERE route_id = p_route_id;

  -- Batch insert new segments (empty array is a no-op)
  INSERT INTO route_segments (route_id, segment_order, from_location_id, to_location_id, segment_cache_id)
  SELECT
    p_route_id,
    (r->>'segment_order')::integer,
    (r->>'from_location_id')::uuid,
    (r->>'to_location_id')::uuid,
    (r->>'segment_cache_id')::uuid
  FROM jsonb_array_elements(p_segment_rows) AS r;

  -- Update route totals atomically with the segment write
  UPDATE option_routes
  SET
    duration_seconds = p_total_duration,
    distance_meters  = p_total_distance
  WHERE route_id = p_route_id;
END;
$$;

REVOKE ALL ON FUNCTION persist_route_segments(uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION persist_route_segments(uuid, jsonb, integer, integer) TO service_role;
