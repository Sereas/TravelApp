"""Tests for POST /api/v1/locations/google/autocomplete and
POST /api/v1/locations/google/resolve (new typeahead endpoints).

Pattern mirrors test_locations_google_preview.py:
- FakeClient dependency-override
- app.dependency_overrides.clear() in every finally block
- _DummySupabase for DB isolation
- monkeypatch settings for kill-switch tests

These tests are in the RED phase: the endpoints do not exist yet.
Every test is expected to FAIL until the implementation lands.
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.clients.google_places import GooglePlacesDisabledError, PlaceResolution
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.main import app

# ---------------------------------------------------------------------------
# Shared constants — deterministic, no real UUIDs, no timing
# ---------------------------------------------------------------------------

VALID_SESSION_TOKEN = "abcdef1234567890abcdef"  # 22 alphanum chars
VALID_PLACE_ID = "ChIJ_abc123"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@dataclass
class AutocompleteSuggestion:
    """Mirrors the AutocompleteSuggestion dataclass that the implementation will define."""

    place_id: str
    main_text: str
    secondary_text: str | None
    types: list[str]


class _DummySupabase:
    """Supabase stub — autocomplete/resolve endpoints must not touch the DB
    directly (ownership is checked via quota RPC only).
    """

    def rpc(self, name, params=None):
        # bump_google_usage: return under-cap by default
        if name == "bump_google_usage":
            m = MagicMock()
            m.execute.return_value = MagicMock(data=True)
            return m
        raise AssertionError(f"Unexpected RPC call in test: {name!r}")

    def table(self, name):
        raise AssertionError(f"autocomplete/resolve should not access table {name!r} directly")


class _CapExceededSupabase:
    """Supabase stub that simulates bump_google_usage returning False (cap hit)."""

    def rpc(self, name, params=None):
        if name == "bump_google_usage":
            m = MagicMock()
            m.execute.return_value = MagicMock(data=False)
            return m
        raise AssertionError(f"Unexpected RPC call: {name!r}")

    def table(self, name):
        raise AssertionError(f"Should not access table {name!r}")


def _make_three_suggestions() -> list[AutocompleteSuggestion]:
    return [
        AutocompleteSuggestion(
            place_id="ChIJ_eiff1",
            main_text="Eiffel Tower",
            secondary_text="Paris, France",
            types=["tourist_attraction", "landmark"],
        ),
        AutocompleteSuggestion(
            place_id="ChIJ_eiff2",
            main_text="Eiffel Square",
            secondary_text="Lyon, France",
            types=["establishment"],
        ),
        AutocompleteSuggestion(
            place_id="ChIJ_eiff3",
            main_text="Eiffelstraße",
            secondary_text="Berlin, Germany",
            types=["route"],
        ),
    ]


def _make_resolution() -> PlaceResolution:
    return PlaceResolution(
        place_id=VALID_PLACE_ID,
        name="Eiffel Tower",
        formatted_address="Av. Gustave Eiffel, 75007 Paris, France",
        latitude=48.8584,
        longitude=2.2945,
        types=["tourist_attraction", "landmark"],
        first_photo_resource="places/ChIJ_abc123/photos/AXCi2Q6photo",
    )


def _override_auth_and_supabase(user_id, supabase=None):
    async def override_user():
        return user_id

    app.dependency_overrides[get_current_user_id] = override_user
    app.dependency_overrides[get_supabase_client] = lambda: (
        supabase if supabase is not None else _DummySupabase()
    )


# ---------------------------------------------------------------------------
# FakeClient for autocomplete — records calls for session_token assertions
# ---------------------------------------------------------------------------


class FakeAutocompleteClient:
    """Fake Places client that supports both autocomplete() and get_place_by_id()."""

    def __init__(self, suggestions=None, resolution=None):
        self._suggestions = suggestions or _make_three_suggestions()
        self._resolution = resolution or _make_resolution()
        # Records of actual call arguments for assertion
        self.autocomplete_calls: list[dict] = []
        self.get_place_by_id_calls: list[dict] = []

    def autocomplete(
        self,
        input: str,
        *,
        session_token: str | None = None,
        language: str | None = None,
        region: str | None = None,
        location_bias: dict | None = None,
    ) -> list[AutocompleteSuggestion]:
        self.autocomplete_calls.append(
            {
                "input": input,
                "session_token": session_token,
                "language": language,
                "region": region,
            }
        )
        return self._suggestions

    def get_place_by_id(
        self,
        place_id: str,
        *,
        session_token: str | None = None,
    ) -> PlaceResolution:
        self.get_place_by_id_calls.append(
            {
                "place_id": place_id,
                "session_token": session_token,
            }
        )
        return self._resolution

    def resolve_from_link(self, _link: str) -> PlaceResolution:
        # Should not be called by autocomplete/resolve endpoints
        raise AssertionError("resolve_from_link must not be called by typeahead endpoints")


# ===========================================================================
# POST /api/v1/locations/google/autocomplete
# ===========================================================================


class TestAutocomplete:
    """Tests for the new autocomplete endpoint."""

    def test_happy_path_returns_three_suggestions(self, client: TestClient):
        """Valid input + session_token -> 200 with three suggestions in correct shape."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        fake = FakeAutocompleteClient()
        app.dependency_overrides[get_google_places_client] = lambda: fake
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiff", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "suggestions" in data, "Response must have 'suggestions' key"
            assert len(data["suggestions"]) == 3, "Expected exactly 3 suggestions"
            for item in data["suggestions"]:
                assert "place_id" in item
                assert isinstance(item["place_id"], str)
                assert "main_text" in item
                assert isinstance(item["main_text"], str)
                assert "secondary_text" in item  # may be None
                assert "types" in item
                assert isinstance(item["types"], list)
        finally:
            app.dependency_overrides.clear()

    def test_happy_path_suggestion_content(self, client: TestClient):
        """Each suggestion carries the correct field values from the FakeClient."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        fake = FakeAutocompleteClient()
        app.dependency_overrides[get_google_places_client] = lambda: fake
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiff", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 200
            suggestions = r.json()["suggestions"]
            assert suggestions[0]["place_id"] == "ChIJ_eiff1"
            assert suggestions[0]["main_text"] == "Eiffel Tower"
            assert suggestions[0]["secondary_text"] == "Paris, France"
            assert "tourist_attraction" in suggestions[0]["types"]
        finally:
            app.dependency_overrides.clear()

    def test_422_on_empty_input(self, client: TestClient):
        """Empty string input must be rejected with 422 before hitting Places."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        class AssertNotCalledClient:
            def autocomplete(self, *a, **kw):
                raise AssertionError("autocomplete must not be called for empty input")

        app.dependency_overrides[get_google_places_client] = lambda: AssertNotCalledClient()
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"
        finally:
            app.dependency_overrides.clear()

    def test_422_on_session_token_too_short(self, client: TestClient):
        """session_token shorter than minimum length must be rejected with 422."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": "abc"},
            )
            assert r.status_code == 422, f"Expected 422 for too-short token, got {r.status_code}"
        finally:
            app.dependency_overrides.clear()

    def test_422_on_session_token_with_non_alphanum_chars(self, client: TestClient):
        """session_token containing non-alphanumeric characters must be rejected with 422."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        try:
            xss_token = "<!--xss-->aaaaaaaaaaaaaaaaaaaaaa"
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": xss_token},
            )
            assert r.status_code == 422, f"Expected 422 for non-alphanum token, got {r.status_code}"
        finally:
            app.dependency_overrides.clear()

    def test_503_when_places_client_raises_disabled_error(self, client: TestClient):
        """If get_google_places_client raises GooglePlacesDisabledError, return 503."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        def _raise_disabled():
            raise GooglePlacesDisabledError("GOOGLE_PLACES_API_KEY is not configured")

        app.dependency_overrides[get_google_places_client] = _raise_disabled
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, f"Expected 503, got {r.status_code}: {r.text}"
        finally:
            app.dependency_overrides.clear()

    def test_429_on_daily_cap_exceeded(self, client: TestClient):
        """When bump_google_usage RPC returns False (cap exceeded), return 429."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id, supabase=_CapExceededSupabase())
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 429, f"Expected 429 on cap exceeded, got {r.status_code}"
            detail = r.json().get("detail", "")
            assert (
                "daily" in detail.lower() or "quota" in detail.lower() or "cap" in detail.lower()
            ), f"Detail must mention the daily cap: {detail!r}"
        finally:
            app.dependency_overrides.clear()

    def test_503_when_google_apis_disabled_master_flag(self, client: TestClient, monkeypatch):
        """GOOGLE_APIS_DISABLED=true master flag -> 503 before any Places call."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        class ShouldNotBeCalledClient:
            def autocomplete(self, *a, **kw):
                raise AssertionError("Places must not be called when APIs are disabled")

        app.dependency_overrides[get_google_places_client] = lambda: ShouldNotBeCalledClient()
        monkeypatch.setenv("GOOGLE_APIS_DISABLED", "true")
        # Clear settings cache so monkeypatched env is picked up
        from backend.app.core.config import get_settings

        get_settings.cache_clear()
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, f"Expected 503, got {r.status_code}"
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()

    def test_503_when_google_autocomplete_disabled_granular_flag(
        self, client: TestClient, monkeypatch
    ):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true granular flag -> 503 for autocomplete."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        monkeypatch.setenv("GOOGLE_AUTOCOMPLETE_DISABLED", "true")
        from backend.app.core.config import get_settings

        get_settings.cache_clear()
        try:
            r = client.post(
                "/api/v1/locations/google/autocomplete",
                json={"input": "Eiffel", "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, f"Expected 503, got {r.status_code}"
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()


# ===========================================================================
# POST /api/v1/locations/google/resolve
# ===========================================================================


class TestResolve:
    """Tests for the new resolve endpoint."""

    def test_happy_path_returns_location_preview_shape(self, client: TestClient):
        """Valid place_id + session_token -> 200 with LocationPreviewResponse fields."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        fake = FakeAutocompleteClient()
        app.dependency_overrides[get_google_places_client] = lambda: fake
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "name" in data
            assert "address" in data
            assert "city" in data
            assert "latitude" in data
            assert "longitude" in data
            assert "google_place_id" in data
            assert "suggested_category" in data
            assert "photo_resource_name" in data
            assert data["name"] == "Eiffel Tower"
            assert data["google_place_id"] == VALID_PLACE_ID
            assert data["latitude"] == pytest.approx(48.8584)
            assert data["longitude"] == pytest.approx(2.2945)
            assert data["photo_resource_name"] == "places/ChIJ_abc123/photos/AXCi2Q6photo"
        finally:
            app.dependency_overrides.clear()

    def test_session_token_forwarded_to_get_place_by_id(self, client: TestClient):
        """Critical cost-contract: the session_token from the request body must be
        forwarded as a kwarg to get_place_by_id(). This is what makes all prior
        autocomplete calls retroactively FREE (Session Usage SKU vs per-request billing).
        """
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        fake = FakeAutocompleteClient()
        app.dependency_overrides[get_google_places_client] = lambda: fake
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 200, r.text
            assert len(fake.get_place_by_id_calls) == 1, (
                "get_place_by_id must be called exactly once"
            )
            call_kwargs = fake.get_place_by_id_calls[0]
            assert call_kwargs["session_token"] == VALID_SESSION_TOKEN, (
                f"session_token was not forwarded to get_place_by_id. "
                f"Got: {call_kwargs['session_token']!r}, "
                f"Expected: {VALID_SESSION_TOKEN!r}. "
                f"This means autocomplete calls will NOT be billed as Session Usage (FREE) "
                f"— they will be billed at $2.83/1000 per request instead."
            )
            assert call_kwargs["place_id"] == VALID_PLACE_ID
        finally:
            app.dependency_overrides.clear()

    def test_resolve_without_session_token_still_works(self, client: TestClient):
        """Omitting session_token (legacy / internal callers) must still return 200.
        FakeClient sees session_token=None.
        """
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        fake = FakeAutocompleteClient()
        app.dependency_overrides[get_google_places_client] = lambda: fake
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID},
            )
            assert r.status_code == 200, r.text
            assert len(fake.get_place_by_id_calls) == 1
            assert fake.get_place_by_id_calls[0]["session_token"] is None
        finally:
            app.dependency_overrides.clear()

    def test_422_on_bad_place_id_path_traversal(self, client: TestClient):
        """place_id containing path traversal chars must be rejected with 422."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={
                    "place_id": "../../etc/passwd",
                    "session_token": VALID_SESSION_TOKEN,
                },
            )
            assert r.status_code == 422, (
                f"Expected 422 for invalid place_id, got {r.status_code}: {r.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_400_on_google_client_error(self, client: TestClient):
        """If get_place_by_id raises a RuntimeError, endpoint must return 400."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        class ErrorClient:
            def get_place_by_id(self, place_id, *, session_token=None):
                raise RuntimeError("Google API returned 404 for place")

        app.dependency_overrides[get_google_places_client] = lambda: ErrorClient()
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 400, (
                f"Expected 400 on Places error, got {r.status_code}: {r.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_503_when_places_client_raises_disabled_error(self, client: TestClient):
        """If get_google_places_client raises GooglePlacesDisabledError, return 503."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        def _raise_disabled():
            raise GooglePlacesDisabledError("GOOGLE_PLACES_API_KEY is not configured")

        app.dependency_overrides[get_google_places_client] = _raise_disabled
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, f"Expected 503, got {r.status_code}: {r.text}"
        finally:
            app.dependency_overrides.clear()

    def test_429_on_daily_cap_exceeded(self, client: TestClient):
        """When bump_google_usage returns False for resolve endpoint, return 429."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id, supabase=_CapExceededSupabase())
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 429, f"Expected 429 on cap exceeded, got {r.status_code}"
            detail = r.json().get("detail", "")
            assert (
                "daily" in detail.lower() or "quota" in detail.lower() or "cap" in detail.lower()
            ), f"Detail must mention the daily cap: {detail!r}"
        finally:
            app.dependency_overrides.clear()

    def test_503_when_google_autocomplete_disabled_blocks_resolve_too(
        self, client: TestClient, monkeypatch
    ):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true must block /resolve because it and
        /autocomplete are two halves of the same UX. If the operator disables
        autocomplete mid-session, the paired resolve should also be blocked.
        """
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        monkeypatch.setenv("GOOGLE_AUTOCOMPLETE_DISABLED", "true")
        from backend.app.core.config import get_settings

        get_settings.cache_clear()
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, (
                f"Expected 503 when autocomplete is disabled (resolve is paired), "
                f"got {r.status_code}"
            )
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()

    def test_503_when_google_apis_disabled_master_flag(self, client: TestClient, monkeypatch):
        """GOOGLE_APIS_DISABLED=true must block /resolve."""
        user_id = uuid4()
        _override_auth_and_supabase(user_id)
        app.dependency_overrides[get_google_places_client] = lambda: FakeAutocompleteClient()
        monkeypatch.setenv("GOOGLE_APIS_DISABLED", "true")
        from backend.app.core.config import get_settings

        get_settings.cache_clear()
        try:
            r = client.post(
                "/api/v1/locations/google/resolve",
                json={"place_id": VALID_PLACE_ID, "session_token": VALID_SESSION_TOKEN},
            )
            assert r.status_code == 503, f"Expected 503, got {r.status_code}"
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()

    def test_preview_endpoint_not_blocked_by_autocomplete_disabled_flag(
        self, client: TestClient, monkeypatch
    ):
        """GOOGLE_AUTOCOMPLETE_DISABLED must NOT block the existing /preview endpoint.
        /preview is the URL-paste path; the granular flag is typeahead-only.
        """
        user_id = uuid4()
        _override_auth_and_supabase(user_id)

        class FakePreviewClient:
            def resolve_from_link(self, _link: str) -> PlaceResolution:
                return PlaceResolution(
                    place_id="ChIJ_preview",
                    name="Louvre",
                    formatted_address="Rue de Rivoli, 75001 Paris, France",
                    latitude=48.86,
                    longitude=2.34,
                    types=["museum"],
                    first_photo_resource=None,
                )

        app.dependency_overrides[get_google_places_client] = lambda: FakePreviewClient()
        monkeypatch.setenv("GOOGLE_AUTOCOMPLETE_DISABLED", "true")
        from backend.app.core.config import get_settings

        get_settings.cache_clear()
        try:
            r = client.post(
                "/api/v1/locations/google/preview",
                json={"google_link": "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"},
            )
            # /preview must still be reachable (200 or at most 400 for network issues,
            # never 503 from the autocomplete kill switch)
            assert r.status_code != 503, (
                "GOOGLE_AUTOCOMPLETE_DISABLED must not block /preview — "
                "that endpoint is the URL-paste path, not the typeahead path"
            )
        finally:
            app.dependency_overrides.clear()
            get_settings.cache_clear()
