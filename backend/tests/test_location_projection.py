"""Tests for services/location_projection.py — RED phase."""

from uuid import uuid4

import pytest

from backend.app.services.location_projection import (
    LOCATION_SUMMARY_COLUMNS,
    build_location_summary,
    enrich_locations_with_photos,
    select_locations,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_supabase_with_locations(locations: list[dict], photos: list[dict] | None = None):
    """Return a minimal mock supabase that serves given location/photo rows."""
    photos = photos or []

    class _Table:
        def __init__(self, rows):
            self._rows = rows
            self._trip_id = None
            self._loc_ids: list[str] | None = None
            self._in_called = False

        def select(self, *_):
            return self

        def eq(self, key, value):
            if key == "trip_id":
                self._trip_id = str(value)
            return self

        def in_(self, key, values):
            if key in ("location_id", "google_place_id"):
                self._in_called = True
                self._loc_ids = [str(v) for v in values]
            return self

        def execute(self):
            if self._loc_ids is not None:
                filtered = [
                    r
                    for r in self._rows
                    if str(r.get("location_id") or r.get("google_place_id")) in self._loc_ids
                ]
                return type("R", (), {"data": filtered})()
            if self._trip_id is not None:
                filtered = [r for r in self._rows if str(r.get("trip_id")) == self._trip_id]
                return type("R", (), {"data": filtered})()
            return type("R", (), {"data": self._rows})()

    class _MockSB:
        def __init__(self):
            self._execute_count = 0
            self._loc_table = _Table(locations)
            self._photo_table = _Table(photos)

        def table(self, name):
            self._execute_count += 1  # crude call counter
            if name == "place_photos":
                return self._photo_table
            return self._loc_table

    return _MockSB()


# ---------------------------------------------------------------------------
# LOCATION_SUMMARY_COLUMNS — single source of truth
# ---------------------------------------------------------------------------


def test_location_summary_columns_includes_lat_lng():
    """lat/lng must appear in the canonical column list."""
    assert "latitude" in LOCATION_SUMMARY_COLUMNS
    assert "longitude" in LOCATION_SUMMARY_COLUMNS


def test_location_summary_columns_includes_required_fields():
    required = {"id", "name", "city", "address", "category", "google_place_id", "user_image_url"}
    assert required.issubset(set(LOCATION_SUMMARY_COLUMNS))


# ---------------------------------------------------------------------------
# select_locations
# ---------------------------------------------------------------------------


def test_select_locations_by_trip_id():
    trip_id = str(uuid4())
    loc_id = str(uuid4())
    locations = [
        {
            "location_id": loc_id,
            "trip_id": trip_id,
            "name": "Louvre",
            "latitude": 48.8606,
            "longitude": 2.3376,
            "google_place_id": None,
            "user_image_url": None,
        }
    ]
    sb = _make_supabase_with_locations(locations)
    result = select_locations(sb, trip_id=trip_id)
    assert len(result) == 1
    assert result[0]["name"] == "Louvre"
    assert result[0]["latitude"] == 48.8606
    assert result[0]["longitude"] == 2.3376


def test_select_locations_by_location_ids():
    trip_id = str(uuid4())
    loc_id_a = str(uuid4())
    loc_id_b = str(uuid4())
    locations = [
        {
            "location_id": loc_id_a,
            "trip_id": trip_id,
            "name": "A",
            "latitude": 1.0,
            "longitude": 2.0,
        },
        {
            "location_id": loc_id_b,
            "trip_id": trip_id,
            "name": "B",
            "latitude": 3.0,
            "longitude": 4.0,
        },
    ]
    sb = _make_supabase_with_locations(locations)
    result = select_locations(sb, location_ids=[loc_id_a])
    assert len(result) == 1
    assert result[0]["name"] == "A"


def test_select_locations_raises_if_neither_arg():
    sb = _make_supabase_with_locations([])
    with pytest.raises(ValueError, match="exactly one"):
        select_locations(sb)


def test_select_locations_raises_if_both_args():
    sb = _make_supabase_with_locations([])
    with pytest.raises(ValueError, match="exactly one"):
        select_locations(sb, trip_id="tid", location_ids=["lid"])


def test_select_locations_returns_empty_list_when_no_rows():
    trip_id = str(uuid4())
    sb = _make_supabase_with_locations([])
    result = select_locations(sb, trip_id=trip_id)
    assert result == []


# ---------------------------------------------------------------------------
# enrich_locations_with_photos
# ---------------------------------------------------------------------------


def test_enrich_locations_with_photos_injects_image_url():
    loc_id = str(uuid4())
    gp_id = "ChIJ123"
    locations = [
        {"location_id": loc_id, "google_place_id": gp_id, "name": "Louvre"},
    ]
    photos = [
        {
            "google_place_id": gp_id,
            "photo_url": "https://cdn.example.com/photo.jpg",
            "attribution_name": "Wikimedia",
            "attribution_uri": "https://wikimedia.org",
        }
    ]
    sb = _make_supabase_with_locations(locations, photos)
    locations_by_id = {loc_id: locations[0]}
    enrich_locations_with_photos(sb, locations_by_id)
    row = locations_by_id[loc_id]
    assert row["image_url"] == "https://cdn.example.com/photo.jpg"
    assert row["attribution_name"] == "Wikimedia"
    assert row["attribution_uri"] == "https://wikimedia.org"


def test_enrich_locations_single_query_no_n_plus_one():
    """Must issue exactly ONE query regardless of how many locations have a google_place_id."""
    locs = {str(uuid4()): {"google_place_id": f"gp_{i}", "name": f"Loc {i}"} for i in range(5)}
    execute_count = 0

    class _Table:
        def select(self, *_):
            return self

        def in_(self, *_):
            return self

        def execute(self):
            nonlocal execute_count
            execute_count += 1
            return type("R", (), {"data": []})()

    class _SB:
        def table(self, name):
            return _Table()

    enrich_locations_with_photos(_SB(), locs)
    # Only ONE DB round-trip allowed
    assert execute_count == 1


def test_enrich_locations_no_query_when_no_place_ids():
    """Skip DB call entirely when no locations have a google_place_id."""
    execute_count = 0

    class _Table:
        def execute(self):
            nonlocal execute_count
            execute_count += 1
            return type("R", (), {"data": []})()

    class _SB:
        def table(self, name):
            return _Table()

    locs = {str(uuid4()): {"google_place_id": None, "name": "X"}}
    enrich_locations_with_photos(_SB(), locs)
    assert execute_count == 0


def test_enrich_locations_null_image_url_when_no_photo():
    loc_id = str(uuid4())
    locs = {loc_id: {"google_place_id": "gp_missing", "name": "NoPhoto"}}
    # photos table returns empty
    sb = _make_supabase_with_locations([], photos=[])
    enrich_locations_with_photos(sb, locs)
    assert locs[loc_id]["image_url"] is None
    assert locs[loc_id]["attribution_name"] is None


# ---------------------------------------------------------------------------
# build_location_summary
# ---------------------------------------------------------------------------


def test_build_location_summary_full_row():
    loc_id = str(uuid4())
    row = {
        "name": "Eiffel Tower",
        "city": "Paris",
        "address": "Champ de Mars",
        "google_link": "https://maps.google.com/...",
        "category": "Viewpoint",
        "note": "Iconic",
        "working_hours": "9-22",
        "requires_booking": "yes",
        "image_url": "https://cdn.example.com/eiffel.jpg",
        "user_image_url": None,
        "attribution_name": "Wikimedia",
        "attribution_uri": "https://wikimedia.org",
        "latitude": 48.8584,
        "longitude": 2.2945,
        "google_place_id": "ChIJabc",
    }
    summary = build_location_summary(row, loc_id)
    assert summary.id == loc_id
    assert summary.name == "Eiffel Tower"
    assert summary.city == "Paris"
    assert summary.latitude == 48.8584
    assert summary.longitude == 2.2945
    assert summary.image_url == "https://cdn.example.com/eiffel.jpg"
    assert summary.attribution_name == "Wikimedia"


def test_build_location_summary_none_row_returns_stub():
    loc_id = str(uuid4())
    summary = build_location_summary(None, loc_id)
    assert summary.id == loc_id
    assert summary.name == ""
    assert summary.latitude is None
    assert summary.longitude is None


def test_build_location_summary_missing_lat_lng_returns_none():
    loc_id = str(uuid4())
    row = {"name": "NoCoords", "city": None}
    summary = build_location_summary(row, loc_id)
    assert summary.latitude is None
    assert summary.longitude is None
