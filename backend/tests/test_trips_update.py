"""Tests for update trip endpoint (Slice 6)."""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


class _TripsTableMock:
    def __init__(self, store: dict[str, dict]):
        self._store = store
        self._mode = None
        self._update_data = None
        self._filter_key = None
        self._filter_value = None

    def select(self, *args):
        self._mode = "select"
        return self

    def update(self, data):
        self._mode = "update"
        self._update_data = dict(data)
        return self

    def eq(self, key, value):
        self._filter_key = key
        self._filter_value = str(value)
        return self

    def execute(self):
        if self._mode == "select":
            if self._filter_key == "trip_id":
                row = self._store.get(self._filter_value)
                if row is None:
                    return type("Result", (), {"data": []})()
                return type("Result", (), {"data": [row]})()
            return type("Result", (), {"data": []})()
        if self._mode == "update":
            if self._filter_key == "trip_id" and self._filter_value in self._store:
                row = self._store[self._filter_value]
                row.update(self._update_data)
                return type("Result", (), {"data": [row]})()
            return type("Result", (), {"data": []})()
        return type("Result", (), {"data": []})()


class _RpcResult:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class MockSupabaseTrips:
    def __init__(self, trips_store: dict[str, dict]):
        self._trips_store = trips_store

    def table(self, name):
        if name == "trips":
            return _TripsTableMock(self._trips_store)
        raise AssertionError(f"Unexpected table: {name}")

    def rpc(self, fn_name, params=None):
        if fn_name in ("verify_member_access", "verify_resource_chain"):
            trip_id = params.get("p_trip_id")
            user_id = params.get("p_user_id")
            trip = self._trips_store.get(trip_id)
            if trip and trip.get("user_id") == user_id:
                return _RpcResult("owner")
            return _RpcResult(None)
        raise AssertionError(f"Unexpected RPC: {fn_name}")


def _make_trip(trip_id: str, user_id: UUID):
    return {
        "trip_id": trip_id,
        "user_id": str(user_id),
        "trip_name": "Paris 2025",
        "start_date": "2025-06-01",
        "end_date": "2025-06-10",
    }


def test_update_trip_name_only(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == trip_id
        assert data["name"] == "New name"
        assert data["start_date"] == "2025-06-01"
        assert data["end_date"] == "2025-06-10"
        assert trips_store[trip_id]["trip_name"] == "New name"
    finally:
        app.dependency_overrides.clear()


def test_update_trip_dates_only(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={
                "start_date": "2025-07-01",
                "end_date": "2025-07-10",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["start_date"] == "2025-07-01"
        assert data["end_date"] == "2025-07-10"
        assert trips_store[trip_id]["start_date"] == "2025-07-01"
        assert trips_store[trip_id]["end_date"] == "2025-07-10"
    finally:
        app.dependency_overrides.clear()


def test_update_trip_all_fields(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={
                "name": "Updated trip",
                "start_date": "2025-08-01",
                "end_date": "2025-08-15",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Updated trip"
        assert data["start_date"] == "2025-08-01"
        assert data["end_date"] == "2025-08-15"
        row = trips_store[trip_id]
        assert row["trip_name"] == "Updated trip"
        assert row["start_date"] == "2025-08-01"
        assert row["end_date"] == "2025-08-15"
    finally:
        app.dependency_overrides.clear()


def test_update_trip_empty_body_returns_422(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(f"/api/v1/trips/{trip_id}", json={})
        assert r.status_code == 422
        detail = r.json().get("detail", "")
        assert isinstance(detail, str)
        assert "at least one field" in detail.lower()
    finally:
        app.dependency_overrides.clear()


def test_update_trip_invalid_start_date_returns_422(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={"start_date": "2025/07/01"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_update_trip_nonexistent_returns_404(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store = {}
    trip_id = str(uuid4())
    mock_sb = MockSupabaseTrips(trips_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_update_trip_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
):
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_update_trip_no_jwt_returns_401(client: TestClient, monkeypatch):
    """Update trip without JWT -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    trip_id = "00000000-0000-0000-0000-000000000001"
    r = client.patch(f"/api/v1/trips/{trip_id}", json={"name": "New name"})
    assert r.status_code == 401
