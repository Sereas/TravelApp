"""Pure unit tests for helpers in backend/app/services/route_calculation.py.

These are Red-phase (Phase 0) baseline tests — no Supabase, no Google client,
no network calls.  They document current behaviour so Phase 4/5 refactors can
verify nothing breaks.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from backend.app.services.route_calculation import (
    STATUS_CONFIG_ERROR,
    STATUS_INPUT_ERROR,
    STATUS_NO_ROUTE,
    STATUS_RETRYABLE_ERROR,
    _cache_key,
    _input_fingerprint,
    classify_provider_error,
    should_recompute_on_view,
)

# ─────────────────────────────────────────────
# _input_fingerprint tests
# ─────────────────────────────────────────────


def test_input_fingerprint_same_for_identical_inputs():
    """Same inputs always produce the same fingerprint (deterministic)."""
    fp1 = _input_fingerprint("place_A", "place_B", 48.8566, 2.3522, 51.5074, -0.1278, "walk")
    fp2 = _input_fingerprint("place_A", "place_B", 48.8566, 2.3522, 51.5074, -0.1278, "walk")
    assert fp1 == fp2


def test_input_fingerprint_differs_on_transport_mode():
    """Changing transport_mode produces a different fingerprint."""
    fp_walk = _input_fingerprint("A", "B", 1.0, 2.0, 3.0, 4.0, "walk")
    fp_transit = _input_fingerprint("A", "B", 1.0, 2.0, 3.0, 4.0, "transit")
    assert fp_walk != fp_transit


def test_input_fingerprint_differs_on_place_id_order():
    """Swapping origin/destination produces a different fingerprint (direction matters)."""
    fp_fwd = _input_fingerprint("place_A", "place_B", 1.0, 2.0, 3.0, 4.0, "walk")
    fp_rev = _input_fingerprint("place_B", "place_A", 3.0, 4.0, 1.0, 2.0, "walk")
    assert fp_fwd != fp_rev


def test_input_fingerprint_none_place_ids_uses_latlng():
    """When place_ids are None the fingerprint still encodes lat/lng.

    None place_ids produce the literal string 'n' (not 'none') in the fingerprint.
    The lat/lng portion is still encoded using _ll() helper.
    """
    fp = _input_fingerprint(None, None, 48.8566, 2.3522, 51.5074, -0.1278, "drive")
    # Implementation uses "n" (not "none") for null place_id slots
    parts = fp.split("|")
    assert parts[0] == "n", f"Expected origin place_id slot to be 'n', got: {parts[0]!r}"
    assert parts[1] == "n", f"Expected dest place_id slot to be 'n', got: {parts[1]!r}"
    # Lat/lng segments should appear in the fingerprint
    assert "48.8566" in fp or "48.85660" in fp


def test_input_fingerprint_rounds_latlng_to_5_decimal_places():
    """Lat/lng are rounded to 5dp so tiny floating-point noise is ignored."""
    fp1 = _input_fingerprint(None, None, 48.856600001, 2.352200001, 51.5074, -0.1278, "walk")
    fp2 = _input_fingerprint(None, None, 48.85660, 2.35220, 51.5074, -0.1278, "walk")
    assert fp1 == fp2


# ─────────────────────────────────────────────
# _cache_key tests
# ─────────────────────────────────────────────


def test_cache_key_uses_place_ids_when_available():
    """When both place_ids are present, the cache key is based on them (not lat/lng)."""
    key = _cache_key("ChIJA", "ChIJB", 48.0, 2.0, 51.0, -0.1, "walk")
    assert "ChIJA" in key
    assert "ChIJB" in key
    assert "latlng" not in key


def test_cache_key_falls_back_to_lat_lng_when_place_id_missing():
    """When either place_id is None/empty, cache key uses lat/lng fallback."""
    key_no_origin = _cache_key(None, "ChIJB", 48.0, 2.0, 51.0, -0.1, "walk")
    assert "latlng" in key_no_origin

    key_no_dest = _cache_key("ChIJA", None, 48.0, 2.0, 51.0, -0.1, "walk")
    assert "latlng" in key_no_dest

    key_neither = _cache_key(None, None, 48.0, 2.0, 51.0, -0.1, "walk")
    assert "latlng" in key_neither


def test_cache_key_includes_transport_mode():
    """Transport mode is always part of the cache key."""
    key_walk = _cache_key("A", "B", 1.0, 2.0, 3.0, 4.0, "walk")
    key_drive = _cache_key("A", "B", 1.0, 2.0, 3.0, 4.0, "drive")
    assert key_walk != key_drive
    assert "walk" in key_walk
    assert "drive" in key_drive


# ─────────────────────────────────────────────
# should_recompute_on_view tests
# ─────────────────────────────────────────────


def _future_iso(minutes: int = 60) -> str:
    return (datetime.now(UTC) + timedelta(minutes=minutes)).isoformat()


def _past_iso(minutes: int = 60) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()


def test_should_recompute_on_view_returns_true_when_no_cache_row():
    """No existing cache row always triggers recompute."""
    assert should_recompute_on_view(None, False, "fp1", "walk") is True


def test_should_recompute_on_view_returns_true_on_force_refresh():
    """force_refresh=True always triggers recompute regardless of cache state."""
    cache_row = {
        "status": "success",
        "input_fingerprint": "fp1",
        "next_retry_at": None,
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, True, "fp1", "walk") is True


def test_should_recompute_on_view_returns_false_for_valid_success_cache():
    """A success cache row with no expiry and matching fingerprint is reused."""
    cache_row = {
        "status": "success",
        "input_fingerprint": "fp1",
        "next_retry_at": None,
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "walk") is False


def test_should_recompute_on_view_returns_true_when_ttl_expired():
    """A success cache row whose cache_expires_at is in the past triggers recompute."""
    cache_row = {
        "status": "success",
        "input_fingerprint": "fp1",
        "next_retry_at": None,
        "cache_expires_at": _past_iso(5),  # expired 5 minutes ago
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "transit") is True


def test_should_recompute_on_view_returns_false_inside_cooldown():
    """A retryable_error with next_retry_at in the future should NOT recompute."""
    cache_row = {
        "status": "retryable_error",
        "input_fingerprint": "fp1",
        "next_retry_at": _future_iso(10),  # 10 minutes from now
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "walk") is False


def test_should_recompute_on_view_returns_true_when_cooldown_elapsed():
    """A retryable_error with next_retry_at in the past IS eligible for recompute."""
    cache_row = {
        "status": "retryable_error",
        "input_fingerprint": "fp1",
        "next_retry_at": _past_iso(1),  # 1 minute ago
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "walk") is True


def test_should_recompute_on_view_returns_true_when_fingerprint_changed():
    """Fingerprint mismatch always triggers recompute (input changed)."""
    cache_row = {
        "status": "success",
        "input_fingerprint": "old_fp",
        "next_retry_at": None,
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "new_fp", "walk") is True


def test_should_recompute_on_view_input_error_not_retried_on_same_fingerprint():
    """input_error status is NOT retried unless the fingerprint changes."""
    cache_row = {
        "status": "input_error",
        "input_fingerprint": "fp1",
        "next_retry_at": None,
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "walk") is False


def test_should_recompute_on_view_legacy_ok_treated_as_success():
    """Legacy 'ok' status is mapped to 'success' and reused (not recomputed)."""
    cache_row = {
        "status": "ok",  # legacy value
        "input_fingerprint": "fp1",
        "next_retry_at": None,
        "cache_expires_at": None,
    }
    assert should_recompute_on_view(cache_row, False, "fp1", "walk") is False


# ─────────────────────────────────────────────
# classify_provider_error tests
# ─────────────────────────────────────────────


def test_classify_provider_error_maps_rate_limit_to_retryable():
    """HTTP 429 (rate limit) maps to STATUS_RETRYABLE_ERROR."""
    status, error_type, cooldown = classify_provider_error(429, "rate limit exceeded", "walk")
    assert status == STATUS_RETRYABLE_ERROR
    assert error_type == "server_or_rate_limit"
    assert cooldown > 0


def test_classify_provider_error_maps_server_errors_to_retryable():
    """HTTP 5xx server errors map to STATUS_RETRYABLE_ERROR."""
    for code in (500, 502, 503, 504):
        status, _error_type, _ = classify_provider_error(code, "server error", "walk")
        assert status == STATUS_RETRYABLE_ERROR, f"HTTP {code} should be retryable"


def test_classify_provider_error_maps_invalid_request_to_input_error():
    """HTTP 400 maps to STATUS_INPUT_ERROR with zero cooldown (retry on input change only)."""
    status, error_type, cooldown = classify_provider_error(400, "bad request", "walk")
    assert status == STATUS_INPUT_ERROR
    assert error_type == "bad_request"
    assert cooldown == 0  # retry only when fingerprint changes


def test_classify_provider_error_maps_404_to_input_error():
    """HTTP 404 from provider maps to STATUS_INPUT_ERROR."""
    status, _error_type, cooldown = classify_provider_error(404, "not found", "walk")
    assert status == STATUS_INPUT_ERROR
    assert cooldown == 0


def test_classify_provider_error_maps_422_to_input_error():
    """HTTP 422 maps to STATUS_INPUT_ERROR."""
    status, _error_type, cooldown = classify_provider_error(422, "unprocessable", "walk")
    assert status == STATUS_INPUT_ERROR
    assert cooldown == 0


def test_classify_provider_error_maps_auth_errors_to_config_error():
    """HTTP 401/403 maps to STATUS_CONFIG_ERROR (misconfigured API key)."""
    for code in (401, 403):
        status, error_type, cooldown = classify_provider_error(code, "forbidden", "walk")
        assert status == STATUS_CONFIG_ERROR, f"HTTP {code} should be config error"
        assert error_type == "forbidden_or_unauthorized"
        assert cooldown > 0


def test_classify_provider_error_no_route_message_maps_to_no_route():
    """'no route' in message maps to STATUS_NO_ROUTE regardless of http_status."""
    status, error_type, _cooldown = classify_provider_error(200, "no route found", "walk")
    assert status == STATUS_NO_ROUTE
    assert error_type == "no_route"


def test_classify_provider_error_no_route_transit_has_shorter_cooldown():
    """Transit no-route has a shorter cooldown than walk/drive (transit changes often)."""
    _, _, transit_cooldown = classify_provider_error(200, "no routes available", "transit")
    _, _, drive_cooldown = classify_provider_error(200, "no routes available", "drive")
    assert transit_cooldown < drive_cooldown


def test_classify_provider_error_unknown_http_status_is_retryable():
    """An unmapped HTTP status (e.g. 418) is treated as retryable."""
    status, _error_type, cooldown = classify_provider_error(418, "i am a teapot", "walk")
    assert status == STATUS_RETRYABLE_ERROR
    assert cooldown > 0


def test_classify_provider_error_none_http_status_is_retryable():
    """No HTTP status at all (network error) is treated as retryable."""
    status, _error_type, cooldown = classify_provider_error(None, "connection refused", "walk")
    assert status == STATUS_RETRYABLE_ERROR
    assert cooldown > 0
