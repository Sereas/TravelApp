"""Option routes (itinerary) API: list, create, get, recalculate, delete."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.app.clients.google_routes import GoogleRoutesClient
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_routes_client
from backend.app.models.schemas import (
    CreateRouteBody,
    RecalculateRouteBody,
    RouteResponse,
    RouteWithSegmentsResponse,
    UpdateRouteBody,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain
from backend.app.services.route_calculation import (
    get_route_with_fresh_segments,
)

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_routes")

router = APIRouter(prefix="/trips", tags=["itinerary-routes"])


def _route_status_from_totals(duration_seconds: int | None, distance_meters: int | None) -> str:
    """Derive route_status for list/get: pending when metrics not yet calculated."""
    if duration_seconds is None and distance_meters is None:
        return "pending"
    return "ok"


def _rpc_row_to_response(row: dict) -> RouteResponse:
    """Build RouteResponse from a get_option_routes RPC row."""
    location_ids = row.get("location_ids") or []
    if isinstance(location_ids, str):
        location_ids = [lid.strip() for lid in location_ids.split(",") if lid.strip()]
    duration = row.get("duration_seconds")
    distance = row.get("distance_meters")
    return RouteResponse(
        route_id=str(row["route_id"]),
        option_id=str(row["option_id"]),
        label=row.get("label"),
        transport_mode=str(row.get("transport_mode", "")),
        duration_seconds=duration,
        distance_meters=distance,
        sort_order=int(row.get("sort_order", 0)),
        location_ids=[str(lid) for lid in location_ids],
        route_status=row.get("route_status") or _route_status_from_totals(duration, distance),
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    result = supabase.rpc(
        "create_route_with_stops",
        {
            "p_option_id": str(option_id),
            "p_transport_mode": body.transport_mode,
            "p_label": body.label,
            "p_location_ids": body.location_ids,
        },
    ).execute()
    if not result.data:
        logger.error(
            "route_create_failed",
            trip_id=str(trip_id),
            day_id=str(day_id),
            option_id=str(option_id),
            error_category="db",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create route; please try again",
        )
    row = result.data if isinstance(result.data, dict) else result.data[0]
    row["location_ids"] = body.location_ids
    # New route has no segments yet; metrics when client calls get with segments or recalculate
    row["route_status"] = "pending"
    logger.info(
        "route_created",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        route_id=str(row.get("route_id", "")),
    )
    return _rpc_row_to_response(row)


@router.get(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
    response_model=RouteResponse | RouteWithSegmentsResponse,
)
async def get_route(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    route_id: UUID,
    include_segments: bool = Query(
        False, description="Include per-segment distance, duration, and polyline"
    ),
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
    routes_client: GoogleRoutesClient | None = Depends(get_google_routes_client),
):
    """
    Get one route by id. If include_segments=true, returns segment data and geometry for MapLibre.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    existing = (
        supabase.table("option_routes")
        .select(
            "route_id, option_id, label, transport_mode, duration_seconds, "
            "distance_meters, sort_order"
        )
        .eq("route_id", str(route_id))
        .eq("option_id", str(option_id))
        .execute()
    )
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    if include_segments:
        # Retry-on-view: reuse cache or recompute only eligible segments
        try:
            with_segments = get_route_with_fresh_segments(
                supabase,
                str(route_id),
                transport_mode=None,
                force_refresh=False,
                google_routes_client=routes_client,
            )
        except LookupError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Route not found"
            ) from None
        except ValueError as e:
            logger.warning("route_calculation_error", error=str(e), error_category="internal")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Route calculation failed",
            ) from e
        return with_segments
    stops = (
        supabase.table("route_stops")
        .select("location_id, stop_order")
        .eq("route_id", str(route_id))
        .order("stop_order")
        .execute()
    )
    stops_sorted = sorted((stops.data or []), key=lambda r: r["stop_order"])
    location_ids = [str(s["location_id"]) for s in stops_sorted]
    row = existing.data[0]
    duration = row.get("duration_seconds")
    distance = row.get("distance_meters")
    return RouteResponse(
        route_id=str(row["route_id"]),
        option_id=str(row["option_id"]),
        label=row.get("label"),
        transport_mode=str(row.get("transport_mode", "walk")),
        duration_seconds=duration,
        distance_meters=distance,
        sort_order=int(row.get("sort_order", 0)),
        location_ids=location_ids,
        route_status=_route_status_from_totals(duration, distance),
    )


@router.patch(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}",
    response_model=RouteResponse,
)
async def update_route(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    route_id: UUID,
    body: UpdateRouteBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update a route's stops, transport mode, and/or label.
    When location_ids changes, stale route_segments are cleared and metrics reset to pending.
    Segment cache is preserved so unchanged stop-pairs reuse cached results.
    """
    if body.transport_mode is None and body.label is None and body.location_ids is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one of transport_mode, label, or location_ids is required",
        )
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    try:
        result = supabase.rpc(
            "update_route_with_stops",
            {
                "p_route_id": str(route_id),
                "p_option_id": str(option_id),
                "p_transport_mode": body.transport_mode,
                "p_label": body.label,
                "p_location_ids": body.location_ids,
            },
        ).execute()
    except Exception as e:
        err_msg = str(e)
        if "ROUTE_NOT_FOUND" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Route not found"
            ) from None
        raise
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    row = result.data if isinstance(result.data, dict) else result.data[0]
    row["location_ids"] = body.location_ids or []
    # If stops changed, status is pending; otherwise preserve
    if body.location_ids is not None:
        row["route_status"] = "pending"
    else:
        row["route_status"] = _route_status_from_totals(
            row.get("duration_seconds"), row.get("distance_meters")
        )
    # If location_ids not changed, fetch current stops for the response
    if body.location_ids is None:
        stops = (
            supabase.table("route_stops")
            .select("location_id, stop_order")
            .eq("route_id", str(route_id))
            .order("stop_order")
            .execute()
        )
        row["location_ids"] = [str(s["location_id"]) for s in (stops.data or [])]
    logger.info(
        "route_updated",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        route_id=str(route_id),
        changed_stops=body.location_ids is not None,
        changed_transport=body.transport_mode is not None,
    )
    return _rpc_row_to_response(row)


@router.post(
    "/{trip_id}/days/{day_id}/options/{option_id}/routes/{route_id}/recalculate",
    response_model=RouteWithSegmentsResponse,
)
async def recalculate_route_endpoint(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    route_id: UUID,
    body: RecalculateRouteBody | None = None,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
    routes_client: GoogleRoutesClient | None = Depends(get_google_routes_client),
):
    """
    Refresh route segments (retry-on-view). Recomputes only segments eligible for retry
    unless force_refresh=true. No automated retries; only when user views or calls this.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    existing = (
        supabase.table("option_routes")
        .select("route_id, transport_mode")
        .eq("route_id", str(route_id))
        .eq("option_id", str(option_id))
        .execute()
    )
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    transport_mode = (
        (body.transport_mode if body else None) or existing.data[0].get("transport_mode") or "walk"
    )
    force_refresh = bool(body and body.force_refresh)
    try:
        result = get_route_with_fresh_segments(
            supabase,
            str(route_id),
            transport_mode=transport_mode,
            force_refresh=force_refresh,
            google_routes_client=routes_client,
        )
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Route not found"
        ) from None
    except ValueError as e:
        logger.warning("route_calculation_error", error=str(e), error_category="internal")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route calculation failed",
        ) from e
    return result


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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
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
