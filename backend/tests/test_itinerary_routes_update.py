"""Tests for PATCH update route endpoint."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_with_route(mock_supabase_trips_and_days, mock_user_id):
    """Setup a trip with a day, option, and route for update tests."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Trip",
            "start_date": None,
            "end_date": None,
        }
    )
    day_id = str(uuid4())
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    option_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    loc1 = str(uuid4())
    loc2 = str(uuid4())
    loc3 = str(uuid4())
    for lid in (loc1, loc2, loc3):
        mock_sb._locations_store.append(
            {
                "location_id": lid,
                "trip_id": trip_id,
                "name": f"Loc-{lid[:4]}",
                "address": None,
                "google_link": None,
                "note": None,
                "city": "Paris",
                "working_hours": None,
                "requires_booking": None,
                "category": None,
            }
        )

    route_id = str(uuid4())

    # Pre-populate the routes RPC store with a route (used by itinerary tree)
    mock_sb._routes_rpc_store.append(
        {
            "route_id": route_id,
            "option_id": option_id,
            "label": None,
            "transport_mode": "walk",
            "duration_seconds": 600,
            "distance_meters": 1000,
            "sort_order": 0,
            "stop_location_ids": [loc1, loc2],
            "segments": [],
        }
    )

    return trip_id, day_id, option_id, route_id, loc1, loc2, loc3, mock_sb


def test_update_route_changes_stops(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH with new location_ids returns pending status."""
    trip_id, day_id, option_id, route_id, loc1, loc2, loc3, mock_sb = (
        _setup_with_route(mock_supabase_trips_and_days, mock_user_id)
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
            json={
                "transport_mode": "drive",
                "location_ids": [loc1, loc3, loc2],
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["route_id"] == route_id
        assert data["transport_mode"] == "drive"
        assert data["location_ids"] == [loc1, loc3, loc2]
        assert data["route_status"] == "pending"
    finally:
        app.dependency_overrides.clear()


def test_update_route_empty_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH with no fields returns 422."""
    trip_id, day_id, option_id, route_id, *_, mock_sb = (
        _setup_with_route(mock_supabase_trips_and_days, mock_user_id)
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
            json={},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_update_route_too_few_stops_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH with only 1 location_id returns 422 (need >= 2)."""
    trip_id, day_id, option_id, route_id, loc1, *_, mock_sb = (
        _setup_with_route(mock_supabase_trips_and_days, mock_user_id)
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
            json={"location_ids": [loc1]},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_update_route_nonexistent_route_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH on non-existent route returns 404."""
    trip_id, day_id, option_id, _route_id, loc1, loc2, _loc3, mock_sb = (
        _setup_with_route(mock_supabase_trips_and_days, mock_user_id)
    )
    fake_route_id = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes/{fake_route_id}",
            json={"location_ids": [loc1, loc2]},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_update_route_no_jwt_returns_401(client: TestClient):
    """PATCH without auth returns 401."""
    r = client.patch(
        f"/api/v1/trips/{uuid4()}/days/{uuid4()}/options/{uuid4()}/routes/{uuid4()}",
        json={"transport_mode": "walk"},
    )
    assert r.status_code == 401
