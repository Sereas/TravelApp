"""Phase 0 baseline: DB round-trip count for PATCH .../options/{option_id}.

Records the CURRENT execute() call count as a snapshot.
Phase 5 will tighten these to ≤ 2.

Current happy path (update starting_city, no option_index conflict check):
  1. rpc:verify_resource_chain
  2. day_options SELECT  (existence check)
  3. day_options UPDATE
  4. day_options SELECT  (re-fetch after update)
  Total: 4 round-trips

With option_index update (triggers conflict check):
  1. rpc:verify_resource_chain
  2. day_options SELECT  (existence check)
  3. day_options SELECT  (conflict check)
  4. day_options UPDATE
  5. day_options SELECT  (re-fetch)
  Total: 5 round-trips

Baseline ceiling ≤ 5 for both variants (current maximum measured).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _seed(days_store, trips_store, user_id):
    """Seed trip + day.  Returns (trip_id, day_id, option_id)."""
    trip_id = str(uuid4())
    day_id = str(uuid4())
    option_id = str(uuid4())

    trips_store.append(
        {
            "trip_id": trip_id,
            "user_id": str(user_id),
            "trip_name": "Budget Test",
            "start_date": None,
            "end_date": None,
        }
    )
    days_store.append(
        {
            "day_id": day_id,
            "trip_id": trip_id,
            "date": "2025-07-01",
            "sort_order": 0,
            "created_at": "2025-01-01T12:00:00Z",
            "active_option_id": None,
        }
    )
    return trip_id, day_id, option_id


def _inject_option(mock_sb, option_id, day_id, option_index=1):
    """Insert an option row into the inner mock's options_store."""
    mock_sb._inner._options_store.append(
        {
            "option_id": option_id,
            "day_id": day_id,
            "option_index": option_index,
            "starting_city": None,
            "ending_city": None,
            "created_by": None,
            "created_at": "2025-01-01T12:00:00Z",
        }
    )


def test_update_option_round_trip_budget_no_index_change(
    client: TestClient,
    mock_user_id,
    mock_supabase_counting,
):
    """
    Phase 0 baseline: PATCH .../options/{option_id} updating starting_city only.

    Measured today: 4 execute() calls (1 rpc + 3 table).
    Baseline ceiling ≤ 5.  Phase 5 will tighten.
    """
    days_store, trips_store, MockFactory, counter = mock_supabase_counting
    trip_id, day_id, option_id = _seed(days_store, trips_store, mock_user_id)
    mock_sb = MockFactory({trip_id: str(mock_user_id)}, mock_user_id)
    _inject_option(mock_sb, option_id, day_id, option_index=1)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}",
            json={"starting_city": "Paris"},
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        assert total <= 5, (
            f"update_option (no index change) exceeded baseline ceiling: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 0 baseline] update_option (no index change) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()


def test_update_option_round_trip_budget_with_index_change(
    client: TestClient,
    mock_user_id,
    mock_supabase_counting,
):
    """
    Phase 0 baseline: PATCH .../options/{option_id} updating option_index (triggers conflict check).

    Measured today: 5 execute() calls (1 rpc + 4 table: exist, conflict, update, re-fetch).
    Baseline ceiling ≤ 5.  Phase 5 will tighten.
    """
    days_store, trips_store, MockFactory, counter = mock_supabase_counting
    trip_id, day_id, option_id = _seed(days_store, trips_store, mock_user_id)
    mock_sb = MockFactory({trip_id: str(mock_user_id)}, mock_user_id)
    _inject_option(mock_sb, option_id, day_id, option_index=1)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}",
            json={"option_index": 2},  # no conflict in mock (only 1 option seeded)
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        assert total <= 5, (
            f"update_option (with index change) exceeded baseline ceiling: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 0 baseline] update_option (with index change) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()
