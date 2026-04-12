"""Phase 0 baseline: DB round-trip count for PATCH .../locations/{location_id}.

Records the CURRENT execute() call count as a snapshot.
Phase 5 will tighten the ceiling to ≤ 3.

Current happy path (update name, no google_place_id change):
  1. rpc:verify_resource_chain
  2. locations SELECT  (existence check)
  3. locations UPDATE
  4. locations SELECT  (re-fetch after update)
  5. place_photos SELECT  (check for cached photo — only when google_place_id present)
  Total: 4 (no gp_id) or 5 (with gp_id) round-trips

Baseline ceiling ≤ 6; Phase 5 will tighten to ≤ 3.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import (
    get_current_user_id,
    get_google_places_client_optional,
)
from backend.app.main import app
from backend.tests.conftest import _ExecuteCounter

# ---------------------------------------------------------------------------
# Minimal mock tables (same shape as test_locations_update.py mocks but
# instrumented with a counter).
# ---------------------------------------------------------------------------


class _TripsTable:
    def __init__(self, store: dict[str, dict]):
        self._store = store
        self._filter_trip_id = None

    def select(self, *args):
        return self

    def eq(self, key, value):
        if key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def execute(self):
        row = self._store.get(self._filter_trip_id)
        return type("Result", (), {"data": [row] if row else []})()


class _LocationsTable:
    def __init__(self, store: dict[str, dict]):
        self._store = store
        self._filter_location_id: str | None = None
        self._filter_trip_id: str | None = None
        self._update_data: dict | None = None

    def select(self, *args):
        return self

    def update(self, data: dict):
        self._update_data = dict(data)
        return self

    def eq(self, key, value):
        if key == "location_id":
            self._filter_location_id = str(value)
        elif key == "trip_id":
            self._filter_trip_id = str(value)
        return self

    def _filtered(self) -> list[dict]:
        rows = list(self._store.values())
        if self._filter_location_id:
            rows = [r for r in rows if r.get("location_id") == self._filter_location_id]
        if self._filter_trip_id:
            rows = [r for r in rows if r.get("trip_id") == self._filter_trip_id]
        return rows

    def execute(self):
        if self._update_data is not None:
            rows = self._filtered()
            if rows:
                rows[0].update(self._update_data)
            self._update_data = None
            return type("Result", (), {"data": rows})()
        return type("Result", (), {"data": self._filtered()})()


class _PlacePhotosTable:
    """Stub that always returns empty (no cached photo)."""

    def select(self, *args):
        return self

    def eq(self, *args):
        return self

    def execute(self):
        return type("Result", (), {"data": []})()


class _InstrumentedMock:
    """
    Minimal Supabase mock for update_location with execute() counting.

    This mirrors MockSupabaseLocations from test_locations_update.py but adds
    an _ExecuteCounter so we can measure round-trips.
    """

    def __init__(
        self,
        trips: dict[str, dict],
        locations: dict[str, dict],
        counter: _ExecuteCounter,
    ):
        self._trips = trips
        self._locations = locations
        self._counter = counter

    def _counted(self, table_obj, table_name: str, op: str = "select"):
        """Wrap table_obj.execute() to record a call."""

        class _Proxy:
            def __init__(proxy_self):
                proxy_self._inner = table_obj
                proxy_self._op = op

            def select(proxy_self, *a):
                proxy_self._op = "select"
                proxy_self._inner = proxy_self._inner.select(*a)
                return proxy_self

            def update(proxy_self, data):
                proxy_self._op = "update"
                proxy_self._inner = proxy_self._inner.update(data)
                return proxy_self

            def eq(proxy_self, *a):
                proxy_self._inner = proxy_self._inner.eq(*a)
                return proxy_self

            def execute(proxy_self):
                self._counter.record(table_name, proxy_self._op)
                return proxy_self._inner.execute()

        return _Proxy()

    def table(self, name: str):
        if name == "trips":
            return self._counted(_TripsTable(self._trips), "trips")
        if name == "locations":
            return self._counted(_LocationsTable(self._locations), "locations")
        if name == "place_photos":
            return self._counted(_PlacePhotosTable(), "place_photos")
        # Any other table (e.g. segment_cache) returns empty
        class _Empty:
            def select(self, *a): return self
            def eq(self, *a): return self
            def execute(self):
                return type("Result", (), {"data": []})()
        return self._counted(_Empty(), name)

    def rpc(self, name: str, params=None):
        params = params or {}

        class _RpcProxy:
            def execute(proxy_self):
                self._counter.record(f"rpc:{name}", "rpc")
                return self._dispatch_rpc(name, params)

        return _RpcProxy()

    def _dispatch_rpc(self, name: str, params: dict):
        if name == "verify_resource_chain":
            tid = str(params.get("p_trip_id", ""))
            uid = str(params.get("p_user_id", ""))
            trip = self._trips.get(tid)
            valid = trip is not None and str(trip.get("user_id")) == uid
            return type("Result", (), {"data": valid})()
        return type("Result", (), {"data": None})()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def _make_trip(trip_id: str, user_id) -> dict:
    return {"trip_id": trip_id, "user_id": str(user_id)}


def _make_location(location_id: str, trip_id: str, **extra) -> dict:
    base = {
        "location_id": location_id,
        "trip_id": trip_id,
        "name": "Old Name",
        "address": "Old Addr",
        "google_link": None,
        "google_place_id": None,
        "google_source_type": None,
        "added_by_email": "user@test.com",
        "added_by_user_id": None,
        "note": None,
        "city": None,
        "working_hours": None,
        "requires_booking": None,
        "category": None,
        "latitude": None,
        "longitude": None,
        "user_image_url": None,
    }
    base.update(extra)
    return base


def test_update_location_round_trip_budget_no_google_place_id(
    client: TestClient,
    mock_user_id,
):
    """
    Phase 0 baseline: PATCH .../locations/{id} updating name only (no google_place_id).

    Expected today: 4 calls — rpc:verify_resource_chain, SELECT, UPDATE, SELECT.
    Baseline ceiling ≤ 6.  Phase 5 will tighten to ≤ 3.
    """
    counter = _ExecuteCounter()
    trip_id = str(uuid4())
    location_id = str(uuid4())

    trips = {trip_id: _make_trip(trip_id, mock_user_id)}
    locations = {location_id: _make_location(location_id, trip_id)}
    mock_sb = _InstrumentedMock(trips, locations, counter)

    async def override_user():
        return mock_user_id

    async def override_places():
        return None  # no Google client

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    app.dependency_overrides[get_google_places_client_optional] = override_places

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        # Phase 5 tightened budget: ownership RPC + update (returns row) = 2 RT
        assert total <= 3, (
            f"update_location (no gp_id) exceeded Phase 5 budget of 3: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 5] update_location (no gp_id) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()


def test_update_location_round_trip_budget_with_google_place_id(
    client: TestClient,
    mock_user_id,
):
    """
    Phase 0 baseline: PATCH .../locations/{id} with a google_place_id present.

    The endpoint queries place_photos after fetching the updated row, adding an
    extra round-trip for photo URL enrichment.

    Expected today: 5 calls — rpc + SELECT + UPDATE + SELECT + place_photos SELECT.
    Baseline ceiling ≤ 6.  Phase 5 will tighten to ≤ 3.
    """
    counter = _ExecuteCounter()
    trip_id = str(uuid4())
    location_id = str(uuid4())

    trips = {trip_id: _make_trip(trip_id, mock_user_id)}
    locations = {
        location_id: _make_location(
            location_id, trip_id, google_place_id="ChIJtest1234"
        )
    }
    mock_sb = _InstrumentedMock(trips, locations, counter)

    async def override_user():
        return mock_user_id

    async def override_places():
        return None  # no Google client; photo enrichment skipped

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb
    app.dependency_overrides[get_google_places_client_optional] = override_places

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/locations/{location_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        # Phase 5 tightened budget: ownership RPC + update (returns row) + place_photos = 3 RT
        assert total <= 3, (
            f"update_location (with gp_id) exceeded Phase 5 budget of 3: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 5] update_location (with gp_id) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()
