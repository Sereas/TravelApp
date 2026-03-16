-- ============================================================
-- Migration: atomic remove_location_from_option RPC
-- 2026-03-16
-- ============================================================

-- ------------------------------------------------------------
-- remove_location_from_option
--    Replaces ~7 sequential Python queries (route_stops lookup,
--    per-route stop count, conditional route/stop delete,
--    option_locations delete) with a single PL/pgSQL transaction.
--
--    Behaviour:
--    - If (option_id, location_id) does not exist → raises
--      exception 'OPTION_LOCATION_NOT_FOUND'.
--    - For each route on this option that has this location as a
--      stop: if remaining stops ≤ 1 after removal, delete the
--      route (cascade deletes its stops). Otherwise, delete only
--      the stop for this location.
--    - Finally, deletes the option_locations row.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_location_from_option(
    p_option_id   uuid,
    p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_route_id   uuid;
    v_stop_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM option_locations
        WHERE option_id   = p_option_id
          AND location_id = p_location_id
    ) THEN
        RAISE EXCEPTION 'OPTION_LOCATION_NOT_FOUND';
    END IF;

    FOR v_route_id IN
        SELECT rs.route_id
        FROM route_stops rs
        JOIN option_routes r ON r.route_id = rs.route_id
        WHERE rs.location_id = p_location_id
          AND r.option_id    = p_option_id
    LOOP
        SELECT COUNT(*) INTO v_stop_count
        FROM route_stops
        WHERE route_id = v_route_id;

        IF v_stop_count <= 2 THEN
            -- Route would have < 2 stops — not meaningful; delete it.
            -- FK cascade deletes route_stops and route_segments.
            DELETE FROM option_routes WHERE route_id = v_route_id;
        ELSE
            DELETE FROM route_stops
            WHERE route_id   = v_route_id
              AND location_id = p_location_id;
        END IF;
    END LOOP;

    DELETE FROM option_locations
    WHERE option_id   = p_option_id
      AND location_id = p_location_id;
END;
$$;
