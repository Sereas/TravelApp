"""Unit tests for GooglePlacesClient URL parsing (no live API calls)."""

from backend.app.clients.google_places import GooglePlacesClient


def test_coordinate_style_slug_detection() -> None:
    assert GooglePlacesClient._is_coordinate_style_place_slug("45°49'40.9\"N 6°12'01.0\"E")
    assert GooglePlacesClient._is_coordinate_style_place_slug(
        "45\u00b049'40.9\"N+6\u00b012'01.0\"E".replace("+", " ")
    )
    assert not GooglePlacesClient._is_coordinate_style_place_slug("Din Tai Fung")
    assert not GooglePlacesClient._is_coordinate_style_place_slug("")


def test_extract_name_coords_from_dms_place_url() -> None:
    """Maps links for dropped pins use DMS in /place/ but embed !3d!4d pin coords."""
    url = (
        "https://www.google.com/maps/place/45%C2%B049'40.9%22N+6%C2%B012'01.0%22E/"
        "@45.8278805,6.199364,18.34z/data=!4m4!3m3!8m2!3d45.8280154!4d6.2002634"
    )
    client = GooglePlacesClient.__new__(GooglePlacesClient)
    name, lat, lng = client._extract_name_and_location_from_url(url)
    assert name is not None
    assert GooglePlacesClient._is_coordinate_style_place_slug(name)
    assert lat is not None and lng is not None
    assert abs(lat - 45.8280154) < 1e-6
    assert abs(lng - 6.2002634) < 1e-6


def test_truncate_text_query_utf8() -> None:
    s = "a" * 100 + "é" * 100  # é is 2 bytes in UTF-8
    out = GooglePlacesClient._truncate_text_query(s, max_bytes=256)
    assert len(out.encode("utf-8")) <= 256
    assert out  # non-empty prefix
