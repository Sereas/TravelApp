"""Live integration tests for Google Places client.

These tests make REAL calls to the Google Places API and require
GOOGLE_PLACES_API_KEY to be set. They are skipped when the key is absent.
"""

import os

import pytest

from backend.app.clients.google_places import GooglePlacesClient

pytestmark = pytest.mark.skipif(
    not os.environ.get("GOOGLE_PLACES_API_KEY"),
    reason="GOOGLE_PLACES_API_KEY not set",
)

TEST_LINK = "https://maps.app.goo.gl/m42uZygTpKWywZx78"


@pytest.fixture(scope="module")
def client():
    c = GooglePlacesClient(os.environ["GOOGLE_PLACES_API_KEY"])
    yield c
    c.close()


def test_resolve_short_link_returns_place_data(client: GooglePlacesClient):
    """Short maps.app.goo.gl link → resolves to a real place with name, coords, types."""
    result = client.resolve_from_link(TEST_LINK)

    assert result.place_id, "place_id must not be empty"
    assert result.name, "name must not be empty"
    assert result.latitude is not None
    assert result.longitude is not None
    assert 43.0 < result.latitude < 44.0, "latitude should be in southern France"
    assert 6.5 < result.longitude < 7.5, "longitude should be near Cannes"
    assert len(result.types) > 0, "types must not be empty"


def test_resolve_short_link_returns_opening_hours(client: GooglePlacesClient):
    """The resolved place should include opening hours text."""
    result = client.resolve_from_link(TEST_LINK)

    assert len(result.opening_hours_text) == 7, "should have 7 weekday descriptions"
    assert any("AM" in h or "PM" in h or "Closed" in h for h in result.opening_hours_text)


def test_resolve_short_link_returns_formatted_address(client: GooglePlacesClient):
    """Address should contain Cannes and France."""
    result = client.resolve_from_link(TEST_LINK)

    assert result.formatted_address is not None
    addr_lower = result.formatted_address.lower()
    assert "cannes" in addr_lower
    assert "france" in addr_lower


def test_url_parsing_extracts_name_and_coords(client: GooglePlacesClient):
    """The URL parser should extract name and lat/lng from a long Maps URL."""
    long_url = client._follow_redirects_if_needed(TEST_LINK)
    name, lat, lng = client._extract_name_and_location_from_url(long_url)

    assert name is not None, "name should be extracted from URL"
    assert lat is not None and lng is not None, "lat/lng should be extracted"
    assert 43.0 < lat < 44.0
    assert 6.5 < lng < 7.5


def test_category_mapping_for_restaurant():
    """Restaurant types should map to 'Restaurant' category."""
    from backend.app.routers.locations_google import _suggest_category

    assert _suggest_category(["restaurant", "food"]) == "Restaurant"
    assert _suggest_category(["seafood_restaurant", "food"]) == "Restaurant"
    assert _suggest_category(["museum"]) == "Museum"
    assert _suggest_category(["cafe"]) == "Café"
    assert _suggest_category(["unknown_type"]) is None


def test_city_extraction_strips_postcode():
    """City should be extracted from address without postcode."""
    from backend.app.routers.locations_google import _extract_city

    assert _extract_city("27 Rue Félix Faure, 06400 Cannes, France") == "Cannes"
    assert _extract_city("5 Av. Anatole France, 75007 Paris, France") == "Paris"
    assert _extract_city("Champ de Mars, Paris, France") == "Paris"
    assert _extract_city(None) is None


def test_working_hours_cleaning():
    """Hours should have Unicode spaces normalized and day names shortened."""
    from backend.app.routers.locations_google import _clean_working_hours

    raw = ["Monday: 11:00\u202fAM\u2009\u201311:00\u202fPM"]
    cleaned = _clean_working_hours(raw)
    assert cleaned == ["Mon: 11:00 AM-11:00 PM"]
    assert "\u202f" not in cleaned[0]
    assert "\u2009" not in cleaned[0]
