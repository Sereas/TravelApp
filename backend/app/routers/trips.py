"""Trips API: create, list, get, update, delete trips."""

from datetime import date
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import CreateTripBody, TripResponse, UpdateTripBody

logger: structlog.stdlib.BoundLogger = structlog.get_logger("trips")

router = APIRouter(prefix="/trips", tags=["trips"])


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    body: CreateTripBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Create a trip owned by the authenticated user.
    Requires valid JWT in Authorization: Bearer <token>.
    """
    row = {
        "user_id": str(user_id),
        "trip_name": body.name,
        "start_date": body.start_date.isoformat() if body.start_date else None,
        "end_date": body.end_date.isoformat() if body.end_date else None,
    }
    result = supabase.table("trips").insert(row).execute()
    if not result.data or len(result.data) == 0:
        raise RuntimeError("Insert did not return row")
    trip = result.data[0]
    trip_id = trip["trip_id"]
    logger.info("trip_created", trip_id=str(trip_id), user_id=str(user_id), trip_name=body.name)
    return TripResponse(
        id=str(trip_id),
        name=trip.get("trip_name", body.name),
        start_date=body.start_date,
        end_date=body.end_date,
    )


def _trip_row_to_response(trip: dict) -> TripResponse:
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
    )


@router.get("", response_model=list[TripResponse])
async def list_trips(
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all trips for the authenticated user. Requires valid JWT.
    Returns 200 with array of trips (id, name, start_date, end_date); empty → [].
    """
    result = (
        supabase.table("trips")
        .select("trip_id, trip_name, start_date, end_date")
        .eq("user_id", str(user_id))
        .execute()
    )
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
    Trip must exist and be owned by the authenticated user; else 404.
    """
    result = (
        supabase.table("trips")
        .select("trip_id, trip_name, start_date, end_date, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = result.data[0]
    if trip.get("user_id") != str(user_id):
        logger.warning("trip_access_denied", trip_id=str(trip_id), user_id=str(user_id))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )
    logger.info("trip_retrieved", trip_id=str(trip_id), user_id=str(user_id))
    return _trip_row_to_response(trip)


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: UUID,
    body: UpdateTripBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update trip name and/or dates. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404 with
    a descriptive message.
    """
    # Ownership check
    result = (
        supabase.table("trips")
        .select("trip_id, trip_name, start_date, end_date, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = result.data[0]
    if trip.get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )

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
    Delete a trip and its associated locations. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Returns 204 No Content on success.
    """
    result = (
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = result.data[0]
    if trip.get("user_id") != str(user_id):
        logger.warning("trip_delete_denied", trip_id=str(trip_id), user_id=str(user_id))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )

    supabase.table("locations").delete().eq("trip_id", str(trip_id)).execute()
    supabase.table("trips").delete().eq("trip_id", str(trip_id)).execute()
    logger.info("trip_deleted", trip_id=str(trip_id), user_id=str(user_id))
