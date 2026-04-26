"""Tests for DELETE /api/v1/trips/{trip_id}/locations/{location_id}."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_delete_location_own_trip_returns_204(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Delete a location from own trip -> 204."""
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
        location_id = resp.json()["id"]
        assert len(locations_inserted) == 1

        # Delete the location
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 204
        assert resp.content == b""
        assert len(locations_inserted) == 0
    finally:
        app.dependency_overrides.clear()


def test_delete_location_nonexistent_trip_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Non-existent trip -> 404."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    location_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_delete_location_other_users_trip_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Other user's trip -> 404."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    location_id = str(uuid4())
    owner_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_delete_location_nonexistent_location_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Location doesn't exist under the trip -> 404."""
    _, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    location_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_delete_location_no_jwt_returns_401(
    client: TestClient,
):
    """Missing JWT -> 401."""
    trip_id = str(uuid4())
    location_id = str(uuid4())
    resp = client.delete(f"/api/v1/trips/{trip_id}/locations/{location_id}")
    assert resp.status_code == 401


def test_delete_location_only_removes_target(
    client: TestClient,
    valid_jwt,
    mock_user_id,
    mock_supabase_trips_and_locations,
):
    """Deleting one location leaves other locations intact."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Add two locations
        resp1 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Eiffel Tower"},
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        resp2 = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Louvre"},
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        loc_id_1 = resp1.json()["id"]
        assert len(locations_inserted) == 2

        # Delete only the first location
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{loc_id_1}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 204
        assert len(locations_inserted) == 1
        assert locations_inserted[0]["name"] == "Louvre"
    finally:
        app.dependency_overrides.clear()


def test_delete_location_calls_cascade_rpc(
    client: TestClient,
    valid_jwt,
    mock_user_id,
):
    """Delete endpoint calls delete_location_cascade RPC with correct params."""
    trip_id = str(uuid4())
    location_id = str(uuid4())

    rpc_calls = []

    class _MockSb:
        def rpc(self, name, params):
            rpc_calls.append((name, params))
            if name in ("verify_member_access", "verify_resource_chain"):
                return type("C", (), {"execute": lambda _: type("R", (), {"data": "owner"})()})()
            if name == "delete_location_cascade":
                return type("C", (), {"execute": lambda _: type("R", (), {"data": None})()})()
            return type("C", (), {"execute": lambda _: type("R", (), {"data": None})()})()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: _MockSb()
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 204

        # Verify RPC was called with correct params
        cascade_calls = [(n, p) for n, p in rpc_calls if n == "delete_location_cascade"]
        assert len(cascade_calls) == 1
        _, params = cascade_calls[0]
        assert params["p_trip_id"] == trip_id
        assert params["p_location_id"] == location_id
    finally:
        app.dependency_overrides.clear()


def test_delete_location_cascade_rpc_not_found_returns_404(
    client: TestClient,
    valid_jwt,
    mock_user_id,
):
    """When the RPC raises LOCATION_NOT_FOUND, endpoint returns 404."""
    from postgrest.exceptions import APIError

    trip_id = str(uuid4())
    location_id = str(uuid4())

    class _MockSb:
        def rpc(self, name, params):
            if name in ("verify_member_access", "verify_resource_chain"):
                return type("C", (), {"execute": lambda _: type("R", (), {"data": "owner"})()})()
            if name == "delete_location_cascade":

                def _raise(_=None):
                    raise APIError(
                        {
                            "message": "LOCATION_NOT_FOUND",
                            "code": "P0001",
                            "hint": None,
                            "details": None,
                        }
                    )

                return type("C", (), {"execute": _raise})()
            return type("C", (), {"execute": lambda _: type("R", (), {"data": None})()})()

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: _MockSb()
    try:
        resp = client.delete(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            headers={"Authorization": f"Bearer {valid_jwt}"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
