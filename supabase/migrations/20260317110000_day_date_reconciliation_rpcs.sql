-- Reorder all days for a trip by date (nulls last), then by existing sort_order.
CREATE OR REPLACE FUNCTION reorder_days_by_date(p_trip_id UUID)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE trip_days td
  SET sort_order = ranked.new_order
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

-- Shift all dated days by N days and reorder.
CREATE OR REPLACE FUNCTION shift_day_dates(p_trip_id UUID, p_offset_days INT)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE trip_days
  SET date = date + make_interval(days => p_offset_days)
  WHERE trip_id = p_trip_id AND date IS NOT NULL;

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

-- Clear dates for specific days and reorder.
CREATE OR REPLACE FUNCTION clear_day_dates(p_trip_id UUID, p_day_ids UUID[])
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE trip_days
  SET date = NULL
  WHERE trip_id = p_trip_id AND day_id = ANY(p_day_ids);

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;

-- Delete specific days (relies on FK CASCADE) and reorder remaining.
CREATE OR REPLACE FUNCTION delete_days_batch(p_trip_id UUID, p_day_ids UUID[])
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM trip_days
  WHERE trip_id = p_trip_id AND day_id = ANY(p_day_ids);

  PERFORM reorder_days_by_date(p_trip_id);
END;
$$;
