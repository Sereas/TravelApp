"""Tests for full itinerary tree endpoint."""

import os
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_full_itinerary(mock_supabase_trips_and_days, mock_user_id):
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
    # Days
    day1 = str(uuid4())
    day2 = str(uuid4())
    days_store.append(
        {
            "day_id": day1,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    days_store.append(
        {
            "day_id": day2,
            "trip_id": trip_id,
            "date": "2025-06-02",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    # Options (cities and created_by now live here)
    opt_store = mock_sb._options_store
    option1 = str(uuid4())
    option2 = str(uuid4())
    opt_store.append(
        {
            "option_id": option1,
            "day_id": day1,
            "option_index": 2,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    opt_store.append(
        {
            "option_id": option2,
            "day_id": day1,
            "option_index": 1,
            "starting_city": "Paris",
            "ending_city": None,
            "created_by": "Alice",
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    # Locations + option_locations
    loc_store = mock_sb._locations_store
    option_locations_store = mock_sb._option_locations_store
    loc1 = str(uuid4())
    loc2 = str(uuid4())
    loc_store.append(
        {
            "location_id": loc1,
            "trip_id": trip_id,
            "name": "Louvre",
            "address": "Rue de Rivoli",
            "google_link": "https://maps.example/louvre",
            "note": "Must see",
            "city": "Paris",
            "working_hours": "9-18",
            "requires_booking": "no",
            "category": "museum",
        }
    )
    loc_store.append(
        {
            "location_id": loc2,
            "trip_id": trip_id,
            "name": "Eiffel Tower",
            "address": "Champ de Mars",
            "google_link": "https://maps.example/eiffel",
            "note": None,
            "city": "Paris",
            "working_hours": None,
            "requires_booking": "yes",
            "category": "landmark",
        }
    )
    option_locations_store.append(
        {
            "option_id": option2,
            "location_id": loc2,
            "sort_order": 1,
            "time_period": "evening",
            "trip_id": trip_id,
        }
    )
    option_locations_store.append(
        {
            "option_id": option2,
            "location_id": loc1,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    return trip_id, day1, day2, option1, option2, loc1, loc2, mock_sb


def test_get_itinerary_returns_nested_structure_and_ordering(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    (
        trip_id,
        day1,
        day2,
        _option1,
        option2,
        loc1,
        loc2,
        mock_sb,
    ) = _setup_full_itinerary(mock_supabase_trips_and_days, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200
        # Timing headers (for benchmarking / performance tests)
        assert "X-Itinerary-Rpc-Ms" in r.headers
        assert "X-Itinerary-Build-Ms" in r.headers
        assert "X-Itinerary-Rows" in r.headers
        if os.environ.get("PRINT_ITINERARY_TIMING"):
            print(
                f"  [timing] rpc_ms={r.headers['X-Itinerary-Rpc-Ms']} "
                f"build_ms={r.headers['X-Itinerary-Build-Ms']} rows={r.headers['X-Itinerary-Rows']}"
            )
        data = r.json()
        # Days ordered by sort_order: day2 (0), then day1 (1)
        assert [d["id"] for d in data["days"]] == [day2, day1]
        # Options on day1 ordered by option_index: option2 (1), then option1 (2)
        day1_node = next(d for d in data["days"] if d["id"] == day1)
        assert [o["id"] for o in day1_node["options"]] == [option2]
        # Locations for option2 ordered by sort_order: loc1 (0), then loc2 (1)
        loc_nodes = day1_node["options"][0]["locations"]
        assert [node["location_id"] for node in loc_nodes] == [loc1, loc2]
        # LocationSummary fields copied
        first = loc_nodes[0]["location"]
        assert first["id"] == loc1
        assert first["name"] == "Louvre"
        assert first["city"] == "Paris"
        assert first["category"] == "museum"
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_empty_days_returns_empty_array(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
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
    assert not days_store

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200
        assert r.json() == {"days": []}
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    _days_store, _trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_other_users_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": owner_id,
            "trip_name": "Trip",
            "start_date": None,
            "end_date": None,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_includes_route_polylines(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Routes with segments (including encoded_polyline) appear in itinerary response."""
    (
        trip_id,
        _day1,
        _day2,
        _option1,
        option2,
        loc1,
        loc2,
        mock_sb,
    ) = _setup_full_itinerary(mock_supabase_trips_and_days, mock_user_id)

    route_id = str(uuid4())
    mock_sb._routes_rpc_store.append(
        {
            "route_id": route_id,
            "option_id": option2,
            "label": "Walking tour",
            "transport_mode": "walk",
            "duration_seconds": 1560,
            "distance_meters": 1900,
            "sort_order": 0,
            "stop_option_location_ids": [loc1, loc2],
            "segments": [
                {
                    "segment_order": 0,
                    "duration_seconds": 1560,
                    "distance_meters": 1900,
                    "encoded_polyline": "m}hiHkwyi@dBjBzBdC",
                },
            ],
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200
        data = r.json()
        # Find the option with routes (option2 on day1)
        day1_node = next(d for d in data["days"] if d["id"] == _day1)
        opt2_node = next(o for o in day1_node["options"] if o["id"] == option2)
        assert len(opt2_node["routes"]) == 1
        route = opt2_node["routes"][0]
        assert route["route_id"] == route_id
        assert route["transport_mode"] == "walk"
        assert route["duration_seconds"] == 1560
        assert route["distance_meters"] == 1900
        assert route["route_status"] == "ok"
        assert route["option_location_ids"] == [loc1, loc2]
        # Segments include encoded_polyline
        assert len(route["segments"]) == 1
        seg = route["segments"][0]
        assert seg["segment_order"] == 0
        assert seg["duration_seconds"] == 1560
        assert seg["distance_meters"] == 1900
        assert seg["encoded_polyline"] == "m}hiHkwyi@dBjBzBdC"
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_route_without_polyline(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Route segments with null polyline (pending calculation) are returned correctly."""
    (
        trip_id,
        _day1,
        _day2,
        _option1,
        option2,
        loc1,
        loc2,
        mock_sb,
    ) = _setup_full_itinerary(mock_supabase_trips_and_days, mock_user_id)

    route_id = str(uuid4())
    mock_sb._routes_rpc_store.append(
        {
            "route_id": route_id,
            "option_id": option2,
            "label": None,
            "transport_mode": "drive",
            "duration_seconds": None,
            "distance_meters": None,
            "sort_order": 0,
            "stop_option_location_ids": [loc1, loc2],
            "segments": [
                {
                    "segment_order": 0,
                    "duration_seconds": None,
                    "distance_meters": None,
                    "encoded_polyline": None,
                },
            ],
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200
        data = r.json()
        day1_node = next(d for d in data["days"] if d["id"] == _day1)
        opt2_node = next(o for o in day1_node["options"] if o["id"] == option2)
        route = opt2_node["routes"][0]
        assert route["route_status"] == "pending"
        seg = route["segments"][0]
        assert seg["encoded_polyline"] is None
    finally:
        app.dependency_overrides.clear()


def test_get_itinerary_no_jwt_returns_401(client: TestClient):
    trip_id = uuid4()
    r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
    assert r.status_code == 401


def test_itinerary_tree_returns_lat_lng(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """LocationSummary embedded in itinerary must include latitude/longitude (Phase 6)."""
    (
        trip_id,
        day1,
        _day2,
        _option1,
        option2,
        loc1,
        loc2,
        mock_sb,
    ) = _setup_full_itinerary(mock_supabase_trips_and_days, mock_user_id)

    # Add coordinates to the fixture locations so the RPC mock can surface them
    for loc in mock_sb._locations_store:
        if str(loc.get("location_id")) == loc1:
            loc["latitude"] = 48.8606
            loc["longitude"] = 2.3376
        elif str(loc.get("location_id")) == loc2:
            loc["latitude"] = 48.8584
            loc["longitude"] = 2.2945

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/itinerary")
        assert r.status_code == 200
        data = r.json()
        day1_node = next(d for d in data["days"] if d["id"] == day1)
        opt2_node = next(o for o in day1_node["options"] if o["id"] == option2)
        loc_nodes = opt2_node["locations"]
        # loc1 first (sort_order 0)
        first_loc_summary = loc_nodes[0]["location"]
        assert first_loc_summary["latitude"] == 48.8606
        assert first_loc_summary["longitude"] == 2.3376
        # loc2 second (sort_order 1)
        second_loc_summary = loc_nodes[1]["location"]
        assert second_loc_summary["latitude"] == 48.8584
        assert second_loc_summary["longitude"] == 2.2945
    finally:
        app.dependency_overrides.clear()
