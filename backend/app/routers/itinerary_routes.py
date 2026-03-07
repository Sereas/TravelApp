"""Option routes (itinerary) API: list, create, delete routes for an option."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import CreateRouteBody, RouteResponse
from backend.app.routers.itinerary_option_locations import _ensure_option_in_day
from backend.app.routers.itinerary_options import _ensure_day_in_trip
from backend.app.routers.trip_ownership import _ensure_trip_owned

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_routes")

router = APIRouter(prefix="/trips", tags=["itinerary-routes"])


def _rpc_row_to_response(row: dict) -> RouteResponse:
    """Build RouteResponse from a get_option_routes RPC row."""
    location_ids = row.get("location_ids") or []
    if isinstance(location_ids, str):
        location_ids = [lid.strip() for lid in location_ids.split(",") if lid.strip()]
    return RouteResponse(
        route_id=str(row["route_id"]),
        option_id=str(row["option_id"]),
        label=row.get("label"),
        transport_mode=str(row.get("transport_mode", "")),
        duration_seconds=row.get("duration_seconds"),
        distance_meters=row.get("distance_meters"),
        sort_order=int(row.get("sort_order", 0)),
        location_ids=[str(lid) for lid in location_ids],
    )


@router.get(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes",
    response_model=list[RouteResponse],
)
async def list_option_routes(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all routes for an option.
    Requires valid JWT; trip must be owned; day and option must belong to trip; else 404.
    Returns 200 with array ordered by sort_order (asc); empty → [].
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    result = supabase.rpc(
        "get_option_routes",
        {"p_option_id": str(option_id)},
    ).execute()
    items = result.data if result.data else []
    logger.info(
        "option_routes_listed",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        count=len(items),
    )
    return [_rpc_row_to_response(r) for r in items]


@router.post(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes",
    response_model=RouteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_route(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    body: CreateRouteBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Create a route with stops for an option.
    Requires valid JWT. Trip/day/option must exist and be owned; else 404.
    Uses create_route_with_stops RPC.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    result = supabase.rpc(
        "create_route_with_stops",
        {
            "p_option_id": str(option_id),
            "p_transport_mode": body.transport_mode,
            "p_label": body.label,
            "p_location_ids": body.location_ids,
        },
    ).execute()
    if not result.data or len(result.data) == 0:
        logger.error(
            "route_create_failed",
            trip_id=str(trip_id),
            day_id=str(day_id),
            option_id=str(option_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create route; please try again",
        )
    row = result.data[0]
    row["location_ids"] = body.location_ids
    logger.info(
        "route_created",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        route_id=str(row.get("route_id", "")),
    )
    return _rpc_row_to_response(row)


@router.delete(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_route(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    route_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Delete a route (cascade deletes stops).
    Trip/day/option must exist and be owned; route must exist; else 404.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    existing = (
        supabase.table("option_routes")
        .select("route_id")
        .eq("route_id", str(route_id))
        .eq("option_id", str(option_id))
        .execute()
    )
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Route not found",
        )
    supabase.table("option_routes").delete().eq("route_id", str(route_id)).execute()
    logger.info(
        "route_deleted",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        route_id=str(route_id),
    )
