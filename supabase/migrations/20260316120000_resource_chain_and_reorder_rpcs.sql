-- ============================================================
-- Migration: resource chain ownership RPC + reorder RPCs
-- 2026-03-16
-- ============================================================

-- ------------------------------------------------------------
-- 1. verify_resource_chain
--    Single EXISTS call replacing up to 3 sequential ownership
--    round-trips (trip → day → option).
--    Returns boolean: true = caller owns the full chain.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_resource_chain(
    p_trip_id   uuid,
    p_user_id   uuid,
    p_day_id    uuid DEFAULT NULL,
    p_option_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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


-- ------------------------------------------------------------
-- 2. reorder_day_options
--    Replaces N SELECT + N UPDATE loop in reorder_options with
--    a single unnest-based batch UPDATE.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_day_options(
    p_day_id     uuid,
    p_option_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE day_options
    SET option_index = t.pos
    FROM (
        SELECT unnest(p_option_ids) AS option_id,
               generate_subscripts(p_option_ids, 1) AS pos
    ) t
    WHERE day_options.option_id = t.option_id
      AND day_options.day_id = p_day_id;
$$;


-- ------------------------------------------------------------
-- 3. reorder_trip_days
--    Replaces N UPDATE loop in reorder_days with a single
--    unnest-based batch UPDATE (0-indexed sort_order).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_trip_days(
    p_trip_id uuid,
    p_day_ids  uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE trip_days
    SET sort_order = t.pos - 1
    FROM (
        SELECT unnest(p_day_ids) AS day_id,
               generate_subscripts(p_day_ids, 1) AS pos
    ) t
    WHERE trip_days.day_id = t.day_id
      AND trip_days.trip_id = p_trip_id;
$$;
