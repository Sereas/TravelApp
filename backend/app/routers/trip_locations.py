"""Trip locations API: add, list, batch-add, update locations for a trip."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    AddLocationBody,
    LocationResponse,
    UpdateLocationBody,
)

router = APIRouter(prefix="/trips", tags=["trips-locations"])


@router.post(
    "/{trip_id}/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_location(
    trip_id: UUID,
    body: AddLocationBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Add a location to a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    """
    trip_result = (
        supabase.table("trips")
        .select("trip_id, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not trip_result.data or len(trip_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = trip_result.data[0]
    if trip.get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )
    row = {
        "trip_id": str(trip_id),
        "name": body.name,
        "address": body.address,
        "google_link": body.google_link,
        "note": body.note,
    }
    result = supabase.table("locations").insert(row).execute()
    if not result.data or len(result.data) == 0:
        raise RuntimeError("Insert did not return row")
    loc = result.data[0]
    return LocationResponse(
        id=str(loc["location_id"]),
        name=loc.get("name", body.name),
        address=loc.get("address"),
        google_link=loc.get("google_link"),
        note=loc.get("note"),
    )


@router.get(
    "/{trip_id}/locations",
    response_model=list[LocationResponse],
)
async def list_locations(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all locations for a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Returns 200 with array of locations; empty array if trip has no locations.
    """
    trip_result = (
        supabase.table("trips")
        .select("trip_id, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not trip_result.data or len(trip_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = trip_result.data[0]
    if trip.get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )
    result = (
        supabase.table("locations")
        .select("location_id, trip_id, name, address, google_link, note")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    items = result.data if result.data else []
    return [
        LocationResponse(
            id=str(loc["location_id"]),
            name=loc.get("name", ""),
            address=loc.get("address"),
            google_link=loc.get("google_link"),
            note=loc.get("note"),
        )
        for loc in items
    ]


@router.post(
    "/{trip_id}/locations/batch",
    response_model=list[LocationResponse],
    status_code=status.HTTP_201_CREATED,
)
async def batch_add_locations(
    trip_id: UUID,
    body: list[AddLocationBody],
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Add multiple locations to a trip in one request. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Body must be a non-empty array; each item must have a non-empty name.
    """
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one location required",
        )
    trip_result = (
        supabase.table("trips")
        .select("trip_id, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not trip_result.data or len(trip_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = trip_result.data[0]
    if trip.get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )
    rows = [
        {
            "trip_id": str(trip_id),
            "name": item.name,
            "address": item.address,
            "google_link": item.google_link,
            "note": item.note,
        }
        for item in body
    ]
    result = supabase.table("locations").insert(rows).execute()
    if not result.data or len(result.data) != len(body):
        raise RuntimeError("Insert did not return expected rows")
    return [
        LocationResponse(
            id=str(loc["location_id"]),
            name=loc.get("name", body[i].name),
            address=loc.get("address"),
            google_link=loc.get("google_link"),
            note=loc.get("note"),
        )
        for i, loc in enumerate(result.data)
    ]


@router.patch(
    "/{trip_id}/locations/{location_id}",
    response_model=LocationResponse,
)
async def update_location(
    trip_id: UUID,
    location_id: UUID,
    body: UpdateLocationBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update a location's user-facing fields for a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; location must belong
    to the trip; else 404 with descriptive message.
    """
    # Trip ownership check
    trip_result = (
        supabase.table("trips")
        .select("trip_id, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not trip_result.data or len(trip_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    trip = trip_result.data[0]
    if trip.get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )

    # Ensure the location exists under this trip
    loc_result = (
        supabase.table("locations")
        .select("location_id, trip_id, name, address, google_link, note")
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not loc_result.data or len(loc_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )

    update_data: dict[str, object] = {}
    if "name" in body.model_fields_set:
        update_data["name"] = body.name
    if "address" in body.model_fields_set:
        update_data["address"] = body.address
    if "google_link" in body.model_fields_set:
        update_data["google_link"] = body.google_link
    if "note" in body.model_fields_set:
        update_data["note"] = body.note

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )

    update_result = (
        supabase.table("locations")
        .update(update_data)
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not update_result.data or len(update_result.data) == 0:
        raise RuntimeError("Update did not return row")
    loc = update_result.data[0]
    return LocationResponse(
        id=str(loc["location_id"]),
        name=loc.get("name", ""),
        address=loc.get("address"),
        google_link=loc.get("google_link"),
        note=loc.get("note"),
    )

