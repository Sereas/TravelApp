-- Place Detail Cache: stores Google Place Details (Pro) responses so repeated
-- lookups for the same google_place_id skip the $17/1k API call.
-- Global across all users/trips, like place_photos.
-- Only populated for places with a google_place_id (user-created manual
-- locations never enter this table).

CREATE TABLE IF NOT EXISTS place_detail_cache (
    google_place_id     TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    formatted_address   TEXT,
    city                TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    google_types        TEXT[] NOT NULL DEFAULT '{}',
    suggested_category  TEXT,
    photo_resource_name TEXT,
    cached_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT place_detail_cache_latitude_check
        CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    CONSTRAINT place_detail_cache_longitude_check
        CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

COMMENT ON TABLE place_detail_cache IS
    'Cached Google Place Details responses keyed by google_place_id. '
    'Global cache shared across all users/trips. Avoids redundant '
    'Place Details Pro API calls ($17/1000).';

COMMENT ON COLUMN place_detail_cache.google_types IS
    'Raw Google place type tags (e.g. restaurant, museum). Stored so '
    'suggested_category can be re-derived if mapping logic changes.';

COMMENT ON COLUMN place_detail_cache.photo_resource_name IS
    'Google Places photo resource (e.g. places/X/photos/Y). May expire; '
    'failure to fetch is handled gracefully by ensure_place_photo.';

COMMENT ON COLUMN place_detail_cache.cached_at IS
    'Timestamp of the Google API call that populated this row. Enables '
    'future TTL-based invalidation.';

-- RLS: enable with no policies. Direct access from authenticated/anon
-- returns zero rows. All access goes through service_role.
ALTER TABLE place_detail_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE place_detail_cache FROM PUBLIC;
REVOKE ALL ON TABLE place_detail_cache FROM anon;
REVOKE ALL ON TABLE place_detail_cache FROM authenticated;
GRANT ALL ON TABLE place_detail_cache TO service_role;
