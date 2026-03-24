"""Tests for day options API: list, create, get, update, delete, reorder."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _setup_own_trip_and_day(mock_supabase_trips_and_days, mock_user_id):
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
    return trip_id, day_id, mock_sb, days_store, trips_store


def test_list_options_empty_returns_200_empty_array(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}/options")
        assert r.status_code == 200
        assert r.json() == []
    finally:
        app.dependency_overrides.clear()


def test_create_option_returns_201_assigns_option_index(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    options_store = mock_sb._options_store

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(f"/api/v1/trips/{trip_id}/days/{day_id}/options", json={})
        assert r.status_code == 201
        data = r.json()
        assert data["day_id"] == day_id
        assert data["option_index"] == 1
        assert "id" in data
        assert len(options_store) == 1
        r2 = client.post(f"/api/v1/trips/{trip_id}/days/{day_id}/options", json={})
        assert r2.status_code == 201
        assert r2.json()["option_index"] == 2
        assert len(options_store) == 2
    finally:
        app.dependency_overrides.clear()


def test_create_option_persists_created_by_label(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options",
            json={"created_by": "Backup"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["created_by"] == "Backup"
        assert any(o.get("created_by") == "Backup" for o in mock_sb._options_store)
    finally:
        app.dependency_overrides.clear()


def test_list_options_returns_200_ordered(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    options_store = mock_sb._options_store
    options_store.append(
        {
            "option_id": str(uuid4()),
            "day_id": day_id,
            "option_index": 2,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    options_store.append(
        {
            "option_id": str(uuid4()),
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}/options")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        assert data[0]["option_index"] == 1
        assert data[1]["option_index"] == 2
    finally:
        app.dependency_overrides.clear()


def test_get_option_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    option_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}")
        assert r.status_code == 200
        assert r.json()["id"] == option_id
        assert r.json()["option_index"] == 1
    finally:
        app.dependency_overrides.clear()


def test_get_option_not_found_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    option_id = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_update_option_returns_200(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    option_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}",
            json={"option_index": 2},
        )
        assert r.status_code == 200
        assert r.json()["option_index"] == 2
    finally:
        app.dependency_overrides.clear()


def test_delete_option_returns_204(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    option_id = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.delete(f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}")
        assert r.status_code == 204
        assert not any(str(o.get("option_id")) == option_id for o in mock_sb._options_store)
    finally:
        app.dependency_overrides.clear()


def test_reorder_options_returns_200_new_order(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    opt_a = str(uuid4())
    opt_b = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": opt_a,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    mock_sb._options_store.append(
        {
            "option_id": opt_b,
            "day_id": day_id,
            "option_index": 2,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/reorder",
            json={"option_ids": [opt_b, opt_a]},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        assert data[0]["id"] == opt_b and data[0]["option_index"] == 1
        assert data[1]["id"] == opt_a and data[1]["option_index"] == 2
    finally:
        app.dependency_overrides.clear()


def test_reorder_options_empty_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/reorder",
            json={"option_ids": []},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_options_duplicate_id_returns_422(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    opt_a = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": opt_a,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/reorder",
            json={"option_ids": [opt_a, opt_a]},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_reorder_options_id_not_in_day_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    opt_a = str(uuid4())
    mock_sb._options_store.append(
        {
            "option_id": opt_a,
            "day_id": day_id,
            "option_index": 1,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )
    other_option_id = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/reorder",
            json={"option_ids": [opt_a, other_option_id]},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_list_options_day_not_found_returns_404(
    client: TestClient,
    mock_user_id,
    mock_supabase_trips_and_days,
):
    trip_id, _day_id, mock_sb, _, _ = _setup_own_trip_and_day(
        mock_supabase_trips_and_days, mock_user_id
    )
    other_day_id = str(uuid4())

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.get(f"/api/v1/trips/{trip_id}/days/{other_day_id}/options")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_create_option_no_jwt_returns_401(client: TestClient):
    r = client.post(f"/api/v1/trips/{uuid4()}/days/{uuid4()}/options", json={})
    assert r.status_code == 401
