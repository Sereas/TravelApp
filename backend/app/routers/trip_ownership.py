"""Shared helpers for enforcing trip ownership across routers."""

from uuid import UUID

import structlog
from fastapi import HTTPException, status

logger: structlog.stdlib.BoundLogger = structlog.get_logger("ownership")


def _ensure_trip_owned(supabase, trip_id: UUID, user_id: UUID) -> None:
    """Raise 404 if trip does not exist or is not owned by user."""
    result = (
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
    )
    if not result.data or len(result.data) == 0:
        logger.warning(
            "ownership_denied",
            reason="trip_not_found",
            trip_id=str(trip_id),
            error_category="auth",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if result.data[0].get("user_id") != str(user_id):
        logger.warning(
            "ownership_denied",
            reason="trip_not_owned",
            trip_id=str(trip_id),
            error_category="auth",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )


def _ensure_resource_chain(
    supabase,
    trip_id: UUID,
    user_id: UUID,
    day_id: UUID | None = None,
    option_id: UUID | None = None,
) -> None:
    """
    Verify the full ownership chain in a single DB round-trip via RPC.

    Replaces sequential calls to _ensure_trip_owned / _ensure_day_in_trip /
    _ensure_option_in_day.  Raises 404 if any link in the chain is missing
    or not owned by the caller.
    """
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
