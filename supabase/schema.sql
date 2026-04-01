CREATE SCHEMA public;

ALTER SCHEMA public OWNER TO pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TABLE public.option_locations (
    option_id uuid NOT NULL,
    location_id uuid NOT NULL,
    sort_order integer NOT NULL,
    time_period character varying(20) NOT NULL,
    CONSTRAINT option_locations_time_period_check CHECK (((time_period)::text = ANY ((ARRAY['morning'::character varying, 'afternoon'::character varying, 'evening'::character varying, 'night'::character varying])::text[])))
);

ALTER TABLE public.option_locations OWNER TO postgres;

CREATE FUNCTION public.batch_insert_option_locations(p_option_id uuid, p_location_ids uuid[], p_sort_orders integer[], p_time_periods text[]) RETURNS SETOF public.option_locations
    LANGUAGE sql SECURITY DEFINER
    AS $$
    INSERT INTO option_locations (option_id, location_id, sort_order, time_period)
    SELECT
        p_option_id,
        unnest(p_location_ids),
        unnest(p_sort_orders),
        unnest(p_time_periods)
    RETURNING *;
$$;

ALTER FUNCTION public.batch_insert_option_locations(p_option_id uuid, p_location_ids uuid[], p_sort_orders integer[], p_time_periods text[]) OWNER TO postgres;

CREATE FUNCTION public.create_route_with_stops(p_option_id uuid, p_transport_mode character varying, p_label character varying, p_location_ids uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_route_id uuid;
  v_max_order int;
  i int;
BEGIN
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_max_order
  FROM option_routes WHERE option_id = p_option_id;

  INSERT INTO option_routes (option_id, transport_mode, label, sort_order)
  VALUES (p_option_id, p_transport_mode, p_label, v_max_order)
  RETURNING route_id INTO v_route_id;

  FOR i IN 1..array_length(p_location_ids, 1) LOOP
    INSERT INTO route_stops (route_id, location_id, stop_order)
    VALUES (v_route_id, p_location_ids[i], i - 1);
  END LOOP;

  RETURN json_build_object(
    'route_id', v_route_id,
    'option_id', p_option_id,
    'transport_mode', p_transport_mode,
    'label', p_label,
    'sort_order', v_max_order,
    'location_ids', p_location_ids
  );
END;
$$;

ALTER FUNCTION public.create_route_with_stops(p_option_id uuid, p_transport_mode character varying, p_label character varying, p_location_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.delete_days_batch(p_trip_id uuid, p_day_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM trip_days
  WHERE trip_id = p_trip_id AND day_id = ANY(p_day_ids);

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

ALTER FUNCTION public.delete_days_batch(p_trip_id uuid, p_day_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.delete_empty_dateless_days(p_trip_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM trip_days
  WHERE trip_id = p_trip_id
    AND date IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM day_options do2
      JOIN option_locations ol ON ol.option_id = do2.option_id
      WHERE do2.day_id = trip_days.day_id
    );
END;
$$;

ALTER FUNCTION public.delete_empty_dateless_days(p_trip_id uuid) OWNER TO postgres;

CREATE FUNCTION public.delete_location_cascade(p_trip_id uuid, p_location_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_route_id   uuid;
    v_stop_count integer;
    v_total_dur  integer;
    v_total_dist integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations
        WHERE location_id = p_location_id
          AND trip_id     = p_trip_id
    ) THEN
        RAISE EXCEPTION 'LOCATION_NOT_FOUND';
    END IF;

    FOR v_route_id IN
        SELECT DISTINCT rs.route_id
        FROM route_stops rs
        WHERE rs.location_id = p_location_id
    LOOP
        SELECT COUNT(*) INTO v_stop_count
        FROM route_stops
        WHERE route_id = v_route_id;

        IF v_stop_count <= 2 THEN
            DELETE FROM option_routes WHERE route_id = v_route_id;
        ELSE
            DELETE FROM route_segments
            WHERE route_id = v_route_id
              AND (from_location_id = p_location_id
                   OR to_location_id = p_location_id);

            DELETE FROM route_stops
            WHERE route_id    = v_route_id
              AND location_id = p_location_id;

            WITH numbered AS (
                SELECT route_id, location_id,
                       ROW_NUMBER() OVER (ORDER BY stop_order) - 1 AS new_order
                FROM route_stops
                WHERE route_id = v_route_id
            )
            UPDATE route_stops rs
            FROM numbered
            WHERE rs.route_id    = numbered.route_id
              AND rs.location_id = numbered.location_id;

            WITH numbered AS (
                SELECT id,
                       ROW_NUMBER() OVER (ORDER BY segment_order) - 1 AS new_order
                FROM route_segments
                WHERE route_id = v_route_id
            )
            UPDATE route_segments seg
            FROM numbered
            WHERE seg.id = numbered.id;

            SELECT COALESCE(SUM(sc.duration_seconds), 0),
                   COALESCE(SUM(sc.distance_meters), 0)
            INTO v_total_dur, v_total_dist
            FROM route_segments rseg
            JOIN segment_cache sc ON sc.id = rseg.segment_cache_id
            WHERE rseg.route_id = v_route_id;

            UPDATE option_routes
                distance_meters  = v_total_dist
            WHERE route_id = v_route_id;
        END IF;
    END LOOP;

    DELETE FROM locations
    WHERE location_id = p_location_id
      AND trip_id     = p_trip_id;
END;
$$;

ALTER FUNCTION public.delete_location_cascade(p_trip_id uuid, p_location_id uuid) OWNER TO postgres;

CREATE FUNCTION public.get_itinerary_routes(p_option_ids uuid[]) RETURNS TABLE(route_id uuid, option_id uuid, label text, transport_mode text, duration_seconds integer, distance_meters integer, sort_order integer, stop_location_ids json, segments json)
    LANGUAGE sql STABLE SECURITY DEFINER
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

ALTER FUNCTION public.get_itinerary_routes(p_option_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid) RETURNS TABLE(day_id uuid, day_date date, day_sort_order integer, day_created_at timestamp with time zone, option_id uuid, option_index integer, option_starting_city character varying, option_ending_city character varying, option_created_by character varying, option_created_at timestamp with time zone, location_id uuid, ol_sort_order integer, time_period text, loc_name text, loc_city text, loc_address text, loc_google_link text, loc_category text, loc_note text, loc_working_hours text, loc_requires_booking text)
    LANGUAGE sql STABLE
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
  LEFT JOIN day_options o ON o.day_id = d.day_id
  LEFT JOIN option_locations ol ON ol.option_id = o.option_id
  LEFT JOIN locations l ON l.trip_id = d.trip_id AND l.location_id = ol.location_id
  WHERE d.trip_id = p_trip_id
  ORDER BY d.sort_order, o.option_index NULLS LAST, ol.sort_order NULLS LAST;
$$;

ALTER FUNCTION public.get_itinerary_tree(p_trip_id uuid) OWNER TO postgres;

CREATE FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS TABLE(day_id uuid, day_date date, day_sort_order integer, day_created_at timestamp with time zone, option_id uuid, option_index integer, option_starting_city character varying, option_ending_city character varying, option_created_by character varying, option_created_at timestamp with time zone, location_id uuid, ol_sort_order integer, time_period text, loc_name text, loc_city text, loc_address text, loc_google_link text, loc_category text, loc_note text, loc_working_hours text, loc_requires_booking text, loc_photo_url text, loc_user_image_url text)
    LANGUAGE sql STABLE
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
        l.requires_booking AS loc_requires_booking,
        pp.photo_url     AS loc_photo_url,
        l.user_image_url AS loc_user_image_url
    FROM trip_days d
    LEFT JOIN day_options o        ON o.day_id = d.day_id
    LEFT JOIN option_locations ol  ON ol.option_id = o.option_id
    LEFT JOIN locations l          ON l.trip_id = d.trip_id
                                  AND l.location_id = ol.location_id
    LEFT JOIN place_photos pp     ON pp.google_place_id = l.google_place_id
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

ALTER FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) OWNER TO postgres;

CREATE FUNCTION public.get_option_routes(p_option_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
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

ALTER FUNCTION public.get_option_routes(p_option_id uuid) OWNER TO postgres;

CREATE FUNCTION public.get_shared_trip_data(p_share_token text) RETURNS json
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

ALTER FUNCTION public.get_shared_trip_data(p_share_token text) OWNER TO postgres;

CREATE FUNCTION public.move_option_to_day(p_option_id uuid, p_source_day_id uuid, p_target_day_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE day_options
    WHERE option_id = p_option_id;

    WITH ranked AS (
        SELECT option_id,
               ROW_NUMBER() OVER (ORDER BY option_index) AS new_index
        FROM day_options
        WHERE day_id = p_source_day_id
          AND option_id != p_option_id
          AND option_index > 0
    )
    UPDATE day_options d
    FROM ranked r
    WHERE d.option_id = r.option_id;

    UPDATE day_options
    WHERE day_id = p_source_day_id
      AND option_id != p_option_id
      AND option_index < 0;

    IF NOT EXISTS (
        SELECT 1 FROM day_options
        WHERE day_id = p_source_day_id AND option_id != p_option_id
    ) THEN
        INSERT INTO day_options (day_id, option_index)
        VALUES (p_source_day_id, 1);
    END IF;

    UPDATE day_options
    WHERE day_id = p_target_day_id;

    UPDATE day_options
    WHERE day_id = p_target_day_id AND option_index < 0;

    UPDATE day_options
    WHERE option_id = p_option_id;
END;
$$;

ALTER FUNCTION public.move_option_to_day(p_option_id uuid, p_source_day_id uuid, p_target_day_id uuid) OWNER TO postgres;

CREATE FUNCTION public.reconcile_clear_dates(p_trip_id uuid, p_day_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM trip_days
  WHERE trip_id = p_trip_id
    AND day_id = ANY(p_day_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM day_options do2
      JOIN option_locations ol ON ol.option_id = do2.option_id
      WHERE do2.day_id = trip_days.day_id
    );

  UPDATE trip_days
  WHERE trip_id = p_trip_id
    AND day_id = ANY(p_day_ids);

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

ALTER FUNCTION public.reconcile_clear_dates(p_trip_id uuid, p_day_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.remove_location_from_option(p_option_id uuid, p_location_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_route_id   uuid;
    v_stop_count integer;
    v_total_dur  integer;
    v_total_dist integer;
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
            DELETE FROM option_routes WHERE route_id = v_route_id;
        ELSE
            DELETE FROM route_segments
            WHERE route_id = v_route_id
              AND (from_location_id = p_location_id
                   OR to_location_id = p_location_id);

            DELETE FROM route_stops
            WHERE route_id   = v_route_id
              AND location_id = p_location_id;

            WITH numbered AS (
                SELECT route_id, location_id,
                       ROW_NUMBER() OVER (ORDER BY stop_order) - 1 AS new_order
                FROM route_stops
                WHERE route_id = v_route_id
            )
            UPDATE route_stops rs
            FROM numbered
            WHERE rs.route_id    = numbered.route_id
              AND rs.location_id = numbered.location_id;

            WITH numbered AS (
                SELECT id,
                       ROW_NUMBER() OVER (ORDER BY segment_order) - 1 AS new_order
                FROM route_segments
                WHERE route_id = v_route_id
            )
            UPDATE route_segments seg
            FROM numbered
            WHERE seg.id = numbered.id;

            SELECT COALESCE(SUM(sc.duration_seconds), 0),
                   COALESCE(SUM(sc.distance_meters), 0)
            INTO v_total_dur, v_total_dist
            FROM route_segments rseg
            JOIN segment_cache sc ON sc.id = rseg.segment_cache_id
            WHERE rseg.route_id = v_route_id;

            UPDATE option_routes
                distance_meters  = v_total_dist
            WHERE route_id = v_route_id;
        END IF;
    END LOOP;

    DELETE FROM option_locations
    WHERE option_id   = p_option_id
      AND location_id = p_location_id;
END;
$$;

ALTER FUNCTION public.remove_location_from_option(p_option_id uuid, p_location_id uuid) OWNER TO postgres;

CREATE FUNCTION public.reorder_day_options(p_day_id uuid, p_option_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
    UPDATE day_options
    FROM (
        SELECT unnest(p_option_ids) AS option_id,
               generate_subscripts(p_option_ids, 1) AS pos
    ) t
    WHERE day_options.option_id = t.option_id
      AND day_options.day_id = p_day_id;
$$;

ALTER FUNCTION public.reorder_day_options(p_day_id uuid, p_option_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.reorder_days_by_date(p_trip_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE trip_days td
  FROM (
    SELECT day_id,
           ROW_NUMBER() OVER (
             ORDER BY date ASC NULLS LAST, sort_order ASC
           ) - 1 AS new_order
    FROM trip_days
    WHERE trip_id = p_trip_id
  ) ranked
  WHERE td.day_id = ranked.day_id
    AND td.sort_order IS DISTINCT FROM ranked.new_order;
END;
$$;

ALTER FUNCTION public.reorder_days_by_date(p_trip_id uuid) OWNER TO postgres;

CREATE FUNCTION public.reorder_option_locations(p_option_id uuid, p_location_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
    UPDATE option_locations ol
    FROM (
        SELECT
            unnest(p_location_ids)              AS location_id,
            generate_subscripts(p_location_ids, 1) AS ord
    ) t
    WHERE ol.option_id    = p_option_id
      AND ol.location_id  = t.location_id;
$$;

ALTER FUNCTION public.reorder_option_locations(p_option_id uuid, p_location_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.reorder_trip_days(p_trip_id uuid, p_day_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
    UPDATE trip_days
    FROM (
        SELECT unnest(p_day_ids) AS day_id,
               generate_subscripts(p_day_ids, 1) AS pos
    ) t
    WHERE trip_days.day_id = t.day_id
      AND trip_days.trip_id = p_trip_id;
$$;

ALTER FUNCTION public.reorder_trip_days(p_trip_id uuid, p_day_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

CREATE FUNCTION public.shift_day_dates(p_trip_id uuid, p_offset_days integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE trip_days
  WHERE trip_id = p_trip_id AND date IS NOT NULL;

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

ALTER FUNCTION public.shift_day_dates(p_trip_id uuid, p_offset_days integer) OWNER TO postgres;

CREATE FUNCTION public.update_route_with_stops(p_route_id uuid, p_option_id uuid, p_transport_mode text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_location_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(route_id uuid, option_id uuid, label text, transport_mode text, duration_seconds integer, distance_meters integer, sort_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM option_routes r
        WHERE r.route_id = p_route_id AND r.option_id = p_option_id
    ) THEN
        RAISE EXCEPTION 'ROUTE_NOT_FOUND';
    END IF;

    UPDATE option_routes r
        label          = COALESCE(p_label, r.label)
    WHERE r.route_id = p_route_id;

    IF p_location_ids IS NOT NULL THEN
        DELETE FROM route_segments rs WHERE rs.route_id = p_route_id;
        DELETE FROM route_stops s WHERE s.route_id = p_route_id;
        INSERT INTO route_stops (route_id, location_id, stop_order)
        SELECT p_route_id, lid, idx - 1
        FROM unnest(p_location_ids) WITH ORDINALITY AS t(lid, idx);
        UPDATE option_routes r
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

ALTER FUNCTION public.update_route_with_stops(p_route_id uuid, p_option_id uuid, p_transport_mode text, p_label text, p_location_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.verify_resource_chain(p_trip_id uuid, p_user_id uuid, p_day_id uuid DEFAULT NULL::uuid, p_option_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM trips t
        WHERE t.trip_id = p_trip_id
          AND t.user_id = p_user_id
          AND (
              p_day_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM trip_days d
                  WHERE d.day_id = p_day_id
                    AND d.trip_id = p_trip_id
              )
          )
          AND (
              p_option_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM day_options o
                  WHERE o.option_id = p_option_id
                    AND o.day_id = p_day_id
              )
          )
    );
$$;

ALTER FUNCTION public.verify_resource_chain(p_trip_id uuid, p_user_id uuid, p_day_id uuid, p_option_id uuid) OWNER TO postgres;

CREATE TABLE public.day_options (
    option_id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_id uuid NOT NULL,
    option_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    starting_city character varying(255),
    ending_city character varying(255),
    created_by character varying(255)
);

ALTER TABLE public.day_options OWNER TO postgres;

CREATE TABLE public.locations (
    location_id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    name character varying NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision,
    address character varying,
    google_link character varying,
    added_by_user_id uuid,
    city character varying(255),
    working_hours text,
    requires_booking character varying(20),
    category character varying(50),
    google_place_id text,
    google_source_type text,
    google_raw jsonb,
    added_by_email text,
    user_image_url text,
    CONSTRAINT locations_category_check CHECK (((category IS NULL) OR ((category)::text = ANY ((ARRAY['Accommodation'::character varying, 'Bar'::character varying, 'Beach'::character varying, 'Café'::character varying, 'Church'::character varying, 'City'::character varying, 'Event'::character varying, 'Excursion'::character varying, 'Hiking'::character varying, 'Historic site'::character varying, 'Market'::character varying, 'Museum'::character varying, 'Nature'::character varying, 'Nightlife'::character varying, 'Park'::character varying, 'Parking'::character varying, 'Restaurant'::character varying, 'Shopping'::character varying, 'Spa / Wellness'::character varying, 'Transport'::character varying, 'Viewpoint'::character varying, 'Walking around'::character varying, 'Other'::character varying])::text[])))),
    CONSTRAINT locations_requires_booking_check CHECK (((requires_booking IS NULL) OR ((requires_booking)::text = ANY ((ARRAY['no'::character varying, 'yes'::character varying, 'yes_done'::character varying])::text[]))))
);

ALTER TABLE public.locations OWNER TO postgres;

COMMENT ON TABLE public.locations IS 'Locations belonging to a trip; access via trip ownership (RLS). MVP Core Trip Planning.';

COMMENT ON COLUMN public.locations.latitude IS 'Optional latitude (WGS84) for map display';

COMMENT ON COLUMN public.locations.longitude IS 'Optional longitude (WGS84) for map display';

COMMENT ON COLUMN public.locations.address IS 'Optional human-readable address (e.g. for sharing, print).';

COMMENT ON COLUMN public.locations.google_link IS 'Optional Google Maps place URL (validated when set).';

COMMENT ON COLUMN public.locations.added_by_user_id IS 'User who added the location (auth.users.id); email resolved at display time.';

COMMENT ON COLUMN public.locations.city IS 'Optional city name.';

COMMENT ON COLUMN public.locations.working_hours IS 'Optional working hours (free text).';

COMMENT ON COLUMN public.locations.requires_booking IS 'Requires booking: no | yes | yes_done (display as No, Yes, Yes (done)).';

COMMENT ON COLUMN public.locations.category IS 'Optional category; only predefined values allowed.';

CREATE TABLE public.option_routes (
    route_id uuid DEFAULT gen_random_uuid() NOT NULL,
    option_id uuid NOT NULL,
    label character varying(255),
    transport_mode character varying(20) DEFAULT 'walk'::character varying NOT NULL,
    duration_seconds integer,
    distance_meters integer,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT option_routes_transport_mode_check CHECK (((transport_mode)::text = ANY ((ARRAY['walk'::character varying, 'drive'::character varying, 'transit'::character varying])::text[])))
);

ALTER TABLE public.option_routes OWNER TO postgres;

CREATE TABLE public.place_photos (
    google_place_id text NOT NULL,
    storage_path text NOT NULL,
    photo_url text NOT NULL,
    width_px integer,
    height_px integer,
    attribution_name text,
    attribution_uri text,
    photo_resource text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_photos OWNER TO postgres;

COMMENT ON TABLE public.place_photos IS 'Cached Google Places photos stored in Supabase Storage, keyed by google_place_id';

CREATE TABLE public.route_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id uuid NOT NULL,
    segment_order integer NOT NULL,
    from_location_id uuid NOT NULL,
    to_location_id uuid NOT NULL,
    segment_cache_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.route_segments OWNER TO postgres;

COMMENT ON TABLE public.route_segments IS 'Links a route to cached segments; one row per leg (stop_i -> stop_i+1)';

CREATE TABLE public.route_stops (
    route_id uuid NOT NULL,
    location_id uuid NOT NULL,
    stop_order integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.route_stops OWNER TO postgres;

CREATE TABLE public.segment_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin_place_id text,
    destination_place_id text,
    origin_lat double precision,
    origin_lng double precision,
    destination_lat double precision,
    destination_lng double precision,
    transport_mode text NOT NULL,
    cache_key text NOT NULL,
    distance_meters integer,
    duration_seconds integer,
    encoded_polyline text,
    provider text DEFAULT 'google'::text NOT NULL,
    raw_provider_response jsonb,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    input_fingerprint text,
    error_type text,
    error_code text,
    provider_http_status integer,
    last_attempt_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    cache_expires_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT segment_cache_status_check CHECK ((status = ANY (ARRAY['success'::text, 'retryable_error'::text, 'config_error'::text, 'input_error'::text, 'no_route'::text]))),
    CONSTRAINT segment_cache_transport_mode_check CHECK ((transport_mode = ANY (ARRAY['walk'::text, 'drive'::text, 'transit'::text])))
);

ALTER TABLE public.segment_cache OWNER TO postgres;

COMMENT ON TABLE public.segment_cache IS 'Reusable cache of route segment results (Google Routes API); keyed by origin/dest place_id + transport_mode';

COMMENT ON COLUMN public.segment_cache.input_fingerprint IS 'Hash of origin/dest place_id + lat/lng + mode; cache invalid when fingerprint changes';

COMMENT ON COLUMN public.segment_cache.next_retry_at IS 'Earliest time to retry on user view (no auto-retry)';

COMMENT ON COLUMN public.segment_cache.cache_expires_at IS 'For success rows: TRANSIT TTL; NULL = indefinite (WALK/DRIVE)';

CREATE TABLE public.trip_days (
    day_id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    date date,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.trip_days OWNER TO postgres;

CREATE TABLE public.trip_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    share_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);

ALTER TABLE public.trip_shares OWNER TO postgres;

CREATE TABLE public.trips (
    trip_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    trip_name character varying,
    destination_country character varying[],
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modified_at timestamp with time zone,
    status character varying,
    members bigint[]
);

ALTER TABLE public.trips OWNER TO postgres;

ALTER TABLE ONLY public.day_options
    ADD CONSTRAINT day_options_day_id_option_index_key UNIQUE (day_id, option_index);

ALTER TABLE ONLY public.day_options
    ADD CONSTRAINT day_options_pkey PRIMARY KEY (option_id);

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (location_id);

ALTER TABLE ONLY public.option_locations
    ADD CONSTRAINT option_locations_pkey PRIMARY KEY (option_id, location_id);

ALTER TABLE ONLY public.option_routes
    ADD CONSTRAINT option_routes_pkey PRIMARY KEY (route_id);

ALTER TABLE ONLY public.place_photos
    ADD CONSTRAINT place_photos_pkey PRIMARY KEY (google_place_id);

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_route_order_unique UNIQUE (route_id, segment_order);

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_pkey PRIMARY KEY (route_id, location_id);

ALTER TABLE ONLY public.segment_cache
    ADD CONSTRAINT segment_cache_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trip_days
    ADD CONSTRAINT trip_days_pkey PRIMARY KEY (day_id);

ALTER TABLE ONLY public.trip_shares
    ADD CONSTRAINT trip_shares_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trip_shares
    ADD CONSTRAINT trip_shares_share_token_key UNIQUE (share_token);

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (trip_id);

CREATE INDEX idx_day_options_day_id ON public.day_options USING btree (day_id);

CREATE INDEX idx_locations_google_place_id ON public.locations USING btree (google_place_id) WHERE (google_place_id IS NOT NULL);

CREATE INDEX idx_locations_trip_id ON public.locations USING btree (trip_id);

CREATE INDEX idx_option_locations_location_id ON public.option_locations USING btree (location_id);

CREATE INDEX idx_option_locations_option_id ON public.option_locations USING btree (option_id);

CREATE INDEX idx_option_routes_option_id ON public.option_routes USING btree (option_id);

CREATE INDEX idx_route_segments_route_id ON public.route_segments USING btree (route_id);

CREATE INDEX idx_route_stops_location_id ON public.route_stops USING btree (location_id);

CREATE INDEX idx_route_stops_route_id ON public.route_stops USING btree (route_id);

CREATE INDEX idx_trip_days_trip_id ON public.trip_days USING btree (trip_id);

CREATE INDEX idx_trip_shares_token ON public.trip_shares USING btree (share_token) WHERE (is_active = true);

CREATE INDEX idx_trip_shares_trip_id ON public.trip_shares USING btree (trip_id);

CREATE INDEX idx_trips_user_id ON public.trips USING btree (user_id);

CREATE INDEX route_segments_segment_cache_id_idx ON public.route_segments USING btree (segment_cache_id);

CREATE UNIQUE INDEX segment_cache_cache_key_key ON public.segment_cache USING btree (cache_key);

CREATE INDEX segment_cache_calculated_at_idx ON public.segment_cache USING btree (calculated_at);

CREATE INDEX segment_cache_input_fingerprint_idx ON public.segment_cache USING btree (input_fingerprint) WHERE (input_fingerprint IS NOT NULL);

CREATE INDEX segment_cache_next_retry_at_idx ON public.segment_cache USING btree (next_retry_at) WHERE (next_retry_at IS NOT NULL);

CREATE TRIGGER route_segments_updated_at BEFORE UPDATE ON public.route_segments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER segment_cache_updated_at BEFORE UPDATE ON public.segment_cache FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.day_options
    ADD CONSTRAINT day_options_day_id_fkey FOREIGN KEY (day_id) REFERENCES public.trip_days(day_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(trip_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.option_locations
    ADD CONSTRAINT option_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.option_locations
    ADD CONSTRAINT option_locations_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.day_options(option_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.option_routes
    ADD CONSTRAINT option_routes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.day_options(option_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.option_routes(route_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_segment_cache_id_fkey FOREIGN KEY (segment_cache_id) REFERENCES public.segment_cache(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(location_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.option_routes(route_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trip_days
    ADD CONSTRAINT trip_days_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(trip_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trip_shares
    ADD CONSTRAINT trip_shares_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(trip_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Enable delete for users based on user_id" ON public.trips FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Enable insert for users based on user_id" ON public.trips FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Enable users to view their own data only" ON public.trips FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Update only user_id's" ON public.trips FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.day_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_options_delete_own_trip ON public.day_options FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.trip_days d
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((d.day_id = day_options.day_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY day_options_insert_own_trip ON public.day_options FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.trip_days d
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((d.day_id = day_options.day_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY day_options_select_own_trip ON public.day_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.trip_days d
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((d.day_id = day_options.day_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY day_options_update_own_trip ON public.day_options FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.trip_days d
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((d.day_id = day_options.day_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_delete_own_trip ON public.locations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.trips
  WHERE ((trips.trip_id = locations.trip_id) AND (trips.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY locations_insert_own_trip ON public.locations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trips
  WHERE ((trips.trip_id = locations.trip_id) AND (trips.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY locations_select_own_trip ON public.locations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trips
  WHERE ((trips.trip_id = locations.trip_id) AND (trips.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY locations_update_own_trip ON public.locations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.trips
  WHERE ((trips.trip_id = locations.trip_id) AND (trips.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trips
  WHERE ((trips.trip_id = locations.trip_id) AND (trips.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.option_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY option_locations_delete_own_trip ON public.option_locations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_locations.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_locations_insert_own_trip ON public.option_locations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_locations.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_locations_select_own_trip ON public.option_locations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_locations.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_locations_update_own_trip ON public.option_locations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_locations.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.option_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY option_routes_delete ON public.option_routes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_routes.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_routes_insert ON public.option_routes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_routes.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_routes_select ON public.option_routes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_routes.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY option_routes_update ON public.option_routes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.day_options o
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((o.option_id = option_routes.option_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.route_segments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY route_stops_delete ON public.route_stops FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (((public.option_routes r
     JOIN public.day_options o ON ((o.option_id = r.option_id)))
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((r.route_id = route_stops.route_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY route_stops_insert ON public.route_stops FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (((public.option_routes r
     JOIN public.day_options o ON ((o.option_id = r.option_id)))
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((r.route_id = route_stops.route_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY route_stops_select ON public.route_stops FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (((public.option_routes r
     JOIN public.day_options o ON ((o.option_id = r.option_id)))
     JOIN public.trip_days d ON ((d.day_id = o.day_id)))
     JOIN public.trips t ON ((t.trip_id = d.trip_id)))
  WHERE ((r.route_id = route_stops.route_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.segment_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_days_delete_own_trip ON public.trip_days FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.trip_id = trip_days.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY trip_days_insert_own_trip ON public.trip_days FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.trip_id = trip_days.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY trip_days_select_own_trip ON public.trip_days FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.trip_id = trip_days.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY trip_days_update_own_trip ON public.trip_days FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.trip_id = trip_days.trip_id) AND (t.user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.option_locations TO authenticated;
GRANT ALL ON TABLE public.option_locations TO service_role;

GRANT ALL ON FUNCTION public.batch_insert_option_locations(p_option_id uuid, p_location_ids uuid[], p_sort_orders integer[], p_time_periods text[]) TO authenticated;
GRANT ALL ON FUNCTION public.batch_insert_option_locations(p_option_id uuid, p_location_ids uuid[], p_sort_orders integer[], p_time_periods text[]) TO service_role;

GRANT ALL ON FUNCTION public.create_route_with_stops(p_option_id uuid, p_transport_mode character varying, p_label character varying, p_location_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_route_with_stops(p_option_id uuid, p_transport_mode character varying, p_label character varying, p_location_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.delete_days_batch(p_trip_id uuid, p_day_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.delete_days_batch(p_trip_id uuid, p_day_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.delete_empty_dateless_days(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_empty_dateless_days(p_trip_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.delete_location_cascade(p_trip_id uuid, p_location_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_location_cascade(p_trip_id uuid, p_location_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_itinerary_routes(p_option_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_routes(p_option_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_itinerary_tree(p_trip_id uuid, p_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_option_routes(p_option_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_option_routes(p_option_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO anon;
GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_trip_data(p_share_token text) TO service_role;

GRANT ALL ON FUNCTION public.move_option_to_day(p_option_id uuid, p_source_day_id uuid, p_target_day_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.move_option_to_day(p_option_id uuid, p_source_day_id uuid, p_target_day_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.reconcile_clear_dates(p_trip_id uuid, p_day_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reconcile_clear_dates(p_trip_id uuid, p_day_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.remove_location_from_option(p_option_id uuid, p_location_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_location_from_option(p_option_id uuid, p_location_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.reorder_day_options(p_day_id uuid, p_option_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_day_options(p_day_id uuid, p_option_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.reorder_days_by_date(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_days_by_date(p_trip_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.reorder_option_locations(p_option_id uuid, p_location_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_option_locations(p_option_id uuid, p_location_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.reorder_trip_days(p_trip_id uuid, p_day_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_trip_days(p_trip_id uuid, p_day_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

GRANT ALL ON FUNCTION public.shift_day_dates(p_trip_id uuid, p_offset_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.shift_day_dates(p_trip_id uuid, p_offset_days integer) TO service_role;

GRANT ALL ON FUNCTION public.update_route_with_stops(p_route_id uuid, p_option_id uuid, p_transport_mode text, p_label text, p_location_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_route_with_stops(p_route_id uuid, p_option_id uuid, p_transport_mode text, p_label text, p_location_ids uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.verify_resource_chain(p_trip_id uuid, p_user_id uuid, p_day_id uuid, p_option_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.verify_resource_chain(p_trip_id uuid, p_user_id uuid, p_day_id uuid, p_option_id uuid) TO service_role;

GRANT ALL ON TABLE public.day_options TO authenticated;
GRANT ALL ON TABLE public.day_options TO service_role;

GRANT ALL ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.locations TO service_role;

GRANT ALL ON TABLE public.option_routes TO authenticated;
GRANT ALL ON TABLE public.option_routes TO service_role;

GRANT ALL ON TABLE public.place_photos TO authenticated;
GRANT ALL ON TABLE public.place_photos TO service_role;

GRANT ALL ON TABLE public.route_segments TO authenticated;
GRANT ALL ON TABLE public.route_segments TO service_role;

GRANT ALL ON TABLE public.route_stops TO authenticated;
GRANT ALL ON TABLE public.route_stops TO service_role;

GRANT ALL ON TABLE public.segment_cache TO authenticated;
GRANT ALL ON TABLE public.segment_cache TO service_role;

GRANT ALL ON TABLE public.trip_days TO authenticated;
GRANT ALL ON TABLE public.trip_days TO service_role;

GRANT ALL ON TABLE public.trip_shares TO authenticated;
GRANT ALL ON TABLE public.trip_shares TO service_role;

GRANT ALL ON TABLE public.trips TO authenticated;
GRANT ALL ON TABLE public.trips TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;
