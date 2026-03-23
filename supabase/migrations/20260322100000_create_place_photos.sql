CREATE TABLE place_photos (
    google_place_id  TEXT PRIMARY KEY,
    storage_path     TEXT NOT NULL,
    photo_url        TEXT NOT NULL,
    width_px         INTEGER,
    height_px        INTEGER,
    attribution_name TEXT,
    attribution_uri  TEXT,
    photo_resource   TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE place_photos IS 'Cached Google Places photos stored in Supabase Storage, keyed by google_place_id';
