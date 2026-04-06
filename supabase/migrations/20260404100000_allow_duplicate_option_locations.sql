-- ============================================================================
-- Migration: Allow duplicate locations in day options
--
-- Adds a surrogate UUID primary key to option_locations, replacing the
-- composite PK (option_id, location_id). This allows the same location
-- to appear multiple times in a single day option (e.g., hotel bookend,
-- circular routes).
-- ============================================================================

-- 1. Add surrogate id column
ALTER TABLE option_locations
  ADD COLUMN id uuid DEFAULT gen_random_uuid() NOT NULL;

-- 2. Drop old composite PK
ALTER TABLE option_locations
  DROP CONSTRAINT option_locations_pkey;

-- 3. Add new surrogate PK
ALTER TABLE option_locations
  ADD CONSTRAINT option_locations_pkey PRIMARY KEY (id);

-- 4. Non-unique index on old pair
CREATE INDEX idx_option_locations_option_location
  ON option_locations (option_id, location_id);

-- ============================================================================
-- RPCs
-- ============================================================================

-- 5. batch_insert — re-create to pick up new column
CREATE OR REPLACE FUNCTION public.batch_insert_option_locations(
    p_option_id    uuid,
    p_location_ids uuid[],
    p_sort_orders  integer[],
    p_time_periods text[]
)
RETURNS SETOF option_locations
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
    INSERT INTO option_locations (option_id, location_id, sort_order, time_period)
    SELECT p_option_id, unnest(p_location_ids), unnest(p_sort_orders), unnest(p_time_periods)
    RETURNING *;
$$;

-- 6. reorder — now accepts ol_ids (option_locations.id) instead of location_ids
DROP FUNCTION IF EXISTS public.reorder_option_locations(uuid, uuid[]);

CREATE FUNCTION public.reorder_option_locations(
    p_option_id uuid,
    p_ol_ids    uuid[]
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
    UPDATE option_locations ol
    SET sort_order = t.ord - 1
    FROM (
        SELECT unnest(p_ol_ids) AS ol_id,
               generate_subscripts(p_ol_ids, 1) AS ord
    ) t
    WHERE ol.id = t.ol_id AND ol.option_id = p_option_id;
$$;

-- 7. remove — now accepts ol_id (option_locations.id) instead of location_id
DROP FUNCTION IF EXISTS public.remove_location_from_option(uuid, uuid);

CREATE FUNCTION public.remove_location_from_option(
    p_option_id uuid,
    p_ol_id     uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_location_id uuid;
    v_route_id    uuid;
    v_stop_count  integer;
    v_still_used  boolean;
    v_total_dur   integer;
    v_total_dist  integer;
BEGIN
    SELECT location_id INTO v_location_id
    FROM option_locations
    WHERE id = p_ol_id AND option_id = p_option_id;

    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'OPTION_LOCATION_NOT_FOUND';
    END IF;

    DELETE FROM option_locations WHERE id = p_ol_id;

    SELECT EXISTS(
        SELECT 1 FROM option_locations
        WHERE option_id = p_option_id AND location_id = v_location_id
    ) INTO v_still_used;

    IF NOT v_still_used THEN
        FOR v_route_id IN
            SELECT rs.route_id
            FROM route_stops rs
            JOIN option_routes r ON r.route_id = rs.route_id
            WHERE rs.location_id = v_location_id
              AND r.option_id    = p_option_id
        LOOP
            SELECT COUNT(*) INTO v_stop_count
            FROM route_stops WHERE route_id = v_route_id;

            IF v_stop_count <= 2 THEN
                DELETE FROM option_routes WHERE route_id = v_route_id;
            ELSE
                DELETE FROM route_segments
                WHERE route_id = v_route_id
                  AND (from_location_id = v_location_id OR to_location_id = v_location_id);

                DELETE FROM route_stops
                WHERE route_id = v_route_id AND location_id = v_location_id;

                WITH numbered AS (
                    SELECT route_id, location_id,
                           ROW_NUMBER() OVER (ORDER BY stop_order) - 1 AS new_order
                    FROM route_stops WHERE route_id = v_route_id
                )
                UPDATE route_stops rs SET stop_order = numbered.new_order
                FROM numbered
                WHERE rs.route_id = numbered.route_id AND rs.location_id = numbered.location_id;

                WITH numbered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY segment_order) - 1 AS new_order
                    FROM route_segments WHERE route_id = v_route_id
                )
                UPDATE route_segments seg SET segment_order = numbered.new_order
                FROM numbered WHERE seg.id = numbered.id;

                SELECT COALESCE(SUM(sc.duration_seconds), 0),
                       COALESCE(SUM(sc.distance_meters), 0)
                INTO v_total_dur, v_total_dist
                FROM route_segments rseg
                JOIN segment_cache sc ON sc.id = rseg.segment_cache_id
                WHERE rseg.route_id = v_route_id;

                UPDATE option_routes
                SET duration_seconds = v_total_dur, distance_meters = v_total_dist
                WHERE route_id = v_route_id;
            END IF;
        END LOOP;
    END IF;
END;
$$;

-- 8. get_itinerary_tree (1-param) — add ol_id
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid)
RETURNS TABLE(
    day_id uuid, day_date date, day_sort_order integer, day_created_at timestamptz,
    option_id uuid, option_index integer,
    option_starting_city varchar, option_ending_city varchar,
    option_created_by varchar, option_created_at timestamptz,
    ol_id uuid, location_id uuid, ol_sort_order integer, time_period text,
    loc_name text, loc_city text, loc_address text,
    loc_google_link text, loc_category text, loc_note text,
    loc_working_hours text, loc_requires_booking text
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT d.day_id, d.date, d.sort_order, d.created_at,
    o.option_id, o.option_index, o.starting_city, o.ending_city, o.created_by, o.created_at,
    ol.id, ol.location_id, ol.sort_order, ol.time_period,
    l.name, l.city, l.address, l.google_link, l.category, l.note, l.working_hours, l.requires_booking
  FROM trip_days d
  LEFT JOIN day_options o ON o.day_id = d.day_id
  LEFT JOIN option_locations ol ON ol.option_id = o.option_id
  LEFT JOIN locations l ON l.trip_id = d.trip_id AND l.location_id = ol.location_id
  WHERE d.trip_id = p_trip_id
  ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

-- 9. get_itinerary_tree (2-param with p_user_id) — add ol_id
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid, uuid);

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
    day_id uuid, day_date date, day_sort_order integer, day_created_at timestamptz,
    option_id uuid, option_index integer,
    option_starting_city varchar, option_ending_city varchar,
    option_created_by varchar, option_created_at timestamptz,
    ol_id uuid, location_id uuid, ol_sort_order integer, time_period text,
    loc_name text, loc_city text, loc_address text,
    loc_google_link text, loc_category text, loc_note text,
    loc_working_hours text, loc_requires_booking text,
    loc_photo_url text, loc_user_image_url text
)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
    SELECT d.day_id, d.date, d.sort_order, d.created_at,
        o.option_id, o.option_index, o.starting_city, o.ending_city, o.created_by, o.created_at,
        ol.id, ol.location_id, ol.sort_order, ol.time_period,
        l.name, l.city, l.address, l.google_link, l.category, l.note, l.working_hours, l.requires_booking,
        pp.photo_url, l.user_image_url
    FROM trip_days d
    LEFT JOIN day_options o ON o.day_id = d.day_id
    LEFT JOIN option_locations ol ON ol.option_id = o.option_id
    LEFT JOIN locations l ON l.trip_id = d.trip_id AND l.location_id = ol.location_id
    LEFT JOIN place_photos pp ON pp.google_place_id = l.google_place_id
    WHERE d.trip_id = p_trip_id
      AND (p_user_id IS NULL OR EXISTS (
          SELECT 1 FROM trips t WHERE t.trip_id = p_trip_id AND t.user_id = p_user_id
      ))
    ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;
