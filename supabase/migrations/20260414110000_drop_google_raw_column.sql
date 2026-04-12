-- Drop the google_raw column from locations table.
-- All useful data (lat/lng, photos, name, address, etc.) is already stored
-- in dedicated columns. The raw Google Places API response (5-15 KB per location)
-- is no longer read or written by any code path.
ALTER TABLE public.locations DROP COLUMN IF EXISTS google_raw;
