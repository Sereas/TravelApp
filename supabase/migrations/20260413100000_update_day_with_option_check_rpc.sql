-- update_day_with_option_check: atomic day update with optional active_option_id validation.
-- Replaces 3 separate round-trips (existence SELECT + option validation SELECT + UPDATE + post-fetch SELECT)
-- with a single RPC call that returns the updated row via RETURNING *.
--
-- Parameters use paired (value, set_flag) so callers can express PATCH semantics:
-- only fields with p_set_* = TRUE are written.

CREATE OR REPLACE FUNCTION update_day_with_option_check(
  p_day_id            uuid,
  p_trip_id           uuid,
  p_date              date,
  p_set_date          boolean,
  p_sort_order        integer,
  p_set_sort_order    boolean,
  p_active_option_id  uuid,
  p_set_active_option boolean
) RETURNS SETOF trip_days
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify day belongs to this trip (also acts as 404 guard).
  IF NOT EXISTS (
    SELECT 1 FROM trip_days WHERE day_id = p_day_id AND trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'DAY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- If caller wants to set active_option_id to a non-NULL value,
  -- verify the option actually belongs to this day.
  IF p_set_active_option AND p_active_option_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM day_options
      WHERE option_id = p_active_option_id AND day_id = p_day_id
    ) THEN
      RAISE EXCEPTION 'INVALID_ACTIVE_OPTION_ID' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE trip_days
  SET
    date             = CASE WHEN p_set_date          THEN p_date             ELSE date             END,
    sort_order       = CASE WHEN p_set_sort_order     THEN p_sort_order       ELSE sort_order       END,
    active_option_id = CASE WHEN p_set_active_option  THEN p_active_option_id ELSE active_option_id END
  WHERE day_id = p_day_id
    AND trip_id = p_trip_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION update_day_with_option_check(uuid, uuid, date, boolean, integer, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_day_with_option_check(uuid, uuid, date, boolean, integer, boolean, uuid, boolean) TO service_role;
