"""Pytest fixtures: app, client, auth and Supabase mocks."""

from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from backend.app.main import app

# Shared test user id for mock auth and JWT
TEST_USER_ID = "11111111-2222-3333-4444-555555555555"


def make_test_jwt(sub: str = TEST_USER_ID, secret: str = "test-jwt-secret") -> str:
    """Build a JWT valid for our dependency (sub, exp)."""
    now = datetime.now(UTC)
    payload = {
        "sub": sub,
        "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        "iat": now,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Clear config cache so env changes in tests take effect."""
    from backend.app.core.config import get_settings

    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    """Test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_user_id():
    """UUID for mock authenticated user."""
    return UUID(TEST_USER_ID)


@pytest.fixture
def valid_jwt(monkeypatch):
    """Set SUPABASE_JWT_SECRET and return a JWT signed with it."""
    secret = "test-supabase-jwt-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    yield make_test_jwt(sub=TEST_USER_ID, secret=secret)
    get_settings.cache_clear()


@pytest.fixture
def mock_supabase():
    """Mock Supabase client that records inserts and returns stub trip row."""
    inserted = []

    class MockTable:
        def __init__(self):
            self._last_row = None

        def insert(self, row):
            inserted.append(dict(row))
            self._last_row = row
            return self

        def execute(self):
            trip_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
            name = self._last_row.get("trip_name", "") if self._last_row else ""
            return type("Result", (), {"data": [{"trip_id": trip_id, "trip_name": name}]})()

    class MockSupabase:
        def table(self, name):
            return MockTable()

    return MockSupabase(), inserted


@pytest.fixture
def mock_supabase_with_rls():
    """
    Mock Supabase client that stores trips and enforces RLS-like access:
    select only returns rows where user_id matches the current viewer.
    Used to verify a trip created by user A is not visible to user B.
    """
    trips_store = []  # list of dicts: trip_id, user_id, trip_name, ...

    class MockTableRLS:
        def __init__(self, store, current_user_id):
            self._store = store
            self._current_user_id = current_user_id
            self._insert_row = None
            self._select_trip_id = None

        def insert(self, row):
            self._insert_row = dict(row)
            self._select_trip_id = None
            return self

        def select(self, *args):
            self._insert_row = None
            return self

        def eq(self, key, value):
            if key == "trip_id":
                self._select_trip_id = value
            return self

        def execute(self):
            import uuid

            if self._insert_row is not None:
                trip_id = str(uuid.uuid4())
                row = {
                    "trip_id": trip_id,
                    "user_id": self._insert_row["user_id"],
                    "trip_name": self._insert_row.get("trip_name", ""),
                    "start_date": self._insert_row.get("start_date"),
                    "end_date": self._insert_row.get("end_date"),
                }
                self._store.append(row)
                return type("Result", (), {"data": [row]})()
            if self._select_trip_id is not None:
                filtered = [
                    r
                    for r in self._store
                    if r["trip_id"] == self._select_trip_id
                    and r["user_id"] == self._current_user_id
                ]
                return type("Result", (), {"data": filtered})()
            return type("Result", (), {"data": []})()

    class MockSupabaseRLS:
        def __init__(self, current_user_id: str):
            self._current_user_id = current_user_id

        def table(self, name):
            return MockTableRLS(trips_store, self._current_user_id)

    return trips_store, MockSupabaseRLS


@pytest.fixture
def mock_supabase_trips_and_locations():
    """
    Mock Supabase for add-location: trips select by trip_id (with ownership),
    locations insert. trip_owners = {trip_id: user_id};
    client built with (trip_owners, current_user_id).
    """
    import uuid as _uuid

    locations_inserted = []
    trips_store = []

    class _TripsTable:
        def __init__(self, trip_owners, user_id, store):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._store = store
            self._trip_id = None
            self._user_id_filter = None
            self._is_delete = False

        def select(self, *args):
            self._trip_id = None
            self._user_id_filter = None
            self._is_delete = False
            return self

        def delete(self):
            self._is_delete = True
            self._trip_id = None
            self._user_id_filter = None
            return self

        def eq(self, key, value):
            if key == "trip_id":
                self._trip_id = str(value) if value is not None else None
            elif key == "user_id":
                self._user_id_filter = str(value) if value is not None else None
            return self

        def execute(self):
            if self._is_delete:
                tid = self._trip_id
                if tid is not None:
                    self._store[:] = [t for t in self._store if str(t.get("trip_id")) != tid]
                return type("Result", (), {"data": []})()
            if self._user_id_filter is not None:
                out = [t for t in self._store if t.get("user_id") == self._user_id_filter]
                return type("Result", (), {"data": out})()
            tid = self._trip_id
            if tid is None or tid not in self._trip_owners:
                return type("Result", (), {"data": []})()
            owner_id = self._trip_owners[tid]
            for t in self._store:
                if str(t.get("trip_id")) == tid:
                    return type("Result", (), {"data": [t]})()
            return type(
                "Result",
                (),
                {
                    "data": [
                        {
                            "trip_id": tid,
                            "user_id": owner_id,
                            "trip_name": "Trip",
                            "start_date": None,
                            "end_date": None,
                        }
                    ]
                },
            )()

    class _LocationsTable:
        def __init__(self, store):
            self._store = store
            self._rows = None
            self._select_trip_id = None
            self._is_delete = False
            self._delete_location_id = None
            self._delete_trip_id = None
            self._select_location_id = None

        def select(self, *args):
            self._rows = None
            self._is_delete = False
            self._select_location_id = None
            return self

        def delete(self):
            self._is_delete = True
            self._delete_location_id = None
            self._delete_trip_id = None
            self._select_trip_id = None
            self._rows = None
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if self._is_delete:
                if key == "location_id":
                    self._delete_location_id = val
                elif key == "trip_id":
                    self._delete_trip_id = val
            else:
                if key == "trip_id":
                    self._select_trip_id = val
                elif key == "location_id":
                    self._select_location_id = val
            return self

        def insert(self, row):
            self._select_trip_id = None
            self._is_delete = False
            self._rows = [dict(r) for r in (row if isinstance(row, list) else [row])]
            return self

        def execute(self):
            if self._is_delete:
                lid = self._delete_location_id
                tid = self._delete_trip_id
                if lid is not None:
                    self._store[:] = [
                        loc for loc in self._store if str(loc.get("location_id")) != lid
                    ]
                elif tid is not None:
                    self._store[:] = [loc for loc in self._store if str(loc.get("trip_id")) != tid]
                return type("Result", (), {"data": []})()
            if self._select_trip_id is not None:
                filtered = [
                    loc for loc in self._store if loc.get("trip_id") == self._select_trip_id
                ]
                if self._select_location_id is not None:
                    filtered = [
                        loc
                        for loc in filtered
                        if loc.get("location_id") == self._select_location_id
                    ]
                return type("Result", (), {"data": filtered})()
            if self._rows is None:
                return type("Result", (), {"data": []})()
            out_list = []
            for r in self._rows:
                loc_id = str(_uuid.uuid4())
                out = {
                    "location_id": loc_id,
                    "trip_id": r["trip_id"],
                    "name": r["name"],
                    "address": r.get("address"),
                    "google_link": r.get("google_link"),
                    "note": r.get("note"),
                }
                self._store.append(out)
                out_list.append(out)
            return type("Result", (), {"data": out_list})()

    class MockSupabaseTL2:
        def __init__(self, trip_owners, user_id):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._trips_store = trips_store

        def table(self, name):
            if name == "trips":
                return _TripsTable(self._trip_owners, self._user_id, self._trips_store)
            if name == "locations":
                return _LocationsTable(locations_inserted)
            return None

    return locations_inserted, MockSupabaseTL2
