"""Tests for POST /api/v1/locations/google/preview."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.clients.google_places import GooglePlacesClient, PlaceResolution
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.main import app


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
            website="https://www.louvre.fr/en",
            formatted_phone_number="+33 1 40 20 50 50",
            opening_hours_text=[
                "Monday: Closed",
                "Tuesday: 9:00 AM - 6:00 PM",
            ],
            photos=[],
            raw={"result": {"place_id": "ChIJCzYy5IS16lQRQrfeQ5K5Oxw"}, "status": "OK"},
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
        assert data["google_raw"]["status"] == "OK"
        # Category suggestion from types
        assert data["suggested_category"] == "Museum"
    finally:
        app.dependency_overrides.clear()


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
