"""Rate limiting configuration for FastAPI endpoints.

Uses slowapi with in-memory storage (suitable for single-process Render
containers).  Authenticated endpoints are keyed by user_id extracted from
the JWT; unauthenticated endpoints are keyed by client IP.
"""

from __future__ import annotations

import base64
import json

import structlog
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

logger = structlog.get_logger("rate_limit")


def get_user_rate_limit_key(request: Request) -> str:
    """Extract user_id from the Bearer token for rate-limit bucketing.

    This does NOT verify the token signature — that is handled by the auth
    dependency.  It only base64-decodes the payload segment to read ``sub``.
    On any failure (missing header, malformed token, missing claim) it falls
    back to IP-based keying.  This is safe because the key is only used for
    rate-limit bucketing, not for authorization.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            token = auth_header[7:]
            # JWT is three base64url segments separated by dots
            payload_b64 = token.split(".")[1]
            # Pad the base64 string if needed
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            sub = payload.get("sub")
            if sub:
                return str(sub)
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_user_rate_limit_key,
    default_limits=["100/minute"],
    storage_uri="memory://",
)
