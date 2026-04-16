"""Tests for POST /api/v1/locations/google/preview."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.clients.google_places import GooglePlacesClient, PlaceResolution
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.main import app
from backend.app.routers.locations_google import _resolve_city


def _make_resolution(
    name: str,
    address: str | None,
    types: list[str],
) -> PlaceResolution:
    return PlaceResolution(
        place_id="ChIJ_test",
        name=name,
        formatted_address=address,
        latitude=None,
        longitude=None,
        types=types,
        first_photo_resource=None,
    )


def test_resolve_city_uses_place_name_when_place_is_locality():
    """A place that IS itself a town/locality should have its name as the city.

    Regression: "https://maps.app.goo.gl/QkaGUPJVJdVxsSuc8" (Étretat) used to
    return 'France' as the city because the 2-part fallback took parts[-1].
    """
    resolved = _make_resolution(
        name="Étretat",
        address="Étretat, France",
        types=["locality", "political"],
    )
    assert _resolve_city(resolved) == "Étretat"


def test_resolve_city_handles_sublocality_places():
    """Sublocalities (neighborhoods) should also resolve to the place name."""
    resolved = _make_resolution(
        name="Le Marais",
        address="Le Marais, 75004 Paris, France",
        types=["sublocality", "political"],
    )
    assert _resolve_city(resolved) == "Le Marais"


def test_resolve_city_falls_back_to_address_for_venues():
    """Venues (not localities) should still parse the city from the address.

    This pins the existing behavior for Victoria Peak (Hong Kong city-state)
    so the locality fix does not regress the 2-part city-state case.
    """
    resolved = _make_resolution(
        name="Victoria Peak",
        address="Victoria Peak, Hong Kong",
        types=["tourist_attraction", "point_of_interest"],
    )
    assert _resolve_city(resolved) == "Hong Kong"


def test_resolve_city_3part_venue_address_still_uses_postcode_strip():
    """A restaurant in a normal city should still extract the city correctly."""
    resolved = _make_resolution(
        name="Le Jules Verne",
        address="Av. Gustave Eiffel, 75007 Paris, France",
        types=["restaurant", "food"],
    )
    assert _resolve_city(resolved) == "Paris"


def test_resolve_city_returns_none_when_nothing_to_infer():
    """No address, no locality types → city is None."""
    resolved = _make_resolution(name="Something", address=None, types=["point_of_interest"])
    assert _resolve_city(resolved) is None


def test_resolve_city_2part_with_postcode_in_first_segment():
    """Venue in a small town: address = '<postcode> <town>, <country>'.

    Regression: https://maps.app.goo.gl/PYTXY3GAzAT97cfQ8 (Château de
    Chenonceau) returned ``formatted_address='37150 Chenonceaux, France'`` with
    venue types. The old 2-part fallback took parts[-1] = 'France'. The
    postcode-prefix in parts[0] is the signal that the first segment carries
    the city name.
    """
    resolved = _make_resolution(
        name="Château de Chenonceau",
        address="37150 Chenonceaux, France",
        types=["tourist_attraction", "landmark", "point_of_interest"],
    )
    assert _resolve_city(resolved) == "Chenonceaux"


def test_extract_city_2part_postcode_prefix():
    """Unit test for the 2-part postcode-prefix branch of _extract_city."""
    from backend.app.routers.locations_google import _extract_city

    assert _extract_city("37150 Chenonceaux, France") == "Chenonceaux"
    assert _extract_city("76790 Étretat, France") == "Étretat"
    # City-state case must still work (postcode in the LAST segment)
    assert _extract_city("Pl. du Casino, 98000 Monaco") == "Monaco"
    # No postcode anywhere: existing 2-part fallback uses parts[-1]
    assert _extract_city("Victoria Peak, Hong Kong") == "Hong Kong"


class _DummySupabase:
    def table(self, name):  # pragma: no cover - preview does not touch DB
        raise AssertionError(f"Preview should not access table {name}")


def _override_auth_and_supabase(client: TestClient, user_id):
    async def override_user():
        return user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: _DummySupabase()


def test_preview_location_from_google_link_returns_200(client: TestClient, monkeypatch):
    """Valid google_link and mocked Google client -> 200 with normalized fields and raw JSON."""
    user_id = uuid4()
    _override_auth_and_supabase(client, user_id)

    def fake_resolve_from_link(_link: str) -> PlaceResolution:
        return PlaceResolution(
            place_id="ChIJCzYy5IS16lQRQrfeQ5K5Oxw",
            name="Louvre Museum",
            formatted_address="Rue de Rivoli, 75001 Paris, France",
            latitude=48.8606111,
            longitude=2.337644,
            types=["museum", "tourist_attraction"],
            first_photo_resource="places/ChIJCzYy5IS16lQR/photos/AXCi2Q6abc",
        )

    class FakeClient:
        def resolve_from_link(self, _link: str) -> PlaceResolution:
            return fake_resolve_from_link(_link)

    app.dependency_overrides[get_google_places_client] = lambda: FakeClient()
    try:
        r = client.post(
            "/api/v1/locations/google/preview",
            json={"google_link": "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Louvre Museum"
        assert data["address"].startswith("Rue de Rivoli")
        assert data["google_place_id"] == "ChIJCzYy5IS16lQRQrfeQ5K5Oxw"
        assert data["photo_resource_name"] == "places/ChIJCzYy5IS16lQR/photos/AXCi2Q6abc"
        # Category suggestion from types
        assert data["suggested_category"] == "Museum"
        # Enterprise-tier fields must not be present in the response:
        # they were removed to keep Google Places billing in the Essentials SKU.
        assert "working_hours" not in data
        assert "website" not in data
        assert "phone" not in data
    finally:
        app.dependency_overrides.clear()


def test_field_masks_contain_no_enterprise_fields():
    """Regression: Google Places v1 bills at the Enterprise SKU whenever the
    field mask asks for ``websiteUri``, ``nationalPhoneNumber``, or
    ``regularOpeningHours.*``. We keep all three Places client call sites off
    the Enterprise SKU.

    Implementation note: we parse ``google_places.py`` with :mod:`ast`, walk
    every string constant, split each on commas (the field-mask delimiter),
    and check each token. This catches Enterprise fields at **any position**
    in a comma-separated mask — not just the first — and ignores mentions
    inside docstrings whose tokens don't look like field-mask fragments.
    Docstrings still contain these words for explanation; we filter those
    out by requiring the enclosing string to look like a field mask (no
    whitespace, at least one recognized Places field token).
    """
    import ast
    import inspect

    from backend.app.clients import google_places as gp

    forbidden = {"websiteUri", "nationalPhoneNumber", "regularOpeningHours"}
    # Any field known to appear in a legitimate Places field mask. A string
    # literal is treated as a field mask only if it contains one of these;
    # docstrings containing `websiteUri` in prose won't match because they
    # also contain spaces and prose words.
    mask_signal_fields = {
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "photos",
        "addressComponents",
        "viewport",
    }

    tree = ast.parse(inspect.getsource(gp))
    offenders: list[str] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
            continue
        value = node.value
        # A field mask has no whitespace and is a CSV of tokens.
        if " " in value or "\n" in value or "\t" in value:
            continue
        tokens = [t.strip() for t in value.split(",") if t.strip()]
        if not tokens:
            continue
        bare_tokens = [t.removeprefix("places.").split(".")[0] for t in tokens]
        if not (set(bare_tokens) & mask_signal_fields):
            continue
        # This string is shaped like a field mask. Fail if any forbidden
        # field appears at any position.
        bad_in_this_mask = [b for b in bare_tokens if b in forbidden]
        if bad_in_this_mask:
            offenders.append(f"{sorted(set(bad_in_this_mask))} in {value!r}")

    assert not offenders, (
        "Enterprise-tier field(s) found in a Google Places field mask in "
        "google_places.py — every Places request including these fields is "
        "billed at Enterprise rates ($20-35/1k):\n  " + "\n  ".join(offenders)
    )


def test_follow_redirects_stops_at_google_maps_url():
    """_follow_redirects_if_needed must stop at google.com/maps and NOT follow the
    next redirect (e.g. /sorry/index 429), so the parsed URL stays parseable."""
    maps_long_url = (
        "https://www.google.com/maps/place/Jingui+Tea+Market/"
        "@23.1035561,113.2143243,14z/data=!4m6!3m5"
        "!1s0x340257d8216a59a9:0x1df111d583326185"
        "!8m2!3d23.1035643!4d113.2271038"
    )
    sorry_url = "https://www.google.com/sorry/index?continue=..."

    def _make_response(url):
        resp = MagicMock()
        if "maps.app.goo.gl" in url:
            resp.status_code = 302
            resp.headers = {"location": maps_long_url}
        elif "google.com/maps" in url:
            # Simulate Google redirecting to the CAPTCHA page
            resp.status_code = 302
            resp.headers = {"location": sorry_url}
        else:
            resp.status_code = 200
            resp.headers = {}
        return resp

    with patch("backend.app.clients.google_places.GooglePlacesClient.__init__", return_value=None):
        client = GooglePlacesClient.__new__(GooglePlacesClient)
        client._http = MagicMock()
        client._http.get.side_effect = lambda url, **_kw: _make_response(url)

        result = client._follow_redirects_if_needed("https://maps.app.goo.gl/mWqZjbYLsLiZFfFK9")

    # Must stop at the Maps URL, never reaching /sorry/
    assert "google.com/maps" in result
    assert "sorry" not in result


def test_preview_returns_place_name_as_city_when_place_is_a_town(client: TestClient, monkeypatch):
    """End-to-end: resolving an Étretat-style link should return city='Étretat'."""
    user_id = uuid4()
    _override_auth_and_supabase(client, user_id)

    class FakeClient:
        def resolve_from_link(self, _link: str) -> PlaceResolution:
            return PlaceResolution(
                place_id="ChIJ_etretat",
                name="Étretat",
                formatted_address="Étretat, France",
                latitude=49.7072,
                longitude=0.2036,
                types=["locality", "political"],
                first_photo_resource=None,
            )

    app.dependency_overrides[get_google_places_client] = lambda: FakeClient()
    try:
        r = client.post(
            "/api/v1/locations/google/preview",
            json={"google_link": "https://maps.app.goo.gl/QkaGUPJVJdVxsSuc8"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Étretat"
        # Before the fix, this was 'France' (the country). It must be the town.
        assert data["city"] == "Étretat"
    finally:
        app.dependency_overrides.clear()


def test_preview_location_missing_google_link_returns_422(client: TestClient, monkeypatch):
    """Missing google_link -> 422."""
    user_id = uuid4()
    _override_auth_and_supabase(client, user_id)

    # Provide a dummy client; the handler should reject empty links before using it
    class DummyClient:
        def resolve_from_link(self, _link: str):
            raise AssertionError("resolve_from_link should not be called for empty link")

    app.dependency_overrides[get_google_places_client] = lambda: DummyClient()
    try:
        r = client.post("/api/v1/locations/google/preview", json={})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()
