"""Shared helpers for enforcing trip membership access across routers."""

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
    required_role: str = "editor",
) -> str:
    """
    Verify the membership access chain in a single DB round-trip via RPC.

    Checks that ``user_id`` is a member of the trip with at least the
    ``required_role`` ('editor' or 'owner').  Optionally validates that
    ``day_id`` and ``option_id`` belong to the trip.

    Returns the user's actual role ('owner' or 'editor').
    Raises 404 if the user is not a member or the chain is invalid.
    """
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
        "verify_member_access",
        {
            "p_trip_id": str(trip_id),
            "p_user_id": str(user_id),
            "p_min_role": required_role,
            "p_day_id": str(day_id) if day_id else None,
            "p_option_id": str(option_id) if option_id else None,
        },
    ).execute()
    if not result.data:
        logger.warning(
            "ownership_denied",
            reason="member_access_denied",
            trip_id=str(trip_id),
            required_role=required_role,
            day_id=str(day_id) if day_id else None,
            option_id=str(option_id) if option_id else None,
            error_category="auth",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found or not owned",
        )
    role = result.data
    if not isinstance(role, str) or role not in ("owner", "editor"):
        logger.error(
            "unexpected_role_value",
            trip_id=str(trip_id),
            role_value=repr(role),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal authorization error",
        )
    return role
