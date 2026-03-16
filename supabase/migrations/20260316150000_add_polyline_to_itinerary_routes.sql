-- Add encoded_polyline to get_itinerary_routes segments JSON
-- so the frontend map can render route lines without extra API calls.

CREATE OR REPLACE FUNCTION public.get_itinerary_routes(
    p_option_ids uuid[]
)
RETURNS TABLE(
    route_id          uuid,
    option_id         uuid,
    label             text,
    transport_mode    text,
    duration_seconds  integer,
    distance_meters   integer,
    sort_order        integer,
    stop_location_ids json,
    segments          json
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        r.route_id,
        r.option_id,
        r.label::text,
        r.transport_mode::text,
        r.duration_seconds,
        r.distance_meters,
        r.sort_order,
        COALESCE(stops.ids,  '[]'::json) AS stop_location_ids,
        COALESCE(segs.data,  '[]'::json) AS segments
    FROM option_routes r
    LEFT JOIN LATERAL (
        SELECT json_agg(s.location_id ORDER BY s.stop_order) AS ids
        FROM route_stops s
        WHERE s.route_id = r.route_id
    ) stops ON true
    LEFT JOIN LATERAL (
        SELECT json_agg(
            json_build_object(
                'segment_order',    rs.segment_order,
                'duration_seconds', sc.duration_seconds,
                'distance_meters',  sc.distance_meters,
                'encoded_polyline', sc.encoded_polyline
            )
            ORDER BY rs.segment_order
        ) AS data
        FROM route_segments rs
        LEFT JOIN segment_cache sc ON sc.id = rs.segment_cache_id
        WHERE rs.route_id = r.route_id
    ) segs ON true
    WHERE r.option_id = ANY(p_option_ids)
    ORDER BY r.sort_order;
$$;
