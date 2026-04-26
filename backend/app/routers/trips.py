"""Trips API: create, list, get, update, delete trips."""

from datetime import date
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_email, get_current_user_id
from backend.app.models.schemas import CreateTripBody, TripResponse, UpdateTripBody
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("trips")

router = APIRouter(prefix="/trips", tags=["trips"])


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    body: CreateTripBody,
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
):
    """
    Create a trip owned by the authenticated user.
    Atomically creates trip + owner membership row via RPC.
    """
    result = supabase.rpc(
        "create_trip_with_owner",
        {
            "p_trip_name": body.name,
            "p_start_date": body.start_date.isoformat() if body.start_date else None,
            "p_end_date": body.end_date.isoformat() if body.end_date else None,
            "p_user_id": str(user_id),
            "p_user_email": user_email,
        },
    ).execute()
    if not result.data:
        raise RuntimeError("create_trip_with_owner did not return trip_id")
    trip_id = result.data
    logger.info("trip_created", trip_id=str(trip_id), user_id=str(user_id))
    return TripResponse(
        id=str(trip_id),
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        role="owner",
    )


def _trip_row_to_response(trip: dict, role: str | None = None) -> TripResponse:
    start = trip.get("start_date")
    end = trip.get("end_date")
    if isinstance(start, str):
        start = date.fromisoformat(start) if start else None
    if isinstance(end, str):
        end = date.fromisoformat(end) if end else None
    return TripResponse(
        id=str(trip["trip_id"]),
        name=trip.get("trip_name", ""),
        start_date=start,
        end_date=end,
        role=role or trip.get("role"),
    )


@router.get("", response_model=list[TripResponse])
async def list_trips(
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all trips the user is a member of (owned + shared).
    Returns 200 with array of trips including the user's role.
    """
    result = supabase.rpc(
        "list_user_trips",
        {"p_user_id": str(user_id)},
    ).execute()
    items = result.data if result.data else []
    logger.info("trips_listed", user_id=str(user_id), count=len(items))
    return [_trip_row_to_response(t) for t in items]


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Get a trip by id. Requires valid JWT.
    User must be a member of the trip; else 404.
    """
    role = _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trips")
        .select("trip_id, trip_name, start_date, end_date")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    trip = result.data[0]
    logger.info("trip_retrieved", trip_id=str(trip_id), user_id=str(user_id))
    return _trip_row_to_response(trip, role=role)


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: UUID,
    body: UpdateTripBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update trip name and/or dates. Owner only.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, required_role="owner")

    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )

    update_data: dict[str, object] = {}
    if "name" in body.model_fields_set:
        update_data["trip_name"] = body.name
    if "start_date" in body.model_fields_set:
        update_data["start_date"] = body.start_date.isoformat() if body.start_date else None
    if "end_date" in body.model_fields_set:
        update_data["end_date"] = body.end_date.isoformat() if body.end_date else None

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )

    update_result = (
        supabase.table("trips").update(update_data).eq("trip_id", str(trip_id)).execute()
    )
    if not update_result.data or len(update_result.data) == 0:
        raise RuntimeError("Update did not return row")
    updated_trip = update_result.data[0]
    logger.info(
        "trip_updated",
        trip_id=str(trip_id),
        user_id=str(user_id),
        fields=list(update_data.keys()),
    )
    return _trip_row_to_response(updated_trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Delete a trip. Owner only.
    FK cascades handle locations, days, options, routes, segments, members deletion.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, required_role="owner")

    # FK cascades handle locations, days, options, routes, segments deletion
    supabase.table("trips").delete().eq("trip_id", str(trip_id)).execute()
    logger.info("trip_deleted", trip_id=str(trip_id), user_id=str(user_id))
