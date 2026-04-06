-- ============================================================================
-- Migration: route_stops.location_id → route_stops.option_location_id
--
-- Routes now reference option_locations.id (the specific instance within an
-- option) instead of locations.location_id. This fixes the bug where duplicate
-- locations in an option (e.g., hotel bookend) all showed the same route
-- badges because route matching used the ambiguous location_id.
-- ============================================================================

-- 1. Add new column (nullable for backfill)
ALTER TABLE route_stops ADD COLUMN option_location_id uuid;

-- 2. Backfill from existing data: join through option_routes to find the
--    matching option_location within the same option.
--    DISTINCT ON picks the first match by sort_order (for duplicates, which
--    were just enabled — existing data has at most one per option).
UPDATE route_stops rs
SET option_location_id = sub.ol_id
FROM (
    SELECT DISTINCT ON (rs2.route_id, rs2.stop_order)
        rs2.route_id,
        rs2.stop_order,
        ol.id AS ol_id
    FROM route_stops rs2
    JOIN option_routes r ON r.route_id = rs2.route_id
    JOIN option_locations ol ON ol.option_id = r.option_id
                            AND ol.location_id = rs2.location_id
    ORDER BY rs2.route_id, rs2.stop_order, ol.sort_order
) sub
WHERE rs.route_id = sub.route_id
  AND rs.stop_order = sub.stop_order;

-- 3. Clean up orphaned stops (option_location deleted but route_stop remained)
--    First delete routes that would drop below 2 stops after orphan removal
DELETE FROM option_routes
WHERE route_id IN (
    SELECT rs.route_id
    FROM route_stops rs
    WHERE rs.option_location_id IS NULL
    GROUP BY rs.route_id
    HAVING (
        SELECT COUNT(*) FROM route_stops r2
        WHERE r2.route_id = rs.route_id AND r2.option_location_id IS NOT NULL
    ) < 2
);
DELETE FROM route_stops WHERE option_location_id IS NULL;

-- 4. Make NOT NULL
ALTER TABLE route_stops ALTER COLUMN option_location_id SET NOT NULL;

-- 5. Drop old PK and FK
ALTER TABLE route_stops DROP CONSTRAINT route_stops_pkey;
ALTER TABLE route_stops DROP CONSTRAINT route_stops_location_id_fkey;

-- 6. Drop old column
ALTER TABLE route_stops DROP COLUMN location_id;

-- 7. Add new PK and constraints
ALTER TABLE route_stops ADD CONSTRAINT route_stops_pkey
    PRIMARY KEY (route_id, stop_order);

ALTER TABLE route_stops ADD CONSTRAINT route_stops_option_location_id_fkey
    FOREIGN KEY (option_location_id) REFERENCES option_locations(id) ON DELETE CASCADE;

-- 8. Indexes
DROP INDEX IF EXISTS idx_route_stops_location_id;
CREATE INDEX idx_route_stops_option_location_id ON route_stops (option_location_id);

-- ============================================================================
-- RPCs
-- ============================================================================

-- 9. create_route_with_stops: p_location_ids → p_option_location_ids
CREATE OR REPLACE FUNCTION public.create_route_with_stops(
    p_option_id           uuid,
    p_transport_mode      varchar,
    p_label               varchar,
    p_option_location_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_route_id  uuid;
  v_max_order int;
BEGIN
  -- Validate all option_location_ids belong to this option
  IF EXISTS (
      SELECT 1 FROM unnest(p_option_location_ids) AS t(ol_id)
      WHERE NOT EXISTS (
          SELECT 1 FROM option_locations ol
          WHERE ol.id = t.ol_id AND ol.option_id = p_option_id
      )
  ) THEN
      RAISE EXCEPTION 'INVALID_OPTION_LOCATION_IDS';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_max_order
  FROM option_routes WHERE option_id = p_option_id;

  INSERT INTO option_routes (option_id, transport_mode, label, sort_order)
  VALUES (p_option_id, p_transport_mode, p_label, v_max_order)
  RETURNING route_id INTO v_route_id;

  INSERT INTO route_stops (route_id, option_location_id, stop_order)
  SELECT v_route_id, ol_id, idx - 1
  FROM unnest(p_option_location_ids) WITH ORDINALITY AS t(ol_id, idx);

  RETURN json_build_object(
    'route_id',              v_route_id,
    'option_id',             p_option_id,
    'transport_mode',        p_transport_mode,
    'label',                 p_label,
    'sort_order',            v_max_order,
    'option_location_ids',   p_option_location_ids
  );
END;
$$;

-- 10. update_route_with_stops: p_location_ids → p_option_location_ids
CREATE OR REPLACE FUNCTION public.update_route_with_stops(
    p_route_id            uuid,
    p_option_id           uuid,
    p_transport_mode      text DEFAULT NULL,
    p_label               text DEFAULT NULL,
    p_option_location_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(route_id uuid, option_id uuid, label text, transport_mode text,
              duration_seconds integer, distance_meters integer, sort_order integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM option_routes r
        WHERE r.route_id = p_route_id AND r.option_id = p_option_id
    ) THEN
        RAISE EXCEPTION 'ROUTE_NOT_FOUND';
    END IF;

    UPDATE option_routes r SET
        transport_mode = COALESCE(p_transport_mode, r.transport_mode),
        label          = COALESCE(p_label, r.label)
    WHERE r.route_id = p_route_id;

    IF p_option_location_ids IS NOT NULL THEN
        -- Validate all option_location_ids belong to this option
        IF EXISTS (
            SELECT 1 FROM unnest(p_option_location_ids) AS t(ol_id)
            WHERE NOT EXISTS (
                SELECT 1 FROM option_locations ol
                WHERE ol.id = t.ol_id AND ol.option_id = p_option_id
            )
        ) THEN
            RAISE EXCEPTION 'INVALID_OPTION_LOCATION_IDS';
        END IF;

        DELETE FROM route_segments rs WHERE rs.route_id = p_route_id;
        DELETE FROM route_stops s WHERE s.route_id = p_route_id;
        INSERT INTO route_stops (route_id, option_location_id, stop_order)
        SELECT p_route_id, ol_id, idx - 1
        FROM unnest(p_option_location_ids) WITH ORDINALITY AS t(ol_id, idx);
        UPDATE option_routes r SET
            duration_seconds = NULL,
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

-- 11. get_option_routes: stop ids now from option_location_id
CREATE OR REPLACE FUNCTION public.get_option_routes(p_option_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT COALESCE(
        json_agg(
            json_build_object(
                'route_id',              r.route_id,
                'option_id',             r.option_id,
                'label',                 r.label,
                'transport_mode',        r.transport_mode,
                'duration_seconds',      r.duration_seconds,
                'distance_meters',       r.distance_meters,
                'sort_order',            r.sort_order,
                'option_location_ids',   COALESCE(stops.ids, '[]'::json)
            )
            ORDER BY r.sort_order
        ),
        '[]'::json
    )
    FROM option_routes r
    LEFT JOIN LATERAL (
        SELECT json_agg(s.option_location_id ORDER BY s.stop_order) AS ids
        FROM route_stops s
        WHERE s.route_id = r.route_id
    ) stops ON true
    WHERE r.option_id = p_option_id;
$$;

-- 12. get_itinerary_routes: stop ids now from option_location_id
CREATE OR REPLACE FUNCTION public.get_itinerary_routes(p_option_ids uuid[])
RETURNS TABLE(route_id uuid, option_id uuid, label text, transport_mode text,
              duration_seconds integer, distance_meters integer, sort_order integer,
              stop_option_location_ids json, segments json)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT
        r.route_id,
        r.option_id,
        r.label::text,
        r.transport_mode::text,
        r.duration_seconds,
        r.distance_meters,
        r.sort_order,
        COALESCE(stops.ids,  '[]'::json) AS stop_option_location_ids,
        COALESCE(segs.data,  '[]'::json) AS segments
    FROM option_routes r
    LEFT JOIN LATERAL (
        SELECT json_agg(s.option_location_id ORDER BY s.stop_order) AS ids
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

-- 13. remove_location_from_option: route cleanup now via option_location_id
--     With ON DELETE CASCADE on route_stops FK, deleting an option_location
--     auto-deletes its route_stops. We must check routes BEFORE the cascade.
CREATE OR REPLACE FUNCTION public.remove_location_from_option(
    p_option_id uuid,
    p_ol_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_route_id    uuid;
    v_stop_count  integer;
    v_affected_routes uuid[];
BEGIN
    -- Verify the option_location exists
    IF NOT EXISTS (
        SELECT 1 FROM option_locations
        WHERE id = p_ol_id AND option_id = p_option_id
    ) THEN
        RAISE EXCEPTION 'OPTION_LOCATION_NOT_FOUND';
    END IF;

    -- Collect routes affected by this option_location BEFORE cascade
    SELECT array_agg(DISTINCT rs.route_id)
    INTO v_affected_routes
    FROM route_stops rs
    WHERE rs.option_location_id = p_ol_id;

    -- Delete the option_location (cascades to route_stops via FK)
    DELETE FROM option_locations WHERE id = p_ol_id;

    -- Clean up affected routes
    IF v_affected_routes IS NOT NULL THEN
        FOREACH v_route_id IN ARRAY v_affected_routes LOOP
            SELECT COUNT(*) INTO v_stop_count
            FROM route_stops WHERE route_id = v_route_id;

            IF v_stop_count < 2 THEN
                -- Route has fewer than 2 stops, delete it entirely
                DELETE FROM option_routes WHERE route_id = v_route_id;
            ELSE
                -- Remove stale segments and renumber
                DELETE FROM route_segments
                WHERE route_id = v_route_id;

                WITH numbered AS (
                    SELECT stop_order AS old_order,
                           ROW_NUMBER() OVER (ORDER BY stop_order) - 1 AS new_order
                    FROM route_stops WHERE route_id = v_route_id
                )
                UPDATE route_stops rs SET stop_order = numbered.new_order
                FROM numbered
                WHERE rs.route_id = v_route_id
                  AND rs.stop_order = numbered.old_order;

                -- Reset metrics (segments were deleted, need recalculation)
                UPDATE option_routes
                SET duration_seconds = NULL, distance_meters = NULL
                WHERE route_id = v_route_id;
            END IF;
        END LOOP;
    END IF;
END;
$$;

-- 14. delete_location_cascade: route cleanup via option_locations join
CREATE OR REPLACE FUNCTION public.delete_location_cascade(
    p_trip_id     uuid,
    p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_route_id    uuid;
    v_stop_count  integer;
    v_affected_routes uuid[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations
        WHERE location_id = p_location_id AND trip_id = p_trip_id
    ) THEN
        RAISE EXCEPTION 'LOCATION_NOT_FOUND';
    END IF;

    -- Collect routes referencing this location via option_locations
    SELECT array_agg(DISTINCT rs.route_id)
    INTO v_affected_routes
    FROM route_stops rs
    JOIN option_locations ol ON ol.id = rs.option_location_id
    WHERE ol.location_id = p_location_id;

    -- Delete the location (cascades: locations → option_locations → route_stops)
    DELETE FROM locations
    WHERE location_id = p_location_id AND trip_id = p_trip_id;

    -- Clean up affected routes (some may have lost stops due to cascade)
    IF v_affected_routes IS NOT NULL THEN
        FOREACH v_route_id IN ARRAY v_affected_routes LOOP
            -- Check if route still exists (may have been cascade-deleted)
            IF NOT EXISTS (SELECT 1 FROM option_routes WHERE route_id = v_route_id) THEN
                CONTINUE;
            END IF;

            SELECT COUNT(*) INTO v_stop_count
            FROM route_stops WHERE route_id = v_route_id;

            IF v_stop_count < 2 THEN
                DELETE FROM option_routes WHERE route_id = v_route_id;
            ELSE
                -- Delete stale segments and renumber stops
                DELETE FROM route_segments WHERE route_id = v_route_id;

                WITH numbered AS (
                    SELECT stop_order AS old_order,
                           ROW_NUMBER() OVER (ORDER BY stop_order) - 1 AS new_order
                    FROM route_stops WHERE route_id = v_route_id
                )
                UPDATE route_stops rs SET stop_order = numbered.new_order
                FROM numbered
                WHERE rs.route_id = v_route_id
                  AND rs.stop_order = numbered.old_order;

                UPDATE option_routes
                SET duration_seconds = NULL, distance_meters = NULL
                WHERE route_id = v_route_id;
            END IF;
        END LOOP;
    END IF;
END;
$$;
