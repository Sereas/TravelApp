"""Tests for JWT verification in auth dependency."""

import base64
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import jwt
import structlog
from fastapi.testclient import TestClient

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import _get_jwk_client
from backend.app.main import app
from backend.tests.conftest import TEST_USER_ID


class _StubSupabase:
    """Minimal stub so endpoints don't crash after auth passes."""

    def table(self, name: str):
        return self

    def select(self, *args):
        return self

    def eq(self, *args):
        return self

    def order(self, *args, **kwargs):
        return self

    def rpc(self, *args, **kwargs):
        return self

    def execute(self):
        return type("R", (), {"data": []})()


def _clear_caches():
    from backend.app.core.config import get_settings

    get_settings.cache_clear()
    _get_jwk_client.cache_clear()


def test_jwt_with_plain_string_secret(client: TestClient, monkeypatch):
    """JWT signed with plain HS256 string secret is accepted."""
    secret = "test-plain-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 401
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


def test_jwt_with_base64_encoded_secret(client: TestClient, monkeypatch):
    """JWT signed with base64-decoded secret is accepted when config has base64 string."""
    raw_secret = b"this-is-a-64-byte-raw-secret-for-testing-supabase-jwt-handling!!"
    b64_secret = base64.b64encode(raw_secret).decode()
    monkeypatch.setenv("SUPABASE_JWT_SECRET", b64_secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        raw_secret,
        algorithm="HS256",
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 401
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


def test_jwt_expired_token_returns_401(client: TestClient, monkeypatch):
    """Expired JWT returns 401."""
    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(2020, 1, 1, tzinfo=UTC)},
        secret,
        algorithm="HS256",
    )

    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
        assert "Invalid or expired token" in resp.json()["detail"]
    finally:
        _clear_caches()


def test_jwt_wrong_secret_returns_401(client: TestClient, monkeypatch):
    """JWT signed with wrong secret returns 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "correct-secret")
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
        "wrong-secret",
        algorithm="HS256",
    )

    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
    finally:
        _clear_caches()


def test_jwt_missing_sub_returns_401(client: TestClient, monkeypatch):
    """JWT without sub claim returns 401."""
    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"exp": datetime(now.year + 1, 1, 1, tzinfo=UTC), "aud": "authenticated"},
        secret,
        algorithm="HS256",
    )

    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
    finally:
        _clear_caches()


def test_jwt_malformed_token_returns_401(client: TestClient, monkeypatch):
    """Completely invalid token string returns 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": "Bearer not-a-real-jwt-token"},
        )
        assert resp.status_code == 401
    finally:
        _clear_caches()


def test_successful_auth_binds_user_id_to_structlog_context(client: TestClient, monkeypatch):
    """After successful auth, user_id is bound to structlog contextvars."""
    secret = "test-plain-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    captured_user_id = {}

    class _CapturingSupabase(_StubSupabase):
        def execute(self):
            ctx = structlog.contextvars.get_contextvars()
            captured_user_id.update(ctx)
            return type("R", (), {"data": []})()

    app.dependency_overrides[get_supabase_client] = _CapturingSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 401
        assert captured_user_id.get("user_id") == TEST_USER_ID
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


# ---------------------------------------------------------------------------
# CRIT-01: Audience enforcement in the HS256 path
# ---------------------------------------------------------------------------


def test_hs256_without_audience_returns_401(client: TestClient, monkeypatch):
    """[RED] Token with NO aud claim must be rejected with 401.

    Currently fails because _verify_token uses options={"verify_aud": False}
    on both HS256 decode attempts, so tokens without aud are accepted.
    """
    secret = "test-aud-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    # Deliberately omit "aud" so the token carries no audience claim.
    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
        secret,
        algorithm="HS256",
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401, (
            "Expected 401 for token without aud claim, "
            f"got {resp.status_code}. "
            "Fix: remove options={'verify_aud': False} from HS256 decode path."
        )
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


def test_hs256_with_wrong_audience_returns_401(client: TestClient, monkeypatch):
    """[RED] Token with aud='wrong-audience' must be rejected with 401.

    Currently fails because verify_aud is disabled for both HS256 attempts.
    """
    secret = "test-aud-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "wrong-audience",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401, (
            "Expected 401 for token with wrong audience, "
            f"got {resp.status_code}. "
            "Fix: enforce aud='authenticated' in HS256 decode path."
        )
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


def test_hs256_with_correct_audience_succeeds(client: TestClient, monkeypatch):
    """[GREEN baseline] Token with aud='authenticated' must be accepted.

    This test must pass both before AND after the CRIT-01 fix — it confirms
    that tightening audience validation does not break valid tokens.
    """
    secret = "test-aud-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "")
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        resp = client.get(
            "/api/v1/trips",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code != 401, (
            f"Expected success for token with aud='authenticated', got {resp.status_code}."
        )
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


# ---------------------------------------------------------------------------
# CRIT-02: JWKS error handling — network errors must NOT fall through to HS256
# ---------------------------------------------------------------------------


def test_jwks_connection_error_does_not_fallback_to_hs256(client: TestClient, monkeypatch):
    """PyJWKClientConnectionError from JWKS must result in 401, not HS256 fallback.

    PyJWT wraps network errors in PyJWKClientConnectionError (a subclass of
    PyJWTError).  The fix must re-raise this specific exception before the
    general PyJWTError catch, so the HS256 path is never reached.
    """
    from jwt.exceptions import PyJWKClientConnectionError

    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    mock_jwk_client = MagicMock()
    mock_jwk_client.get_signing_key_from_jwt.side_effect = PyJWKClientConnectionError(
        'Fail to fetch data from the url, err: "Connection refused"'
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        with patch("backend.app.dependencies._get_jwk_client", return_value=mock_jwk_client):
            resp = client.get(
                "/api/v1/trips",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 401, (
            "Expected 401 when JWKS raises PyJWKClientConnectionError, "
            f"got {resp.status_code}. "
            "Fix: re-raise PyJWKClientConnectionError before the PyJWTError catch."
        )
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


def test_jwks_timeout_wrapped_error_does_not_fallback_to_hs256(client: TestClient, monkeypatch):
    """PyJWKClientConnectionError wrapping a timeout must also result in 401.

    PyJWT catches TimeoutError internally and wraps it in
    PyJWKClientConnectionError.  This test confirms the wrapper is also
    handled correctly.
    """
    from jwt.exceptions import PyJWKClientConnectionError

    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    _clear_caches()

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC),
        },
        secret,
        algorithm="HS256",
    )

    mock_jwk_client = MagicMock()
    mock_jwk_client.get_signing_key_from_jwt.side_effect = PyJWKClientConnectionError(
        'Fail to fetch data from the url, err: "timed out"'
    )

    app.dependency_overrides[get_supabase_client] = _StubSupabase
    try:
        with patch("backend.app.dependencies._get_jwk_client", return_value=mock_jwk_client):
            resp = client.get(
                "/api/v1/trips",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 401, (
            "Expected 401 when JWKS raises TimeoutError, "
            f"got {resp.status_code}. "
            "Fix: catch only jwt exceptions in the JWKS block, not bare Exception."
        )
    finally:
        app.dependency_overrides.clear()
        _clear_caches()


# ---------------------------------------------------------------------------
# CRIT-03: Settings must not silently fall back to anon key
# ---------------------------------------------------------------------------


def test_missing_service_role_key_raises_error(monkeypatch):
    """[RED] Settings() must raise when SUPABASE_URL is set but SERVICE_ROLE_KEY is absent.

    Currently fails because Settings.__init__ silently assigns
    supabase_key = service_key or anon_key with no error or warning.
    Fix: raise ValueError (or similar) when supabase_url is non-empty and
    SUPABASE_SERVICE_ROLE_KEY resolves to an empty string.
    """
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key-value")

    from backend.app.core.config import Settings, get_settings

    get_settings.cache_clear()
    try:
        import pytest

        with pytest.raises((ValueError, RuntimeError)):
            Settings()
    finally:
        get_settings.cache_clear()
