"""Tests for POST /api/v1/trips/{trip_id}/locations/import-google-list-stream.

RED phase — the endpoint does not exist yet. Every test here is expected to
FAIL with 404 / routing error until the implementation is added.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.clients.google_list_scraper import ScrapedPlace
from backend.app.clients.google_places import (
    GoogleListParseError,
    PlaceResolution,
)
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import (
    get_current_user_email,
    get_current_user_id,
    get_google_places_client_optional,
)
from backend.app.main import app

TRIP_ID = str(uuid4())
USER_ID = uuid4()
USER_EMAIL = "test@example.com"

STREAM_URL = f"/api/v1/trips/{TRIP_ID}/locations/import-google-list-stream"
REQUEST_BODY = {"google_list_url": "https://maps.app.goo.gl/abc123"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_resolution(place_id: str, name: str) -> PlaceResolution:
    return PlaceResolution(
        place_id=place_id,
        name=name,
        formatted_address="123 Test St, Paris, France",
        latitude=48.86,
        longitude=2.34,
        types=["restaurant"],
        first_photo_resource=None,
    )


def _mock_supabase(existing_place_ids: list[str] | None = None):
    """Build a mock Supabase client with trip ownership + existing locations."""
    sb = MagicMock()

    trip_row = {"trip_id": TRIP_ID, "user_id": str(USER_ID)}

    def _table(name):
        t = MagicMock()
        if name == "trips":
            t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[trip_row]
            )
        elif name == "locations":
            rows = [{"google_place_id": pid} for pid in (existing_place_ids or [])]
            select_mock = MagicMock()
            select_mock.eq.return_value.execute.return_value = MagicMock(data=rows)
            t.select.return_value = select_mock

            def _insert(data):
                m = MagicMock()
                m.execute.return_value = MagicMock(data=data)
                return m

            t.insert.side_effect = _insert
        elif name == "place_detail_cache":
            # Cache lookups always miss (no cached places in tests)
            t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            # Cache writes succeed
            t.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        return t

    sb.table.side_effect = _table

    # `bump_google_usage` quota RPC (list-import guard). Default: always
    # under cap so existing happy-path tests don't need to re-stub it.
    # The cap-exceeded test overrides this with its own supabase mock.
    def _rpc(name, params=None):
        if name == "bump_google_usage":
            m = MagicMock()
            m.execute.return_value = MagicMock(data=True)
            return m
        return MagicMock()

    sb.rpc.side_effect = _rpc
    return sb


def _setup_overrides(supabase, places_client=None):
    async def override_user():
        return USER_ID

    async def override_email():
        return USER_EMAIL

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_current_user_email] = override_email
    app.dependency_overrides[get_supabase_client] = lambda: supabase
    if places_client is not None:
        app.dependency_overrides[get_google_places_client_optional] = lambda: places_client


def _parse_sse_events(text: str) -> list[dict]:
    """Parse SSE response body into a list of event dicts."""
    events = []
    for chunk in text.strip().split("\n\n"):
        for line in chunk.split("\n"):
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_stream_happy_path_event_sequence(client: TestClient):
    """Two places scraped and resolved → events arrive in correct order.

    Expected sequence:
      scraping → scraping_done(total=2) → enriching(1/2) → enriching(2/2)
      → saving → complete(imported_count=2)
    """
    sb = _mock_supabase()

    scraped = [
        ScrapedPlace(name="Place A", latitude=48.86, longitude=2.34),
        ScrapedPlace(name="Place B", latitude=48.87, longitude=2.35),
    ]

    def fake_id_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Place A" in text:
            return "place_a_id"
        return "place_b_id"

    def fake_get_by_id(place_id, **kw):
        names = {"place_a_id": "Place A", "place_b_id": "Place B"}
        return _make_resolution(place_id, names.get(place_id, "Unknown"))

    mock_places = MagicMock()
    mock_places.search_place_id_by_text.side_effect = fake_id_search
    mock_places.get_place_by_id.side_effect = fake_get_by_id
    _setup_overrides(sb, places_client=mock_places)

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            # The endpoint must exist and return SSE
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = _parse_sse_events(resp.text)
            event_types = [e["event"] for e in events]

            # Verify mandatory ordering
            assert event_types[0] == "scraping"
            assert event_types[1] == "scraping_done"
            assert event_types[-1] == "complete"
            assert "saving" in event_types

            # scraping_done carries correct total
            scraping_done = next(e for e in events if e["event"] == "scraping_done")
            assert scraping_done["total"] == 2

            # Two enriching events, one per place
            enriching_events = [e for e in events if e["event"] == "enriching"]
            assert len(enriching_events) == 2
            assert enriching_events[0]["current"] == 1
            assert enriching_events[0]["total"] == 2
            assert enriching_events[1]["current"] == 2
            assert enriching_events[1]["total"] == 2
            # Both must have a name and status
            for ev in enriching_events:
                assert "name" in ev
                assert ev["status"] == "imported"

            # complete event carries final counts
            complete = next(e for e in events if e["event"] == "complete")
            assert complete["imported_count"] == 2
            assert complete["existing_count"] == 0
            assert complete["failed_count"] == 0
            assert len(complete["imported"]) == 2
            assert complete["existing"] == []
            assert complete["failed"] == []
        finally:
            app.dependency_overrides.clear()


def test_stream_scraper_error_yields_error_event(client: TestClient):
    """Scraper raises GoogleListParseError → events: scraping → error.

    No scraping_done, no enriching, no complete — just error.
    The error message must be the scraper's actual message, not a generic fallback.
    """
    captcha_message = (
        "Google returned a CAPTCHA or rate-limit response. "
        "Try again later or open the list in your browser first."
    )
    sb = _mock_supabase()
    _setup_overrides(sb, places_client=MagicMock())

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(
            side_effect=GoogleListParseError(captcha_message)
        )

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = _parse_sse_events(resp.text)
            event_types = [e["event"] for e in events]

            # First event is the scraping indicator
            assert event_types[0] == "scraping"

            # Last event is the error
            assert event_types[-1] == "error"
            error_event = events[-1]
            assert "message" in error_event

            # No scraping_done or complete should appear
            assert "scraping_done" not in event_types
            assert "complete" not in event_types

            # Internal errors (CAPTCHA, Playwright) get a user-friendly generic message.
            assert "technical difficulties" in error_event["message"], (
                f"Expected user-friendly message but got: {error_event['message']!r}"
            )
            assert "CAPTCHA" not in error_event["message"], (
                "Internal error details must not leak to the user"
            )
        finally:
            app.dependency_overrides.clear()


def test_stream_empty_list_error_passes_through_scraper_message(client: TestClient):
    """Scraper raises GoogleListParseError for an empty/private list.

    The SSE error event must carry the scraper's specific message
    ("No list items found on the page. The list may be empty, private, or the
    URL may be invalid.") rather than the generic "Failed to parse Google Maps
    list. Please check the URL and try again." fallback.

    This test is in RED phase — it FAILS until the catch block is updated to
    yield str(exc) instead of the hardcoded generic string.
    """
    empty_list_message = (
        "No list items found on the page. "
        "The list may be empty, private, or the URL may be invalid."
    )
    sb = _mock_supabase()
    _setup_overrides(sb, places_client=MagicMock())

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(
            side_effect=GoogleListParseError(empty_list_message)
        )

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = _parse_sse_events(resp.text)
            event_types = [e["event"] for e in events]

            assert event_types[0] == "scraping"
            assert event_types[-1] == "error"

            assert "scraping_done" not in event_types
            assert "complete" not in event_types

            error_event = events[-1]

            # The specific scraper message must be forwarded verbatim.
            # FAILS with current code because the catch block uses a hardcoded string.
            assert "No list items found" in error_event["message"], (
                f"Expected 'No list items found' in message but got: {error_event['message']!r}"
            )
            assert "Failed to parse Google Maps list" not in error_event["message"], (
                "Generic fallback message must not overwrite the specific scraper error"
            )
        finally:
            app.dependency_overrides.clear()


def test_stream_captcha_error_passes_through_scraper_message(client: TestClient):
    """Scraper raises GoogleListParseError for a CAPTCHA/rate-limit hit.

    Internal errors like CAPTCHA should be replaced with a user-friendly
    generic message — the raw error must not leak to the user.
    """
    captcha_message = (
        "Google returned a CAPTCHA or rate-limit response. "
        "Try again later or open the list in your browser first."
    )
    sb = _mock_supabase()
    _setup_overrides(sb, places_client=MagicMock())

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(
            side_effect=GoogleListParseError(captcha_message)
        )

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            assert resp.status_code == 200

            events = _parse_sse_events(resp.text)
            error_event = next(e for e in events if e["event"] == "error")

            # Internal error details must be hidden from the user
            assert "technical difficulties" in error_event["message"], (
                f"Expected user-friendly message but got: {error_event['message']!r}"
            )
            assert "CAPTCHA" not in error_event["message"], (
                "Internal error details must not leak to the user"
            )
        finally:
            app.dependency_overrides.clear()


def test_stream_enrichment_failure_continues(client: TestClient):
    """3 places scraped; 2nd place enrichment raises an Exception.

    Expected behaviour: the stream continues for all 3 places, the 2nd has
    status "failed", and complete carries failed_count=1.
    """
    sb = _mock_supabase()

    scraped = [
        ScrapedPlace(name="Good One", latitude=1.0, longitude=2.0),
        ScrapedPlace(name="Bad One", latitude=1.1, longitude=2.1),
        ScrapedPlace(name="Good Two", latitude=1.2, longitude=2.2),
    ]

    def fake_id_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Bad One" in text:
            raise RuntimeError("Places API exploded")
        if "Good One" in text:
            return "good_one_id"
        return "good_two_id"

    def fake_get_by_id(place_id, **kw):
        names = {"good_one_id": "Good One", "good_two_id": "Good Two"}
        return _make_resolution(place_id, names.get(place_id, "Unknown"))

    mock_places = MagicMock()
    mock_places.search_place_id_by_text.side_effect = fake_id_search
    # Nearby fallback must also fail for the "Bad One" place
    mock_places.search_place_id_nearby.side_effect = RuntimeError("Nearby search also failed")
    mock_places.get_place_by_id.side_effect = fake_get_by_id
    _setup_overrides(sb, places_client=mock_places)

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = _parse_sse_events(resp.text)
            event_types = [e["event"] for e in events]

            # All 3 places must get an enriching event
            enriching_events = [e for e in events if e["event"] == "enriching"]
            assert len(enriching_events) == 3

            statuses = [e["status"] for e in enriching_events]
            assert statuses[0] == "imported"
            assert statuses[1] == "failed"
            assert statuses[2] == "imported"

            # saving must appear (2 places to insert)
            assert "saving" in event_types

            # complete reflects correct counts
            complete = next(e for e in events if e["event"] == "complete")
            assert complete["imported_count"] == 2
            assert complete["failed_count"] == 1
            assert complete["existing_count"] == 0

            # No error event for a per-place failure — stream finishes normally
            assert "error" not in event_types
        finally:
            app.dependency_overrides.clear()


def test_list_import_respects_kill_switch(client: TestClient, monkeypatch):
    """GOOGLE_LIST_IMPORT_DISABLED=true must block the SSE endpoint immediately.

    The stream must either return a non-200 HTTP status OR, if the endpoint
    returns 200 with SSE, the first event must be 'error' and no Places API
    calls must be made. Either behaviour is acceptable as long as the user
    is informed and no Google billing happens.

    This test validates that the granular kill switch is wired into the SSE
    handler — not just the new autocomplete/resolve endpoints.
    """
    monkeypatch.setenv("GOOGLE_LIST_IMPORT_DISABLED", "true")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    class ShouldNotBeCalledClient:
        def _search_place_by_text(self, *a, **kw):
            raise AssertionError("Places API must not be called when list import is disabled")

        def _search_place_nearby(self, *a, **kw):
            raise AssertionError("Places API must not be called when list import is disabled")

    sb = _mock_supabase()
    _setup_overrides(sb, places_client=ShouldNotBeCalledClient())

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        # Even if somehow the scraper ran, it would see no places
        scraper_instance.extract_places = AsyncMock(return_value=[])
        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)
            # Either a non-200 (503) or an SSE stream whose first data event is 'error'
            if resp.status_code != 200:
                assert resp.status_code == 503, (
                    f"Expected 503 when list import is disabled, got {resp.status_code}"
                )
            else:
                assert "text/event-stream" in resp.headers.get("content-type", ""), (
                    "If 200, response must be SSE"
                )
                events = _parse_sse_events(resp.text)
                assert events, "SSE stream must contain at least one event"
                # First substantive event must be 'error' (or the only event is error)
                event_types = [e.get("event") for e in events]
                assert "error" in event_types, (
                    f"Expected an 'error' event when kill switch is active. "
                    f"Got events: {event_types}"
                )
                # No 'complete' event — the import must be stopped
                assert "complete" not in event_types, (
                    "A 'complete' event must not appear when the kill switch blocks the import"
                )
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()


def test_list_import_stops_on_daily_cap_mid_stream(client: TestClient):
    """Daily cap is hit on the 3rd place — stream emits 'error' and closes.

    Setup: 3 scraped places, quota supabase returns True for places 1-2 and
    False for place 3. The stream must:
    - Emit 'enriching' events for the first 2 places (imported)
    - Emit an 'error' event when the 3rd place hits the cap
    - NOT emit a 'complete' event after the error

    This validates that bump_google_usage is called inside the SSE streaming
    loop per resolved place, and the handler terminates correctly on cap hit.
    """
    scraped = [
        ScrapedPlace(name="Place A", latitude=48.86, longitude=2.34),
        ScrapedPlace(name="Place B", latitude=48.87, longitude=2.35),
        ScrapedPlace(name="Place C", latitude=48.88, longitude=2.36),
    ]

    def fake_id_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Place A" in text:
            return "place_a_id"
        if "Place B" in text:
            return "place_b_id"
        return "place_c_id"

    def fake_get_by_id(place_id, **kw):
        names = {"place_a_id": "Place A", "place_b_id": "Place B", "place_c_id": "Place C"}
        return _make_resolution(place_id, names.get(place_id, "Unknown"))

    mock_places = MagicMock()
    mock_places.search_place_id_by_text.side_effect = fake_id_search
    mock_places.get_place_by_id.side_effect = fake_get_by_id

    # Quota supabase: counts bump calls and returns False starting at the 3rd call
    class _QuotaSupabase:
        def __init__(self):
            self._bump_count = 0

        def rpc(self, name, params=None):
            if name == "bump_google_usage":
                self._bump_count += 1
                under_cap = self._bump_count <= 2  # first 2 are fine, 3rd hits cap
                m = MagicMock()
                m.execute.return_value = MagicMock(data=under_cap)
                return m
            # For verify_resource_chain (ownership check)
            if name in ("verify_member_access", "verify_resource_chain"):
                m = MagicMock()
                m.execute.return_value = MagicMock(data="owner")
                return m
            raise AssertionError(f"Unexpected RPC: {name!r}")

        def table(self, name):
            t = MagicMock()
            trip_row = {"trip_id": TRIP_ID, "user_id": str(USER_ID)}
            if name == "trips":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    MagicMock(data=[trip_row])
                )
            elif name == "locations":
                select_mock = MagicMock()
                select_mock.eq.return_value.execute.return_value = MagicMock(data=[])
                t.select.return_value = select_mock

                def _insert(data):
                    m = MagicMock()
                    m.execute.return_value = MagicMock(data=data)
                    return m

                t.insert.side_effect = _insert
            elif name == "place_detail_cache":
                t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                t.upsert.return_value.execute.return_value = MagicMock(data=[{}])
            return t

    quota_sb = _QuotaSupabase()

    async def override_user():
        return USER_ID

    async def override_email():
        return USER_EMAIL

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_current_user_email] = override_email
    app.dependency_overrides[get_supabase_client] = lambda: quota_sb
    app.dependency_overrides[get_google_places_client_optional] = lambda: mock_places

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)
        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)
            assert resp.status_code == 200, f"Expected 200 SSE, got {resp.status_code}"
            assert "text/event-stream" in resp.headers.get("content-type", ""), (
                "Expected SSE content-type"
            )
            events = _parse_sse_events(resp.text)
            event_types = [e.get("event") for e in events]

            # The first 2 places must have been processed
            enriching_events = [e for e in events if e.get("event") == "enriching"]
            assert len(enriching_events) >= 2, (
                f"Expected at least 2 enriching events before cap hit, got {len(enriching_events)}"
            )
            # The stream must have emitted an error event for the cap
            assert "error" in event_types, (
                f"Expected an 'error' event when daily cap is hit mid-stream. "
                f"Got events: {event_types}"
            )
            error_event = next(e for e in events if e.get("event") == "error")
            error_msg = error_event.get("message", "").lower()
            assert (
                "daily" in error_msg
                or "quota" in error_msg
                or "cap" in error_msg
                or "limit" in error_msg
            ), f"Error message must mention cap/quota/daily, got: {error_msg!r}"
            # No 'complete' after the cap-triggered error
            assert "complete" not in event_types, (
                "A 'complete' event must not appear after the daily cap error"
            )
        finally:
            app.dependency_overrides.clear()


def test_stream_all_duplicates_no_saving_event(client: TestClient):
    """All scraped places already exist in the trip.

    Expected sequence:
      scraping → scraping_done(total=1) → enriching(status:"existing")
      → complete(imported_count:0)

    The "saving" event must NOT appear because there is nothing to insert.
    """
    existing_place_id = "already_there"
    sb = _mock_supabase(existing_place_ids=[existing_place_id])

    scraped = [
        ScrapedPlace(name="Already There", latitude=48.86, longitude=2.34),
    ]

    mock_places = MagicMock()
    mock_places.search_place_id_by_text.return_value = existing_place_id
    _setup_overrides(sb, places_client=mock_places)

    with patch("backend.app.services.google_list_import.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            resp = client.post(STREAM_URL, json=REQUEST_BODY)

            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = _parse_sse_events(resp.text)
            event_types = [e["event"] for e in events]

            assert event_types[0] == "scraping"

            scraping_done = next(e for e in events if e["event"] == "scraping_done")
            assert scraping_done["total"] == 1

            enriching_events = [e for e in events if e["event"] == "enriching"]
            assert len(enriching_events) == 1
            assert enriching_events[0]["status"] == "existing"

            # No saving event when there is nothing to insert
            assert "saving" not in event_types

            complete = next(e for e in events if e["event"] == "complete")
            assert complete["imported_count"] == 0
            assert complete["existing_count"] == 1
            assert complete["failed_count"] == 0
        finally:
            app.dependency_overrides.clear()
