-- ============================================================
-- Migration: trip membership tables
-- 2026-04-24
--
-- Adds trip_members and trip_invitations tables for multi-user
-- trip collaboration. Backfills existing trip owners.
-- ============================================================

-- ------------------------------------------------------------
-- 1. trip_members — who has access to which trip
-- ------------------------------------------------------------
CREATE TABLE public.trip_members (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    email       text,
    role        text NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner', 'editor')),
    invited_by  uuid NOT NULL,
    joined_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_id, user_id)
);

CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);

ALTER TABLE public.trip_members OWNER TO postgres;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.trip_members TO service_role;
REVOKE ALL ON TABLE public.trip_members FROM anon;

-- ------------------------------------------------------------
-- 2. trip_invitations — invite link tokens
--    Owner-role invitations are structurally impossible by
--    CHECK constraint — owners are only created via
--    create_trip_with_owner RPC.
-- ------------------------------------------------------------
CREATE TABLE public.trip_invitations (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id        uuid NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
    token_hash     text NOT NULL UNIQUE,
    role           text NOT NULL DEFAULT 'editor'
                   CHECK (role IN ('editor')),
    invited_by     uuid NOT NULL,
    expires_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    consumed_by    uuid,
    consumed_at    timestamptz,
    revoked_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- Partial index: fast lookup of active (usable) tokens
CREATE INDEX idx_trip_invitations_active
    ON trip_invitations (token_hash)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- FK cascade performance index
CREATE INDEX idx_trip_invitations_trip_id ON trip_invitations(trip_id);

ALTER TABLE public.trip_invitations OWNER TO postgres;
ALTER TABLE public.trip_invitations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.trip_invitations TO service_role;
REVOKE ALL ON TABLE public.trip_invitations FROM anon;

-- ------------------------------------------------------------
-- 3. Backfill: every existing trip owner → trip_members row
-- ------------------------------------------------------------
INSERT INTO trip_members (trip_id, user_id, role, invited_by, joined_at)
SELECT trip_id, user_id, 'owner', user_id, created_at
FROM trips
ON CONFLICT (trip_id, user_id) DO NOTHING;
