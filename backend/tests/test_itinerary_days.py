"""Tests for trip days (itinerary) API: list, create, get, update, delete."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_list_days_own_trip_empty_returns_200_empty_array(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """List days for own trip with no days -> 200, []."""
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days")
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_list_days_own_trip_with_days_returns_200_ordered(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """List days for own trip with days -> 200, array ordered by sort_order."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
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
            "day_id": str(uuid4()),
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    days_store.append(
        {
            "day_id": str(uuid4()),
            "trip_id": trip_id,
            "date": "2025-06-02",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        assert data[0]["sort_order"] == 0
        assert data[1]["sort_order"] == 1
    finally:
        app.dependency_overrides.clear()


def test_list_days_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """List days for non-existent trip -> 404."""
    _days_store, _trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_list_days_other_users_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """List days for another user's trip -> 404."""
    _days_store, _trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    other_user = str(uuid4())
    mock_sb = MockSupabase({trip_id: other_user}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_create_day_returns_201_and_assigns_sort_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Create day -> 201, backend assigns sort_order (append)."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days",
            json={"date": "2025-06-01"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["trip_id"] == trip_id
        assert data["sort_order"] == 0
        assert "id" in data
        assert len(days_store) == 1
        assert days_store[0]["sort_order"] == 0
        r2 = client.post(f"/api/v1/trips/{trip_id}/days", json={})
        assert r2.status_code == 201
        assert r2.json()["sort_order"] == 1
        assert len(days_store) == 2
    finally:
        app.dependency_overrides.clear()


def test_create_day_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Create day for non-existent trip -> 404."""
    _days_store, _trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days", json={})
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_get_day_own_trip_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Get day by id for own trip -> 200."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
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

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}")
        assert r.status_code == 200
        assert r.json()["id"] == day_id
        assert r.json()["date"] == "2025-06-01"
    finally:
        app.dependency_overrides.clear()


def test_get_day_not_found_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Get non-existent day -> 404."""
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_update_day_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Update day -> 200 and fields updated."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
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

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}",
            json={"date": "2025-07-01"},
        )
        assert r.status_code == 200
        assert r.json()["date"] == "2025-07-01"
    finally:
        app.dependency_overrides.clear()


def test_update_day_empty_body_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Update day with empty body -> 422."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
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
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(f"/api/v1/trips/{trip_id}/days/{day_id}", json={})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_delete_day_returns_204(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Delete day -> 204 and day removed from store."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
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
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete(f"/api/v1/trips/{trip_id}/days/{day_id}")
        assert r.status_code == 204
        assert not any(str(d.get("day_id")) == day_id for d in days_store)
    finally:
        app.dependency_overrides.clear()


def test_delete_day_not_found_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Delete non-existent day -> 404."""
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": None,
            "end_date": None,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete(f"/api/v1/trips/{trip_id}/days/{day_id}")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_list_days_no_jwt_returns_401(client: TestClient):
    """List days without JWT -> 401."""
    r = client.get(f"/api/v1/trips/{uuid4()}/days")
    assert r.status_code == 401


def test_create_day_no_jwt_returns_401(client: TestClient):
    """Create day without JWT -> 401."""
    r = client.post(f"/api/v1/trips/{uuid4()}/days", json={})
    assert r.status_code == 401
