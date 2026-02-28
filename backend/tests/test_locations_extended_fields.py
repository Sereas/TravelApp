"""Tests for extended location fields: city, working_hours, requires_booking, category, added_by."""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def test_locations_mock_insert_has_no_select(mock_supabase_trips_and_locations):
    """Regression: insert() returns builder with execute() but NOT select() (matches real Supabase).
    Router must use insert().execute() then separate select(), not insert().select().execute().
    """
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: "11111111-2222-3333-4444-555555555555"}, "11111111-2222-3333-4444-555555555555")
    table = mock_sb.table("locations")
    builder = table.insert({"name": "x", "trip_id": trip_id})
    assert hasattr(builder, "execute"), "insert builder must have execute()"
    assert not hasattr(builder, "select"), "insert builder must NOT have select() - real Supabase SyncQueryRequestBuilder has no select"


def test_locations_mock_update_has_no_select(mock_supabase_trips_and_locations):
    """Regression: update() returns builder with eq(), execute() but NOT select() (matches real Supabase).
    Router must use update().eq().eq().execute() then separate select(), not update().select().execute().
    """
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    mock_sb = MockSupabase({}, "11111111-2222-3333-4444-555555555555")
    table = mock_sb.table("locations")
    builder = table.update({"name": "x"})
    assert hasattr(builder, "eq") and hasattr(builder, "execute"), "update builder must have eq() and execute()"
    assert not hasattr(builder, "select"), "update builder must NOT have select() - real Supabase SyncFilterRequestBuilder has no select"


def test_add_location_with_extended_fields_returns_201(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase_trips_and_locations,
):
    """POST with city, working_hours, requires_booking, category -> 201 and returned in body."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={
                "name": "Louvre",
                "city": "Paris",
                "working_hours": "9:00–18:00",
                "requires_booking": "yes",
                "category": "Museum",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Louvre"
        assert data["city"] == "Paris"
        assert data["working_hours"] == "9:00–18:00"
        assert data["requires_booking"] == "yes"
        assert data["category"] == "Museum"
        assert data["added_by_user_id"] == str(mock_user_id)
        # added_by_email is resolved from auth; mock has no auth so None
        assert data.get("added_by_email") is None
        assert len(locations_inserted) == 1
        loc = locations_inserted[0]
        assert loc["city"] == "Paris"
        assert loc["working_hours"] == "9:00–18:00"
        assert loc["requires_booking"] == "yes"
        assert loc["category"] == "Museum"
        assert loc["added_by_user_id"] == str(mock_user_id)
    finally:
        app.dependency_overrides.clear()


def test_add_location_requires_booking_invalid_returns_422(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase_trips_and_locations,
):
    """requires_booking not in (no, yes, yes_done) -> 422."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Place", "requires_booking": "maybe"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_add_location_category_invalid_returns_422(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase_trips_and_locations,
):
    """category not in allowed 14 values -> 422."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={"name": "Place", "category": "InvalidCategory"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_list_locations_returns_extended_fields(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase_trips_and_locations,
):
    """GET list returns city, working_hours, requires_booking, category, added_by_user_id."""
    _locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        client.post(
            f"/api/v1/trips/{trip_id}/locations",
            json={
                "name": "Café",
                "city": "Rome",
                "category": "Café",
                "requires_booking": "no",
            },
        )
        r = client.get(f"/api/v1/trips/{trip_id}/locations")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        loc = data[0]
        assert loc["name"] == "Café"
        assert loc["city"] == "Rome"
        assert loc["category"] == "Café"
        assert loc["requires_booking"] == "no"
        assert "added_by_user_id" in loc
    finally:
        app.dependency_overrides.clear()


def _make_trip(trip_id: str, user_id: UUID):
    return {"trip_id": trip_id, "user_id": str(user_id)}


def _make_location(loc_id: str, trip_id: str, **kwargs):
    base = {
        "location_id": loc_id,
        "trip_id": trip_id,
        "name": "Old name",
        "address": "Old address",
        "google_link": "https://old.example.com",
        "note": "Old note",
        "added_by_user_id": None,
        "city": None,
        "working_hours": None,
        "requires_booking": None,
        "category": None,
    }
    base.update(kwargs)
    return base


class _TripsTableMock:
    def __init__(self, store: dict):
        self._store = store
        self._filter_trip_id = None

    def select(self, *args):
        return self

    def eq(self, key, value):
        if key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def execute(self):
        if self._filter_trip_id and self._filter_trip_id in self._store:
            return type("Result", (), {"data": [self._store[self._filter_trip_id]]})()
        return type("Result", (), {"data": []})()


class _LocationsTableMock:
    def __init__(self, store: dict):
        self._store = store
        self._filter_location_id = None
        self._filter_trip_id = None
        self._update_data = None

    def select(self, *args):
        return self

    def update(self, data):
        self._update_data = dict(data)
        return self

    def eq(self, key, value):
        if key == "location_id":
            self._filter_location_id = str(value)
        elif key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def execute(self):
        if self._update_data is not None:
            rows = [
                r
                for r in self._store.values()
                if (not self._filter_location_id or r.get("location_id") == self._filter_location_id)
                and (not self._filter_trip_id or r.get("trip_id") == self._filter_trip_id)
            ]
            if not rows:
                out = type("Result", (), {"data": []})()
            else:
                row = rows[0]
                row.update(self._update_data)
                out = type("Result", (), {"data": [row]})()
            self._update_data = None
            return out
        rows = [
            r
            for r in self._store.values()
            if (not self._filter_trip_id or r.get("trip_id") == self._filter_trip_id)
            and (not self._filter_location_id or r.get("location_id") == self._filter_location_id)
        ]
        return type("Result", (), {"data": rows})()


class _MockSupabaseUpdate:
    def __init__(self, trips_store: dict, locations_store: dict):
        self._trips = trips_store
        self._locations = locations_store

    def table(self, name):
        if name == "trips":
            return _TripsTableMock(self._trips)
        if name == "locations":
            return _LocationsTableMock(self._locations)
        raise AssertionError(f"Unexpected table: {name}")


def test_update_location_extended_fields(
    client: TestClient,
    mock_user_id: UUID,
):
    """PATCH with city, working_hours, requires_booking, category -> 200 and returned."""
    trips_store: dict = {}
    locations_store: dict = {}
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    trips_store[trip_id] = _make_trip(trip_id, mock_user_id)
    locations_store[loc_id] = _make_location(loc_id, trip_id)
    mock_sb = _MockSupabaseUpdate(trips_store, locations_store)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{loc_id}",
            json={
                "city": "Milan",
                "working_hours": "8–20",
                "requires_booking": "yes_done",
                "category": "Restaurant",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["city"] == "Milan"
        assert data["working_hours"] == "8–20"
        assert data["requires_booking"] == "yes_done"
        assert data["category"] == "Restaurant"
    finally:
        app.dependency_overrides.clear()


def test_batch_add_locations_with_extended_fields(
    client: TestClient,
    mock_user_id: UUID,
    mock_supabase_trips_and_locations,
):
    """Batch POST with extended fields -> 201 and each item has them."""
    locations_inserted, MockSupabase = mock_supabase_trips_and_locations
    trip_id = str(uuid4())
    mock_sb = MockSupabase({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    try:
        r = client.post(
            f"/api/v1/trips/{trip_id}/locations/batch",
            json=[
                {"name": "A", "category": "Museum"},
                {"name": "B", "city": "Berlin", "requires_booking": "yes"},
            ],
        )
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2
        assert data[0]["category"] == "Museum"
        assert data[1]["city"] == "Berlin"
        assert data[1]["requires_booking"] == "yes"
        assert len(locations_inserted) == 2
        assert locations_inserted[0]["category"] == "Museum"
        assert locations_inserted[1]["city"] == "Berlin"
    finally:
        app.dependency_overrides.clear()
