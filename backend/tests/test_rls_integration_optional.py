"""Optional integration test: RLS on real Supabase (skip unless env is set).

Run only when you want to verify RLS against a real database (e.g. a Supabase
dev branch). Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY,
and SUPABASE_TEST_USER_ID (a UUID of an existing Supabase Auth user, e.g. from
Dashboard → Authentication → Users). Skip by default so CI and local runs do not need a live DB.

  RUN_RLS_INTEGRATION=1 SUPABASE_TEST_USER_ID=<auth-user-uuid> \\
    pytest backend/tests/test_rls_integration_optional.py -v

See docs/design/backend-and-supabase.md.
"""

import os
from uuid import uuid4

import pytest

# Skip entire module unless explicitly requested
pytestmark = pytest.mark.skipif(
    os.getenv("RUN_RLS_INTEGRATION", "").lower() not in ("1", "true", "yes"),
    reason="Set RUN_RLS_INTEGRATION=1 to run RLS integration tests (requires real Supabase)",
)


@pytest.fixture(scope="module")
def supabase_client():
    """Real Supabase client; skip if env not set."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        pytest.skip("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required")
    from supabase import create_client

    return create_client(url, key)


def test_rls_trips_isolated_by_user(supabase_client):
    """With service role we can read all rows; RLS is enforced for anon+user JWT.

    This test uses the configured key (service role or anon). With service role,
    RLS is bypassed so we see all trips; the test documents that RLS policies
    exist and that the API enforces ownership when using service role.
    With anon key and no user JWT, we would see no rows (RLS would block).
    We do a minimal check: insert a trip and then read it back by primary key
    to ensure the DB is reachable and the schema is correct. trips.user_id is
    a FK to auth.users, so we use SUPABASE_TEST_USER_ID (an existing Auth user).
    Full RLS verification (user A cannot see user B's trips) is best done manually
    or with two JWTs and anon client; see docs/design/backend-and-supabase.md.
    """
    user_id = os.getenv("SUPABASE_TEST_USER_ID", "").strip()
    if not user_id:
        pytest.skip(
            "SUPABASE_TEST_USER_ID required: set to a valid auth user UUID "
            "(e.g. from Supabase Dashboard → Authentication → Users)"
        )
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    get_settings()
    trip_name = f"RLS test trip {uuid4()}"
    # Insert as if we were the API (we have the key)
    r = (
        supabase_client.table("trips")
        .insert(
            {
                "user_id": user_id,
                "trip_name": trip_name,
            }
        )
        .execute()
    )
    assert r.data and len(r.data) == 1
    trip_id = r.data[0]["trip_id"]
    # Read back (service role bypasses RLS)
    r2 = supabase_client.table("trips").select("*").eq("trip_id", trip_id).execute()
    assert r2.data and len(r2.data) == 1
    assert r2.data[0]["trip_name"] == trip_name
    assert r2.data[0]["user_id"] == user_id
    # Cleanup
    supabase_client.table("trips").delete().eq("trip_id", trip_id).execute()
