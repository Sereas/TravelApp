"""Tests for POST /api/v1/trips/{trip_id}/locations/import-google-list."""

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


@pytest.fixture
def client():
    return TestClient(app)


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


def test_import_happy_path_mix_of_new_and_existing(client: TestClient):
    """Happy path: 3 places scraped, 1 already exists, 2 imported."""
    sb = _mock_supabase(existing_place_ids=["existing_place_1"])

    scraped = [
        ScrapedPlace(name="Place A", latitude=1.28, longitude=103.85),
        ScrapedPlace(name="Place B", latitude=1.29, longitude=103.86),
        ScrapedPlace(name="Place C", latitude=1.30, longitude=103.87),
    ]

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Place A" in text:
            return _make_resolution("existing_place_1", "Place A")
        if "Place B" in text:
            return _make_resolution("new_place_2", "Place B")
        return _make_resolution("new_place_3", "Place C")

    mock_client = MagicMock()
    mock_client._search_place_by_text.side_effect = fake_search
    _setup_overrides(sb, places_client=mock_client)

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc123"},
            )
            assert r.status_code == 200
            data = r.json()
            assert data["imported_count"] == 2
            assert data["existing_count"] == 1
            assert data["failed_count"] == 0
            assert len(data["imported"]) == 2
            assert len(data["existing"]) == 1
        finally:
            app.dependency_overrides.clear()


def test_import_all_duplicates(client: TestClient):
    """All scraped places already exist in the trip."""
    sb = _mock_supabase(existing_place_ids=["p1", "p2"])

    scraped = [
        ScrapedPlace(name="Place A", latitude=1.28, longitude=103.85),
        ScrapedPlace(name="Place B", latitude=1.29, longitude=103.86),
    ]

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Place A" in text:
            return _make_resolution("p1", "Place A")
        return _make_resolution("p2", "Place B")

    mock_client = MagicMock()
    mock_client._search_place_by_text.side_effect = fake_search
    _setup_overrides(sb, places_client=mock_client)

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc"},
            )
            assert r.status_code == 200
            data = r.json()
            assert data["imported_count"] == 0
            assert data["existing_count"] == 2
            assert data["failed_count"] == 0
        finally:
            app.dependency_overrides.clear()


def test_import_partial_resolve_failures(client: TestClient):
    """Some places fail to resolve — they show up as failed, rest still imported."""
    sb = _mock_supabase()

    scraped = [
        ScrapedPlace(name="Good Place", latitude=1.28, longitude=103.85),
        ScrapedPlace(name="Bad Place", latitude=1.29, longitude=103.86),
    ]

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Bad" in text:
            raise RuntimeError("Places search returned no candidates")
        return _make_resolution("good_place", "Good Place")

    mock_client = MagicMock()
    mock_client._search_place_by_text.side_effect = fake_search
    mock_client._search_place_nearby.side_effect = RuntimeError("Nearby search also failed")
    _setup_overrides(sb, places_client=mock_client)

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc"},
            )
            assert r.status_code == 200
            data = r.json()
            assert data["imported_count"] == 1
            assert data["failed_count"] == 1
            assert "Places API lookup failed" in data["failed"][0]["detail"]
        finally:
            app.dependency_overrides.clear()


def test_import_scraper_captcha_error(client: TestClient):
    """Scraper raises CAPTCHA error → 400."""
    sb = _mock_supabase()
    _setup_overrides(sb, places_client=MagicMock())

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(
            side_effect=GoogleListParseError("Google returned a CAPTCHA")
        )

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc"},
            )
            assert r.status_code == 400
            # Error messages are now sanitized — raw exception text is not
            # forwarded to the client.  Just verify we get a user-facing message.
            assert "Failed to parse" in r.json()["detail"]
        finally:
            app.dependency_overrides.clear()


def test_import_passes_notes_to_db(client: TestClient):
    """User notes from the Google list are stored in the location note field."""
    _inserted_rows = []
    sb = _mock_supabase()

    # Patch the locations table insert to capture rows
    _orig_table = sb.table.side_effect

    def _table_with_capture(name):
        t = _orig_table(name)
        if name == "locations":

            def _capturing_insert(data):
                _inserted_rows.extend(data)
                m = MagicMock()
                m.execute.return_value = MagicMock(data=data)
                return m

            t.insert.side_effect = _capturing_insert
        return t

    sb.table.side_effect = _table_with_capture

    scraped = [
        ScrapedPlace(name="Café Pierre", latitude=48.86, longitude=2.34, note="Best macarons"),
        ScrapedPlace(name="No Note Place", latitude=48.87, longitude=2.35),
    ]

    def fake_search(text, *, latitude=None, longitude=None, radius_m=None):
        if "Pierre" in text:
            return _make_resolution("place_1", "Café Pierre Hermé")
        return _make_resolution("place_2", "No Note Place")

    mock_client = MagicMock()
    mock_client._search_place_by_text.side_effect = fake_search
    _setup_overrides(sb, places_client=mock_client)

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc"},
            )
            assert r.status_code == 200
            assert r.json()["imported_count"] == 2

            # Verify that the rows passed to .insert() contain the note field.
            # The mock creates fresh objects per sb.table() call, so we
            # capture insert args via the side_effect recorder instead.
            inserted_rows = _inserted_rows
            assert inserted_rows[0]["note"] == "Best macarons"
            assert inserted_rows[1]["note"] is None
        finally:
            app.dependency_overrides.clear()


def test_import_deduplicates_within_batch(client: TestClient):
    """If two scraped places resolve to the same place_id, only import once."""
    sb = _mock_supabase()

    scraped = [
        ScrapedPlace(name="Same Place", latitude=1.28, longitude=103.85),
        ScrapedPlace(name="Same Place Again", latitude=1.28, longitude=103.85),
    ]

    mock_client = MagicMock()
    mock_client._search_place_by_text.return_value = _make_resolution("same_id", "Same Place")
    _setup_overrides(sb, places_client=mock_client)

    with patch("backend.app.routers.trip_locations.GoogleListScraper") as MockScraper:
        scraper_instance = MockScraper.return_value
        scraper_instance.extract_places = AsyncMock(return_value=scraped)

        try:
            r = client.post(
                f"/api/v1/trips/{TRIP_ID}/locations/import-google-list",
                json={"google_list_url": "https://maps.app.goo.gl/abc"},
            )
            assert r.status_code == 200
            data = r.json()
            assert data["imported_count"] == 1
            assert data["existing_count"] == 1  # second place deduped
        finally:
            app.dependency_overrides.clear()
