"""Tests for services/google_list_import.py — RED phase."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.app.services.google_list_import import (
    EnrichingItem,
    ImportComplete,
    ImportError,
    SavingStarted,
    ScrapingStarted,
    import_google_list_iter,
)

# ---------------------------------------------------------------------------
# Helpers / stubs
# ---------------------------------------------------------------------------


@dataclass
class _FakePlace:
    name: str | None
    latitude: float
    longitude: float
    note: str | None = None


@dataclass
class _FakeResolved:
    name: str
    place_id: str
    formatted_address: str | None
    latitude: float
    longitude: float
    first_photo_resource: str | None
    types: list
    opening_hours_text: list


def _fake_resolved(name: str, place_id: str) -> _FakeResolved:
    return _FakeResolved(
        name=name,
        place_id=place_id,
        formatted_address=f"{name} Addr",
        latitude=48.0 + len(name),
        longitude=2.0 + len(name),
        first_photo_resource=None,
        types=["restaurant"],
        opening_hours_text=[],
    )


def _make_supabase(trip_id: str, existing_place_ids: list[str] | None = None):
    """Minimal supabase mock for import service tests."""
    existing = existing_place_ids or []
    inserted_rows: list[dict] = []

    class _LocTable:
        def __init__(self):
            self._trip_id = None
            self._is_insert = False
            self._rows: list[dict] = []

        def select(self, *_):
            return self

        def eq(self, key, val):
            if key == "trip_id":
                self._trip_id = str(val)
            return self

        def insert(self, rows):
            if isinstance(rows, list):
                self._rows = rows
            else:
                self._rows = [rows]
            self._is_insert = True
            return self

        def execute(self):
            if self._is_insert:
                out = []
                for r in self._rows:
                    row = dict(r)
                    row["location_id"] = str(uuid4())
                    inserted_rows.append(row)
                    out.append(row)
                return type("R", (), {"data": out})()
            # select google_place_id
            return type("R", (), {"data": [{"google_place_id": p} for p in existing]})()

    class _EmptyTable:
        def select(self, *_):
            return self

        def in_(self, *_):
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class _SB:
        def table(self, name):
            if name == "locations":
                return _LocTable()
            return _EmptyTable()

    return _SB(), inserted_rows


def _make_places_client(resolutions: dict[str, _FakeResolved]):
    """Fake google places client; keyed by place name."""
    client = MagicMock()

    def _text_search(name, **kwargs):
        if name in resolutions:
            return resolutions[name]
        raise ValueError(f"No mock for {name}")

    client._search_place_by_text.side_effect = _text_search
    client._search_place_nearby.side_effect = lambda lat, lng: None
    client._is_coordinate_style_place_slug = lambda n: False

    return client


async def _collect(gen: AsyncIterator) -> list:
    events = []
    async for event in gen:
        events.append(event)
    return events


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_yields_scraping_started_first():
    """First event must always be ScrapingStarted."""
    trip_id = str(uuid4())
    user_id = str(uuid4())
    sb, _ = _make_supabase(trip_id)
    pc = _make_places_client({})

    async def _empty_extract(url):
        return []

    with patch(
        "backend.app.services.google_list_import.GoogleListScraper"
    ) as MockScraper:
        MockScraper.return_value.extract_places = _empty_extract
        gen = import_google_list_iter(
            sb, pc, trip_id=trip_id, user_id=user_id, user_email=None, url="https://maps.google.com/x"
        )
        first = await gen.__anext__()
    assert isinstance(first, ScrapingStarted)


@pytest.mark.asyncio
async def test_import_happy_path_event_sequence():
    """Full happy path: scraping started/done, enriching per place, saving, complete."""
    trip_id = str(uuid4())
    user_id = str(uuid4())
    places = [
        _FakePlace("Louvre", 48.86, 2.33),
        _FakePlace("Eiffel Tower", 48.85, 2.29),
    ]
    resolutions = {
        "Louvre": _fake_resolved("Louvre Museum", "gp_louvre"),
        "Eiffel Tower": _fake_resolved("Eiffel Tower", "gp_eiffel"),
    }
    sb, inserted = _make_supabase(trip_id)
    pc = _make_places_client(resolutions)

    async def _fake_extract(url):
        return places

    with patch(
        "backend.app.services.google_list_import.GoogleListScraper"
    ) as MockScraper:
        MockScraper.return_value.extract_places = _fake_extract
        events = await _collect(
            import_google_list_iter(
                sb, pc, trip_id=trip_id, user_id=user_id, user_email="u@test.com", url="https://maps.google.com/x"
            )
        )

    types = [type(e).__name__ for e in events]
    assert types[0] == "ScrapingStarted"
    assert types[1] == "ScrapingDone"
    # At least 2 EnrichingItem events
    enriching = [e for e in events if isinstance(e, EnrichingItem)]
    assert len(enriching) == 2
    saving = [e for e in events if isinstance(e, SavingStarted)]
    assert len(saving) == 1
    complete = [e for e in events if isinstance(e, ImportComplete)]
    assert len(complete) == 1
    assert complete[0].inserted  # at least one inserted
    # Both locations persisted to DB
    assert len(inserted) == 2


@pytest.mark.asyncio
async def test_import_deduplicates_existing_place_ids():
    """Places already in the trip must not be re-inserted."""
    trip_id = str(uuid4())
    user_id = str(uuid4())
    existing_gp = "gp_existing"
    places = [_FakePlace("Existing Place", 48.86, 2.33)]
    resolutions = {"Existing Place": _fake_resolved("Existing Place", existing_gp)}
    sb, inserted = _make_supabase(trip_id, existing_place_ids=[existing_gp])
    pc = _make_places_client(resolutions)

    async def _fake_extract(url):
        return places

    with patch(
        "backend.app.services.google_list_import.GoogleListScraper"
    ) as MockScraper:
        MockScraper.return_value.extract_places = _fake_extract
        events = await _collect(
            import_google_list_iter(
                sb, pc, trip_id=trip_id, user_id=user_id, user_email=None, url="https://maps.google.com/x"
            )
        )

    complete = next(e for e in events if isinstance(e, ImportComplete))
    assert complete.inserted == []
    assert len(complete.skipped) == 1
    assert len(inserted) == 0


@pytest.mark.asyncio
async def test_import_yields_import_error_on_scrape_failure():
    """GoogleListParseError from scraper → ImportError event."""
    from backend.app.clients.google_places import GoogleListParseError

    trip_id = str(uuid4())
    sb, _ = _make_supabase(trip_id)
    pc = _make_places_client({})

    async def _fail_extract(url):
        raise GoogleListParseError("CAPTCHA blocked")

    with patch(
        "backend.app.services.google_list_import.GoogleListScraper"
    ) as MockScraper:
        MockScraper.return_value.extract_places = _fail_extract
        events = await _collect(
            import_google_list_iter(
                sb, pc, trip_id=trip_id, user_id=str(uuid4()), user_email=None, url="https://maps.google.com/x"
            )
        )

    assert any(isinstance(e, ImportError) for e in events)
    assert not any(isinstance(e, ImportComplete) for e in events)


@pytest.mark.asyncio
async def test_import_single_batch_insert():
    """All new locations must go in ONE batch INSERT, not per-item inserts."""
    trip_id = str(uuid4())
    user_id = str(uuid4())
    places = [_FakePlace(f"Place {i}", float(i), float(i)) for i in range(4)]
    resolutions = {
        f"Place {i}": _fake_resolved(f"Place {i}", f"gp_{i}") for i in range(4)
    }
    insert_call_count = 0

    class _CountingLocTable:
        def __init__(self):
            self._rows = []
            self._is_insert = False

        def select(self, *_):
            return self

        def eq(self, *_):
            return self

        def insert(self, rows):
            nonlocal insert_call_count
            insert_call_count += 1
            self._rows = rows if isinstance(rows, list) else [rows]
            self._is_insert = True
            return self

        def execute(self):
            if self._is_insert:
                out = [dict(r, location_id=str(uuid4())) for r in self._rows]
                return type("R", (), {"data": out})()
            return type("R", (), {"data": []})()

    class _SB:
        def table(self, name):
            if name == "locations":
                return _CountingLocTable()
            return MagicMock(
                select=MagicMock(return_value=MagicMock(
                    in_=MagicMock(return_value=MagicMock(
                        execute=MagicMock(return_value=type("R", (), {"data": []})())
                    ))
                ))
            )

    pc = _make_places_client(resolutions)

    async def _fake_extract(url):
        return places

    with patch(
        "backend.app.services.google_list_import.GoogleListScraper"
    ) as MockScraper:
        MockScraper.return_value.extract_places = _fake_extract
        await _collect(
            import_google_list_iter(
                _SB(), pc, trip_id=trip_id, user_id=user_id, user_email=None, url="https://maps.google.com/x"
            )
        )

    # Only one batch INSERT call (not 4)
    assert insert_call_count == 1
