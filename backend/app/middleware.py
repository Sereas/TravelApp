"""ASGI middleware for structured request/response logging."""

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger: structlog.stdlib.BoundLogger = structlog.get_logger("http")

# Paths to log at DEBUG level (health probes generate noise at INFO).
_QUIET_PATHS = {"/health", "/healthz"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())[:8]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        start = time.perf_counter()
        method = request.method
        path = request.url.path
        query_extra = {"query_string": str(request.url.query)} if request.url.query else {}

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.error(
                "request_error",
                method=method,
                path=path,
                **query_extra,
                duration_ms=duration_ms,
                error_category="internal",
                exc_info=True,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        status_code = response.status_code

        if path in _QUIET_PATHS and status_code < 400:
            log = logger.debug
        elif status_code >= 500:
            log = logger.error
        elif status_code >= 400:
            log = logger.warning
        else:
            log = logger.info

        log(
            "request_completed",
            method=method,
            path=path,
            **query_extra,
            status_code=status_code,
            duration_ms=duration_ms,
        )

        response.headers["X-Request-ID"] = request_id
        return response
