-- Add attribution columns to get_itinerary_tree for Google photo compliance
DROP FUNCTION IF EXISTS public.get_itinerary_tree(uuid, uuid);

CREATE FUNCTION public.get_itinerary_tree(
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
    loc_requires_booking text,
    loc_photo_url        text,
    loc_user_image_url   text,
    loc_attribution_name text,
    loc_attribution_uri  text
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
