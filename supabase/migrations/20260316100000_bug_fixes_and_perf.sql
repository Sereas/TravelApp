-- ============================================================
-- Migration: bug fixes and performance improvements
-- 2026-03-16
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fix segment_cache.status default
--    Default was 'ok' which violates the CHECK constraint.
--    Python code always supplies status explicitly; legacy 'ok'
--    rows are handled by STATUS_LEGACY_TO_NEW in Python.
-- ------------------------------------------------------------
ALTER TABLE segment_cache ALTER COLUMN status SET DEFAULT 'success';


-- ------------------------------------------------------------
-- 2. Add missing FK: route_stops.location_id → locations
--    Without this, deleting a location leaves orphaned stops.
--    Index first (required for FK performance on the referencing side).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_stops_location_id
    ON route_stops (location_id);

ALTER TABLE route_stops
    ADD CONSTRAINT route_stops_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES locations (location_id)
    ON DELETE RESTRICT;


-- ------------------------------------------------------------
-- 3. Add missing index: locations.google_place_id
--    Used in cache key construction; partial index (most rows have it).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_locations_google_place_id
    ON locations (google_place_id)
    WHERE google_place_id IS NOT NULL;


-- ------------------------------------------------------------
-- 4. Fix trips.modified_at: non-TZ timestamp → timestamptz
--    All other timestamp columns use timestamptz; this was inconsistent.
-- ------------------------------------------------------------
ALTER TABLE trips
    ALTER COLUMN modified_at TYPE timestamptz
    USING modified_at AT TIME ZONE 'UTC';


-- ------------------------------------------------------------
-- 5. Rewrite batch_insert_option_locations
--    Was: N individual INSERTs in a PL/pgSQL loop.
--    Now: single set-based INSERT using unnest() — one round-trip.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batch_insert_option_locations(
    p_option_id   uuid,
    p_location_ids uuid[],
    p_sort_orders  integer[],
    p_time_periods text[]
)
RETURNS SETOF option_locations
LANGUAGE sql
SECURITY DEFINER
AS $$
    INSERT INTO option_locations (option_id, location_id, sort_order, time_period)
    SELECT
        p_option_id,
        unnest(p_location_ids),
        unnest(p_sort_orders),
        unnest(p_time_periods)
    RETURNING *;
$$;


-- ------------------------------------------------------------
-- 6. Rewrite reorder_option_locations
--    Was: N individual UPDATEs in a PL/pgSQL loop.
--    Now: single UPDATE FROM unnest() — one round-trip.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_option_locations(
    p_option_id    uuid,
    p_location_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE option_locations ol
    SET sort_order = t.ord - 1
    FROM (
        SELECT
            unnest(p_location_ids)              AS location_id,
            generate_subscripts(p_location_ids, 1) AS ord
    ) t
    WHERE ol.option_id    = p_option_id
      AND ol.location_id  = t.location_id;
$$;


-- ------------------------------------------------------------
-- 7. Rewrite get_option_routes
--    Was: correlated subquery inside json_agg (runs once per route).
--    Now: single LEFT JOIN LATERAL with pre-aggregated stops — one pass.
--    Also marked STABLE so the planner can cache results within a query.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_option_routes(p_option_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT COALESCE(
        json_agg(
            json_build_object(
                'route_id',         r.route_id,
                'option_id',        r.option_id,
                'label',            r.label,
                'transport_mode',   r.transport_mode,
                'duration_seconds', r.duration_seconds,
                'distance_meters',  r.distance_meters,
                'sort_order',       r.sort_order,
                'location_ids',     COALESCE(stops.ids, '[]'::json)
            )
            ORDER BY r.sort_order
        ),
        '[]'::json
    )
    FROM option_routes r
    LEFT JOIN LATERAL (
        SELECT json_agg(s.location_id ORDER BY s.stop_order) AS ids
        FROM route_stops s
        WHERE s.route_id = r.route_id
    ) stops ON true
    WHERE r.option_id = p_option_id;
$$;
