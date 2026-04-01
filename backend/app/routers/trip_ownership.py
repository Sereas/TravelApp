"""Shared helpers for enforcing trip ownership across routers."""

from uuid import UUID

import structlog
from fastapi import HTTPException, status

logger: structlog.stdlib.BoundLogger = structlog.get_logger("ownership")


def _ensure_resource_chain(
    supabase,
    trip_id: UUID,
    user_id: UUID,
    day_id: UUID | None = None,
    option_id: UUID | None = None,
) -> None:
    """
    Verify the full ownership chain in a single DB round-trip via RPC.

    Verifies the full ownership chain in a single DB round-trip via the
    ``verify_resource_chain`` RPC.  Raises 404 if any link in the chain is
    missing or not owned by the caller.
    """
    # HIGH-05: option_id without day_id is structurally invalid. The RPC's SQL
    # happens to deny access (NULL = p_day_id evaluates to FALSE), but this
    # guard catches the invalid call early with a distinct log entry.
    if option_id is not None and day_id is None:
        logger.warning(
            "ownership_denied",
            reason="option_without_day",
            trip_id=str(trip_id),
            option_id=str(option_id),
            error_category="auth",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found or not owned",
        )

    result = supabase.rpc(
        "verify_resource_chain",
        {
            "p_trip_id": str(trip_id),
            "p_user_id": str(user_id),
            "p_day_id": str(day_id) if day_id else None,
            "p_option_id": str(option_id) if option_id else None,
        },
    ).execute()
    if not result.data:
        logger.warning(
            "ownership_denied",
            reason="resource_chain_failed",
            trip_id=str(trip_id),
            day_id=str(day_id) if day_id else None,
            option_id=str(option_id) if option_id else None,
            error_category="auth",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found or not owned",
        )
