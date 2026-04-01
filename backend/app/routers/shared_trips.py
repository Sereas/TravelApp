"""Public shared trip access + owner share management endpoints."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi.util import get_remote_address

from backend.app.core.config import get_settings
from backend.app.core.rate_limit import limiter
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    ItineraryResponse,
    SharedLocationSummary,
    SharedTripInfo,
    SharedTripResponse,
    ShareTripResponse,
)
from backend.app.routers.itinerary_tree import (
    _attach_routes_to_itinerary,
    _build_itinerary_response,
    _rpc_rows_to_tree_data,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("shared_trips")

router = APIRouter(tags=["sharing"])

_FRONTEND_BASE = get_settings().frontend_base_url
_SHARE_TOKEN_EXPIRY_DAYS = 180


# ---------------------------------------------------------------------------
# Public endpoint (no auth)
# ---------------------------------------------------------------------------


@router.get("/shared/{share_token}", response_model=SharedTripResponse)
@limiter.limit("60/minute", key_func=get_remote_address)
async def get_shared_trip(
    request: Request,
    share_token: str,
    supabase=Depends(get_supabase_client),
) -> SharedTripResponse:
    """Public read-only trip view via share token. No authentication required."""
    result = supabase.rpc("get_shared_trip_data", {"p_share_token": share_token}).execute()
    data = result.data
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared trip not found")

    trip_data = data["trip"]
    locations_data = data["locations"] or []
    itinerary_rows = data["itinerary_rows"] or []

    trip_info = SharedTripInfo(
        name=trip_data["trip_name"],
        start_date=trip_data.get("start_date"),
        end_date=trip_data.get("end_date"),
    )

    locations = [SharedLocationSummary(**loc) for loc in locations_data]

    if itinerary_rows:
        day_rows, option_rows, ol_rows, locations_by_id = _rpc_rows_to_tree_data(itinerary_rows)
        itinerary = _build_itinerary_response(
            day_rows, option_rows, ol_rows, locations_by_id, include_empty_options=False
        )
        _attach_routes_to_itinerary(supabase, itinerary)
    else:
        itinerary = ItineraryResponse(days=[])

    return SharedTripResponse(trip=trip_info, locations=locations, itinerary=itinerary)


# ---------------------------------------------------------------------------
# Owner endpoints (auth required)
# ---------------------------------------------------------------------------


@router.post("/trips/{trip_id}/share", response_model=ShareTripResponse)
async def create_trip_share(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
) -> ShareTripResponse:
    """Create or return existing share link for a trip. Idempotent."""
    _ensure_resource_chain(supabase, trip_id, user_id)

    existing = (
        supabase.table("trip_shares")
        .select("share_token, created_at, expires_at")
        .eq("trip_id", str(trip_id))
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        return ShareTripResponse(
            share_token=row["share_token"],
            share_url=f"{_FRONTEND_BASE}/shared/{row['share_token']}",
            created_at=row["created_at"],
            expires_at=row.get("expires_at"),
        )

    expires_at = (datetime.now(UTC) + timedelta(days=_SHARE_TOKEN_EXPIRY_DAYS)).isoformat()
    insert_result = (
        supabase.table("trip_shares")
        .insert(
            {
                "trip_id": str(trip_id),
                "created_by": str(user_id),
                "expires_at": expires_at,
            }
        )
        .execute()
    )
    row = insert_result.data[0]
    return ShareTripResponse(
        share_token=row["share_token"],
        share_url=f"{_FRONTEND_BASE}/shared/{row['share_token']}",
        created_at=row["created_at"],
        expires_at=row.get("expires_at"),
    )


@router.get("/trips/{trip_id}/share", response_model=ShareTripResponse)
async def get_trip_share(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
) -> ShareTripResponse:
    """Get current active share for a trip, or 404."""
    _ensure_resource_chain(supabase, trip_id, user_id)

    result = (
        supabase.table("trip_shares")
        .select("share_token, created_at, expires_at")
        .eq("trip_id", str(trip_id))
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No active share for this trip"
        )

    row = result.data[0]
    return ShareTripResponse(
        share_token=row["share_token"],
        share_url=f"{_FRONTEND_BASE}/shared/{row['share_token']}",
        created_at=row["created_at"],
        expires_at=row.get("expires_at"),
    )


@router.delete("/trips/{trip_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_trip_share(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
) -> None:
    """Revoke all active shares for a trip."""
    _ensure_resource_chain(supabase, trip_id, user_id)

    supabase.table("trip_shares").update({"is_active": False}).eq("trip_id", str(trip_id)).eq(
        "is_active", True
    ).execute()
