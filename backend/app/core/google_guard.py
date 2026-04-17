"""Shared cost-guard helpers for every Google-billing endpoint.

Two concerns, one module:

* Kill switches (synchronous) — check env-driven feature flags before any
  Google call is made. Returns ``None`` when allowed; raises
  :class:`fastapi.HTTPException` (503) when disabled.
* Per-user daily quota (async) — atomically increments a Postgres counter
  via the ``bump_google_usage`` RPC and raises 429 when the day's cap is
  exceeded. The same RPC is used for every endpoint (autocomplete, resolve,
  preview, list_import) so cost accounting is centralised.

Endpoints:

* ``autocomplete`` — POST /api/v1/locations/google/autocomplete
* ``resolve``      — POST /api/v1/locations/google/resolve
* ``preview``      — POST /api/v1/locations/google/preview (URL paste)
* ``list_import``  — POST /api/v1/trips/{id}/locations/import-google-list-stream

The typeahead UX pairs ``autocomplete`` + ``resolve``; the
``GOOGLE_AUTOCOMPLETE_DISABLED`` flag blocks both together so operators can
disable the feature end-to-end with one env var. ``GOOGLE_APIS_DISABLED``
is the master switch that blocks everything.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

import structlog
from fastapi import HTTPException, status

logger: structlog.stdlib.BoundLogger = structlog.get_logger("google_guard")

# Type alias for the small set of billable endpoints.
GoogleEndpoint = Literal["autocomplete", "resolve", "preview", "list_import"]


def ensure_google_allowed(settings, endpoint: str) -> None:
    """Raise HTTPException(503) if a Google endpoint is disabled via config.

    Kill-switch matrix:

    ======================================  =============  =======  =========  =======  ============
    Setting                                  autocomplete   resolve  preview    list_import
    ======================================  =============  =======  =========  =======  ============
    ``google_apis_disabled`` (master)        blocked        blocked  blocked    blocked
    ``google_autocomplete_disabled``         blocked        blocked  allowed    allowed
    ``google_list_import_disabled``          allowed        allowed  allowed    blocked
    ======================================  =============  =======  =========  =======  ============

    Called at the top of every Google-billing handler before the Places
    client is touched.
    """
    if getattr(settings, "google_apis_disabled", False):
        logger.info(
            "google_kill_switch_hit",
            endpoint=endpoint,
            flag="google_apis_disabled",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integrations are temporarily disabled",
        )

    if endpoint in ("autocomplete", "resolve") and getattr(
        settings, "google_autocomplete_disabled", False
    ):
        logger.info(
            "google_kill_switch_hit",
            endpoint=endpoint,
            flag="google_autocomplete_disabled",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google autocomplete is temporarily disabled",
        )

    if endpoint == "list_import" and getattr(settings, "google_list_import_disabled", False):
        logger.info(
            "google_kill_switch_hit",
            endpoint=endpoint,
            flag="google_list_import_disabled",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google list import is temporarily disabled",
        )


def bump_google_quota_sync(
    supabase,
    user_id: UUID | str,
    endpoint: str,
    daily_cap: int,
) -> None:
    """Synchronous quota check — suitable for ``asyncio.to_thread``.

    The ``bump_google_usage`` RPC performs an atomic upsert + increment and
    returns ``TRUE`` if the new count is within ``p_daily_cap``, ``FALSE``
    when the cap has been exceeded. We map ``FALSE`` to HTTP 429 so the
    client can retry tomorrow (or the operator can raise the cap).

    RPC network errors are NOT swallowed — the caller must decide whether to
    fail-closed (block the Google call) or fail-open (allow). Production code
    should let the error propagate so any DB outage is visible.
    """
    result = supabase.rpc(
        "bump_google_usage",
        {
            "p_user_id": str(user_id),
            "p_endpoint": endpoint,
            "p_daily_cap": int(daily_cap),
        },
    ).execute()
    under_cap = getattr(result, "data", None)
    # The RPC always returns a boolean. Anything other than explicit True is
    # treated as over-cap so a missing / malformed row fails safe.
    if under_cap is not True:
        logger.warning(
            "google_quota_exceeded",
            endpoint=endpoint,
            user_id=str(user_id),
            daily_cap=daily_cap,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily Google API quota cap reached for {endpoint} "
                f"(limit {daily_cap}/day). Try again after midnight UTC."
            ),
        )


async def bump_google_quota(
    supabase,
    user_id: UUID | str,
    endpoint: str,
    daily_cap: int,
) -> None:
    """Async wrapper around :func:`bump_google_quota_sync`.

    All existing callers ``await`` this function. The autocomplete endpoint
    uses the sync variant directly via ``asyncio.to_thread`` for parallel
    execution with the Places API call.
    """
    bump_google_quota_sync(supabase, user_id, endpoint, daily_cap)
