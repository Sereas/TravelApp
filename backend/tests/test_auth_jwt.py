"""Tests for JWT verification in auth dependency, including base64 secrets."""

import base64
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from jose import jwt

from backend.tests.conftest import TEST_USER_ID


def test_jwt_with_plain_string_secret(client: TestClient, monkeypatch):
    """JWT signed with plain string secret is accepted."""
    secret = "test-plain-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
        secret,
        algorithm="HS256",
    )

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": f"Bearer {token}"},
    )
    # 401 would mean JWT rejected; anything else means JWT was accepted
    assert resp.status_code != 401
    get_settings.cache_clear()


def test_jwt_with_base64_encoded_secret(client: TestClient, monkeypatch):
    """JWT signed with base64-decoded secret is accepted when config has base64 string."""
    raw_secret = b"this-is-a-64-byte-raw-secret-for-testing-supabase-jwt-handling!!"
    b64_secret = base64.b64encode(raw_secret).decode()
    monkeypatch.setenv("SUPABASE_JWT_SECRET", b64_secret)
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
        raw_secret,
        algorithm="HS256",
    )

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code != 401
    get_settings.cache_clear()


def test_jwt_expired_token_returns_401(client: TestClient, monkeypatch):
    """Expired JWT returns 401."""
    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(2020, 1, 1, tzinfo=UTC)},
        secret,
        algorithm="HS256",
    )

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401
    assert "Invalid or expired token" in resp.json()["detail"]
    get_settings.cache_clear()


def test_jwt_wrong_secret_returns_401(client: TestClient, monkeypatch):
    """JWT signed with wrong secret returns 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "correct-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": TEST_USER_ID, "exp": datetime(now.year + 1, 1, 1, tzinfo=UTC)},
        "wrong-secret",
        algorithm="HS256",
    )

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401
    get_settings.cache_clear()


def test_jwt_missing_sub_returns_401(client: TestClient, monkeypatch):
    """JWT without sub claim returns 401."""
    secret = "test-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    now = datetime.now(UTC)
    token = jwt.encode(
        {"exp": datetime(now.year + 1, 1, 1, tzinfo=UTC), "role": "authenticated"},
        secret,
        algorithm="HS256",
        headers={"alg": "HS256", "typ": "JWT"},
    )

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401
    get_settings.cache_clear()


def test_jwt_malformed_token_returns_401(client: TestClient, monkeypatch):
    """Completely invalid token string returns 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    resp = client.get(
        "/api/v1/trips",
        headers={"Authorization": "Bearer not-a-real-jwt-token"},
    )
    assert resp.status_code == 401
    get_settings.cache_clear()
