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
        "aud": "authenticated",
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
        def __init__(self, trip_owners, user_id, store, locs_store=None):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._store = store
            self._locs_store = locs_store
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

        def order(self, *args, **kwargs):
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
                    if self._locs_store is not None:
                        self._locs_store[:] = [
                            loc for loc in self._locs_store if str(loc.get("trip_id")) != tid
                        ]
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
            "google_place_id": r.get("google_place_id"),
            "note": r.get("note"),
            "added_by_user_id": r.get("added_by_user_id"),
            "added_by_email": r.get("added_by_email"),
            "city": r.get("city"),
            "working_hours": r.get("working_hours"),
            "useful_link": r.get("useful_link"),
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
            self._select_google_place_id = None
            self._limit = None

        def select(self, *args):
            self._is_delete = False
            self._select_location_id = None
            self._in_location_ids = None
            self._select_google_place_id = None
            self._limit = None
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
                elif key == "google_place_id":
                    self._select_google_place_id = val
            return self

        def in_(self, key, values):
            if key == "location_id":
                self._in_location_ids = [str(v) for v in values]
            return self

        def limit(self, n):
            self._limit = n
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
                if self._select_google_place_id is not None:
                    filtered = [
                        loc
                        for loc in filtered
                        if loc.get("google_place_id") == self._select_google_place_id
                    ]
                if self._limit is not None:
                    filtered = filtered[: self._limit]
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
                return _TripsTable(
                    self._trip_owners, self._user_id, self._trips_store, locations_inserted
                )
            if name == "locations":
                return _LocationsTable(locations_inserted)
            return None

        def rpc(self, name, params):
            if name == "verify_resource_chain":
                tid = str(params.get("p_trip_id", ""))
                uid = str(params.get("p_user_id", ""))
                valid = tid in self._trip_owners and self._trip_owners[tid] == uid
                return type(
                    "RpcChain", (), {"execute": lambda _: type("R", (), {"data": valid})()}
                )()
            if name == "delete_location_cascade":
                loc_id = str(params.get("p_location_id", ""))
                trip_id = str(params.get("p_trip_id", ""))
                idx = next(
                    (
                        i
                        for i, loc in enumerate(locations_inserted)
                        if str(loc.get("location_id")) == loc_id
                        and str(loc.get("trip_id")) == trip_id
                    ),
                    None,
                )

                def _exec(self_inner=None):
                    if idx is None:
                        from postgrest.exceptions import APIError

                        raise APIError(
                            {
                                "message": "LOCATION_NOT_FOUND",
                                "code": "P0001",
                                "hint": None,
                                "details": None,
                            }
                        )
                    locations_inserted.pop(idx)
                    return type("R", (), {"data": None})()

                return type("RpcChain", (), {"execute": _exec})()
            return type("RpcChain", (), {"execute": lambda _: type("R", (), {"data": None})()})()

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

        def order(self, *args, **kwargs):
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
            self._neq_filters: list[tuple[str, str]] = []
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            self._insert_row = None
            self._update_data = None
            self._is_delete = False

        def select(self, *args):
            self._trip_id = None
            self._day_id = None
            self._neq_filters = []
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
            elif key == "date":
                # Store date filter for execute
                if not hasattr(self, "_date_eq"):
                    self._date_eq = None
                self._date_eq = val
            return self

        def neq(self, key, value):
            self._neq_filters.append((key, str(value) if value is not None else None))
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
                and (
                    not hasattr(self, "_date_eq")
                    or self._date_eq is None
                    or str(d.get("date", "")) == self._date_eq
                )
                and all(str(d.get(k, "")) != v for k, v in self._neq_filters)
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
            # Preserve insert row for insert().select().execute() chain (matches PostgREST).
            preserved_insert = self._insert_row
            self._day_id = None
            self._option_id = None
            self._order_col = None
            self._order_desc = False
            self._limit_n = None
            if preserved_insert is None:
                self._update_data = None
                self._is_delete = False
            self._insert_row = preserved_insert
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
            elif key == "option_id":
                self._option_id = {str(v) for v in values}
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

            def _matches_option_id(row):
                if self._option_id is None:
                    return True
                if isinstance(self._option_id, set):
                    return str(row.get("option_id")) in self._option_id
                return str(row.get("option_id")) == self._option_id

            filtered = [o for o in self._store if _matches_day_id(o) and _matches_option_id(o)]
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
            self._id = None
            self._order_col = None
            self._order_desc = False
            self._insert_row = None
            self._update_data = None
            self._is_delete = False

        def select(self, *args):
            self._option_id = None
            self._location_id = None
            self._id = None
            self._order_col = None
            self._order_desc = False
            self._insert_row = None
            self._update_data = None
            self._is_delete = False
            return self

        def eq(self, key, value):
            val = str(value) if value is not None else None
            if key == "option_id":
                self._option_id = val
            elif key == "location_id":
                self._location_id = val
            elif key == "id":
                self._id = val
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
                    "id": str(_uuid.uuid4()),
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
                    if self._id and str(r.get("id")) != self._id:
                        continue
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
                        (self._id is None or str(r.get("id")) == self._id)
                        and (self._option_id is None or str(r.get("option_id")) == self._option_id)
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
            if self._id is not None:
                filtered = [r for r in filtered if str(r.get("id")) == self._id]
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
                        "day_active_option_id": d.get("active_option_id"),
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
                            "day_active_option_id": d.get("active_option_id"),
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
                            "day_active_option_id": d.get("active_option_id"),
                            "option_id": oid,
                            "option_index": o.get("option_index", 1),
                            "option_starting_city": o.get("starting_city"),
                            "option_ending_city": o.get("ending_city"),
                            "option_created_by": o.get("created_by"),
                            "option_created_at": o.get("created_at"),
                            "ol_id": ol.get("id"),
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
                            "loc_photo_url": loc.get("image_url"),
                            "loc_user_image_url": loc.get("user_image_url"),
                            "loc_attribution_name": loc.get("attribution_name"),
                            "loc_attribution_uri": loc.get("attribution_uri"),
                            "loc_latitude": loc.get("latitude"),
                            "loc_longitude": loc.get("longitude"),
                        }
                    )
        return rows

    class _RpcResult:
        def __init__(self, data):
            self.data = data

    class _EmptyTable:
        """Stub table that always returns empty results for select/in_/order/execute chains."""

        def select(self, *a):
            return self

        def eq(self, *a):
            return self

        def in_(self, *a):
            return self

        def order(self, *a, **kw):
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    # Store for pre-built route RPC rows (shape matches get_itinerary_routes output)
    routes_rpc_store: list[dict] = []

    class MockSupabaseTripsAndDays:
        def __init__(self, trip_owners, user_id):
            self._trip_owners = {str(k): str(v) for k, v in trip_owners.items()}
            self._user_id = str(user_id)
            self._trips_store = trips_store
            self._days_store = trip_days_store
            self._options_store = day_options_store
            self._locations_store = locations_store
            self._option_locations_store = option_locations_store
            self._routes_rpc_store = routes_rpc_store

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
            if name in ("option_routes", "route_stops", "place_photos"):
                return _EmptyTable()
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
            if name == "verify_resource_chain":
                trip_id_str = str(params.get("p_trip_id", ""))
                user_id_str = str(params.get("p_user_id", ""))
                day_id_str = params.get("p_day_id")
                option_id_str = params.get("p_option_id")
                # Check trip ownership
                if (
                    trip_id_str not in self._trip_owners
                    or self._trip_owners[trip_id_str] != user_id_str
                ):
                    return type("RpcChain", (), {"execute": lambda _: _RpcResult(False)})()
                # Check day in trip
                if day_id_str is not None:
                    day_found = any(
                        str(d.get("day_id")) == str(day_id_str)
                        and str(d.get("trip_id")) == trip_id_str
                        for d in self._days_store
                    )
                    if not day_found:
                        return type("RpcChain", (), {"execute": lambda _: _RpcResult(False)})()
                # Check option in day
                if option_id_str is not None and day_id_str is not None:
                    opt_found = any(
                        str(o.get("option_id")) == str(option_id_str)
                        and str(o.get("day_id")) == str(day_id_str)
                        for o in self._options_store
                    )
                    if not opt_found:
                        return type("RpcChain", (), {"execute": lambda _: _RpcResult(False)})()
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(True)})()
            if name == "reorder_option_locations":
                oid = str(params.get("p_option_id", ""))
                ol_ids = [str(x) for x in (params.get("p_ol_ids") or [])]
                for pos, ol_id in enumerate(ol_ids):
                    for r in self._option_locations_store:
                        if str(r.get("option_id")) == oid and str(r.get("id")) == ol_id:
                            r["sort_order"] = pos
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "reorder_day_options":
                did = str(params.get("p_day_id", ""))
                oids = [str(x) for x in (params.get("p_option_ids") or [])]
                for pos, oid in enumerate(oids, start=1):
                    for o in self._options_store:
                        if str(o.get("option_id")) == oid and str(o.get("day_id")) == did:
                            o["option_index"] = pos
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "reorder_trip_days":
                tid = str(params.get("p_trip_id", ""))
                dids = [str(x) for x in (params.get("p_day_ids") or [])]
                for pos, did in enumerate(dids):
                    for d in self._days_store:
                        if str(d.get("day_id")) == did and str(d.get("trip_id")) == tid:
                            d["sort_order"] = pos
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "batch_insert_option_locations":
                oid = str(params.get("p_option_id", ""))
                lids = [str(x) for x in (params.get("p_location_ids") or [])]
                sorts = params.get("p_sort_orders") or []
                periods = params.get("p_time_periods") or []
                inserted = []
                for i, lid in enumerate(lids):
                    row = {
                        "id": str(_uuid.uuid4()),
                        "option_id": oid,
                        "location_id": lid,
                        "sort_order": int(sorts[i]) if i < len(sorts) else 0,
                        "time_period": periods[i] if i < len(periods) else "morning",
                    }
                    self._option_locations_store.append(row)
                    inserted.append(row)
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(inserted)})()
            if name == "get_itinerary_routes":
                option_ids = {str(x) for x in (params.get("p_option_ids") or [])}
                filtered = [
                    r for r in self._routes_rpc_store if str(r.get("option_id")) in option_ids
                ]
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(filtered)})()
            if name == "remove_location_from_option":
                oid = str(params.get("p_option_id", ""))
                ol_id = str(params.get("p_ol_id", ""))
                exists = any(
                    str(r.get("option_id")) == oid and str(r.get("id")) == ol_id
                    for r in self._option_locations_store
                )
                if not exists:
                    raise Exception("OPTION_LOCATION_NOT_FOUND")
                self._option_locations_store[:] = [
                    r
                    for r in self._option_locations_store
                    if not (str(r.get("option_id")) == oid and str(r.get("id")) == ol_id)
                ]
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "update_route_with_stops":
                rid = str(params.get("p_route_id", ""))
                oid = str(params.get("p_option_id", ""))
                route = None
                for r in self._routes_rpc_store:
                    if str(r.get("route_id")) == rid and str(r.get("option_id")) == oid:
                        route = r
                        break
                if route is None:
                    raise Exception("ROUTE_NOT_FOUND")
                tm = params.get("p_transport_mode")
                lb = params.get("p_label")
                ol_ids = params.get("p_option_location_ids")
                if tm is not None:
                    route["transport_mode"] = tm
                if lb is not None:
                    route["label"] = lb
                if ol_ids is not None:
                    route["stop_option_location_ids"] = ol_ids
                    route["duration_seconds"] = None
                    route["distance_meters"] = None
                row = {
                    "route_id": route["route_id"],
                    "option_id": route["option_id"],
                    "label": route.get("label"),
                    "transport_mode": route.get("transport_mode", "walk"),
                    "duration_seconds": route.get("duration_seconds"),
                    "distance_meters": route.get("distance_meters"),
                    "sort_order": route.get("sort_order", 0),
                }
                return type("RpcChain", (), {"execute": lambda _: _RpcResult([row])})()
            if name == "move_option_to_day":
                opt_id = str(params.get("p_option_id", ""))
                src_id = str(params.get("p_source_day_id", ""))
                tgt_id = str(params.get("p_target_day_id", ""))
                moved = next(
                    (o for o in self._options_store if str(o.get("option_id")) == opt_id),
                    None,
                )
                if moved:
                    # Bump target options
                    for o in self._options_store:
                        if str(o.get("day_id")) == tgt_id:
                            o["option_index"] += 1
                    # Move option to target
                    moved["day_id"] = tgt_id
                    moved["option_index"] = 1
                    # Renumber remaining source options
                    remaining = sorted(
                        [
                            o
                            for o in self._options_store
                            if str(o.get("day_id")) == src_id and str(o.get("option_id")) != opt_id
                        ],
                        key=lambda x: x.get("option_index", 0),
                    )
                    if remaining:
                        for i, o in enumerate(remaining, start=1):
                            o["option_index"] = i
                    else:
                        from uuid import uuid4 as _uuid4

                        self._options_store.append(
                            {
                                "option_id": str(_uuid4()),
                                "day_id": src_id,
                                "option_index": 1,
                                "starting_city": None,
                                "ending_city": None,
                                "created_by": None,
                                "created_at": "2025-01-01T12:00:00Z",
                            }
                        )
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "reorder_days_by_date":
                tid = str(params.get("p_trip_id", ""))
                trip_days = [d for d in self._days_store if str(d.get("trip_id")) == tid]
                trip_days.sort(
                    key=lambda x: (
                        x.get("date") is None,
                        x.get("date") or "",
                        x.get("sort_order", 0),
                    )
                )
                for i, d in enumerate(trip_days):
                    d["sort_order"] = i
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "shift_day_dates":
                tid = str(params.get("p_trip_id", ""))
                offset = int(params.get("p_offset_days", 0))
                from datetime import date as _date
                from datetime import timedelta as _td

                for d in self._days_store:
                    if str(d.get("trip_id")) == tid and d.get("date"):
                        old = _date.fromisoformat(d["date"])
                        d["date"] = (old + _td(days=offset)).isoformat()
                # reorder
                trip_days = [d for d in self._days_store if str(d.get("trip_id")) == tid]
                trip_days.sort(
                    key=lambda x: (
                        x.get("date") is None,
                        x.get("date") or "",
                        x.get("sort_order", 0),
                    )
                )
                for i, d in enumerate(trip_days):
                    d["sort_order"] = i
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "reconcile_clear_dates":
                tid = str(params.get("p_trip_id", ""))
                day_ids = {str(x) for x in (params.get("p_day_ids") or [])}
                # Delete empty days (no option_locations)
                to_delete = set()
                for d in self._days_store:
                    if str(d.get("trip_id")) == tid and str(d.get("day_id")) in day_ids:
                        did = str(d["day_id"])
                        has_content = any(
                            str(ol.get("option_id"))
                            in {
                                str(o.get("option_id"))
                                for o in self._options_store
                                if str(o.get("day_id")) == did
                            }
                            for ol in self._option_locations_store
                        )
                        if not has_content:
                            to_delete.add(did)
                self._days_store[:] = [
                    d for d in self._days_store if str(d.get("day_id")) not in to_delete
                ]
                # Clear dates on remaining days from p_day_ids
                for d in self._days_store:
                    if str(d.get("trip_id")) == tid and str(d.get("day_id")) in day_ids:
                        d["date"] = None
                # reorder
                trip_days = [d for d in self._days_store if str(d.get("trip_id")) == tid]
                trip_days.sort(
                    key=lambda x: (
                        x.get("date") is None,
                        x.get("date") or "",
                        x.get("sort_order", 0),
                    )
                )
                for i, d in enumerate(trip_days):
                    d["sort_order"] = i
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "delete_empty_dateless_days":
                tid = str(params.get("p_trip_id", ""))
                to_delete = set()
                for d in self._days_store:
                    if str(d.get("trip_id")) == tid and d.get("date") is None:
                        did = str(d["day_id"])
                        has_content = any(
                            str(ol.get("option_id"))
                            in {
                                str(o.get("option_id"))
                                for o in self._options_store
                                if str(o.get("day_id")) == did
                            }
                            for ol in self._option_locations_store
                        )
                        if not has_content:
                            to_delete.add(did)
                self._days_store[:] = [
                    d for d in self._days_store if str(d.get("day_id")) not in to_delete
                ]
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "delete_days_batch":
                tid = str(params.get("p_trip_id", ""))
                day_ids = {str(x) for x in (params.get("p_day_ids") or [])}
                self._days_store[:] = [
                    d
                    for d in self._days_store
                    if not (str(d.get("trip_id")) == tid and str(d.get("day_id")) in day_ids)
                ]
                # reorder
                trip_days = [d for d in self._days_store if str(d.get("trip_id")) == tid]
                trip_days.sort(
                    key=lambda x: (
                        x.get("date") is None,
                        x.get("date") or "",
                        x.get("sort_order", 0),
                    )
                )
                for i, d in enumerate(trip_days):
                    d["sort_order"] = i
                return type("RpcChain", (), {"execute": lambda _: _RpcResult(None)})()
            if name == "update_day_with_option_check":
                from postgrest.exceptions import APIError

                did = str(params.get("p_day_id", ""))
                tid = str(params.get("p_trip_id", ""))
                # Find the day
                day = next(
                    (
                        d
                        for d in self._days_store
                        if str(d.get("day_id")) == did and str(d.get("trip_id")) == tid
                    ),
                    None,
                )
                if day is None:

                    def _raise_day_not_found():
                        raise APIError(
                            {
                                "message": "DAY_NOT_FOUND",
                                "code": "P0002",
                                "hint": None,
                                "details": None,
                            }
                        )

                    return type("RpcChain", (), {"execute": lambda _: _raise_day_not_found()})()
                # Validate active_option_id if p_set_active_option and value is not None
                has_active = params.get("p_set_active_option")
                has_aoid = params.get("p_active_option_id") is not None
                if has_active and has_aoid:
                    aoid = str(params["p_active_option_id"])
                    valid = any(
                        str(o.get("option_id")) == aoid and str(o.get("day_id")) == did
                        for o in self._options_store
                    )
                    if not valid:

                        def _raise_invalid_option():
                            raise APIError(
                                {
                                    "message": "INVALID_ACTIVE_OPTION_ID",
                                    "code": "P0002",
                                    "hint": None,
                                    "details": None,
                                }
                            )

                        chain = {"execute": lambda _: _raise_invalid_option()}
                        return type("RpcChain", (), chain)()
                # Apply updates
                if params.get("p_set_date"):
                    day["date"] = params.get("p_date")
                if params.get("p_set_sort_order"):
                    day["sort_order"] = params.get("p_sort_order")
                if params.get("p_set_active_option"):
                    aoid_val = params.get("p_active_option_id")
                    day["active_option_id"] = str(aoid_val) if aoid_val else None
                updated_day = dict(day)
                return type("RpcChain", (), {"execute": lambda _: _RpcResult([updated_day])})()
            if name == "update_option_with_conflict_check":
                from postgrest.exceptions import APIError

                oid = str(params.get("p_option_id", ""))
                did = str(params.get("p_day_id", ""))
                # Find the option
                option = next(
                    (
                        o
                        for o in self._options_store
                        if str(o.get("option_id")) == oid and str(o.get("day_id")) == did
                    ),
                    None,
                )
                if option is None:

                    def _raise_option_not_found():
                        raise APIError(
                            {
                                "message": "OPTION_NOT_FOUND",
                                "code": "P0002",
                                "hint": None,
                                "details": None,
                            }
                        )

                    return type("RpcChain", (), {"execute": lambda _: _raise_option_not_found()})()
                # Check option_index conflict
                if params.get("p_set_option_index") and params.get("p_option_index") is not None:
                    new_idx = int(params["p_option_index"])
                    conflict = any(
                        str(o.get("option_id")) != oid
                        and str(o.get("day_id")) == did
                        and int(o.get("option_index", -1)) == new_idx
                        for o in self._options_store
                    )
                    if conflict:

                        def _raise_conflict():
                            raise APIError(
                                {
                                    "message": "OPTION_INDEX_CONFLICT",
                                    "code": "P0001",
                                    "hint": None,
                                    "details": None,
                                }
                            )

                        return type("RpcChain", (), {"execute": lambda _: _raise_conflict()})()
                    option["option_index"] = new_idx
                if params.get("p_set_starting_city"):
                    option["starting_city"] = params.get("p_starting_city")
                if params.get("p_set_ending_city"):
                    option["ending_city"] = params.get("p_ending_city")
                if params.get("p_set_created_by"):
                    option["created_by"] = params.get("p_created_by")
                updated_option = dict(option)
                return type("RpcChain", (), {"execute": lambda _: _RpcResult([updated_option])})()
            return type("RpcChain", (), {"execute": lambda _: _RpcResult([])})()

    return trip_days_store, trips_store, MockSupabaseTripsAndDays


# ---------------------------------------------------------------------------
# Execute-call counter — opt-in, used by round-trip budget tests.
# ---------------------------------------------------------------------------


class _ExecuteCounter:
    """Wraps any .execute() call on a Supabase mock and counts by (table, op)."""

    def __init__(self):
        # calls[table_or_rpc][op] -> int
        self.calls: dict[str, dict[str, int]] = {}
        self._total = 0

    def record(self, table: str, op: str) -> None:
        self.calls.setdefault(table, {}).setdefault(op, 0)
        self.calls[table][op] += 1
        self._total += 1

    @property
    def total_calls(self) -> int:
        return self._total

    def reset(self) -> None:
        self.calls.clear()
        self._total = 0


def _wrap_execute(obj, counter: _ExecuteCounter, table: str, op: str):
    """Return a callable whose .execute() records a call and delegates."""
    original_execute = getattr(obj, "execute", None)

    class _Counted:
        def execute(self_inner):
            counter.record(table, op)
            if original_execute is not None:
                return original_execute()
            return type("Result", (), {"data": []})()

        # Forward every other attribute so chains still work
        def __getattr__(self_inner, name):
            return getattr(obj, name)

    return _Counted()


class _CountingTableProxy:
    """
    Thin proxy that intercepts the terminal .execute() call on a query builder
    returned by supabase.table(name), records it, then delegates.
    """

    def __init__(self, inner, counter: _ExecuteCounter, table: str):
        self._inner = inner
        self._counter = counter
        self._table = table
        self._op = "select"  # default; overridden by insert/update/delete/upsert

    def _delegate(self, op, *a, **kw):
        self._op = op
        fn = getattr(self._inner, op, None)
        if fn:
            self._inner = fn(*a, **kw)
        return self

    def select(self, *a, **kw):
        return self._delegate("select", *a, **kw)

    def insert(self, *a, **kw):
        return self._delegate("insert", *a, **kw)

    def update(self, *a, **kw):
        return self._delegate("update", *a, **kw)

    def delete(self, *a, **kw):
        return self._delegate("delete", *a, **kw)

    def upsert(self, *a, **kw):
        return self._delegate("upsert", *a, **kw)

    def eq(self, *a, **kw):
        self._inner = self._inner.eq(*a, **kw) if hasattr(self._inner, "eq") else self._inner
        return self

    def neq(self, *a, **kw):
        self._inner = self._inner.neq(*a, **kw) if hasattr(self._inner, "neq") else self._inner
        return self

    def in_(self, *a, **kw):
        self._inner = self._inner.in_(*a, **kw) if hasattr(self._inner, "in_") else self._inner
        return self

    def order(self, *a, **kw):
        self._inner = self._inner.order(*a, **kw) if hasattr(self._inner, "order") else self._inner
        return self

    def limit(self, *a, **kw):
        self._inner = self._inner.limit(*a, **kw) if hasattr(self._inner, "limit") else self._inner
        return self

    def execute(self):
        self._counter.record(self._table, self._op)
        if hasattr(self._inner, "execute"):
            return self._inner.execute()
        return type("Result", (), {"data": []})()


class _CountingRpcProxy:
    """Wraps supabase.rpc(name, params) and records the execute() call."""

    def __init__(self, inner, counter: _ExecuteCounter, name: str):
        self._inner = inner
        self._counter = counter
        self._name = name

    def execute(self):
        self._counter.record(f"rpc:{self._name}", "rpc")
        if hasattr(self._inner, "execute"):
            return self._inner.execute()
        return type("Result", (), {"data": []})()


class CountingSupabaseMock:
    """
    Wraps an existing MockSupabase instance (from mock_supabase_trips_and_days
    or similar) and intercepts every .execute() to count calls.

    Usage
    -----
    counter = _ExecuteCounter()
    counting_mock = CountingSupabaseMock(real_mock, counter)
    app.dependency_overrides[get_supabase_client] = lambda: counting_mock
    # ... make request ...
    assert counter.total_calls <= N
    """

    def __init__(self, inner, counter: _ExecuteCounter):
        self._inner = inner
        self._counter = counter

    def table(self, name: str):
        inner_table = self._inner.table(name)
        return _CountingTableProxy(inner_table, self._counter, name)

    def rpc(self, name: str, params=None):
        inner_rpc = self._inner.rpc(name, params or {})
        return _CountingRpcProxy(inner_rpc, self._counter, name)

    # Forward storage/auth attributes (for fixtures that set self.auth etc.)
    def __getattr__(self, item):
        return getattr(self._inner, item)


@pytest.fixture
def mock_supabase_counting(mock_supabase_trips_and_days):
    """
    Returns (days_store, trips_store, MockSupabaseFactory, counter).

    The factory now produces CountingSupabaseMock instances that transparently
    wrap MockSupabaseTripsAndDays but count every .execute() call.

    Example
    -------
    days_store, trips_store, MockFactory, counter = mock_supabase_counting
    mock_sb = MockFactory({trip_id: user_id}, user_id)
    # inject mock_sb, make request, then:
    assert counter.total_calls <= 10
    assert counter.calls["trip_days"]["select"] == 2
    """
    days_store, trips_store, MockSupabaseTripsAndDays = mock_supabase_trips_and_days
    counter = _ExecuteCounter()

    def _counting_factory(trip_owners, user_id):
        inner = MockSupabaseTripsAndDays(trip_owners, user_id)
        return CountingSupabaseMock(inner, counter)

    return days_store, trips_store, _counting_factory, counter


# ---------------------------------------------------------------------------
# Rate limiting — disable globally so existing tests are unaffected.
# The try/except guard allows this fixture to run even before the
# rate_limit module is created (Red phase).
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _disable_rate_limits():
    """Disable slowapi rate limiting for the duration of every test."""
    try:
        from backend.app.core.rate_limit import limiter
    except ImportError:
        yield
        return
    limiter.enabled = False
    try:
        yield
    finally:
        limiter.enabled = True
