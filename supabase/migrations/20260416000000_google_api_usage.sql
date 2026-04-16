-- ============================================================================
-- Migration: google_api_usage — per-user daily quota for Google API endpoints
--
-- Purpose: cost guardrail across all Google-billing endpoints. A compromised
-- or buggy client should not be able to burn through Google billing beyond a
-- predictable daily ceiling.
--
-- Covered endpoints (bump one row per billable call):
--   * autocomplete   — POST /api/v1/locations/google/autocomplete
--   * resolve        — POST /api/v1/locations/google/resolve
--   * preview        — POST /api/v1/locations/google/preview
--   * list_import    — POST /api/v1/trips/{id}/locations/import-google-list-stream
--                      (bumped once per resolved place inside the SSE loop)
--
-- Daily cap defaults (overridable via env GOOGLE_DAILY_CAP_*):
--   autocomplete: 2000   resolve: 200   preview: 200   list_import: 500
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_api_usage (
    user_id uuid NOT NULL,
    date date NOT NULL DEFAULT CURRENT_DATE,
    endpoint text NOT NULL,
    count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date, endpoint)
);

COMMENT ON TABLE google_api_usage IS
    'Per-user per-day counter for Google-billing endpoints. Bumped atomically via bump_google_usage RPC; enforces daily cap via the RPC''s returned boolean. Accessed only through the SECURITY DEFINER RPC — no direct reads.';

-- Defence-in-depth: lock the table down even though the RPC is the only
-- production access path. `anon` must never touch usage data; `authenticated`
-- goes through the SECURITY DEFINER RPC, not direct SELECTs.
REVOKE ALL ON TABLE google_api_usage FROM PUBLIC;
REVOKE ALL ON TABLE google_api_usage FROM anon;
REVOKE ALL ON TABLE google_api_usage FROM authenticated;

-- Enable RLS as a second line of defence. All access flows through the
-- SECURITY DEFINER RPC below, which bypasses RLS for inserts/updates.
-- Direct SELECTs from any role return zero rows.
ALTER TABLE google_api_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN google_api_usage.count IS
    'Monotonic counter for (user_id, date, endpoint). Never decremented — housekeeping should DELETE rows older than ~32 days in a future migration.';

-- Lookup by date for housekeeping / dashboards.
CREATE INDEX IF NOT EXISTS idx_google_api_usage_date
    ON google_api_usage(date);

-- Atomic upsert + cap check. Returns TRUE when the post-increment count is
-- within cap; FALSE when the cap has been exceeded.
CREATE OR REPLACE FUNCTION bump_google_usage(
    p_user_id uuid,
    p_endpoint text,
    p_daily_cap integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    new_count integer;
BEGIN
    INSERT INTO google_api_usage (user_id, date, endpoint, count)
    VALUES (p_user_id, CURRENT_DATE, p_endpoint, 1)
    ON CONFLICT (user_id, date, endpoint) DO UPDATE
        SET count = google_api_usage.count + 1
    RETURNING count INTO new_count;
    RETURN new_count <= p_daily_cap;
END;
$$;

COMMENT ON FUNCTION bump_google_usage(uuid, text, integer) IS
    'Atomically increment per-user per-day per-endpoint counter and return whether the post-increment count is within the caller-supplied cap. Used by backend/app/core/google_guard.py::bump_google_quota.';

-- Security: only service_role and authenticated may execute. Anon must never
-- be able to enumerate usage or cause writes.
REVOKE ALL ON FUNCTION bump_google_usage(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION bump_google_usage(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION bump_google_usage(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION bump_google_usage(uuid, text, integer) TO service_role;
