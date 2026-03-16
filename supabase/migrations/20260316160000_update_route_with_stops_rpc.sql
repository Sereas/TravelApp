-- Atomic RPC for editing a route: update metadata and/or replace stops.
-- Deletes route_segments (stale mappings) but leaves segment_cache intact
-- so unchanged stop-pairs reuse cached results on next calculation.

CREATE OR REPLACE FUNCTION public.update_route_with_stops(
    p_route_id       uuid,
    p_option_id      uuid,
    p_transport_mode text    DEFAULT NULL,
    p_label          text    DEFAULT NULL,
    p_location_ids   uuid[]  DEFAULT NULL
)
RETURNS TABLE(
    route_id         uuid,
    option_id        uuid,
    label            text,
    transport_mode   text,
    duration_seconds integer,
    distance_meters  integer,
    sort_order       integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify route belongs to option
    IF NOT EXISTS (
        SELECT 1 FROM option_routes r
        WHERE r.route_id = p_route_id AND r.option_id = p_option_id
    ) THEN
        RAISE EXCEPTION 'ROUTE_NOT_FOUND';
    END IF;

    -- Update transport_mode / label if provided
    UPDATE option_routes r
    SET transport_mode = COALESCE(p_transport_mode, r.transport_mode),
        label          = COALESCE(p_label, r.label)
    WHERE r.route_id = p_route_id;

    -- Replace stops if new location_ids provided
    IF p_location_ids IS NOT NULL THEN
        -- Delete stale route_segments (mapping rows, not cache)
        DELETE FROM route_segments rs WHERE rs.route_id = p_route_id;
        -- Delete old stops
        DELETE FROM route_stops s WHERE s.route_id = p_route_id;
        -- Insert new stops
        INSERT INTO route_stops (route_id, location_id, stop_order)
        SELECT p_route_id, lid, idx - 1
        FROM unnest(p_location_ids) WITH ORDINALITY AS t(lid, idx);
        -- Reset aggregated metrics (will be recalculated)
        UPDATE option_routes r
        SET duration_seconds = NULL,
            distance_meters  = NULL
        WHERE r.route_id = p_route_id;
    END IF;

    RETURN QUERY
    SELECT r.route_id, r.option_id, r.label::text, r.transport_mode::text,
           r.duration_seconds, r.distance_meters, r.sort_order
    FROM option_routes r
    WHERE r.route_id = p_route_id;
END;
$$;
