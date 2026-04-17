"""Tests for backend.app.services.place_detail_cache."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.clients.google_places import PlaceResolution
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.main import app
from backend.app.services.place_detail_cache import (
    lookup_cached_place,
    write_place_to_cache,
)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CACHED_ROW = {
    "google_place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
    "name": "Eiffel Tower",
    "formatted_address": "Av. Gustave Eiffel, 75007 Paris, France",
    "city": "Paris",
    "latitude": 48.8584,
    "longitude": 2.2945,
    "google_types": ["tourist_attraction", "landmark"],
    "suggested_category": "Viewpoint",
    "photo_resource_name": "places/ChIJD7fiBh9u5kcR/photos/AXCi2Q6abc",
}


def _make_supabase_mock(*, data=None):
    """Build a mock Supabase client that returns *data* for any table query."""
    mock = MagicMock()
    chain = mock.table.return_value.select.return_value.eq.return_value
    chain.execute.return_value = MagicMock(data=data)
    return mock


def _make_resolution(**overrides) -> PlaceResolution:
    defaults = {
        "place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ",
        "name": "Eiffel Tower",
        "formatted_address": "Av. Gustave Eiffel, 75007 Paris, France",
        "latitude": 48.8584,
        "longitude": 2.2945,
        "types": ["tourist_attraction", "landmark"],
        "first_photo_resource": "places/ChIJD7fiBh9u5kcR/photos/AXCi2Q6abc",
    }
    defaults.update(overrides)
    return PlaceResolution(**defaults)


# ---------------------------------------------------------------------------
# lookup_cached_place
# ---------------------------------------------------------------------------


class TestLookupCachedPlace:
    def test_cache_hit_returns_place_resolution(self):
        sb = _make_supabase_mock(data=[_CACHED_ROW])
        result = lookup_cached_place(sb, "ChIJD7fiBh9u5kcRYJSMaMOCCwQ")

        assert result is not None
        assert result.place_id == "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
        assert result.name == "Eiffel Tower"
        assert result.formatted_address == "Av. Gustave Eiffel, 75007 Paris, France"
        assert result.latitude == 48.8584
        assert result.longitude == 2.2945
        assert result.types == ["tourist_attraction", "landmark"]
        assert result.first_photo_resource == "places/ChIJD7fiBh9u5kcR/photos/AXCi2Q6abc"

    def test_cache_miss_returns_none(self):
        sb = _make_supabase_mock(data=[])
        result = lookup_cached_place(sb, "ChIJ_unknown")
        assert result is None

    def test_empty_place_id_returns_none_without_db_call(self):
        sb = MagicMock()
        assert lookup_cached_place(sb, "") is None
        assert lookup_cached_place(sb, None) is None
        sb.table.assert_not_called()

    def test_db_error_returns_none(self):
        sb = MagicMock()
        sb.table.side_effect = Exception("connection refused")
        result = lookup_cached_place(sb, "ChIJ_test")
        assert result is None

    def test_missing_optional_fields_still_works(self):
        row = {
            "google_place_id": "ChIJ_minimal",
            "name": "A Place",
            "formatted_address": None,
            "city": None,
            "latitude": None,
            "longitude": None,
            "google_types": [],
            "suggested_category": None,
            "photo_resource_name": None,
        }
        sb = _make_supabase_mock(data=[row])
        result = lookup_cached_place(sb, "ChIJ_minimal")
        assert result is not None
        assert result.name == "A Place"
        assert result.latitude is None
        assert result.types == []
        assert result.first_photo_resource is None


# ---------------------------------------------------------------------------
# write_place_to_cache
# ---------------------------------------------------------------------------


class TestWritePlaceToCache:
    def test_writes_correct_row(self):
        sb = MagicMock()
        sb.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        resolved = _make_resolution()

        write_place_to_cache(sb, resolved, city="Paris", suggested_category="Viewpoint")

        sb.table.assert_called_once_with("place_detail_cache")
        upsert_call = sb.table.return_value.upsert.call_args
        row = upsert_call[0][0]
        assert row["google_place_id"] == "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
        assert row["name"] == "Eiffel Tower"
        assert row["city"] == "Paris"
        assert row["suggested_category"] == "Viewpoint"
        assert row["google_types"] == ["tourist_attraction", "landmark"]
        assert upsert_call[1]["on_conflict"] == "google_place_id"

    def test_skips_empty_place_id(self):
        sb = MagicMock()
        resolved = _make_resolution(place_id="")
        write_place_to_cache(sb, resolved)
        sb.table.assert_not_called()

    def test_swallows_exceptions(self):
        sb = MagicMock()
        sb.table.side_effect = Exception("db down")
        resolved = _make_resolution()
        # Must not raise
        write_place_to_cache(sb, resolved, city="Paris", suggested_category="Viewpoint")


# ---------------------------------------------------------------------------
# /resolve endpoint cache integration
# ---------------------------------------------------------------------------


class _CacheableSupabase:
    """Mock Supabase that supports both cache lookups and quota RPC."""

    def __init__(self, *, cache_data=None):
        self._cache_data = cache_data

    def table(self, name):
        if name == "place_detail_cache":
            m = MagicMock()
            chain = m.select.return_value.eq.return_value
            chain.execute.return_value = MagicMock(data=self._cache_data or [])
            # Also support upsert for background writes
            m.upsert.return_value.execute.return_value = MagicMock(data=[{}])
            return m
        raise AssertionError(f"Unexpected table access: {name}")

    def rpc(self, name, params=None):
        if name == "bump_google_usage":
            m = MagicMock()
            m.execute.return_value = MagicMock(data=True)
            return m
        raise AssertionError(f"Unexpected RPC: {name}")


class TestResolveEndpointCache:
    """Integration tests: /resolve uses cache before calling Google API."""

    def _setup(self, client, *, cache_data=None):
        user_id = uuid4()

        async def override_user():
            return user_id

        app.dependency_overrides[get_current_user_id] = override_user
        app.dependency_overrides[get_supabase_client] = lambda: _CacheableSupabase(
            cache_data=cache_data
        )
        return user_id

    def test_resolve_returns_cached_data_without_api_call(self, client: TestClient):
        """Cache hit: returns data from DB, Google API never called."""
        self._setup(client, cache_data=[_CACHED_ROW])

        class ShouldNotCallClient:
            def get_place_by_id(self, *a, **kw):
                raise AssertionError("Google API must not be called on cache hit")

        app.dependency_overrides[get_google_places_client] = lambda: ShouldNotCallClient()

        r = client.post(
            "/api/v1/locations/google/resolve",
            json={"place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Eiffel Tower"
        assert data["google_place_id"] == "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
        assert data["city"] == "Paris"
        assert data["suggested_category"] == "Viewpoint"
        assert data["photo_resource_name"] == "places/ChIJD7fiBh9u5kcR/photos/AXCi2Q6abc"

    def test_resolve_calls_api_on_cache_miss(self, client: TestClient):
        """Cache miss: falls through to Google API normally."""
        self._setup(client, cache_data=[])

        api_called = False

        class FakeClient:
            def get_place_by_id(self, place_id, *, session_token=None):
                nonlocal api_called
                api_called = True
                return _make_resolution()

        app.dependency_overrides[get_google_places_client] = lambda: FakeClient()

        r = client.post(
            "/api/v1/locations/google/resolve",
            json={"place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"},
        )
        assert r.status_code == 200
        assert api_called, "Google API should have been called on cache miss"

    def test_resolve_cache_hit_skips_quota_bump(self, client: TestClient):
        """On cache hit, bump_google_quota must NOT be called."""
        user_id = uuid4()

        quota_bumped = False

        class _TrackingSupabase(_CacheableSupabase):
            def rpc(self, name, params=None):
                nonlocal quota_bumped
                if name == "bump_google_usage":
                    quota_bumped = True
                    m = MagicMock()
                    m.execute.return_value = MagicMock(data=True)
                    return m
                raise AssertionError(f"Unexpected RPC: {name}")

        async def override_user():
            return user_id

        app.dependency_overrides[get_current_user_id] = override_user
        app.dependency_overrides[get_supabase_client] = lambda: _TrackingSupabase(
            cache_data=[_CACHED_ROW]
        )

        class ShouldNotCallClient:
            def get_place_by_id(self, *a, **kw):
                raise AssertionError("Google API must not be called on cache hit")

        app.dependency_overrides[get_google_places_client] = lambda: ShouldNotCallClient()

        r = client.post(
            "/api/v1/locations/google/resolve",
            json={"place_id": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"},
        )
        assert r.status_code == 200
        assert not quota_bumped, "Quota bump should be skipped on cache hit"


# ---------------------------------------------------------------------------
# /preview endpoint cache integration
# ---------------------------------------------------------------------------


class TestPreviewEndpointCache:
    """Integration tests: /preview uses cache check between free search and paid details."""

    def test_preview_cache_miss_calls_api_and_writes_cache(self, client: TestClient):
        """Cache miss: /preview calls get_place_by_id and writes to cache."""
        user_id = uuid4()
        cache_written = False

        class _TrackingSupabase:
            def table(self, name):
                nonlocal cache_written
                if name == "place_detail_cache":
                    m = MagicMock()
                    # Cache lookup returns miss
                    m.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

                    # Cache write tracking
                    def _track_upsert(*a, **kw):
                        nonlocal cache_written
                        cache_written = True
                        r = MagicMock()
                        r.execute.return_value = MagicMock(data=[{}])
                        return r

                    m.upsert.side_effect = _track_upsert
                    return m
                raise AssertionError(f"Unexpected table: {name}")

            def rpc(self, name, params=None):
                if name == "bump_google_usage":
                    m = MagicMock()
                    m.execute.return_value = MagicMock(data=True)
                    return m
                raise AssertionError(f"Unexpected RPC: {name}")

        async def override_user():
            return user_id

        class FakeClient:
            def resolve_place_id_from_link(self, _link):
                return "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"

            def get_place_by_id(self, place_id, **kw):
                return _make_resolution()

        app.dependency_overrides[get_current_user_id] = override_user
        app.dependency_overrides[get_supabase_client] = lambda: _TrackingSupabase()
        app.dependency_overrides[get_google_places_client] = lambda: FakeClient()

        r = client.post(
            "/api/v1/locations/google/preview",
            json={"google_link": "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"},
        )
        assert r.status_code == 200
        assert cache_written, "Cache write should have been triggered after /preview cache miss"

    def test_preview_cache_hit_skips_api_call(self, client: TestClient):
        """Cache hit: /preview returns cached data without calling get_place_by_id."""
        user_id = uuid4()

        class _CacheHitSupabase:
            def table(self, name):
                if name == "place_detail_cache":
                    m = MagicMock()
                    m.select.return_value.eq.return_value.execute.return_value = MagicMock(
                        data=[_CACHED_ROW]
                    )
                    return m
                raise AssertionError(f"Unexpected table: {name}")

            def rpc(self, name, params=None):
                raise AssertionError(f"No RPC should be called on cache hit: {name}")

        async def override_user():
            return user_id

        class FakeClient:
            def resolve_place_id_from_link(self, _link):
                return "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"

            def get_place_by_id(self, *a, **kw):
                raise AssertionError("get_place_by_id must not be called on cache hit")

        app.dependency_overrides[get_current_user_id] = override_user
        app.dependency_overrides[get_supabase_client] = lambda: _CacheHitSupabase()
        app.dependency_overrides[get_google_places_client] = lambda: FakeClient()

        r = client.post(
            "/api/v1/locations/google/preview",
            json={"google_link": "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Eiffel Tower"
        assert data["google_place_id"] == "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
