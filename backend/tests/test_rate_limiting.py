"""Rate limiting tests.

Each test builds a self-contained minimal FastAPI app so they are fully
isolated from the main application.
"""

import base64
import json
from unittest.mock import MagicMock

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# ---------------------------------------------------------------------------
# Import under test — will raise ImportError in Red phase
# ---------------------------------------------------------------------------
from backend.app.core.rate_limit import get_user_rate_limit_key

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _custom_429_handler(request: Request, exc: RateLimitExceeded):
    """Matches the production handler in main.py."""
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
        headers={"Retry-After": "60"},
    )


def _build_app(limit_string: str, key_func=get_remote_address) -> tuple[FastAPI, TestClient]:
    """Build a minimal FastAPI app with a rate-limited endpoint."""
    test_limiter = Limiter(key_func=key_func)
    app = FastAPI()
    app.state.limiter = test_limiter

    from slowapi.middleware import SlowAPIMiddleware

    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _custom_429_handler)

    @app.get("/ping")
    @test_limiter.limit(limit_string)
    async def ping(request: Request):
        return {"ok": True}

    return app, TestClient(app, raise_server_exceptions=False)


def _make_jwt_with_sub(sub: str) -> str:
    """Produce a minimal (unsigned) JWT whose payload contains `sub`."""
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
    payload_bytes = json.dumps({"sub": sub}).encode()
    payload = base64.urlsafe_b64encode(payload_bytes).rstrip(b"=").decode()
    return f"{header}.{payload}.fakesignature"


# ---------------------------------------------------------------------------
# Test 1: 429 is returned after the limit is exceeded
# ---------------------------------------------------------------------------


def test_rate_limit_returns_429_after_limit_exceeded():
    """First two requests succeed; third triggers 429."""
    _, client = _build_app("2/minute")

    r1 = client.get("/ping")
    r2 = client.get("/ping")
    r3 = client.get("/ping")

    assert r1.status_code == 200, "First request should succeed"
    assert r2.status_code == 200, "Second request should succeed"
    assert r3.status_code == 429, "Third request should be rate-limited"


# ---------------------------------------------------------------------------
# Test 2: 429 response includes Retry-After header
# ---------------------------------------------------------------------------


def test_rate_limit_response_includes_retry_after_header():
    """A 429 response must carry a Retry-After header."""
    _, client = _build_app("1/minute")

    client.get("/ping")  # consume the one allowed request
    r = client.get("/ping")

    assert r.status_code == 429
    assert "retry-after" in {h.lower() for h in r.headers}, (
        "429 response must include Retry-After header"
    )
    # RFC 7231: Retry-After must be an integer (seconds) or HTTP-date
    retry_after = r.headers.get("retry-after", r.headers.get("Retry-After", ""))
    assert retry_after.isdigit(), f"Retry-After must be an integer (seconds), got '{retry_after}'"


# ---------------------------------------------------------------------------
# Test 3: Rate limit buckets are per-user, not shared
# ---------------------------------------------------------------------------


def test_rate_limit_per_user_isolation():
    """Each user key has its own bucket; different users don't share quota."""

    # Key function that extracts a user identifier from a custom header so
    # we can control the bucket from the test client without a real JWT.
    def _header_key(request: Request) -> str:
        return request.headers.get("X-Test-User", get_remote_address(request))

    test_limiter = Limiter(key_func=_header_key)
    app = FastAPI()
    app.state.limiter = test_limiter

    from slowapi.middleware import SlowAPIMiddleware

    app.add_middleware(SlowAPIMiddleware)
    app.add_exception_handler(RateLimitExceeded, _custom_429_handler)

    @app.get("/ping")
    @test_limiter.limit("1/minute")
    async def ping(request: Request):
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)

    # Both users get their first request through
    ra1 = client.get("/ping", headers={"X-Test-User": "user-a"})
    rb1 = client.get("/ping", headers={"X-Test-User": "user-b"})
    assert ra1.status_code == 200, "user-a first request should succeed"
    assert rb1.status_code == 200, "user-b first request should succeed"

    # user-a's second request must be blocked; user-b's bucket is still unaffected above
    ra2 = client.get("/ping", headers={"X-Test-User": "user-a"})
    assert ra2.status_code == 429, "user-a second request should be rate-limited"


# ---------------------------------------------------------------------------
# Test 4: get_user_rate_limit_key extracts sub from a valid Bearer token
# ---------------------------------------------------------------------------


def test_user_key_extracts_sub_from_jwt():
    """Key function returns the JWT `sub` claim for authenticated requests."""
    sub = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    token = _make_jwt_with_sub(sub)

    mock_request = MagicMock(spec=Request)
    mock_request.headers = {"authorization": f"Bearer {token}"}
    # Simulate starlette's client attribute used by get_remote_address fallback
    mock_request.client = MagicMock()
    mock_request.client.host = "127.0.0.1"

    result = get_user_rate_limit_key(mock_request)

    assert result == sub, f"Expected key function to return sub '{sub}', got '{result}'"


# ---------------------------------------------------------------------------
# Test 5: get_user_rate_limit_key falls back to IP on a malformed token
# ---------------------------------------------------------------------------


def test_user_key_falls_back_to_ip_on_bad_token():
    """Key function falls back to client IP when the token cannot be parsed."""
    mock_request = MagicMock(spec=Request)
    mock_request.headers = {"authorization": "Bearer this-is-not-a-jwt"}
    mock_request.client = MagicMock()
    mock_request.client.host = "10.0.0.1"

    result = get_user_rate_limit_key(mock_request)

    assert result == "10.0.0.1", f"Expected IP fallback '10.0.0.1', got '{result}'"
