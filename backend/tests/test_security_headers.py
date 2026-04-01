"""
HIGH-04: Security response headers.
LOW-02: X-Request-ID must be a full UUID.

HIGH-04 tests were previously RED; they now pass after SecurityHeadersMiddleware
was added. LOW-02 is RED because middleware.py truncates the UUID to 8 chars.
"""

import re

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

REQUIRED_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


@pytest.fixture
def client():
    return TestClient(app)


class TestSecurityHeaders:
    """
    Verify that security headers are present on every response.
    These tests are currently RED because no middleware sets these headers.
    """

    def test_responses_include_security_headers(self, client):
        """
        GET /health must include all required security headers.

        Currently FAILS — no security-headers middleware is registered.
        """
        resp = client.get("/health")
        assert resp.status_code == 200

        missing = []
        wrong_value = []

        for header, expected_value in REQUIRED_HEADERS.items():
            actual = resp.headers.get(header)
            if actual is None:
                missing.append(header)
            elif actual != expected_value:
                wrong_value.append(f"{header}: expected {expected_value!r}, got {actual!r}")

        assert not missing, (
            f"Missing security headers: {missing}. "
            "Add a SecurityHeadersMiddleware to backend/app/main.py."
        )
        assert not wrong_value, f"Incorrect security header values: {wrong_value}."

    def test_security_headers_present_on_authenticated_endpoints(self, client):
        """
        Security headers must be injected on ALL responses, not just /health.
        A 401 from a protected endpoint should also carry the headers.

        Currently FAILS for the same reason.
        """
        # Hit a protected endpoint without a token — expect 401 or 403
        resp = client.get("/api/v1/trips")
        assert resp.status_code in (401, 403, 422)

        missing = [h for h in REQUIRED_HEADERS if h not in resp.headers]
        assert not missing, (
            f"Security headers absent on auth-failure response: {missing}. "
            "Middleware must run before auth checks."
        )

    def test_x_content_type_options_prevents_mime_sniffing(self, client):
        """
        The value of X-Content-Type-Options must be exactly 'nosniff' (case matters
        for some older user-agents).
        """
        resp = client.get("/health")
        value = resp.headers.get("X-Content-Type-Options", "")
        assert value == "nosniff", f"X-Content-Type-Options must be 'nosniff', got {value!r}."

    def test_x_frame_options_prevents_clickjacking(self, client):
        """X-Frame-Options must be exactly 'DENY'."""
        resp = client.get("/health")
        value = resp.headers.get("X-Frame-Options", "")
        assert value == "DENY", f"X-Frame-Options must be 'DENY', got {value!r}."

    def test_referrer_policy_is_strict(self, client):
        """Referrer-Policy must be 'strict-origin-when-cross-origin'."""
        resp = client.get("/health")
        value = resp.headers.get("Referrer-Policy", "")
        assert value == "strict-origin-when-cross-origin", (
            f"Referrer-Policy must be 'strict-origin-when-cross-origin', got {value!r}."
        )


class TestXRequestIdIsFullUuid:
    """
    LOW-02 — RED phase.

    The ``X-Request-ID`` header must be a full UUID (36 chars with hyphens,
    e.g. ``550e8400-e29b-41d4-a716-446655440000``), NOT an 8-character truncation.

    Currently FAILS because ``middleware.py`` line 21 does:
        request_id = str(uuid.uuid4())[:8]
    which truncates the UUID to 8 characters, dramatically reducing uniqueness
    (only ~4 billion distinct values vs ~5.3x10^36 for a full UUID).
    """

    _FULL_UUID_RE = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )
    _HEX32_RE = re.compile(r"^[0-9a-f]{32}$", re.IGNORECASE)

    def test_x_request_id_is_full_uuid_on_health(self, client):
        """
        LOW-02 — RED.

        X-Request-ID on GET /health must be a full UUID (36 chars with hyphens).

        Currently FAILS: the header value is only 8 characters long.
        Fix: remove ``[:8]`` from ``middleware.py`` line 21.
        """
        resp = client.get("/health")
        request_id = resp.headers.get("X-Request-ID", "")

        assert request_id, "X-Request-ID header must be present"

        is_full_uuid = bool(self._FULL_UUID_RE.match(request_id))
        is_hex32 = bool(self._HEX32_RE.match(request_id))

        assert is_full_uuid or is_hex32, (
            f"X-Request-ID must be a full UUID (36 chars with hyphens) or "
            f"32 hex chars without hyphens, but got {request_id!r} "
            f"({len(request_id)} chars). "
            "Fix: change ``str(uuid.uuid4())[:8]`` to ``str(uuid.uuid4())`` "
            "in backend/app/middleware.py."
        )

    def test_x_request_id_is_full_uuid_on_authenticated_endpoint(self, client):
        """
        X-Request-ID must be a full UUID on non-health endpoints too (e.g. 401 response).
        """
        resp = client.get("/api/v1/trips")
        request_id = resp.headers.get("X-Request-ID", "")

        assert request_id, "X-Request-ID header must be present on auth-failure responses"

        is_full_uuid = bool(self._FULL_UUID_RE.match(request_id))
        is_hex32 = bool(self._HEX32_RE.match(request_id))

        assert is_full_uuid or is_hex32, (
            f"X-Request-ID on a 401 response must be a full UUID, got {request_id!r} "
            f"({len(request_id)} chars)."
        )

    def test_x_request_ids_are_unique_across_requests(self, client):
        """Each request must get a distinct X-Request-ID value."""
        ids = [client.get("/health").headers.get("X-Request-ID") for _ in range(5)]
        assert len(set(ids)) == 5, f"All 5 request IDs must be unique, but got duplicates: {ids}"

    def test_x_request_id_length_is_36(self, client):
        """
        LOW-02 — most direct assertion.

        The UUID string representation with hyphens is exactly 36 characters.
        The truncated version in the current code is only 8 characters.
        """
        resp = client.get("/health")
        request_id = resp.headers.get("X-Request-ID", "")
        assert len(request_id) == 36, (
            f"X-Request-ID must be 36 characters (full UUID with hyphens), "
            f"got {len(request_id)} chars: {request_id!r}. "
            "Remove ``[:8]`` from ``str(uuid.uuid4())[:8]`` in middleware.py."
        )
