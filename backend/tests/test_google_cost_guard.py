"""Unit tests for backend/app/core/google_guard.py helpers.

Tests the two public functions:
- ensure_google_allowed(settings, endpoint) — kill-switch checks
- async bump_google_quota(supabase, user_id, endpoint, daily_cap) — per-user quota

These tests are in the RED phase: google_guard.py does not exist yet.
Every test is expected to FAIL until the implementation lands.

Async tests use pytest-asyncio (same as test_route_calculation_concurrency.py).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

# ---------------------------------------------------------------------------
# Import under test (will fail in Red phase — that's expected)
# ---------------------------------------------------------------------------
from backend.app.core.google_guard import bump_google_quota, ensure_google_allowed

# ---------------------------------------------------------------------------
# Helpers — minimal settings stubs
# ---------------------------------------------------------------------------


def _settings(
    *,
    google_apis_disabled: bool = False,
    google_autocomplete_disabled: bool = False,
    google_list_import_disabled: bool = False,
) -> object:
    """Build a minimal settings-like object."""
    return SimpleNamespace(
        google_apis_disabled=google_apis_disabled,
        google_autocomplete_disabled=google_autocomplete_disabled,
        google_list_import_disabled=google_list_import_disabled,
    )


def _supabase_mock(*, under_cap: bool) -> MagicMock:
    """Mock Supabase client whose bump_google_usage RPC returns under_cap boolean."""
    sb = MagicMock()
    rpc_result = MagicMock()
    rpc_result.execute.return_value = MagicMock(data=under_cap)
    sb.rpc.return_value = rpc_result
    return sb


def _supabase_rpc_raises(exc: Exception) -> MagicMock:
    """Mock that makes .execute() raise to simulate a network error."""
    sb = MagicMock()
    rpc_result = MagicMock()
    rpc_result.execute.side_effect = exc
    sb.rpc.return_value = rpc_result
    return sb


# ===========================================================================
# ensure_google_allowed — kill-switch logic (synchronous)
# ===========================================================================


class TestEnsureGoogleAllowed:
    # --- Master flag ---

    def test_raises_503_when_master_flag_true_for_autocomplete(self):
        """GOOGLE_APIS_DISABLED=true blocks every endpoint, including autocomplete."""
        s = _settings(google_apis_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "autocomplete")
        assert exc_info.value.status_code == 503

    def test_raises_503_when_master_flag_true_for_resolve(self):
        """GOOGLE_APIS_DISABLED=true blocks resolve."""
        s = _settings(google_apis_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "resolve")
        assert exc_info.value.status_code == 503

    def test_raises_503_when_master_flag_true_for_preview(self):
        """GOOGLE_APIS_DISABLED=true blocks even the URL-paste preview."""
        s = _settings(google_apis_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "preview")
        assert exc_info.value.status_code == 503

    def test_raises_503_when_master_flag_true_for_list_import(self):
        """GOOGLE_APIS_DISABLED=true blocks list import."""
        s = _settings(google_apis_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "list_import")
        assert exc_info.value.status_code == 503

    # --- Granular autocomplete flag ---

    def test_raises_503_when_autocomplete_flag_true_for_autocomplete_endpoint(self):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true blocks /autocomplete."""
        s = _settings(google_autocomplete_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "autocomplete")
        assert exc_info.value.status_code == 503

    def test_raises_503_when_autocomplete_flag_true_for_resolve_endpoint(self):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true also blocks /resolve.
        /resolve is the second half of the typeahead UX; blocking one without the
        other would allow cost leaks from abandoned sessions that call /resolve
        without a paired /autocomplete.
        """
        s = _settings(google_autocomplete_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "resolve")
        assert exc_info.value.status_code == 503

    def test_autocomplete_flag_does_not_block_preview_endpoint(self):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true must NOT block /preview.
        /preview is the URL-paste path (Path A); it is independent of typeahead.
        """
        s = _settings(google_autocomplete_disabled=True)
        # Must not raise
        ensure_google_allowed(s, "preview")

    def test_autocomplete_flag_does_not_block_list_import_endpoint(self):
        """GOOGLE_AUTOCOMPLETE_DISABLED=true must NOT block list import."""
        s = _settings(google_autocomplete_disabled=True)
        ensure_google_allowed(s, "list_import")

    # --- Granular list_import flag ---

    def test_raises_503_when_list_import_flag_true_for_list_import_endpoint(self):
        """GOOGLE_LIST_IMPORT_DISABLED=true blocks list import."""
        s = _settings(google_list_import_disabled=True)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "list_import")
        assert exc_info.value.status_code == 503

    def test_list_import_flag_does_not_block_autocomplete_endpoint(self):
        """GOOGLE_LIST_IMPORT_DISABLED=true must NOT block /autocomplete."""
        s = _settings(google_list_import_disabled=True)
        ensure_google_allowed(s, "autocomplete")

    def test_list_import_flag_does_not_block_preview_endpoint(self):
        """GOOGLE_LIST_IMPORT_DISABLED=true must NOT block /preview."""
        s = _settings(google_list_import_disabled=True)
        ensure_google_allowed(s, "preview")

    # --- All flags False — no exception ---

    def test_does_not_raise_when_all_flags_false(self):
        """When all kill-switch flags are False, no exception is raised."""
        s = _settings()
        ensure_google_allowed(s, "autocomplete")
        ensure_google_allowed(s, "resolve")
        ensure_google_allowed(s, "preview")
        ensure_google_allowed(s, "list_import")

    # --- Master overrides granular ---

    def test_master_flag_overrides_granular_flag_for_preview(self):
        """Even if only master is True and autocomplete is False, preview is blocked."""
        s = _settings(google_apis_disabled=True, google_autocomplete_disabled=False)
        with pytest.raises(HTTPException) as exc_info:
            ensure_google_allowed(s, "preview")
        assert exc_info.value.status_code == 503


# ===========================================================================
# bump_google_quota — per-user daily cap enforcement (async)
# ===========================================================================


class TestBumpGoogleQuota:
    """Tests for the async bump_google_quota helper.

    All cases use the `pytest-asyncio` marker rather than manual
    `run_until_complete`, which is deprecated in Python 3.12+.
    """

    @pytest.mark.asyncio
    async def test_calls_rpc_with_expected_params(self):
        """bump_google_quota must call supabase.rpc('bump_google_usage', ...) correctly."""
        user_id = "11111111-2222-3333-4444-555555555555"
        sb = _supabase_mock(under_cap=True)
        await bump_google_quota(sb, user_id, "autocomplete", daily_cap=2000)
        sb.rpc.assert_called_once()
        call_args = sb.rpc.call_args
        rpc_name = call_args[0][0]
        rpc_params = call_args[0][1] if len(call_args[0]) > 1 else call_args[1]
        assert rpc_name == "bump_google_usage"
        # Params must contain the user_id, endpoint, and daily_cap
        params_dict = rpc_params if isinstance(rpc_params, dict) else {}
        assert str(user_id) in str(params_dict), f"user_id not in RPC params: {params_dict}"

    @pytest.mark.asyncio
    async def test_does_not_raise_when_under_cap(self):
        """When RPC returns True (under cap), no exception is raised."""
        sb = _supabase_mock(under_cap=True)
        # Must not raise
        result = await bump_google_quota(sb, "user-123", "resolve", daily_cap=200)
        assert result is None  # function returns None when allowed

    @pytest.mark.asyncio
    async def test_raises_429_when_over_cap(self):
        """When RPC returns False (over daily cap), HTTPException(429) is raised."""
        sb = _supabase_mock(under_cap=False)
        with pytest.raises(HTTPException) as exc_info:
            await bump_google_quota(sb, "user-123", "resolve", daily_cap=200)
        assert exc_info.value.status_code == 429
        detail = str(exc_info.value.detail).lower()
        assert "daily" in detail or "quota" in detail or "cap" in detail, (
            f"429 detail must mention the daily cap, got: {detail!r}"
        )

    @pytest.mark.asyncio
    async def test_raises_on_rpc_network_error(self):
        """When the RPC execute() raises a network error, the function raises
        an HTTPException (500 or re-raises). Callers must not swallow this.
        """
        sb = _supabase_rpc_raises(RuntimeError("connection timeout"))
        with pytest.raises((HTTPException, RuntimeError)):
            await bump_google_quota(sb, "user-123", "autocomplete", daily_cap=2000)

    @pytest.mark.asyncio
    async def test_different_endpoints_have_independent_caps(self):
        """autocomplete and resolve must be tracked independently.
        This test calls bump_google_quota twice with different endpoints and
        verifies the RPC is called with the correct endpoint name each time.
        """
        sb = _supabase_mock(under_cap=True)
        await bump_google_quota(sb, "user-abc", "autocomplete", daily_cap=2000)
        await bump_google_quota(sb, "user-abc", "resolve", daily_cap=200)
        assert sb.rpc.call_count == 2, "RPC must be called once per endpoint"
        # Inspect that different endpoint names were passed
        first_call_params = str(sb.rpc.call_args_list[0])
        second_call_params = str(sb.rpc.call_args_list[1])
        assert "autocomplete" in first_call_params
        assert "resolve" in second_call_params

    @pytest.mark.asyncio
    async def test_list_import_cap_is_checked(self):
        """list_import daily cap of 500 places is enforced via the same RPC."""
        sb = _supabase_mock(under_cap=False)  # simulate cap hit at place 501
        with pytest.raises(HTTPException) as exc_info:
            await bump_google_quota(sb, "user-123", "list_import", daily_cap=500)
        assert exc_info.value.status_code == 429
