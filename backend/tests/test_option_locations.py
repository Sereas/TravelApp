"""Tests for option-locations API: list/add/update/delete/batch."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_trip_day_option_and_location(mock_supabase_trips_and_days, mock_user_id):
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())
    location_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    # Seed trip and day
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    # Seed option and location rows
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._locations_store.append({"location_id": location_id, "trip_id": trip_id})
    return trip_id, day_id, option_id, location_id, mock_sb


def test_list_option_locations_empty_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, _, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_returns_201(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"location_id": location_id, "sort_order": 0, "time_period": "morning"}
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body,
        )
        assert r.status_code == 201
        data = r.json()
        assert data["option_id"] == option_id
        assert data["location_id"] == location_id
        assert data["sort_order"] == 0
        assert data["time_period"] == "morning"
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_location_not_in_trip_returns_400(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    # Change location trip_id so it no longer belongs to trip
    mock_sb._locations_store[0]["trip_id"] = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"location_id": location_id, "sort_order": 0, "time_period": "morning"}
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body,
        )
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_duplicate_returns_409(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    # Seed existing link
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"location_id": location_id, "sort_order": 1, "time_period": "afternoon"}
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
            json=body,
        )
        assert r.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_list_option_locations_returns_200_ordered(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    other_location_id = str(uuid4())
    mock_sb._locations_store.append({"location_id": other_location_id, "trip_id": trip_id})
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": other_location_id,
            "sort_order": 2,
            "time_period": "evening",
            "trip_id": trip_id,
        }
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 1,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        # Ordered by sort_order
        assert data[0]["sort_order"] == 1
        assert data[0]["location_id"] == location_id
        assert data[1]["sort_order"] == 2
        assert data[1]["location_id"] == other_location_id
    finally:
        app.dependency_overrides.clear()


def test_update_option_location_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = {"sort_order": 3, "time_period": "evening"}
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{location_id}",
            json=body,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["sort_order"] == 3
        assert data["time_period"] == "evening"
    finally:
        app.dependency_overrides.clear()


def test_update_option_location_empty_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{location_id}",
            json={},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_remove_location_from_option_returns_204(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, location_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": location_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/{location_id}",
        )
        assert r.status_code == 204
        assert not any(
            ol.get("option_id") == option_id and ol.get("location_id") == location_id
            for ol in mock_sb._option_locations_store
        )
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_to_option_returns_201_and_same_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, first_loc_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    second_loc_id = str(uuid4())
    mock_sb._locations_store.append({"location_id": second_loc_id, "trip_id": trip_id})

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = [
        {"location_id": first_loc_id, "sort_order": 0, "time_period": "morning"},
        {"location_id": second_loc_id, "sort_order": 1, "time_period": "afternoon"},
    ]
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=body,
        )
        assert r.status_code == 201
        data = r.json()
        assert [d["location_id"] for d in data] == [first_loc_id, second_loc_id]
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_empty_array_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, _, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=[],
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_duplicate_in_batch_returns_409(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, loc_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = [
        {"location_id": loc_id, "sort_order": 0, "time_period": "morning"},
        {"location_id": loc_id, "sort_order": 1, "time_period": "afternoon"},
    ]
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=body,
        )
        assert r.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_existing_link_returns_409_and_no_new_rows(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, option_id, loc_id, mock_sb = _setup_trip_day_option_and_location(
        mock_supabase_trips_and_days, mock_user_id
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": option_id,
            "location_id": loc_id,
            "sort_order": 0,
            "time_period": "morning",
            "trip_id": trip_id,
        }
    )
    initial_count = len(mock_sb._option_locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    body = [{"location_id": loc_id, "sort_order": 1, "time_period": "afternoon"}]
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
            json=body,
        )
        assert r.status_code == 409
        # All-or-nothing: no new rows added
        assert len(mock_sb._option_locations_store) == initial_count
    finally:
        app.dependency_overrides.clear()


def test_add_location_to_option_no_jwt_returns_401(client: TestClient):
    trip_id = uuid4()
    day_id = uuid4()
    option_id = uuid4()
    loc_id = uuid4()
    body = {"location_id": str(loc_id), "sort_order": 0, "time_period": "morning"}
    r = client.post(
        f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations",
        json=body,
    )
    assert r.status_code == 401
