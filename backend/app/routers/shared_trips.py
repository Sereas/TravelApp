"""Public shared trip access + owner share management endpoints."""

import os
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    ItineraryResponse,
    ItineraryRoute,
    RouteSegmentSummary,
    SharedLocationSummary,
    SharedTripInfo,
    SharedTripResponse,
    ShareTripResponse,
)
from backend.app.routers.itinerary_tree import (
    _build_itinerary_response,
    _rpc_rows_to_tree_data,
)
from backend.app.routers.trip_ownership import _ensure_trip_owned

logger: structlog.stdlib.BoundLogger = structlog.get_logger("shared_trips")

router = APIRouter(tags=["sharing"])

_FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL", "https://shtabtravel.vercel.app")


# ---------------------------------------------------------------------------
# Public endpoint (no auth)
# ---------------------------------------------------------------------------


@router.get("/shared/{share_token}", response_model=SharedTripResponse)
async def get_shared_trip(
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
        # Attach routes (same logic as itinerary_tree.get_itinerary)
        all_option_ids = [opt.id for d in itinerary.days for opt in d.options]
        if all_option_ids:
            routes_rpc = supabase.rpc(
                "get_itinerary_routes", {"p_option_ids": all_option_ids}
            ).execute()
            routes_by_option: dict[str, list[ItineraryRoute]] = {}
            for r in routes_rpc.data or []:
                oid = str(r["option_id"])
                dur = r.get("duration_seconds")
                dist = r.get("distance_meters")
                route_status = "pending" if (dur is None and dist is None) else "ok"
                segments = [
                    RouteSegmentSummary(
                        segment_order=int(s["segment_order"]),
                        duration_seconds=s.get("duration_seconds"),
                        distance_meters=s.get("distance_meters"),
                        encoded_polyline=s.get("encoded_polyline"),
                    )
                    for s in (r.get("segments") or [])
                ]
                route = ItineraryRoute(
                    route_id=str(r["route_id"]),
                    label=r.get("label"),
                    transport_mode=r.get("transport_mode", "walk"),
                    duration_seconds=dur,
                    distance_meters=dist,
                    sort_order=int(r.get("sort_order", 0)),
                    location_ids=[str(lid) for lid in (r.get("stop_location_ids") or [])],
                    route_status=route_status,
                    segments=segments,
                )
                routes_by_option.setdefault(oid, []).append(route)
            for d in itinerary.days:
                for opt in d.options:
                    opt.routes = routes_by_option.get(opt.id, [])
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
    _ensure_trip_owned(supabase, trip_id, user_id)

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

    insert_result = (
        supabase.table("trip_shares")
        .insert({"trip_id": str(trip_id), "created_by": str(user_id)})
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
    _ensure_trip_owned(supabase, trip_id, user_id)

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
    _ensure_trip_owned(supabase, trip_id, user_id)

    supabase.table("trip_shares").update({"is_active": False}).eq(
        "trip_id", str(trip_id)
    ).eq("is_active", True).execute()
