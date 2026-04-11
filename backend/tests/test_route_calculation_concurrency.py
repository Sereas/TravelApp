"""Phase 4 — Concurrency tests for route_calculation.py.

These tests are WRITTEN FIRST (RED phase) and describe the target behaviour
after the Phase 4 refactor:

  * Google leg calls run concurrently via asyncio.gather.
  * batch_upsert_segment_cache RPC is called exactly ONCE per recompute.
  * persist_route_segments RPC is called exactly ONCE per recompute.
  * A single failed segment does not prevent the others from being stored.
  * Cache hits skip the Google call entirely.
  * force_refresh=True recomputes all segments even when cache is populated.
  * In-flight concurrency is capped by the semaphore constant.

All Supabase and Google client calls are mocked — no network, no DB.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.app.clients.google_routes import RouteLegResult
from backend.app.services.route_calculation import (
    STATUS_SUCCESS,
    _cache_key,
    _input_fingerprint,
)

# ---------------------------------------------------------------------------
# Helpers / shared factories
# ---------------------------------------------------------------------------


def _make_leg(distance: int = 1000, duration: int = 300) -> RouteLegResult:
    return RouteLegResult(
        distance_meters=distance,
        duration_seconds=duration,
        encoded_polyline="abc123",
        raw_response={"routes": []},
    )


def _future_iso(minutes: int = 60) -> str:
    return (datetime.now(UTC) + timedelta(minutes=minutes)).isoformat()


def _past_iso(minutes: int = 60) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()


# ---------------------------------------------------------------------------
# Minimal Supabase mock for segment-computation tests
# ---------------------------------------------------------------------------

ROUTE_ID = str(uuid4())
OPTION_ID = str(uuid4())

# Four-stop route → 3 segments
_LOC_IDS = [str(uuid4()) for _ in range(4)]
_PLACE_IDS = [f"place_{i}" for i in range(4)]

# Build (lat, lng) per location
_LATS = [48.0 + i * 0.1 for i in range(4)]
_LNGS = [2.0 + i * 0.1 for i in range(4)]


def _make_route_row() -> dict:
    return {
        "route_id": ROUTE_ID,
        "option_id": OPTION_ID,
        "label": "Test Route",
        "transport_mode": "walk",
        "sort_order": 0,
        "duration_seconds": None,
        "distance_meters": None,
    }


def _make_stop_rows() -> list[dict]:
    """4 stops (option_location_ids) → 3 segments."""
    ol_ids = [str(uuid4()) for _ in range(4)]
    return [
        {"option_location_id": ol_ids[i], "stop_order": i}
        for i in range(4)
    ], ol_ids


def _make_ol_rows(ol_ids: list[str]) -> list[dict]:
    return [{"id": ol_ids[i], "location_id": _LOC_IDS[i]} for i in range(4)]


def _make_location_rows() -> list[dict]:
    return [
        {
            "location_id": _LOC_IDS[i],
            "google_place_id": _PLACE_IDS[i],
            "latitude": _LATS[i],
            "longitude": _LNGS[i],
        }
        for i in range(4)
    ]


def _cache_row_for_segment(i: int, mode: str = "walk") -> dict:
    """Pre-built valid success cache row for segment i → i+1."""
    key = _cache_key(
        _PLACE_IDS[i], _PLACE_IDS[i + 1],
        _LATS[i], _LNGS[i],
        _LATS[i + 1], _LNGS[i + 1],
        mode,
    )
    fp = _input_fingerprint(
        _PLACE_IDS[i], _PLACE_IDS[i + 1],
        _LATS[i], _LNGS[i],
        _LATS[i + 1], _LNGS[i + 1],
        mode,
    )
    return {
        "id": str(uuid4()),
        "cache_key": key,
        "status": STATUS_SUCCESS,
        "input_fingerprint": fp,
        "distance_meters": 500,
        "duration_seconds": 120,
        "encoded_polyline": "xyz",
        "error_type": None,
        "error_code": None,
        "error_message": None,
        "provider_http_status": None,
        "next_retry_at": None,
        "cache_expires_at": None,
        "retry_count": 0,
    }


class _SupabaseMock:
    """
    Minimal Supabase mock for route_calculation tests.

    Tracks calls to:
      - batch_upsert_segment_cache RPC
      - persist_route_segments RPC

    Pre-seeded with route row, stops, option_locations, locations.
    Can be given pre-seeded cache rows to simulate cache hits.
    """

    def __init__(
        self,
        stop_rows: list[dict],
        ol_rows: list[dict],
        cache_rows_by_key: dict[str, dict] | None = None,
        existing_segments: list[dict] | None = None,
        route_row_override: dict | None = None,
    ) -> None:
        self._stop_rows = stop_rows
        self._ol_rows = ol_rows
        self._cache_rows_by_key = cache_rows_by_key or {}
        self._existing_segments = existing_segments or []
        # Build cache_rows_by_id so _CacheTable.in_("id", ...) lookups also work
        # for the skip-persist test path (existing_segments reference ids).
        self._cache_rows_by_id = {
            row["id"]: row for row in self._cache_rows_by_key.values()
        }
        self._route_row = route_row_override or _make_route_row()
        # Track RPC call counts
        self.batch_upsert_calls: list[Any] = []
        self.persist_calls: list[Any] = []

    # ------------------------------------------------------------------
    # RPC dispatch
    # ------------------------------------------------------------------

    def rpc(self, name: str, params: dict | None = None):
        params = params or {}
        if name == "batch_upsert_segment_cache":
            self.batch_upsert_calls.append(params)
            # Return back the rows passed in (simulates RETURNING *)
            rows_in = params.get("p_rows", [])
            out = []
            for r in rows_in:
                out.append({
                    "id": str(uuid4()),
                    "cache_key": r.get("cache_key"),
                    "status": r.get("status", STATUS_SUCCESS),
                    "input_fingerprint": r.get("input_fingerprint"),
                    "distance_meters": r.get("distance_meters"),
                    "duration_seconds": r.get("duration_seconds"),
                    "encoded_polyline": r.get("encoded_polyline"),
                    "error_type": r.get("error_type"),
                    "error_code": r.get("error_code"),
                    "error_message": r.get("error_message"),
                    "provider_http_status": r.get("provider_http_status"),
                    "next_retry_at": r.get("next_retry_at"),
                    "cache_expires_at": r.get("cache_expires_at"),
                    "retry_count": r.get("retry_count", 0),
                })
            return _ChainResult(out)
        if name == "persist_route_segments":
            self.persist_calls.append(params)
            return _ChainResult(None)
        raise AssertionError(f"Unexpected RPC call: {name!r}")

    # ------------------------------------------------------------------
    # Table access — route_calculation fetches these before computing
    # ------------------------------------------------------------------

    def table(self, name: str):
        if name == "option_routes":
            return _RouteTable(self._route_row)
        if name == "route_stops":
            return _StopTable(self._stop_rows)
        if name == "option_locations":
            return _OlTable(self._ol_rows)
        if name == "locations":
            return _LocationTable(_make_location_rows())
        if name == "route_segments":
            # After refactor, route_segments is NOT touched directly (persist RPC handles it)
            # Return existing_segments if provided (for skip-persist test), else empty
            return _RsTable(self._existing_segments)
        if name == "segment_cache":
            return _CacheTable(self._cache_rows_by_key, self._cache_rows_by_id)
        raise AssertionError(f"Unexpected table access: {name!r}")


class _ChainResult:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return type("R", (), {"data": self._data})()


class _RouteTable:
    """
    option_routes table mock that enforces SELECT projection — only returns
    columns the caller explicitly requested. Catches silent bugs like
    "service reads route.duration_seconds but the SELECT never fetched it".
    """

    def __init__(self, row):
        self._row = row
        self._selected_cols: list[str] | None = None

    def select(self, *args):
        # args is a tuple of 1 string like "col_a, col_b, col_c, ..."
        if args and isinstance(args[0], str):
            self._selected_cols = [
                c.strip() for c in args[0].split(",") if c.strip()
            ]
        else:
            self._selected_cols = None  # no filter
        return self

    def eq(self, *_):
        return self

    def execute(self):
        if self._selected_cols is None:
            projected = dict(self._row)
        else:
            projected = {k: self._row.get(k) for k in self._selected_cols}
        return type("R", (), {"data": [projected]})()

    def update(self, *_):
        return self


class _StopTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _OlTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_):
        return self

    def in_(self, *_):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _LocationTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_):
        return self

    def in_(self, *_):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _RsTable:
    """route_segments: return pre-seeded existing segments (or empty)."""

    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def in_(self, *_):
        return self

    def execute(self):
        return type("R", (), {"data": list(self._rows)})()


class _CacheTable:
    """segment_cache: supports fetch-by-cache_key AND fetch-by-id lookups."""

    def __init__(
        self,
        rows_by_key: dict[str, dict],
        rows_by_id: dict[str, dict] | None = None,
    ) -> None:
        self._rows_by_key = rows_by_key
        self._rows_by_id = rows_by_id or {}
        self._key_filter: str | None = None
        self._id_list: list[str] | None = None

    def select(self, *_):
        self._key_filter = None
        self._id_list = None
        return self

    def eq(self, key, value):
        if key == "cache_key":
            self._key_filter = str(value)
        return self

    def in_(self, key, values):
        if key == "id":
            self._id_list = [str(v) for v in values]
        return self

    def execute(self):
        if self._key_filter is not None:
            row = self._rows_by_key.get(self._key_filter)
            return type("R", (), {"data": [row] if row else []})()
        if self._id_list is not None:
            matched = [
                self._rows_by_id[i] for i in self._id_list if i in self._rows_by_id
            ]
            return type("R", (), {"data": matched})()
        return type("R", (), {"data": []})()


# ---------------------------------------------------------------------------
# Build stop/ol rows helper
# ---------------------------------------------------------------------------


def _make_stops_and_ols():
    stop_rows, ol_ids = _make_stop_rows()
    ol_rows = _make_ol_rows(ol_ids)
    return stop_rows, ol_rows


# ---------------------------------------------------------------------------
# Test: concurrent Google calls -- wall-clock must be max(per_call), not N*
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_segments_runs_google_calls_concurrently():
    """
    For N segments with a slow Google stub (each call sleeps 100ms),
    wall-clock must be < 2 * single_call_time, not N * single_call_time.

    Phase 4 converts _get_route_segments_impl to async and dispatches Google
    calls via asyncio.gather(asyncio.to_thread(...)).

    With 3 segments * 100ms sequential = 300ms.
    Concurrent = ~100ms.  We assert < 250ms to give CI headroom.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()
    sb = _SupabaseMock(stop_rows, ol_rows)

    call_times: list[float] = []

    def slow_compute_leg(o_lat, o_lng, d_lat, d_lng, mode):
        time.sleep(0.1)  # 100ms per call
        call_times.append(time.perf_counter())
        return _make_leg()

    google_client = MagicMock()
    google_client.compute_leg.side_effect = slow_compute_leg

    t0 = time.perf_counter()
    result = await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )
    elapsed = time.perf_counter() - t0

    # 3 segments * 100ms sequential = 300ms; concurrent should be ~100ms
    assert elapsed < 0.25, (
        f"Expected concurrent execution (<250ms) but took {elapsed * 1000:.0f}ms. "
        "Phase 4 must use asyncio.gather for Google leg calls."
    )
    assert len(result.segments) == 3
    assert result.route_status == "ok"


# ---------------------------------------------------------------------------
# Test: batch_upsert_segment_cache called exactly once per recompute
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_upsert_called_once_per_recompute():
    """
    No matter how many segments need computing, batch_upsert_segment_cache
    RPC is called exactly ONCE (not once per segment).
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()
    sb = _SupabaseMock(stop_rows, ol_rows)

    google_client = MagicMock()
    google_client.compute_leg.return_value = _make_leg()

    await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )

    assert len(sb.batch_upsert_calls) == 1, (
        f"Expected exactly 1 batch_upsert_segment_cache call, got {len(sb.batch_upsert_calls)}. "
        "Phase 4 must batch all cache writes into a single RPC."
    )
    # All 3 segments must be in the single batch
    rows = sb.batch_upsert_calls[0].get("p_rows", [])
    assert len(rows) == 3, f"Expected 3 rows in batch, got {len(rows)}"


# ---------------------------------------------------------------------------
# Test: persist_route_segments called exactly once
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_persist_route_segments_called_once_at_end():
    """
    persist_route_segments RPC is called exactly once per get_route_with_fresh_segments
    invocation, not once per segment.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()
    sb = _SupabaseMock(stop_rows, ol_rows)

    google_client = MagicMock()
    google_client.compute_leg.return_value = _make_leg()

    await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )

    assert len(sb.persist_calls) == 1, (
        f"Expected exactly 1 persist_route_segments call, got {len(sb.persist_calls)}. "
        "Phase 4 must atomically persist all segments in a single RPC."
    )
    # Check that totals were passed
    call = sb.persist_calls[0]
    assert call.get("p_route_id") == ROUTE_ID
    assert isinstance(call.get("p_total_duration"), int)
    assert isinstance(call.get("p_total_distance"), int)


# ---------------------------------------------------------------------------
# Test: one failed segment does not block the others
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_failed_segment_does_not_block_others():
    """
    If one Google call raises, the other 2 segments are still computed,
    cached, and returned.  The failed segment has a non-success status.
    The overall route_status is 'error' (or 'partial').
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()
    sb = _SupabaseMock(stop_rows, ol_rows)

    call_count = 0

    def sometimes_fail(o_lat, o_lng, d_lat, d_lng, mode):
        nonlocal call_count
        call_count += 1
        if call_count == 2:  # second segment fails
            raise ValueError("Google said no route")
        return _make_leg()

    google_client = MagicMock()
    google_client.compute_leg.side_effect = sometimes_fail

    result = await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )

    assert len(result.segments) == 3
    # At least 2 segments should be success
    success_count = sum(1 for s in result.segments if s.status == STATUS_SUCCESS)
    assert success_count >= 2, f"Expected >=2 successful segments, got {success_count}"
    # Overall status should reflect the error
    assert result.route_status == "error"
    # The batch upsert should still have been called (with the successful rows + error row)
    assert len(sb.batch_upsert_calls) == 1


# ---------------------------------------------------------------------------
# Test: cache hit skips Google call
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cache_hit_skips_google_call():
    """
    For a 4-stop route (3 segments), if 2 segments are already cached with
    valid fingerprints (success status), only 1 Google call is made.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()

    # Pre-seed cache rows for segments 0 and 1 (i → i+1)
    cache_by_key = {
        _cache_row_for_segment(0)["cache_key"]: _cache_row_for_segment(0),
        _cache_row_for_segment(1)["cache_key"]: _cache_row_for_segment(1),
    }
    # Segment 2 is NOT cached → should trigger one Google call

    sb = _SupabaseMock(stop_rows, ol_rows, cache_rows_by_key=cache_by_key)

    google_client = MagicMock()
    google_client.compute_leg.return_value = _make_leg()

    await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )

    # Only 1 Google call for the uncached segment
    assert google_client.compute_leg.call_count == 1, (
        f"Expected exactly 1 Google call (cache hit for 2 of 3 segments), "
        f"but got {google_client.compute_leg.call_count}."
    )
    # batch_upsert must contain exactly 1 row (the newly-computed segment),
    # not 3 — cached segments should not be re-upserted on every view.
    assert len(sb.batch_upsert_calls) == 1, (
        f"Expected batch_upsert_segment_cache called once, "
        f"got {len(sb.batch_upsert_calls)}."
    )
    upserted_rows = sb.batch_upsert_calls[0]["p_rows"]
    assert len(upserted_rows) == 1, (
        f"Expected batch_upsert to contain 1 row (the uncached segment), "
        f"got {len(upserted_rows)}."
    )


# ---------------------------------------------------------------------------
# Test: full cache hit with matching existing segments skips both RPCs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_cache_hit_skips_batch_upsert_and_persist():
    """
    When all segments are cached AND existing route_segments already match the
    cache ids AND option_routes totals are up-to-date, the service must not
    call batch_upsert_segment_cache NOR persist_route_segments — the DB is
    already consistent and writes would be wasted.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()

    # Pre-seed valid cache rows for all 3 segments.
    seg_rows = [_cache_row_for_segment(i) for i in range(3)]
    cache_by_key = {row["cache_key"]: row for row in seg_rows}

    # Pre-seed existing route_segments that reference those cache ids, ordered
    # 0..2, and a route row whose totals already match the cached values.
    existing_segments = [
        {
            "segment_order": i,
            "from_location_id": _LOC_IDS[i],
            "to_location_id": _LOC_IDS[i + 1],
            "segment_cache_id": seg_rows[i]["id"],
        }
        for i in range(3)
    ]
    # Route totals must match the sum of cached rows (500m, 120s each * 3)
    route_row = _make_route_row()
    route_row["duration_seconds"] = 360
    route_row["distance_meters"] = 1500

    sb = _SupabaseMock(
        stop_rows,
        ol_rows,
        cache_rows_by_key=cache_by_key,
        existing_segments=existing_segments,
        route_row_override=route_row,
    )

    google_client = MagicMock()
    google_client.compute_leg.return_value = _make_leg()

    await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=False,
        google_routes_client=google_client,
    )

    assert google_client.compute_leg.call_count == 0, (
        "Full cache hit should make zero Google calls."
    )
    assert len(sb.batch_upsert_calls) == 0, (
        "Full cache hit should skip batch_upsert_segment_cache entirely."
    )
    assert len(sb.persist_calls) == 0, (
        "Full cache hit with matching existing segments should skip persist_route_segments."
    )


# ---------------------------------------------------------------------------
# Test: force_refresh recomputes all segments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_force_refresh_recomputes_all():
    """
    With force_refresh=True, ALL segments are recomputed even if valid cache rows exist.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()

    # Pre-seed ALL 3 segments as valid success cache rows
    cache_by_key = {
        _cache_row_for_segment(i)["cache_key"]: _cache_row_for_segment(i)
        for i in range(3)
    }

    sb = _SupabaseMock(stop_rows, ol_rows, cache_rows_by_key=cache_by_key)

    google_client = MagicMock()
    google_client.compute_leg.return_value = _make_leg()

    await rc.get_route_with_fresh_segments(
        sb,
        ROUTE_ID,
        transport_mode="walk",
        force_refresh=True,  # must bypass all cache
        google_routes_client=google_client,
    )

    assert google_client.compute_leg.call_count == 3, (
        f"Expected 3 Google calls (force_refresh=True), "
        f"got {google_client.compute_leg.call_count}."
    )


# ---------------------------------------------------------------------------
# Test: concurrency capped by semaphore constant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrency_capped_by_semaphore():
    """
    With 3 segments and GOOGLE_ROUTES_MAX_CONCURRENT_LEGS=4 (default),
    no more than 4 concurrent Google calls run at once.

    We instrument the Google call to track max concurrency.
    """
    from backend.app.services import route_calculation as rc

    stop_rows, ol_rows = _make_stops_and_ols()
    sb = _SupabaseMock(stop_rows, ol_rows)

    in_flight = 0
    max_in_flight = 0

    async def tracked_compute_leg(o_lat, o_lng, d_lat, d_lng, mode):
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return _make_leg()

    # Patch asyncio.to_thread to use our async version directly
    async def patched_to_thread(fn, *args, **kwargs):
        return await tracked_compute_leg(*args)

    # Override the constant to 2 to verify the cap is actually enforced
    with patch.object(rc, "GOOGLE_ROUTES_MAX_CONCURRENT_LEGS", 2), patch(
        "asyncio.to_thread", patched_to_thread
    ):
            google_client = MagicMock()
            # compute_leg will be called via asyncio.to_thread which we patch
            google_client.compute_leg.side_effect = lambda *a, **kw: _make_leg()

            await rc.get_route_with_fresh_segments(
                sb,
                ROUTE_ID,
                transport_mode="walk",
                force_refresh=False,
                google_routes_client=google_client,
            )

    assert max_in_flight <= 2, (
        f"Expected max concurrency ≤ 2 (semaphore cap), got {max_in_flight}. "
        "Phase 4 must enforce GOOGLE_ROUTES_MAX_CONCURRENT_LEGS via asyncio.Semaphore."
    )
