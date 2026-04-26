"""
HIGH-05: _ensure_resource_chain NULL day_id bypass.

RED phase — test_resource_chain_rejects_option_without_day FAILS against
current code because _ensure_resource_chain has no Python-level guard that
requires day_id to be provided when option_id is given.  The RPC is called
with p_day_id=None which, in the current SQL function, returns TRUE even when
the option is unrelated to the trip (NULL bypass).

The fix must be a Python-level pre-condition check so it is fast, testable
without a live DB, and cannot be bypassed by any RPC behaviour.
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.app.routers.trip_ownership import _ensure_resource_chain


def _make_stub_supabase(*, rpc_returns="owner"):
    """
    Minimal mock that records RPC calls and returns a configurable result.

    ``rpc_returns`` should be a role string ('owner', 'editor') for success
    or None/False for denial.
    """
    mock = MagicMock()

    rpc_result = MagicMock()
    rpc_result.execute.return_value = MagicMock(data=rpc_returns)
    mock.rpc.return_value = rpc_result

    return mock


class TestResourceChainPythonGuard:
    """
    Unit tests for the Python-level argument validation inside
    _ensure_resource_chain.  None of these tests hit a real DB.
    """

    def test_resource_chain_rejects_option_without_day(self):
        """
        Passing option_id without day_id must raise HTTPException(404) at the
        Python level BEFORE the RPC is called.

        Currently FAILS — no such guard exists; the function calls the RPC with
        p_day_id=None which the SQL function incorrectly accepts.
        """
        stub = _make_stub_supabase(rpc_returns="owner")
        trip_id = uuid4()
        user_id = uuid4()
        option_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            _ensure_resource_chain(
                stub,
                trip_id,
                user_id,
                day_id=None,  # deliberately omitted
                option_id=option_id,
            )

        assert exc_info.value.status_code == 404, (
            f"Expected 404, got {exc_info.value.status_code}. "
            "The guard must reject option_id without day_id."
        )

        # The RPC must NOT have been called — we reject before touching the DB
        stub.rpc.assert_not_called()

    def test_resource_chain_trip_only_calls_rpc(self):
        """
        Calling with trip_id + user_id only (no day_id, no option_id) must
        still reach the RPC and succeed.  This is the happy path for
        trip-scoped endpoints.
        """
        stub = _make_stub_supabase(rpc_returns="owner")
        trip_id = uuid4()
        user_id = uuid4()

        # Should NOT raise
        _ensure_resource_chain(stub, trip_id, user_id)

        stub.rpc.assert_called_once()

    def test_resource_chain_trip_and_day_calls_rpc(self):
        """
        Providing trip_id + day_id is valid; RPC must be called and succeed.
        """
        stub = _make_stub_supabase(rpc_returns="owner")
        trip_id = uuid4()
        user_id = uuid4()
        day_id = uuid4()

        _ensure_resource_chain(stub, trip_id, user_id, day_id=day_id)

        stub.rpc.assert_called_once()

    def test_resource_chain_full_chain_calls_rpc(self):
        """
        Providing trip_id + day_id + option_id is valid; RPC must be called.
        """
        stub = _make_stub_supabase(rpc_returns="owner")
        trip_id = uuid4()
        user_id = uuid4()
        day_id = uuid4()
        option_id = uuid4()

        _ensure_resource_chain(stub, trip_id, user_id, day_id=day_id, option_id=option_id)

        stub.rpc.assert_called_once()

    def test_resource_chain_rpc_returning_false_raises_404(self):
        """
        When the RPC returns a falsy result (chain broken at DB level), the
        function must raise HTTPException(404).  This verifies the existing
        post-RPC check still works alongside the new pre-RPC guard.
        """
        stub = _make_stub_supabase(rpc_returns=None)
        trip_id = uuid4()
        user_id = uuid4()
        day_id = uuid4()
        option_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            _ensure_resource_chain(
                stub,
                trip_id,
                user_id,
                day_id=day_id,
                option_id=option_id,
            )

        assert exc_info.value.status_code == 404

    def test_resource_chain_option_without_day_rpc_not_called_even_when_rpc_would_succeed(self):
        """
        Even if the underlying RPC would return True (e.g. due to the SQL NULL
        bypass bug), the Python guard must fire first and raise 404.
        """
        stub = _make_stub_supabase(rpc_returns="owner")  # RPC would say "OK"
        trip_id = uuid4()
        user_id = uuid4()
        option_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            _ensure_resource_chain(
                stub,
                trip_id,
                user_id,
                day_id=None,
                option_id=option_id,
            )

        # 404 must come from the Python guard, not the RPC
        assert exc_info.value.status_code == 404
        stub.rpc.assert_not_called()
