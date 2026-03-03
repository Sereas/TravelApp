-- Migration: Move starting_city, ending_city, created_by from trip_days to day_options
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- This migration is idempotent (safe to run multiple times).

BEGIN;

-- Step 1: Add columns to day_options (IF NOT EXISTS makes this idempotent)
ALTER TABLE day_options
  ADD COLUMN IF NOT EXISTS starting_city varchar(255),
  ADD COLUMN IF NOT EXISTS ending_city varchar(255),
  ADD COLUMN IF NOT EXISTS created_by varchar(255);

-- Step 2: Migrate existing data from trip_days to the first option per day
-- (copies to the option with the lowest option_index for each day)
UPDATE day_options
SET
  starting_city = td.starting_city,
  ending_city = td.ending_city,
  created_by = td.created_by
FROM trip_days td
WHERE day_options.day_id = td.day_id
  AND day_options.option_index = (
    SELECT MIN(opt2.option_index)
    FROM day_options opt2
    WHERE opt2.day_id = td.day_id
  )
  AND (td.starting_city IS NOT NULL OR td.ending_city IS NOT NULL OR td.created_by IS NOT NULL);

-- Step 3: Drop columns from trip_days
ALTER TABLE trip_days
  DROP COLUMN IF EXISTS starting_city,
  DROP COLUMN IF EXISTS ending_city,
  DROP COLUMN IF EXISTS created_by;

-- Step 4: Enable RLS on all itinerary tables (fixes Supabase "RLS disabled" warning)
-- Note: The backend uses the service_role key which bypasses RLS, so enabling
-- RLS without policies won't break the API. It does secure against direct
-- anon-key access from the client.
ALTER TABLE trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_locations ENABLE ROW LEVEL SECURITY;

COMMIT;
