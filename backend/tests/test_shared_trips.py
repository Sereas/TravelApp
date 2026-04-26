"""Tests for shared trips endpoints (public view + owner share management)."""

from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app

from .conftest import TEST_USER_ID


class _Result:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class MockSupabaseShared:
    """Mock Supabase client for shared trips tests."""

    def __init__(
        self,
        *,
        trip_exists: bool = True,
        trip_user_id: str = TEST_USER_ID,
        active_share: dict | None = None,
        rpc_shared_data: dict | None = None,
    ):
        self._trip_exists = trip_exists
        self._trip_user_id = trip_user_id
        self._active_share = active_share
        self._rpc_shared_data = rpc_shared_data
        self._inserted_shares: list[dict] = []

    def rpc(self, fn_name, params=None):
        if fn_name == "get_shared_trip_data":
            return _Result(self._rpc_shared_data)
        if fn_name in ("verify_member_access", "verify_resource_chain"):
            user_id = (params or {}).get("p_user_id")
            valid = self._trip_exists and self._trip_user_id == user_id
            return _Result("owner" if valid else None)
        return _Result(None)

    def table(self, name):
        if name == "trips":
            return _TripsTable(self._trip_exists, self._trip_user_id)
        if name == "trip_shares":
            return _SharesTable(self._active_share, self._inserted_shares)
        return _NoopTable()


class _TripsTable:
    def __init__(self, exists, user_id):
        self._exists = exists
        self._user_id = user_id

    def select(self, cols):
        self._cols = cols
        return self

    def eq(self, col, val):
        return self

    def execute(self):
        if self._exists:
            trip_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
            return _Result([{"trip_id": trip_id, "user_id": self._user_id}])
        return _Result([])


class _SharesTable:
    def __init__(self, active_share, inserted_list):
        self._active_share = active_share
        self._inserted_list = inserted_list
        self._mode = None
        self._insert_data = None
        self._update_data = None

    def select(self, cols):
        self._mode = "select"
        return self

    def insert(self, data):
        self._mode = "insert"
        self._insert_data = data
        return self

    def update(self, data):
        self._mode = "update"
        self._update_data = data
        return self

    def eq(self, col, val):
        return self

    def limit(self, n):
        return self

    def execute(self):
        if self._mode == "select":
            if self._active_share:
                return _Result([self._active_share])
            return _Result([])
        if self._mode == "insert":
            row = {
                "share_token": "abc123def456",
                "created_at": datetime.now(UTC).isoformat(),
                "expires_at": None,
                **self._insert_data,
            }
            self._inserted_list.append(row)
            return _Result([row])
        if self._mode == "update":
            return _Result([])
        return _Result([])


class _NoopTable:
    def select(self, *a, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def execute(self):
        return _Result([])


MOCK_SHARED_DATA = {
    "trip": {
        "trip_name": "Paris Trip",
        "start_date": "2026-06-01",
        "end_date": "2026-06-10",
    },
    "locations": [
        {
            "id": "loc-1",
            "name": "Eiffel Tower",
            "city": "Paris",
            "address": "Champ de Mars",
            "google_link": None,
            "category": "Viewpoint",
            "note": None,
            "working_hours": None,
            "requires_booking": None,
            "latitude": 48.8584,
            "longitude": 2.2945,
            "google_place_id": None,
            "image_url": None,
            "user_image_url": None,
            "attribution_name": None,
            "attribution_uri": None,
        }
    ],
    "itinerary_rows": [
        {
            "day_id": "day-1",
            "day_date": "2026-06-01",
            "day_sort_order": 0,
            "day_created_at": "2026-01-01T00:00:00",
            "option_id": "opt-1",
            "option_index": 1,
            "option_starting_city": "Paris",
            "option_ending_city": "Paris",
            "option_created_at": "2026-01-01T00:00:00",
            "location_id": "loc-1",
            "ol_sort_order": 0,
            "time_period": "morning",
            "loc_name": "Eiffel Tower",
            "loc_city": "Paris",
            "loc_address": "Champ de Mars",
            "loc_google_link": None,
            "loc_category": "Viewpoint",
            "loc_note": None,
            "loc_working_hours": None,
            "loc_requires_booking": None,
            "loc_photo_url": None,
            "loc_user_image_url": None,
            "loc_attribution_name": None,
            "loc_attribution_uri": None,
        }
    ],
}


# ---------------------------------------------------------------------------
# Public endpoint: GET /api/v1/shared/{token}
# ---------------------------------------------------------------------------


def test_get_shared_trip_success(client: TestClient):
    """Valid share token returns trip, locations, and itinerary."""
    mock_sb = MockSupabaseShared(rpc_shared_data=MOCK_SHARED_DATA)
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/shared/validtoken123")
        assert r.status_code == 200
        data = r.json()
        assert data["trip"]["name"] == "Paris Trip"
        assert data["trip"]["start_date"] == "2026-06-01"
        assert len(data["locations"]) == 1
        assert data["locations"][0]["name"] == "Eiffel Tower"
        assert len(data["itinerary"]["days"]) == 1
        day0_loc = data["itinerary"]["days"][0]["options"][0]["locations"][0]
        assert day0_loc["location"]["name"] == "Eiffel Tower"
    finally:
        app.dependency_overrides.clear()


def test_get_shared_trip_invalid_token_404(client: TestClient):
    """Invalid/expired token returns 404."""
    mock_sb = MockSupabaseShared(rpc_shared_data=None)
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/shared/badtoken")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_get_shared_trip_no_auth_required(client: TestClient):
    """Public endpoint does not require auth header."""
    mock_sb = MockSupabaseShared(rpc_shared_data=MOCK_SHARED_DATA)
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/shared/validtoken123")
        assert r.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_shared_trip_no_sensitive_fields(client: TestClient):
    """Public response must not contain user_id or added_by_email."""
    mock_sb = MockSupabaseShared(rpc_shared_data=MOCK_SHARED_DATA)
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/shared/validtoken123")
        data = r.json()
        raw = r.text
        assert "added_by_email" not in raw
        assert "added_by_user_id" not in raw
        assert "user_id" not in data["trip"]
    finally:
        app.dependency_overrides.clear()


def test_get_shared_trip_empty_itinerary(client: TestClient):
    """Shared trip with no itinerary returns empty days list."""
    data = {**MOCK_SHARED_DATA, "itinerary_rows": []}
    mock_sb = MockSupabaseShared(rpc_shared_data=data)
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/shared/validtoken123")
        assert r.status_code == 200
        assert r.json()["itinerary"]["days"] == []
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Owner endpoint: POST /api/v1/trips/{trip_id}/share
# ---------------------------------------------------------------------------


def test_create_share_success(client: TestClient, mock_user_id: UUID):
    """Owner can create a share link."""
    mock_sb = MockSupabaseShared()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 200
        data = r.json()
        assert "share_token" in data
        assert "share_url" in data
        assert "/shared/" in data["share_url"]
    finally:
        app.dependency_overrides.clear()


def test_create_share_idempotent(client: TestClient, mock_user_id: UUID):
    """If active share exists, return it instead of creating new one."""
    existing = {
        "share_token": "existing-token",
        "created_at": "2026-01-01T00:00:00Z",
        "expires_at": None,
    }
    mock_sb = MockSupabaseShared(active_share=existing)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 200
        assert r.json()["share_token"] == "existing-token"
    finally:
        app.dependency_overrides.clear()


def test_create_share_trip_not_owned_404(client: TestClient, mock_user_id: UUID):
    """Non-owner gets 404."""
    mock_sb = MockSupabaseShared(trip_user_id="other-user-id")

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_create_share_no_auth_401(client: TestClient, monkeypatch):
    """No auth header returns 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    r = client.post("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Owner endpoint: GET /api/v1/trips/{trip_id}/share
# ---------------------------------------------------------------------------


def test_get_share_status_active(client: TestClient, mock_user_id: UUID):
    """Get active share returns the share info."""
    existing = {
        "share_token": "active-token",
        "created_at": "2026-01-01T00:00:00Z",
        "expires_at": None,
    }
    mock_sb = MockSupabaseShared(active_share=existing)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 200
        assert r.json()["share_token"] == "active-token"
    finally:
        app.dependency_overrides.clear()


def test_get_share_status_none_404(client: TestClient, mock_user_id: UUID):
    """No active share returns 404."""
    mock_sb = MockSupabaseShared()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Owner endpoint: DELETE /api/v1/trips/{trip_id}/share
# ---------------------------------------------------------------------------


def test_revoke_share_success(client: TestClient, mock_user_id: UUID):
    """Revoke returns 204."""
    mock_sb = MockSupabaseShared()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 204
    finally:
        app.dependency_overrides.clear()


def test_revoke_share_not_owned_404(client: TestClient, mock_user_id: UUID):
    """Non-owner gets 404 on revoke."""
    mock_sb = MockSupabaseShared(trip_user_id="other-user-id")

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# MED-01: Share token default expiry
# ---------------------------------------------------------------------------


class _SharesTableTrackingInsert(_SharesTable):
    """Variant that records the raw dict passed to insert()."""

    def __init__(self, active_share, inserted_list):
        super().__init__(active_share, inserted_list)
        self.raw_insert_calls: list[dict] = []

    def insert(self, data):
        self.raw_insert_calls.append(dict(data))
        return super().insert(data)


class MockSupabaseSharedTrackingInsert(MockSupabaseShared):
    """Mock that exposes the _SharesTableTrackingInsert so tests can inspect it."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._shares_table = _SharesTableTrackingInsert(self._active_share, self._inserted_shares)

    def table(self, name):
        if name == "trip_shares":
            return self._shares_table
        return super().table(name)


@pytest.mark.xfail(reason="MED-01: share token expiry not yet implemented")
def test_create_share_inserts_expires_at(client: TestClient, mock_user_id: UUID):
    """
    MED-01 — RED phase.

    When create_trip_share inserts a new row into trip_shares, it MUST include
    a non-NULL ``expires_at`` value so tokens expire automatically.

    Currently FAILS because the router passes only
    ``{"trip_id": ..., "created_by": ...}`` with no ``expires_at`` key,
    relying on a DB default that does not exist — so tokens never expire.
    """
    mock_sb = MockSupabaseSharedTrackingInsert()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post("/api/v1/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890/share")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

        assert mock_sb._shares_table.raw_insert_calls, (
            "No insert was made — idempotent branch returned early unexpectedly"
        )
        inserted_payload = mock_sb._shares_table.raw_insert_calls[0]

        assert "expires_at" in inserted_payload, (
            "create_trip_share must pass expires_at to the insert payload. "
            "Currently the key is missing, meaning tokens never expire. "
            "Add a default expiry (e.g. now + 30 days) before inserting."
        )
        assert inserted_payload["expires_at"] is not None, (
            "expires_at must not be NULL. "
            "Provide a concrete future timestamp so tokens have a finite lifetime."
        )
    finally:
        app.dependency_overrides.clear()
