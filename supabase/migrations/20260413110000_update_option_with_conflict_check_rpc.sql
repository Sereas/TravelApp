-- update_option_with_conflict_check: atomic option update with option_index collision guard.
-- Replaces 3 separate round-trips (existence SELECT + conflict SELECT + UPDATE + post-fetch SELECT)
-- with a single RPC call that returns the updated row via RETURNING *.
--
-- Parameters use paired (value, set_flag) so callers can express PATCH semantics:
-- only fields with p_set_* = TRUE are written.

CREATE OR REPLACE FUNCTION update_option_with_conflict_check(
  p_option_id        uuid,
  p_day_id           uuid,
  p_option_index     integer,
  p_set_option_index boolean,
  p_starting_city    character varying,
  p_set_starting_city boolean,
  p_ending_city      character varying,
  p_set_ending_city  boolean,
  p_created_by       character varying,
  p_set_created_by   boolean
) RETURNS SETOF day_options
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify option belongs to this day (also acts as 404 guard).
  IF NOT EXISTS (
    SELECT 1 FROM day_options WHERE option_id = p_option_id AND day_id = p_day_id
  ) THEN
    RAISE EXCEPTION 'OPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- If caller wants to set option_index, check for collision with another option in the same day.
  IF p_set_option_index AND p_option_index IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM day_options
      WHERE day_id = p_day_id
        AND option_index = p_option_index
        AND option_id <> p_option_id
    ) THEN
      RAISE EXCEPTION 'OPTION_INDEX_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE day_options
  SET
    option_index   = CASE WHEN p_set_option_index    THEN p_option_index    ELSE option_index   END,
    starting_city  = CASE WHEN p_set_starting_city   THEN p_starting_city   ELSE starting_city  END,
    ending_city    = CASE WHEN p_set_ending_city      THEN p_ending_city     ELSE ending_city    END,
    created_by     = CASE WHEN p_set_created_by       THEN p_created_by      ELSE created_by     END
  WHERE option_id = p_option_id
    AND day_id = p_day_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION update_option_with_conflict_check(uuid, uuid, integer, boolean, character varying, boolean, character varying, boolean, character varying, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_option_with_conflict_check(uuid, uuid, integer, boolean, character varying, boolean, character varying, boolean, character varying, boolean) TO service_role;
