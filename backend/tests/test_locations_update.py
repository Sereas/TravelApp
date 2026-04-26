"""Tests for update-location endpoint (Slice 7)."""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


class _TripsTableMock:
    def __init__(self, trips_store: dict[str, dict]):
        self._store = trips_store
        self._mode = None
        self._filter_trip_id = None

    def select(self, *args):
        self._mode = "select"
        return self

    def eq(self, key, value):
        if key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def execute(self):
        if self._mode == "select":
            row = self._store.get(self._filter_trip_id)
            if row is None:
                return type("Result", (), {"data": []})()
            return type("Result", (), {"data": [row]})()
        return type("Result", (), {"data": []})()


class _LocationsTableMock:
    def __init__(self, locations_store: dict[str, dict]):
        self._store = locations_store
        self._mode = None
        self._filter_location_id = None
        self._filter_trip_id = None
        self._update_data = None

    def select(self, *args):
        self._mode = "select"
        return self

    def update(self, data):
        self._mode = "update"
        self._update_data = dict(data)
        return self

    def eq(self, key, value):
        if key == "location_id":
            self._filter_location_id = str(value)
        elif key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def _filter_rows(self):
        rows = list(self._store.values())
        if self._filter_location_id is not None:
            rows = [r for r in rows if r.get("location_id") == self._filter_location_id]
        if self._filter_trip_id is not None:
            rows = [r for r in rows if r.get("trip_id") == self._filter_trip_id]
        return rows

    def execute(self):
        # update().eq().eq().select().execute() — apply update when _update_data set
        if self._update_data is not None:
            rows = self._filter_rows()
            if not rows:
                out = type("Result", (), {"data": []})()
            else:
                row = rows[0]
                row.update(self._update_data)
                out = type("Result", (), {"data": [row]})()
            self._update_data = None
            return out
        if self._mode == "select":
            rows = self._filter_rows()
            return type("Result", (), {"data": rows})()
        return type("Result", (), {"data": []})()


class MockSupabaseLocations:
    def __init__(self, trips_store: dict[str, dict], locations_store: dict[str, dict]):
        self._trips_store = trips_store
        self._locations_store = locations_store

    def table(self, name):
        if name == "trips":
            return _TripsTableMock(self._trips_store)
        if name == "locations":
            return _LocationsTableMock(self._locations_store)
        raise AssertionError(f"Unexpected table: {name}")

    def rpc(self, name, params):
        if name in ("verify_member_access", "verify_resource_chain"):
            tid = str(params.get("p_trip_id", ""))
            uid = str(params.get("p_user_id", ""))
            trip = self._trips_store.get(tid)
            valid = trip is not None and str(trip.get("user_id")) == uid
            role = "owner" if valid else None
            return type("Chain", (), {"execute": lambda _: type("R", (), {"data": role})()})()
        return type("Chain", (), {"execute": lambda _: type("R", (), {"data": None})()})()


def _make_trip(trip_id: str, user_id: UUID):
    return {
        "trip_id": trip_id,
        "user_id": str(user_id),
    }


def _make_location(location_id: str, trip_id: str, **kwargs):
    base = {
        "location_id": location_id,
        "trip_id": trip_id,
        "name": "Old name",
        "address": "Old address",
        "google_link": "https://old.example.com",
        "note": "Old note",
        "added_by_user_id": None,
        "city": None,
        "working_hours": None,
        "useful_link": None,
        "requires_booking": None,
        "category": None,
    }
    base.update(kwargs)
    return base


def test_update_location_name_only(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == loc_id
        assert data["name"] == "New name"
        # address, google_link, note unchanged
        assert data["address"] == "Old address"
        assert data["google_link"] == "https://old.example.com"
        assert data["note"] == "Old note"
    finally:
        app.dependency_overrides.clear()


def test_update_location_multiple_fields(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={
                "name": "Updated name",
                "address": "New address",
                "note": "New note",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Updated name"
        assert data["address"] == "New address"
        assert data["note"] == "New note"
        assert data["google_link"] == "https://old.example.com"
    finally:
        app.dependency_overrides.clear()


def test_update_location_empty_body_returns_422(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={},
        )
        assert r.status_code == 422
        detail = r.json().get("detail", "")
        assert isinstance(detail, str)
        assert "at least one field" in detail.lower()
    finally:
        app.dependency_overrides.clear()


def test_update_location_nonexistent_trip_returns_404(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_update_location_other_users_trip_returns_404(
    client: TestClient,
    mock_supabase_trips_and_locations,
):
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    owner_id = str(uuid4())
    other_user_id = str(uuid4())
    loc_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: owner_id}, other_user_id)

    async def override_user():
        return UUID(other_user_id)

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Resource not found or not owned"
    finally:
        app.dependency_overrides.clear()


def test_update_location_nonexistent_location_returns_404(
    client: TestClient,
    mock_user_id: UUID,
):
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"name": "New name"},
        )
        assert r.status_code == 404
        assert r.json().get("detail") == "Location not found"
    finally:
        app.dependency_overrides.clear()


def test_update_location_invalid_requires_booking_returns_422(
    client: TestClient,
    mock_user_id: UUID,
):
    """PATCH with requires_booking not in (no, yes, yes_done) -> 422."""
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"requires_booking": "maybe"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_update_location_invalid_category_returns_422(
    client: TestClient,
    mock_user_id: UUID,
):
    """PATCH with category not in allowed 14 values -> 422."""
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"category": "InvalidCategory"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_update_location_useful_link(
    client: TestClient,
    mock_user_id: UUID,
):
    """PATCH useful_link updates and returns the new value."""
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"useful_link": "https://example.com/booking"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["useful_link"] == "https://example.com/booking"
    finally:
        app.dependency_overrides.clear()


def test_update_location_useful_link_empty_string_becomes_null(
    client: TestClient,
    mock_user_id: UUID,
):
    """Empty-string useful_link is converted to null via _NULLABLE_TEXT_FIELDS."""
    trips_store: dict[str, dict] = {}
    locations_store: dict[str, dict] = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id, useful_link="https://old.example.com")
    mock_sb = MockSupabaseLocations(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={"useful_link": ""},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["useful_link"] is None
    finally:
        app.dependency_overrides.clear()


def test_update_location_no_jwt_returns_401(client: TestClient, monkeypatch):
    """Update location without JWT -> 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    trip_id = "00000000-0000-0000-0000-000000000001"
    loc_id = "00000000-0000-0000-0000-000000000002"
    r = client.patch(
        f"/api/v1/trips/{trip_id}/locations/{loc_id}",
        json={"name": "New name"},
    )
    assert r.status_code == 401
