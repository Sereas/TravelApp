-- ============================================================
-- Migration: itinerary endpoint performance (6 RT → 2 RT)
-- 2026-03-16
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add optional p_user_id to get_itinerary_tree
--    When supplied, ownership is verified inline via EXISTS —
--    eliminates the separate round-trip to the trips table.
--    p_user_id DEFAULT NULL keeps the old signature compatible.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_itinerary_tree(
    p_trip_id  uuid,
    p_user_id  uuid DEFAULT NULL
)
RETURNS TABLE(
    day_id               uuid,
    day_date             date,
    day_sort_order       integer,
    day_created_at       timestamptz,
    option_id            uuid,
    option_index         integer,
    option_starting_city varchar,
    option_ending_city   varchar,
    option_created_by    varchar,
    option_created_at    timestamptz,
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
LANGUAGE sql
STABLE
AS $$
    SELECT
        d.day_id,
        d.date           AS day_date,
        d.sort_order     AS day_sort_order,
        d.created_at     AS day_created_at,
        o.option_id,
        o.option_index,
        o.starting_city  AS option_starting_city,
        o.ending_city    AS option_ending_city,
        o.created_by     AS option_created_by,
        o.created_at     AS option_created_at,
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
        l.requires_booking AS loc_requires_booking
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    WHERE d.trip_id = p_trip_id
      AND (
          p_user_id IS NULL
          OR EXISTS (
              SELECT 1 FROM trips t
              WHERE t.trip_id = p_trip_id
                AND t.user_id = p_user_id
          )
      )
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;


-- ------------------------------------------------------------
-- 2. New get_itinerary_routes(p_option_ids uuid[])
--    Replaces 4 sequential Python queries (option_routes,
--    route_stops, route_segments, segment_cache) with a single
--    LEFT JOIN LATERAL pass — returns one row per route with
--    stop_location_ids and segments pre-aggregated as JSON.
-- ------------------------------------------------------------
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
                'distance_meters',  sc.distance_meters
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
