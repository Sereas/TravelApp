"""Tests for DELETE /api/v1/trips/{trip_id}."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_delete_trip_own_trip_returns_204(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Delete own trip -> 204 No Content."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 204
        assert resp.content == b""
    finally:
        app.dependency_overrides.clear()


def test_delete_trip_nonexistent_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Non-existent trip -> 404."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_delete_trip_other_users_trip_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Other user's trip -> 404."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_delete_trip_no_jwt_returns_401(
    client: TestClient,
):
    """Missing JWT -> 401."""
    trip_id = str(uuid4())
    resp = client.delete(f"/api/v1/trips/{trip_id}")
    assert resp.status_code == 401


def test_delete_trip_removes_associated_locations(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Deleting a trip also removes its locations from the store."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Add a location first
        resp = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Eiffel Tower"},
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 201
        assert len(locations_inserted) == 1

        # Delete the trip
        resp = client.delete(
            f"/api/v1/trips/{trip_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 204

        # Locations should be removed
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()
