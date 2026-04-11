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


def test_update_day_set_active_option_id_persists(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH active_option_id with a matching option -> 200 and value persisted.

    This is the feature flow: the owner picks an Alternative option, and we
    persist the choice on `trip_days` so it survives logout/login and is what
    shared viewers see.
    """
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append({"trip_id": trip_id, "user_id": str(mock_user_id), "trip_name": "Paris"})
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
            "active_option_id": None,
        }
    )
    # Seed the option on this day so validation passes.
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 2,
            "starting_city": None,
            "ending_city": None,
            "created_by": "Alt",
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
            json={"active_option_id": option_id},
        )
        assert r.status_code == 200, r.text
        assert r.json()["active_option_id"] == option_id
        # And the store actually has the new pointer.
        assert days_store[0]["active_option_id"] == option_id
    finally:
        app.dependency_overrides.clear()


def test_update_day_clear_active_option_id_with_null(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH active_option_id=null clears the pointer and 200s.

    Used when the user wants to fall back to the Main option explicitly.
    """
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    stale_option_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append({"trip_id": trip_id, "user_id": str(mock_user_id), "trip_name": "Paris"})
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
            "active_option_id": stale_option_id,
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}",
            json={"active_option_id": None},
        )
        assert r.status_code == 200, r.text
        assert r.json()["active_option_id"] is None
        assert days_store[0]["active_option_id"] is None
    finally:
        app.dependency_overrides.clear()


def test_update_day_active_option_id_cross_day_rejected(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """PATCH with an option_id that belongs to a different day -> 422.

    Prevents a crafted request from pointing day A at an option from day B
    even though both days belong to the user. The FK alone can't catch this;
    the handler must verify `option.day_id == day_id`.
    """
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_a = str(uuid4())
    day_b = str(uuid4())
    option_on_b = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append({"trip_id": trip_id, "user_id": str(mock_user_id), "trip_name": "Paris"})
    days_store.extend(
        [
            {
                "day_id": day_a,
                "trip_id": trip_id,
                "date": None,
                "sort_order": 0,
                "created_at": "2025-01-01T12:00:00Z",
                "active_option_id": None,
            },
            {
                "day_id": day_b,
                "trip_id": trip_id,
                "date": None,
                "sort_order": 1,
                "created_at": "2025-01-01T12:00:00Z",
                "active_option_id": None,
            },
        ]
    )
    # Option is on day B, but we'll try to assign it to day A.
    mock_sb._options_store.append(
        {
            "option_id": option_on_b,
            "day_id": day_b,
            "option_index": 1,
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
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_a}",
            json={"active_option_id": option_on_b},
        )
        assert r.status_code == 422
        assert "does not belong to this day" in r.text
        # And day A was NOT mutated.
        day_a_row = next(d for d in days_store if d["day_id"] == day_a)
        assert day_a_row["active_option_id"] is None
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


def test_reassign_day_date_simple_returns_204(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reassign day date with no conflict and single option -> 204, date updated."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_id = str(uuid4())
    opt_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": "2025-06-01",
            "end_date": "2025-06-15",
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
    mock_sb._options_store.append(
        {
            "option_id": opt_id,
            "day_id": day_id,
            "option_index": 1,
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
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/reassign-date",
            json={"new_date": "2025-06-05", "option_id": opt_id},
        )
        assert r.status_code == 204
        assert days_store[0]["date"] == "2025-06-05"
    finally:
        app.dependency_overrides.clear()


def test_reassign_day_date_with_conflict_calls_rpc(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reassign day date to a date owned by another day -> 204, RPC called."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    day_a = str(uuid4())
    day_b = str(uuid4())
    opt_a = str(uuid4())
    opt_b = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": "2025-06-01",
            "end_date": "2025-06-15",
        }
    )
    days_store.extend(
        [
            {
                "day_id": day_a,
                "trip_id": trip_id,
                "date": "2025-06-01",
                "sort_order": 0,
                "created_at": "2025-01-01T12:00:00Z",
            },
            {
                "day_id": day_b,
                "trip_id": trip_id,
                "date": "2025-06-02",
                "sort_order": 1,
                "created_at": "2025-01-01T12:00:00Z",
            },
        ]
    )
    # Add options so the RPC mock has something to swap
    mock_sb._options_store.extend(
        [
            {
                "option_id": opt_a,
                "day_id": day_a,
                "option_index": 1,
                "starting_city": None,
                "ending_city": None,
                "created_by": None,
                "created_at": "2025-01-01T12:00:00Z",
            },
            {
                "option_id": opt_b,
                "day_id": day_b,
                "option_index": 1,
                "starting_city": None,
                "ending_city": None,
                "created_by": None,
                "created_at": "2025-01-01T12:00:00Z",
            },
        ]
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_a}/reassign-date",
            json={"new_date": "2025-06-02", "option_id": opt_a},
        )
        assert r.status_code == 204
        # day_a keeps its original date (NOT changed)
        assert days_store[0]["date"] == "2025-06-01"
        # RPC moved opt_a to day_b and opt_b stayed on day_b (bumped index)
        opt_a_row = next(o for o in mock_sb._options_store if o["option_id"] == opt_a)
        assert opt_a_row["day_id"] == day_b
        assert opt_a_row["option_index"] == 1
        opt_b_row = next(o for o in mock_sb._options_store if o["option_id"] == opt_b)
        assert opt_b_row["option_index"] == 2
    finally:
        app.dependency_overrides.clear()


def test_reassign_day_date_cleans_empty_dateless_source(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reassign date from dateless day with conflict -> source day deleted if empty."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    dateless_day_id = str(uuid4())
    dated_day_id = str(uuid4())
    opt_a = str(uuid4())
    opt_b = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Paris",
            "start_date": "2025-06-01",
            "end_date": "2025-06-15",
        }
    )
    # Dateless source day (created before dates were set)
    days_store.append(
        {
            "day_id": dateless_day_id,
            "trip_id": trip_id,
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    # Dated target day
    days_store.append(
        {
            "day_id": dated_day_id,
            "trip_id": trip_id,
            "date": "2025-06-01",
            "sort_order": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._options_store.extend(
        [
            {
                "option_id": opt_a,
                "day_id": dateless_day_id,
                "option_index": 1,
                "starting_city": None,
                "ending_city": None,
                "created_by": None,
                "created_at": "2025-01-01T12:00:00Z",
            },
            {
                "option_id": opt_b,
                "day_id": dated_day_id,
                "option_index": 1,
                "starting_city": None,
                "ending_city": None,
                "created_by": None,
                "created_at": "2025-01-01T12:00:00Z",
            },
        ]
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{dateless_day_id}/reassign-date",
            json={"new_date": "2025-06-01", "option_id": opt_a},
        )
        assert r.status_code == 204
        # Dateless source day should be deleted (empty after move)
        remaining_ids = {d["day_id"] for d in days_store if d["trip_id"] == trip_id}
        assert dateless_day_id not in remaining_ids
        # Dated target day should remain
        assert dated_day_id in remaining_ids
    finally:
        app.dependency_overrides.clear()


def test_generate_days_empty_trip_creates_all_days(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days for a trip with dates and no existing days -> 201, all days created."""
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        assert len(days) == 3
        dates = [d["date"] for d in days]
        assert "2026-06-01" in dates
        assert "2026-06-02" in dates
        assert "2026-06-03" in dates
    finally:
        app.dependency_overrides.clear()


def test_generate_days_skips_existing_dates(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days when some days already exist -> 201, only missing days added."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    # Pre-existing day for Jun 1
    days_store.append(
        {
            "day_id": str(uuid4()),
            "trip_id": trip_id,
            "date": "2026-06-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        # Should have 3 total (1 existing + 2 new)
        assert len(days) == 3
        dates = sorted(d["date"] for d in days)
        assert dates == ["2026-06-01", "2026-06-02", "2026-06-03"]
    finally:
        app.dependency_overrides.clear()


def test_generate_days_all_covered_returns_existing(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days when all dates already covered -> 201, returns existing days."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-02",
        }
    )
    for i, d in enumerate(["2026-06-01", "2026-06-02"]):
        days_store.append(
            {
                "day_id": str(uuid4()),
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        assert len(days) == 2
        # No new days inserted — store should still have exactly 2
        assert len(days_store) == 2
    finally:
        app.dependency_overrides.clear()


def test_generate_days_no_dates_returns_400(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days for trip without dates -> 400."""
    _days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
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


def test_generate_days_reorders_by_date(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days with existing out-of-order day -> days reordered by date."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    # Existing day with date Jun 3 at sort_order 0 (out of order)
    days_store.append(
        {
            "day_id": str(uuid4()),
            "trip_id": trip_id,
            "date": "2026-06-03",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        assert len(days) == 3
        # Days should be ordered by date
        dates = [d["date"] for d in days]
        assert dates == ["2026-06-01", "2026-06-02", "2026-06-03"]
        orders = [d["sort_order"] for d in days]
        assert orders == [0, 1, 2]
    finally:
        app.dependency_overrides.clear()


def test_reconcile_shift_days(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reconcile shift -> dates shifted by offset."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    for i, d in enumerate(["2026-06-01", "2026-06-02", "2026-06-03"]):
        days_store.append(
            {
                "day_id": str(uuid4()),
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/reconcile",
            json={"action": "shift", "offset_days": 3},
        )
        assert r.status_code == 204
        dates = sorted(d["date"] for d in days_store)
        assert dates == ["2026-06-04", "2026-06-05", "2026-06-06"]
    finally:
        app.dependency_overrides.clear()


def test_reconcile_clear_dates(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reconcile clear_dates -> empty orphaned days deleted, third day (not targeted) unaffected."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    day_ids = []
    for i, d in enumerate(["2026-06-01", "2026-06-02", "2026-06-03"]):
        did = str(uuid4())
        day_ids.append(did)
        days_store.append(
            {
                "day_id": did,
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Clear dates from first two days — both are empty so they get deleted
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/reconcile",
            json={"action": "clear_dates", "day_ids": day_ids[:2]},
        )
        assert r.status_code == 204
        # First two days (empty) should be deleted
        remaining_ids = {d["day_id"] for d in days_store if d["trip_id"] == trip_id}
        assert day_ids[0] not in remaining_ids
        assert day_ids[1] not in remaining_ids
        # Third day should keep its date (not in the clear list)
        assert day_ids[2] in remaining_ids
        day3 = next(d for d in days_store if d["day_id"] == day_ids[2])
        assert day3["date"] == "2026-06-03"
    finally:
        app.dependency_overrides.clear()


def test_reconcile_delete_days(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reconcile delete -> specified days removed."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    day_ids = []
    for i, d in enumerate(["2026-06-01", "2026-06-02", "2026-06-03"]):
        did = str(uuid4())
        day_ids.append(did)
        days_store.append(
            {
                "day_id": did,
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Delete first two days
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/reconcile",
            json={"action": "delete", "day_ids": day_ids[:2]},
        )
        assert r.status_code == 204
        remaining = [d for d in days_store if d["trip_id"] == trip_id]
        assert len(remaining) == 1
        assert remaining[0]["day_id"] == day_ids[2]
        assert remaining[0]["sort_order"] == 0
    finally:
        app.dependency_overrides.clear()


def test_reconcile_clear_dates_deletes_empty_days(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reconcile clear_dates: empty orphaned days deleted, days with content keep (date cleared)."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
        }
    )
    day_ids = []
    for i, d in enumerate(["2026-06-01", "2026-06-02", "2026-06-03"]):
        did = str(uuid4())
        day_ids.append(did)
        days_store.append(
            {
                "day_id": did,
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )
    # Add an option + location to day 3 so it has content
    opt_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": opt_id,
            "day_id": day_ids[2],
            "option_index": 1,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": opt_id,
            "location_id": str(uuid4()),
            "sort_order": 0,
            "time_period": "morning",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        # Clear dates from all three days — day 1 & 2 are empty, day 3 has content
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/reconcile",
            json={"action": "clear_dates", "day_ids": day_ids},
        )
        assert r.status_code == 204
        # Day 1 and Day 2 (empty) should be deleted
        remaining_ids = {d["day_id"] for d in days_store if d["trip_id"] == trip_id}
        assert day_ids[0] not in remaining_ids
        assert day_ids[1] not in remaining_ids
        # Day 3 (has content) should remain but with date cleared
        assert day_ids[2] in remaining_ids
        day3 = next(d for d in days_store if d["day_id"] == day_ids[2])
        assert day3["date"] is None
    finally:
        app.dependency_overrides.clear()


def test_reconcile_clear_dates_all_empty(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Reconcile clear_dates: when all orphaned days are empty, all get deleted."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-02",
        }
    )
    day_ids = []
    for i, d in enumerate(["2026-06-01", "2026-06-02"]):
        did = str(uuid4())
        day_ids.append(did)
        days_store.append(
            {
                "day_id": did,
                "trip_id": trip_id,
                "date": d,
                "sort_order": i,
                "created_at": "2025-01-01T12:00:00Z",
            }
        )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/reconcile",
            json={"action": "clear_dates", "day_ids": day_ids},
        )
        assert r.status_code == 204
        remaining = [d for d in days_store if d["trip_id"] == trip_id]
        assert len(remaining) == 0
    finally:
        app.dependency_overrides.clear()


def test_generate_days_cleans_empty_dateless_days(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days removes empty dateless days before generating."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-02",
        }
    )
    # Add an empty dateless day (leftover from reconciliation)
    empty_day_id = str(uuid4())
    days_store.append(
        {
            "day_id": empty_day_id,
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
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        # Should have 2 days (Jun 1 + Jun 2), empty dateless day removed
        assert len(days) == 2
        assert all(d["date"] is not None for d in days)
        # Empty dateless day should be gone from store
        assert not any(d["day_id"] == empty_day_id for d in days_store)
    finally:
        app.dependency_overrides.clear()


def test_generate_days_keeps_dateless_days_with_content(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    """Generate days preserves dateless days that have locations."""
    days_store, trips_store, MockSupabase = mock_supabase_trips_and_days
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)
    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(mock_user_id),
            "trip_name": "Rome",
            "start_date": "2026-06-01",
            "end_date": "2026-06-01",
        }
    )
    # Add a dateless day WITH content
    content_day_id = str(uuid4())
    days_store.append(
        {
            "day_id": content_day_id,
            "trip_id": trip_id,
            "date": None,
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    opt_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": opt_id,
            "day_id": content_day_id,
            "option_index": 1,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._option_locations_store.append(
        {
            "option_id": opt_id,
            "location_id": str(uuid4()),
            "sort_order": 0,
            "time_period": "morning",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/generate")
        assert r.status_code == 201
        days = r.json()
        # Should have 2 days: the dateless day with content + Jun 1
        assert len(days) == 2
        # Content day should still be in the store
        assert any(d["day_id"] == content_day_id for d in days_store)
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
