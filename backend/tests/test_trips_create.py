"""Unit and integration tests for create-trip and auth (Slice 2)."""

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


# ---- Unit: validation and success with mocks ----

def test_create_trip_missing_name_returns_422(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase,
):
    """Request without name -> 4xx (422). Auth is mocked so body is validated."""
    mock_sb, _ = mock_supabase

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # No body
        r = client.post("/api/trips", json={})
        assert r.status_code == 422
        # Empty name
        r = client.post("/api/trips", json={"name": ""})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_create_trip_with_name_and_mock_auth_returns_201(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase,
):
    """With name and mock auth -> success, response contains id and name."""
    mock_sb, inserted = mock_supabase

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post("/api/trips", json={"name": "Paris 2025"})
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["name"] == "Paris 2025"
        assert data.get("start_date") is None
        assert data.get("end_date") is None
    finally:
        app.dependency_overrides.clear()


# ---- Integration: auth and DB verification ----

def test_create_trip_valid_jwt_and_body_returns_201(
    client: TestClient,
    valid_jwt: str,
    mock_supabase,
):
    """Valid JWT + valid body -> 201, body has trip id and supplied name/dates."""
    mock_sb, _ = mock_supabase
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            "/api/trips",
            json={
                "name": "Rome 2026",
                "start_date": "2026-06-01",
                "end_date": "2026-06-10",
            },
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["name"] == "Rome 2026"
        assert data["start_date"] == "2026-06-01"
        assert data["end_date"] == "2026-06-10"
    finally:
        app.dependency_overrides.clear()


def test_create_trip_no_authorization_returns_401(client: TestClient, monkeypatch):
    """No Authorization header -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings
    get_settings.cache_clear()
    r = client.post("/api/trips", json={"name": "My Trip"})
    assert r.status_code == 401


def test_create_trip_invalid_token_returns_401(client: TestClient, monkeypatch):
    """Invalid or expired token -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings
    get_settings.cache_clear()
    r = client.post(
        "/api/trips",
        json={"name": "My Trip"},
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert r.status_code == 401


def test_create_trip_then_verify_inserted_data(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase,
):
    """Create trip via API, then verify (via mock) trip has correct user_id and name."""
    mock_sb, inserted = mock_supabase

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            "/api/trips",
            json={"name": "Verified Trip", "start_date": "2025-07-01"},
        )
        assert r.status_code == 201
        assert len(inserted) == 1
        row = inserted[0]
        assert row["user_id"] == str(mock_user_id)
        assert row["trip_name"] == "Verified Trip"
        assert row["start_date"] == "2025-07-01"
        assert row.get("end_date") is None
    finally:
        app.dependency_overrides.clear()


def test_create_trip_only_accessible_by_owner(
    client: TestClient,
    mock_supabase_with_rls,
):
    """Create a trip as user A; verify that user B cannot access it (RLS-like isolation)."""
    from uuid import uuid4

    trips_store, MockSupabaseRLS = mock_supabase_with_rls
    user_a_id = uuid4()
    user_b_id = uuid4()
    assert user_a_id != user_b_id

    async def override_user_a():
        return user_a_id

    # Create trip as user A
    client_a = MockSupabaseRLS(str(user_a_id))
    app.dependency_overrides[get_current_user_id] = override_user_a
    app.dependency_overrides[get_supabase_client] = lambda: client_a
    try:
        r = client.post(
            "/api/trips",
            json={"name": "User A Trip"},
        )
        assert r.status_code == 201
        data = r.json()
        trip_id = data["id"]
        assert len(trips_store) == 1
        assert trips_store[0]["user_id"] == str(user_a_id)
        assert trips_store[0]["trip_id"] == trip_id
    finally:
        app.dependency_overrides.clear()

    # User A can access the trip (RLS allows owner)
    client_a_select = MockSupabaseRLS(str(user_a_id))
    result_a = client_a_select.table("trips").select("*").eq("trip_id", trip_id).execute()
    assert len(result_a.data) == 1, "Owner must be able to access their trip"
    assert result_a.data[0]["trip_name"] == "User A Trip"

    # User B cannot access the same trip (RLS isolates by user_id)
    client_b = MockSupabaseRLS(str(user_b_id))
    result_b = client_b.table("trips").select("*").eq("trip_id", trip_id).execute()
    assert result_b.data == [], "Trip created by user A must not be visible to user B"
