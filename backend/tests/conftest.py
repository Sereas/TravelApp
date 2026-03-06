"""Pytest fixtures: app, client, auth and Supabase mocks."""

from datetime import UTC, datetime
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient

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
            if isinstance(row, list):
                # Support bulk insert: used by generate_days endpoint.
                self._insert_row = [dict(r) for r in row]
            else:
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

    def _location_row(loc_id: str, r: dict):
        """Build a full location row (with extended fields) for select/return."""
        return {
            "location_id": loc_id,
            "trip_id": r.get("trip_id"),
            "name": r.get("name", ""),
            "address": r.get("address"),
            "google_link": r.get("google_link"),
            "note": r.get("note"),
            "added_by_user_id": r.get("added_by_user_id"),
            "city": r.get("city"),
            "working_hours": r.get("working_hours"),
            "requires_booking": r.get("requires_booking"),
            "category": r.get("category"),
        }

    class _InsertBuilder:
        """Mimics Supabase insert(): has execute() but NO select().

        Real client is SyncQueryRequestBuilder.
        """

        def __init__(self, store, rows):
            self._store = store
            self._rows = [dict(r) for r in (rows if isinstance(rows, list) else [rows])]

        def execute(self):
            out_list = []
            for r in self._rows:
                loc_id = str(_uuid.uuid4())
                out = _location_row(loc_id, r)
                self._store.append(out)
                out_list.append(out)
            return type("Result", (), {"data": out_list})()

    class _UpdateBuilder:
        """Mimics Supabase update(): has eq(), execute() but NO select().

        Real client is SyncFilterRequestBuilder.
        """

        def __init__(self, store, update_data):
            self._store = store
            self._update_data = dict(update_data)
            self._filter_location_id = None
            self._filter_trip_id = None

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "location_id":
                self._filter_location_id = val
            elif key == "trip_id":
                self._filter_trip_id = val
            return self

        def execute(self):
            filtered = [
                loc
                for loc in self._store
                if (
                    not self._filter_location_id
                    or loc.get("location_id") == self._filter_location_id
                )
                and (not self._filter_trip_id or loc.get("trip_id") == self._filter_trip_id)
            ]
            if not filtered:
                return type("Result", (), {"data": []})()
            for row in filtered:
                row.update(self._update_data)
            return type("Result", (), {"data": filtered})()

    class _LocationsTable:
        def __init__(self, store):
            self._store = store
            self._select_trip_id = None
            self._is_delete = False
            self._delete_location_id = None
            self._delete_trip_id = None
            self._select_location_id = None
            self._in_location_ids = None

        def select(self, *args):
            self._is_delete = False
            self._select_location_id = None
            self._in_location_ids = None
            return self

        def delete(self):
            self._is_delete = True
            self._delete_location_id = None
            self._delete_trip_id = None
            self._select_trip_id = None
            self._in_location_ids = None
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

        def in_(self, key, values):
            if key == "location_id":
                self._in_location_ids = [str(v) for v in values]
            return self

        def insert(self, row):
            return _InsertBuilder(self._store, row)

        def update(self, data):
            return _UpdateBuilder(self._store, data)

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
                if self._in_location_ids is not None:
                    filtered = [
                        loc for loc in filtered if loc.get("location_id") in self._in_location_ids
                    ]
                return type("Result", (), {"data": filtered})()
            return type("Result", (), {"data": []})()

    class _MockAuthAdmin:
        """Mimics supabase.auth.admin for email resolution."""

        def __init__(self, user_emails):
            self._emails = {str(k): v for k, v in user_emails.items()}

        def get_user_by_id(self, uid):
            email = self._emails.get(str(uid))
            if email is None:
                return None
            user = type("User", (), {"email": email})()
            return type("Response", (), {"user": user})()

    class _MockAuth:
        def __init__(self, user_emails):
            self.admin = _MockAuthAdmin(user_emails)

    class MockSupabaseTL2:
        def __init__(self, trip_owners, user_id, *, user_emails=None):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._trips_store = trips_store
            self.auth = _MockAuth(user_emails or {})

        def table(self, name):
            if name == "trips":
                return _TripsTable(self._trip_owners, self._user_id, self._trips_store)
            if name == "locations":
                return _LocationsTable(locations_inserted)
            return None

    return locations_inserted, MockSupabaseTL2


@pytest.fixture
def mock_supabase_trips_and_days():
    """
    Mock Supabase for itinerary days: trips (ownership) + trip_days CRUD.
    trip_owners = {trip_id: user_id}; MockSupabase(trip_owners, current_user_id).
    """
    import uuid as _uuid

    trips_store = []
    trip_days_store = []

    class _TripsTableForDays:
        def __init__(self, trip_owners, user_id, store):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._store = store
            self._trip_id = None
            self._user_id_filter = None

        def select(self, *args):
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

    class _TripDaysTable:
        def __init__(self, store):
            self._store = store
            self._trip_id = None
            self._day_id = None
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            self._insert_row = None
            self._update_data = None
            self._is_delete = False

        def select(self, *args):
            self._trip_id = None
            self._day_id = None
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            self._insert_row = None
            self._update_data = None
            self._is_delete = False
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "trip_id":
                self._trip_id = val
            elif key == "day_id":
                self._day_id = val
            return self

        def order(self, column, desc=False):
            self._order_col = column
            self._order_desc = bool(desc)
            return self

        def limit(self, n):
            self._limit_n = int(n)
            return self

        def insert(self, row):
            # Support both single-row and bulk inserts (list of rows),
            # matching the pattern used by other mocks.
            if isinstance(row, list):
                self._insert_row = [dict(r) for r in row]
            else:
                self._insert_row = dict(row)
            self._update_data = None
            self._is_delete = False
            return self

        def update(self, data):
            self._update_data = dict(data)
            self._insert_row = None
            self._is_delete = False
            return self

        def delete(self):
            self._is_delete = True
            self._insert_row = None
            self._update_data = None
            return self

        def execute(self):
            if self._insert_row is not None:
                rows = (
                    self._insert_row if isinstance(self._insert_row, list) else [self._insert_row]
                )
                out = []
                for base in rows:
                    day_id = str(_uuid.uuid4())
                    row = {
                        "day_id": day_id,
                        "trip_id": base.get("trip_id"),
                        "date": base.get("date"),
                        "sort_order": int(base.get("sort_order", 0)),
                        "created_at": "2025-01-01T12:00:00Z",
                    }
                    self._store.append(row)
                    out.append(row)
                return type("Result", (), {"data": out})()
            if self._update_data is not None:
                for r in self._store:
                    if (not self._day_id or str(r.get("day_id")) == self._day_id) and (
                        not self._trip_id or str(r.get("trip_id")) == self._trip_id
                    ):
                        r.update(self._update_data)
                        return type("Result", (), {"data": [r]})()
                return type("Result", (), {"data": []})()
            if self._is_delete:
                if self._day_id and self._trip_id:
                    self._store[:] = [
                        d
                        for d in self._store
                        if not (
                            str(d.get("day_id")) == self._day_id
                            and str(d.get("trip_id")) == self._trip_id
                        )
                    ]
                return type("Result", (), {"data": []})()
            # select
            filtered = [
                d
                for d in self._store
                if (not self._trip_id or str(d.get("trip_id")) == self._trip_id)
                and (not self._day_id or str(d.get("day_id")) == self._day_id)
            ]
            if self._order_col:
                filtered = sorted(
                    filtered,
                    key=lambda x: (x.get(self._order_col) is not None, x.get(self._order_col)),
                    reverse=self._order_desc,
                )
            if self._limit_n is not None:
                filtered = filtered[: self._limit_n]
            return type("Result", (), {"data": filtered})()

    class _DayOptionsTable:
        def __init__(self, store):
            self._store = store
            self._day_id = None
            self._option_id = None
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            self._insert_row = None
            self._update_data = None
            self._is_delete = False

        def select(self, *args):
            self._day_id = None
            self._option_id = None
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            self._insert_row = None
            self._update_data = None
            self._is_delete = False
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "day_id":
                self._day_id = val
            elif key == "option_id":
                self._option_id = val
            return self

        def in_(self, key, values):
            if key == "day_id":
                # Store as a set of ids to filter against in execute()
                self._day_id = {str(v) for v in values}
            return self

        def order(self, column, desc=False):
            self._order_col = column
            self._order_desc = bool(desc)
            return self

        def limit(self, n):
            self._limit_n = int(n)
            return self

        def insert(self, row):
            self._insert_row = dict(row)
            self._update_data = None
            self._is_delete = False
            return self

        def update(self, data):
            self._update_data = dict(data)
            self._insert_row = None
            self._is_delete = False
            return self

        def delete(self):
            self._is_delete = True
            self._insert_row = None
            self._update_data = None
            return self

        def execute(self):
            if self._insert_row is not None:
                option_id = str(_uuid.uuid4())
                row = {
                    "option_id": option_id,
                    "day_id": self._insert_row.get("day_id"),
                    "option_index": int(self._insert_row.get("option_index", 1)),
                    "starting_city": self._insert_row.get("starting_city"),
                    "ending_city": self._insert_row.get("ending_city"),
                    "created_by": self._insert_row.get("created_by"),
                    "created_at": "2025-01-01T12:00:00Z",
                }
                self._store.append(row)
                return type("Result", (), {"data": [row]})()
            if self._update_data is not None:
                for r in self._store:
                    if (not self._option_id or str(r.get("option_id")) == self._option_id) and (
                        not self._day_id or str(r.get("day_id")) == self._day_id
                    ):
                        r.update(self._update_data)
                        return type("Result", (), {"data": [r]})()
                return type("Result", (), {"data": []})()
            if self._is_delete:
                if self._option_id and self._day_id:
                    self._store[:] = [
                        o
                        for o in self._store
                        if not (
                            str(o.get("option_id")) == self._option_id
                            and str(o.get("day_id")) == self._day_id
                        )
                    ]
                return type("Result", (), {"data": []})()

            def _matches_day_id(row):
                if self._day_id is None:
                    return True
                if isinstance(self._day_id, set):
                    return str(row.get("day_id")) in self._day_id
                return str(row.get("day_id")) == self._day_id

            filtered = [
                o
                for o in self._store
                if _matches_day_id(o)
                and (not self._option_id or str(o.get("option_id")) == self._option_id)
            ]
            if self._order_col:
                filtered = sorted(
                    filtered,
                    key=lambda x: (x.get(self._order_col) is not None, x.get(self._order_col)),
                    reverse=self._order_desc,
                )
            if self._limit_n is not None:
                filtered = filtered[: self._limit_n]
            return type("Result", (), {"data": filtered})()

    day_options_store = []
    locations_store = []
    option_locations_store = []

    class _LocationsTableForItinerary:
        def __init__(self, store):
            self._store = store
            self._location_id = None
            self._trip_id = None

        def select(self, *args):
            self._location_id = None
            self._trip_id = None
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "location_id":
                self._location_id = val
            elif key == "trip_id":
                self._trip_id = val
            return self

        def in_(self, key, values):
            if key == "location_id":
                self._location_id = {str(v) for v in values}
            return self

        def execute(self):
            filtered = self._store
            if self._location_id is not None:
                if isinstance(self._location_id, set):
                    filtered = [
                        loc for loc in filtered if str(loc.get("location_id")) in self._location_id
                    ]
                else:
                    filtered = [
                        loc for loc in filtered if str(loc.get("location_id")) == self._location_id
                    ]
            if self._trip_id is not None:
                filtered = [loc for loc in filtered if str(loc.get("trip_id")) == self._trip_id]
            return type("Result", (), {"data": filtered})()

    class _OptionLocationsTable:
        def __init__(self, store):
            self._store = store
            self._option_id = None
            self._location_id = None
            self._order_col = None
            self._order_desc = False
            self._insert_row = None
            self._update_data = None
            self._is_delete = False

        def select(self, *args):
            self._option_id = None
            self._location_id = None
            self._order_col = None
            self._order_desc = False
            self._insert_row = None
            self._update_data = None
            self._is_delete = False
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "option_id":
                if self._is_delete:
                    self._option_id = val
                else:
                    self._option_id = val
            elif key == "location_id":
                if self._is_delete:
                    self._location_id = val
                else:
                    self._location_id = val
            return self

        def in_(self, key, values):
            if key == "option_id":
                # store as set of ids for filtering later
                self._option_id = {str(v) for v in values}
            return self

        def order(self, column, desc=False):
            self._order_col = column
            self._order_desc = bool(desc)
            return self

        def insert(self, row):
            self._insert_row = dict(row)
            self._update_data = None
            self._is_delete = False
            return self

        def update(self, data):
            self._update_data = dict(data)
            self._insert_row = None
            self._is_delete = False
            return self

        def delete(self):
            self._is_delete = True
            self._insert_row = None
            self._update_data = None
            return self

        def execute(self):
            if self._insert_row is not None:
                row = {
                    "option_id": self._insert_row.get("option_id"),
                    "location_id": self._insert_row.get("location_id"),
                    "sort_order": int(self._insert_row.get("sort_order", 0)),
                    "time_period": self._insert_row.get("time_period"),
                    "trip_id": self._insert_row.get("trip_id"),
                }
                self._store.append(row)
                return type("Result", (), {"data": [row]})()
            if self._update_data is not None:
                updated = []
                for r in self._store:
                    if self._option_id and str(r.get("option_id")) != self._option_id:
                        continue
                    if self._location_id and str(r.get("location_id")) != self._location_id:
                        continue
                    r.update(self._update_data)
                    updated.append(r)
                return type("Result", (), {"data": updated})()
            if self._is_delete:
                before = len(self._store)
                self._store[:] = [
                    r
                    for r in self._store
                    if not (
                        (self._option_id is None or str(r.get("option_id")) == self._option_id)
                        and (
                            self._location_id is None
                            or str(r.get("location_id")) == self._location_id
                        )
                    )
                ]
                deleted = before - len(self._store)
                return type("Result", (), {"data": [] if deleted == 0 else [{}]})()
            filtered = self._store

            def _matches_option_id(row):
                if self._option_id is None:
                    return True
                if isinstance(self._option_id, set):
                    return str(row.get("option_id")) in self._option_id
                return str(row.get("option_id")) == self._option_id

            filtered = [r for r in filtered if _matches_option_id(r)]
            if self._location_id is not None:
                filtered = [r for r in filtered if str(r.get("location_id")) == self._location_id]
            if self._order_col:
                filtered = sorted(
                    filtered,
                    key=lambda x: (x.get(self._order_col) is not None, x.get(self._order_col)),
                    reverse=self._order_desc,
                )
            return type("Result", (), {"data": filtered})()

    def _build_rpc_itinerary_rows(trip_id_str, days_store, options_store, ol_store, loc_store):
        """Build flat rows in get_itinerary_tree RPC shape for the mock."""
        days = sorted(
            [d for d in days_store if str(d.get("trip_id")) == trip_id_str],
            key=lambda x: (x.get("sort_order") is None, x.get("sort_order")),
        )
        loc_by_id = {
            str(loc["location_id"]): loc
            for loc in loc_store
            if str(loc.get("trip_id")) == trip_id_str
        }
        rows = []
        for d in days:
            day_id = d.get("day_id")
            opts = sorted(
                [o for o in options_store if str(o.get("day_id")) == str(day_id)],
                key=lambda x: (x.get("option_index") is None, x.get("option_index")),
            )
            if not opts:
                rows.append(
                    {
                        "day_id": day_id,
                        "day_date": d.get("date"),
                        "day_sort_order": d.get("sort_order", 0),
                        "day_created_at": d.get("created_at"),
                        "option_id": None,
                        "option_index": None,
                        "option_starting_city": None,
                        "option_ending_city": None,
                        "option_created_by": None,
                        "option_created_at": None,
                        "location_id": None,
                        "ol_sort_order": None,
                        "time_period": None,
                        "loc_name": None,
                        "loc_city": None,
                        "loc_address": None,
                        "loc_google_link": None,
                        "loc_category": None,
                        "loc_note": None,
                        "loc_working_hours": None,
                        "loc_requires_booking": None,
                    }
                )
                continue
            for o in opts:
                oid = o.get("option_id")
                ols = sorted(
                    [ol for ol in ol_store if str(ol.get("option_id")) == str(oid)],
                    key=lambda x: (x.get("sort_order") is None, x.get("sort_order")),
                )
                if not ols:
                    rows.append(
                        {
                            "day_id": day_id,
                            "day_date": d.get("date"),
                            "day_sort_order": d.get("sort_order", 0),
                            "day_created_at": d.get("created_at"),
                            "option_id": oid,
                            "option_index": o.get("option_index", 1),
                            "option_starting_city": o.get("starting_city"),
                            "option_ending_city": o.get("ending_city"),
                            "option_created_by": o.get("created_by"),
                            "option_created_at": o.get("created_at"),
                            "location_id": None,
                            "ol_sort_order": None,
                            "time_period": None,
                            "loc_name": None,
                            "loc_city": None,
                            "loc_address": None,
                            "loc_google_link": None,
                            "loc_category": None,
                            "loc_note": None,
                            "loc_working_hours": None,
                            "loc_requires_booking": None,
                        }
                    )
                    continue
                for ol in ols:
                    lid = ol.get("location_id")
                    loc = loc_by_id.get(str(lid), {}) if lid else {}
                    rows.append(
                        {
                            "day_id": day_id,
                            "day_date": d.get("date"),
                            "day_sort_order": d.get("sort_order", 0),
                            "day_created_at": d.get("created_at"),
                            "option_id": oid,
                            "option_index": o.get("option_index", 1),
                            "option_starting_city": o.get("starting_city"),
                            "option_ending_city": o.get("ending_city"),
                            "option_created_by": o.get("created_by"),
                            "option_created_at": o.get("created_at"),
                            "location_id": lid,
                            "ol_sort_order": ol.get("sort_order", 0),
                            "time_period": ol.get("time_period") or "",
                            "loc_name": loc.get("name"),
                            "loc_city": loc.get("city"),
                            "loc_address": loc.get("address"),
                            "loc_google_link": loc.get("google_link"),
                            "loc_category": loc.get("category"),
                            "loc_note": loc.get("note"),
                            "loc_working_hours": loc.get("working_hours"),
                            "loc_requires_booking": loc.get("requires_booking"),
                        }
                    )
        return rows

    class _RpcResult:
        def __init__(self, data):
            self.data = data

    class MockSupabaseTripsAndDays:
        def __init__(self, trip_owners, user_id):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._trips_store = trips_store
            self._days_store = trip_days_store
            self._options_store = day_options_store
            self._locations_store = locations_store
            self._option_locations_store = option_locations_store

        def table(self, name):
            if name == "trips":
                return _TripsTableForDays(self._trip_owners, self._user_id, self._trips_store)
            if name == "trip_days":
                return _TripDaysTable(self._days_store)
            if name == "day_options":
                return _DayOptionsTable(self._options_store)
            if name == "locations":
                return _LocationsTableForItinerary(self._locations_store)
            if name == "option_locations":
                return _OptionLocationsTable(self._option_locations_store)
            return None

        def rpc(self, name, params):
            if name == "get_itinerary_tree":
                trip_id_str = str(params.get("p_trip_id", ""))
                data = _build_rpc_itinerary_rows(
                    trip_id_str,
                    self._days_store,
                    self._options_store,
                    self._option_locations_store,
                    self._locations_store,
                )
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(data)})()
            return type("RpcChain", (), {"execute": lambda _: _RpcResult([])})()

    return trip_days_store, trips_store, MockSupabaseTripsAndDays
