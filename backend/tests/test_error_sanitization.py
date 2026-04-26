"""
HIGH-03 / MED-06: Error message sanitization.

HIGH-03 (existing) — RED phase — test_route_calculation_error_does_not_leak_internal_details
FAILS because itinerary_routes.py returns ``detail=str(e)`` for ValueError, leaking
internal API keys, quotas, and project identifiers.

MED-06 (new) — RED phase — ``_compute_one_segment`` stores ``error_message=str(e)``
verbatim in segment_cache. The field returned in RouteSegmentResponse must not carry raw
exception text containing internal API details (keys, project IDs, quota info).
"""

from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.main import app

TEST_USER_ID = "11111111-2222-3333-4444-555555555555"


def _make_minimal_routes_mock(trip_id: str, day_id: str, option_id: str, route_id: str):
    """
    Mock supabase that passes ownership, returns a valid route row, and
    returns a non-empty routes list so `include_segments=true` is exercised.
    """
    mock = MagicMock()

    def rpc_handler(name, params):
        result = MagicMock()
        result.execute.return_value = MagicMock(data="owner")
        return result

    mock.rpc = rpc_handler

    route_row = {
        "route_id": route_id,
        "option_id": option_id,
        "label": "Test route",
        "transport_mode": "walk",
        "duration_seconds": 600,
        "distance_meters": 1000,
        "sort_order": 0,
    }
    stop_row = {"location_id": str(uuid4()), "stop_order": 0}

    def table_handler(name):
        t = MagicMock()
        chain = MagicMock()
        chain.eq.return_value = chain
        chain.order.return_value = chain
        if name == "option_routes":
            chain.execute.return_value = MagicMock(data=[route_row])
        elif name == "route_stops":
            chain.execute.return_value = MagicMock(data=[stop_row])
        else:
            chain.execute.return_value = MagicMock(data=[])
        t.select.return_value = chain
        return t

    mock.table = table_handler
    return mock


@pytest.fixture(autouse=True)
def _auth_override():
    async def override():
        return UUID(TEST_USER_ID)

    app.dependency_overrides[get_current_user_id] = override
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture
def client():
    return TestClient(app)


class TestErrorSanitization:
    """
    Ensure internal exception messages are not forwarded verbatim to clients.
    """

    def test_route_calculation_error_does_not_leak_internal_details(self, client):
        """
        When `get_route_with_fresh_segments` raises a ValueError containing
        sensitive internal details (API key names, quota info, project IDs),
        the response detail must NOT contain those strings.

        Currently FAILS because itinerary_routes.py:188 does `detail=str(e)`.
        """
        trip_id = str(uuid4())
        day_id = str(uuid4())
        option_id = str(uuid4())
        route_id = str(uuid4())

        mock_sb = _make_minimal_routes_mock(trip_id, day_id, option_id, route_id)
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        sensitive_message = "Google API returned 403: quota exceeded for project XYZ123"

        try:
            with patch(
                "backend.app.routers.itinerary_routes.get_route_with_fresh_segments",
                side_effect=ValueError(sensitive_message),
            ):
                resp = client.get(
                    f"/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
                    params={"include_segments": "true"},
                )

            assert resp.status_code == 400, (
                f"Expected 400 for route calculation error, got {resp.status_code}"
            )

            detail = resp.json().get("detail", "")
            forbidden_fragments = ["Google API", "403", "quota", "XYZ123"]
            leaked = [f for f in forbidden_fragments if f in detail]
            assert not leaked, (
                f"Response detail leaks internal information {leaked!r}. "
                f"Full detail: {detail!r}. "
                "The endpoint must return a generic error message instead of str(e)."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    # ------------------------------------------------------------------
    # MED-06: segment_cache error_message sanitization
    # ------------------------------------------------------------------

    def test_compute_segment_error_message_is_sanitized(self):
        """
        MED-06 — Phase 4 updated.

        ``_compute_one_segment_async`` (Phase 4 replacement of ``_compute_one_segment``)
        builds the error_message via ``_build_segment_cache_row``.  The message
        must be a generic sanitized string rather than ``str(e)`` verbatim so
        internal API keys, project IDs, and HTTP status codes from Google are
        never persisted or surfaced to clients.

        Verified fixed in Phase 4: ``_build_segment_cache_row`` always stores
        the constant ``"Route calculation failed for this segment"`` as
        ``error_message`` regardless of exception content.
        """
        import asyncio

        from backend.app.services.route_calculation import _compute_one_segment_async

        sensitive_exception_message = (
            "HTTP 403 Forbidden: API key AIzaSyABC123_secret restricted for "
            "project my-internal-project-XYZ; quota exhausted"
        )

        class _FakeGoogleClient:
            def compute_leg(self, *args, **kwargs):
                raise RuntimeError(sensitive_exception_message)

        import asyncio as _asyncio

        semaphore = _asyncio.Semaphore(4)

        _cache_key_val, cache_row = asyncio.get_event_loop().run_until_complete(
            _compute_one_segment_async(
                google_client=_FakeGoogleClient(),
                origin_place_id="place_A",
                origin_lat=48.8,
                origin_lng=2.3,
                dest_place_id="place_B",
                dest_lat=48.9,
                dest_lng=2.4,
                transport_mode="walk",
                existing_retry_count=0,
                semaphore=semaphore,
            )
        )

        stored_error_message = cache_row.get("error_message", "")
        forbidden_fragments = ["AIzaSy", "my-internal-project-XYZ", "403", "quota"]
        leaked = [f for f in forbidden_fragments if f in (stored_error_message or "")]
        assert not leaked, (
            f"error_message stored in segment_cache contains internal details "
            f"{leaked!r}. Full message: {stored_error_message!r}. "
            "Sanitize the exception message before storing it — strip API keys, "
            "project IDs, and raw HTTP status codes."
        )

    def test_route_recalculate_error_does_not_leak_internal_details(self, client):
        """
        The recalculate endpoint (POST …/routes/{id}/recalculate) has the same
        `detail=str(e)` pattern at itinerary_routes.py:335.  It must also
        return a generic message instead of the raw ValueError text.

        Currently FAILS for the same reason.
        """
        trip_id = str(uuid4())
        day_id = str(uuid4())
        option_id = str(uuid4())
        route_id = str(uuid4())

        mock_sb = _make_minimal_routes_mock(trip_id, day_id, option_id, route_id)
        app.dependency_overrides[get_supabase_client] = lambda: mock_sb

        sensitive_message = "Google API returned 403: quota exceeded for project XYZ123"

        try:
            with patch(
                "backend.app.routers.itinerary_routes.get_route_with_fresh_segments",
                side_effect=ValueError(sensitive_message),
            ):
                resp = client.post(
                    f"/api/v1/trips/{trip_id}/days/{day_id}"
                    f"/options/{option_id}/routes/{route_id}/recalculate",
                    json={},
                )

            assert resp.status_code == 400, (
                f"Expected 400 for route recalculation error, got {resp.status_code}"
            )

            detail = resp.json().get("detail", "")
            forbidden_fragments = ["Google API", "403", "quota", "XYZ123"]
            leaked = [f for f in forbidden_fragments if f in detail]
            assert not leaked, (
                f"Response detail leaks internal information {leaked!r}. "
                f"Full detail: {detail!r}. "
                "The recalculate endpoint must also return a generic error message."
            )
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)
