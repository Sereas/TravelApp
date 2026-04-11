"""Phase 0 baseline: DB round-trip count for POST .../routes (create route).

This test captures the CURRENT execute() call count as a snapshot so that
Phase 4 can assert the improvement.  The baseline assertion is deliberately
loose (≤ 10) — Phase 4 will tighten it to ≤ 2 once route-create is decoupled
from segment computation.

The happy path today is:
  1. rpc:verify_resource_chain   (ownership check)
  2. rpc:create_route_with_stops (atomic RPC)

Total: 2 round-trips (already optimal for the create-only path).
If the count ever grows beyond 10 something has regressed significantly.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_routes_client
from backend.app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_trip_day_option(days_store, trips_store, user_id):
    """Insert one trip + day into the mock stores.  Returns (trip_id, day_id, option_id placeholder)."""
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())

    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(user_id),
            "trip_name": "Budget Test Trip",
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
            "active_option_id": None,
        }
    )
    return trip_id, day_id, option_id


# ---------------------------------------------------------------------------
# The route mock needs a create_route_with_stops RPC that the counting
# MockSupabaseTripsAndDays fixture doesn't include by default.
# We extend it here with a minimal shim that returns a valid row.
# ---------------------------------------------------------------------------


class _RouteRpcMixin:
    """Mix-in that adds create_route_with_stops RPC support to a counting mock."""

    def __init__(self, inner, counter):
        self._inner = inner
        self._counter = counter
        self._routes: list[dict] = []

    def table(self, name):
        return self._inner.table(name)

    def rpc(self, name: str, params=None):
        params = params or {}
        if name == "create_route_with_stops":
            # Count it as an RPC call and return a stub route row
            from backend.tests.conftest import _CountingRpcProxy

            route_id = str(uuid4())
            row = {
                "route_id": route_id,
                "option_id": params.get("p_option_id", ""),
                "label": params.get("p_label"),
                "transport_mode": params.get("p_transport_mode", "walk"),
                "duration_seconds": None,
                "distance_meters": None,
                "sort_order": 0,
                "option_location_ids": params.get("p_option_location_ids") or [],
            }
            self._routes.append(row)

            class _StubRpc:
                def execute(inner_self):
                    self._counter.record(f"rpc:{name}", "rpc")
                    return type("Result", (), {"data": row})()

            return _StubRpc()

        return self._inner.rpc(name, params)

    def __getattr__(self, item):
        return getattr(self._inner, item)


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


def test_route_create_round_trip_budget(
    client: TestClient,
    mock_user_id,
    mock_supabase_counting,
):
    """
    Phase 0 baseline: POST .../routes counts DB round-trips.

    Current happy path:
      1. rpc:verify_resource_chain
      2. rpc:create_route_with_stops

    Baseline ceiling is ≤ 10.  Phase 4 will tighten to ≤ 2 once the create
    endpoint is fully decoupled from any segment computation path.
    """
    days_store, trips_store, MockFactory, counter = mock_supabase_counting

    trip_id, day_id, option_id = _seed_trip_day_option(days_store, trips_store, mock_user_id)

    # Build mock through factory, then inject option + option_locations
    inner_mock = MockFactory({trip_id: str(mock_user_id)}, mock_user_id)
    # Reach into the inner CountingSupabaseMock to get the real MockSupabaseTripsAndDays
    real_inner = inner_mock._inner
    real_inner._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": 1,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )

    # CreateRouteBody requires min_length=2 for option_location_ids; seed two stubs
    ol_id_1 = str(uuid4())
    ol_id_2 = str(uuid4())
    loc_id_1 = str(uuid4())
    loc_id_2 = str(uuid4())
    real_inner._option_locations_store.append(
        {"id": ol_id_1, "option_id": option_id, "location_id": loc_id_1, "sort_order": 0}
    )
    real_inner._option_locations_store.append(
        {"id": ol_id_2, "option_id": option_id, "location_id": loc_id_2, "sort_order": 1}
    )

    # Wrap with our RPC mixin to handle create_route_with_stops
    extended_mock = _RouteRpcMixin(inner_mock, counter)

    async def override_user():
        return mock_user_id

    async def override_routes_client():
        return None  # no Google client needed for route creation

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: extended_mock
    app.dependency_overrides[get_google_routes_client] = override_routes_client

    try:
        counter.reset()
        response = client.post(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes",
            json={
                "transport_mode": "walk",
                "label": "Route A",
                "option_location_ids": [ol_id_1, ol_id_2],
            },
        )
        assert response.status_code == 201, f"Unexpected status: {response.status_code} {response.text}"

        total = counter.total_calls
        # Phase 0 baseline — Phase 4 will tighten to ≤ 2
        assert total <= 10, (
            f"Baseline route create round-trips exceeded ceiling: {total}\n"
            f"Call breakdown: {counter.calls}"
        )
        # Record current baseline for future reference
        print(f"\n[Phase 0 baseline] route_create total execute() calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()
