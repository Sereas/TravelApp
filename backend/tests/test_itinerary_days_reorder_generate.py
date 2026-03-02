"""Tests for trip days reorder and generate endpoints."""

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_trip_with_days(mock_supabase_trips_and_days, mock_user_id):
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
    return trip_id, days_store, trips_store, mock_sb


def test_reorder_days_happy_path_updates_sort_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, days_store, _trips_store, mock_sb = _setup_trip_with_days(
        mock_supabase_trips_and_days, mock_user_id
    )
    day1 = str(uuid4())
    day2 = str(uuid4())
    days_store.append(
        {
            "day_id": day1,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 0,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    days_store.append(
        {
            "day_id": day2,
            "trip_id": trip_id,
            "date": "2025-06-02",
            "sort_order": 1,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        body = {"day_ids": [day2, day1]}
        r = client.patch(f"/api/v1/trips/{trip_id}/days/reorder", json=body)
        assert r.status_code == 200
        data = r.json()
        assert [d["id"] for d in data] == [day2, day1]
        assert [d["sort_order"] for d in data] == [0, 1]
    finally:
        app.dependency_overrides.clear()


def test_reorder_days_empty_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, _days_store, _trips_store, mock_sb = _setup_trip_with_days(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(f"/api/v1/trips/{trip_id}/days/reorder", json={"day_ids": []})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_days_day_not_in_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, days_store, _trips_store, mock_sb = _setup_trip_with_days(
        mock_supabase_trips_and_days, mock_user_id
    )
    other_day = str(uuid4())
    # No days in store for this trip yet
    assert not days_store

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(f"/api/v1/trips/{trip_id}/days/reorder", json={"day_ids": [other_day]})
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def _setup_trip_for_generate(mock_supabase_trips_and_days, mock_user_id):
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Trip",
            "start_date": date(2025, 6, 1).isoformat(),
            "end_date": date(2025, 6, 3).isoformat(),
        }
    )
    return trip_id, days_store, trips_store, mock_sb


def test_generate_days_happy_path_creates_range_and_sort_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, days_store, _trips_store, mock_sb = _setup_trip_for_generate(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 3
        assert [d["sort_order"] for d in data] == [0, 1, 2]
        assert [d["date"] for d in data] == [
            "2025-06-01",
            "2025-06-02",
            "2025-06-03",
        ]
        assert len(days_store) == 3
    finally:
        app.dependency_overrides.clear()


def test_generate_days_when_days_already_exist_returns_409(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, days_store, _trips_store, mock_sb = _setup_trip_for_generate(
        mock_supabase_trips_and_days, mock_user_id
    )
    days_store.append(
        {
            "day_id": str(uuid4()),
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 0,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_generate_days_missing_dates_returns_400(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
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

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_generate_days_invalid_date_range_returns_400(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    # end_date before start_date
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Trip",
            "start_date": date(2025, 6, 3).isoformat(),
            "end_date": date(2025, 6, 1).isoformat(),
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()
