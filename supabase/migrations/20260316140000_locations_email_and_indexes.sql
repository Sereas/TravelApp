-- ============================================================
-- Migration: locations.added_by_email + performance indexes
-- 2026-03-16
-- ============================================================

-- ------------------------------------------------------------
-- 1. Denormalize added_by_email into locations
--    Eliminates all supabase.auth.admin.get_user_by_id() calls
--    from request handlers. Email is written at INSERT time from
--    the JWT payload (Supabase JWTs always include `email`).
-- ------------------------------------------------------------
ALTER TABLE locations ADD COLUMN IF NOT EXISTS added_by_email text;


-- ------------------------------------------------------------
-- 2. Index on option_routes.option_id
--    get_itinerary_routes filters WHERE option_id = ANY(...).
--    PostgreSQL does not auto-create an index on FK columns of
--    the referencing table; this ensures an index-scan is used.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_option_routes_option_id
    ON option_routes (option_id);


-- ------------------------------------------------------------
-- 3. Verify companion indexes exist (create if missing)
--    These should exist from FK definitions, but be explicit.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id
    ON route_stops (route_id);

CREATE INDEX IF NOT EXISTS idx_route_segments_route_id
    ON route_segments (route_id);

CREATE INDEX IF NOT EXISTS idx_trip_days_trip_id
    ON trip_days (trip_id);

CREATE INDEX IF NOT EXISTS idx_day_options_day_id
    ON day_options (day_id);

CREATE INDEX IF NOT EXISTS idx_option_locations_option_id
    ON option_locations (option_id);
