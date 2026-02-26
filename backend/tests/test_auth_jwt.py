"""Tests for JWT verification in auth dependency."""

import base64
from datetime import UTC, datetime

import jwt
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
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
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
        {"exp": datetime(now.year + 1, 1, 1, tzinfo=UTC), "role": "authenticated"},
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
