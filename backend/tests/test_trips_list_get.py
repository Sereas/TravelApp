"""Tests for list my trips and get trip (Slice 5)."""

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_list_trips_returns_200_and_own_trips(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """List my trips -> 200, array of trips for current user."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id1 = str(uuid4())
    trip_id2 = str(uuid4())
    mock_sb = MockSupabase(
        {trip_id1: str(mock_user_id), trip_id2: str(mock_user_id)},
        mock_user_id,
    )
    mock_sb._trips_store.extend([
        {"trip_id": trip_id1, "user_id": str(mock_user_id), "trip_name": "Paris", "start_date": "2025-06-01", "end_date": "2025-06-10"},
        {"trip_id": trip_id2, "user_id": str(mock_user_id), "trip_name": "Rome", "start_date": None, "end_date": None},
    ])

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/trips")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 2
        names = {t["name"] for t in data}
        assert names == {"Paris", "Rome"}
        one = next(t for t in data if t["name"] == "Paris")
        assert one["start_date"] == "2025-06-01"
        assert one["end_date"] == "2025-06-10"
        other = next(t for t in data if t["name"] == "Rome")
        assert other["start_date"] is None
        assert other["end_date"] is None
    finally:
        app.dependency_overrides.clear()


def test_list_trips_empty_returns_200_empty_array(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """List my trips when none -> 200, []."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get("/api/trips")
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_list_trips_no_jwt_returns_401(client: TestClient, monkeypatch):
    """List trips without JWT -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings
    get_settings.cache_clear()
    r = client.get("/api/trips")
    assert r.status_code == 401


def test_get_trip_own_trip_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Get trip by id (own trip) -> 200, body has id, name, dates."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    mock_sb._trips_store.append({
        "trip_id": trip_id,
        "user_id": str(mock_user_id),
        "trip_name": "Paris 2025",
        "start_date": "2025-06-01",
        "end_date": "2025-06-10",
    })

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/trips/{trip_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == trip_id
        assert data["name"] == "Paris 2025"
        assert data["start_date"] == "2025-06-01"
        assert data["end_date"] == "2025-06-10"
    finally:
        app.dependency_overrides.clear()


def test_get_trip_nonexistent_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Get trip with non-existent id -> 404."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Trip not found"
    finally:
        app.dependency_overrides.clear()


def test_get_trip_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
    valid_jwt,
):
    """Get trip owned by another user -> 404."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Trip not owned by user"
    finally:
        app.dependency_overrides.clear()


def test_get_trip_no_jwt_returns_401(client: TestClient, monkeypatch):
    """Get trip without JWT -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings
    get_settings.cache_clear()
    r = client.get("/api/trips/00000000-0000-0000-0000-000000000001")
    assert r.status_code == 401
