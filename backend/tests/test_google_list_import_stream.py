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
        website=None,
        formatted_phone_number=None,
        opening_hours_text=[],
        photos=[],
        raw={"places": [{"id": place_id}]},
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
        return t

    sb.table.side_effect = _table
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
        app.dependency_overrides[get_google_places_client_optional] = (
            lambda: places_client
        )


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

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Place A" in text:
            return _make_resolution("place_a_id", "Place A")
        return _make_resolution("place_b_id", "Place B")

    mock_places = MagicMock()
    mock_places._search_place_by_text.side_effect = fake_search
    _setup_overrides(sb, places_client=mock_places)

    with patch(
        "backend.app.routers.trip_locations.GoogleListScraper"
    ) as MockScraper:
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
    """
    sb = _mock_supabase()
    _setup_overrides(sb, places_client=MagicMock())

    with patch(
        "backend.app.routers.trip_locations.GoogleListScraper"
    ) as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(
            side_effect=GoogleListParseError("CAPTCHA")
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

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Bad One" in text:
            raise RuntimeError("Places API exploded")
        if "Good One" in text:
            return _make_resolution("good_one_id", "Good One")
        return _make_resolution("good_two_id", "Good Two")

    mock_places = MagicMock()
    mock_places._search_place_by_text.side_effect = fake_search
    _setup_overrides(sb, places_client=mock_places)

    with patch(
        "backend.app.routers.trip_locations.GoogleListScraper"
    ) as MockScraper:
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
    mock_places._search_place_by_text.return_value = _make_resolution(
        existing_place_id, "Already There"
    )
    _setup_overrides(sb, places_client=mock_places)

    with patch(
        "backend.app.routers.trip_locations.GoogleListScraper"
    ) as MockScraper:
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
