-- Smart day cleanup RPCs for date reconciliation and generate flows.
-- reconcile_clear_dates: deletes empty orphaned days, clears dates on days with content.
-- delete_empty_dateless_days: removes dateless days with no content (cleanup for generate).

CREATE OR REPLACE FUNCTION reconcile_clear_dates(
  p_trip_id UUID,
  p_day_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete days from p_day_ids that have NO option_locations (empty)
  DELETE FROM trip_days
  WHERE trip_id = p_trip_id
    AND day_id = ANY(p_day_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM day_options do2
      JOIN option_locations ol ON ol.option_id = do2.option_id
      WHERE do2.day_id = trip_days.day_id
    );

  -- Clear date on remaining days from p_day_ids (they have content)
  UPDATE trip_days
  SET date = NULL
  WHERE trip_id = p_trip_id
    AND day_id = ANY(p_day_ids);

  -- Reorder all days by date
  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

CREATE OR REPLACE FUNCTION delete_empty_dateless_days(
  p_trip_id UUID
)
RETURNS VOID
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
