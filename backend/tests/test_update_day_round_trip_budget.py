"""Phase 0 baseline: DB round-trip count for PATCH .../days/{day_id}.

Records the CURRENT execute() call count as a snapshot.
Phase 5 will tighten these to ≤ 2.

Current happy path (no active_option_id):
  1. rpc:verify_resource_chain
  2. trip_days SELECT  (existence check)
  3. trip_days UPDATE
  4. trip_days SELECT  (re-fetch after update)
  Total: 4 round-trips

Current happy path (with active_option_id):
  1. rpc:verify_resource_chain
  2. trip_days SELECT  (existence check)
  3. day_options SELECT  (validate active_option_id belongs to this day)
  4. trip_days UPDATE
  5. trip_days SELECT  (re-fetch after update)
  Total: 5 round-trips

Baseline ceiling is ≤ 6 (1 spare above measured) for both variants.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app


def _seed(days_store, trips_store, user_id, *, with_option=False):
    """Return (trip_id, day_id, option_id)."""
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


def test_update_day_round_trip_budget_no_active_option(
    client: TestClient,
    mock_user_id,
    mock_supabase_counting,
):
    """
    Phase 0 baseline: PATCH .../days/{day_id} without active_option_id.

    Measured today: 4 execute() calls (1 rpc + 3 table).
    Baseline ceiling ≤ 6.  Phase 5 will tighten to ≤ 2.
    """
    days_store, trips_store, MockFactory, counter = mock_supabase_counting
    trip_id, day_id, _option_id = _seed(days_store, trips_store, mock_user_id)
    mock_sb = MockFactory({trip_id: str(mock_user_id)}, mock_user_id)

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}",
            json={"date": "2025-08-01"},
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        # Phase 5 tightened budget: ownership RPC + update RPC = 2 RT
        assert total <= 2, (
            f"update_day (no active_option_id) exceeded Phase 5 budget of 2: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 5] update_day (no active_option_id) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()


def test_update_day_round_trip_budget_with_active_option(
    client: TestClient,
    mock_user_id,
    mock_supabase_counting,
):
    """
    Phase 0 baseline: PATCH .../days/{day_id} WITH active_option_id.

    Measured today: 5 execute() calls (1 rpc + 4 table: existence, option
    validation, update, re-fetch).
    Baseline ceiling ≤ 6.  Phase 5 will tighten to ≤ 2.
    """
    days_store, trips_store, MockFactory, counter = mock_supabase_counting
    trip_id, day_id, option_id = _seed(days_store, trips_store, mock_user_id)
    mock_sb = MockFactory({trip_id: str(mock_user_id)}, mock_user_id)

    # Seed the option into the inner mock's options_store
    real_inner = mock_sb._inner
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

    async def override_user():
        return mock_user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: mock_sb

    try:
        counter.reset()
        resp = client.patch(
            f"/api/v1/trips/{trip_id}/days/{day_id}",
            json={"active_option_id": option_id},
        )
        assert resp.status_code == 200, f"Unexpected: {resp.status_code} {resp.text}"

        total = counter.total_calls
        # Phase 5 tightened budget: ownership RPC + update RPC = 2 RT
        assert total <= 2, (
            f"update_day (with active_option_id) exceeded Phase 5 budget of 2: {total}\n"
            f"Breakdown: {counter.calls}"
        )
        print(f"\n[Phase 5] update_day (with active_option_id) total calls: {total}")
        print(f"  Breakdown: {counter.calls}")
    finally:
        app.dependency_overrides.clear()
