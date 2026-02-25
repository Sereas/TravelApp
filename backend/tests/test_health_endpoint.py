"""Tests for the /health endpoint."""

from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_returns_200_and_ok_json(client: TestClient):
    """GET /health -> 200 and {'status': 'ok'} without auth."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_does_not_require_auth_even_when_jwt_required_for_others(
    client: TestClient,
    monkeypatch,
):
    """
    /health should stay unauthenticated even if SUPABASE_JWT_SECRET is set and
    other endpoints enforce Authorization headers.
    """
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    from backend.app.core.config import get_settings

    get_settings.cache_clear()

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

