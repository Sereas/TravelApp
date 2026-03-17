-- Drop the old clear_day_dates RPC, replaced by reconcile_clear_dates.
DROP FUNCTION IF EXISTS clear_day_dates(UUID, UUID[]);
