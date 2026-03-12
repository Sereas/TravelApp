"""Trip locations API: add, list, batch-add, update locations for a trip."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    AddLocationBody,
    LocationResponse,
    UpdateLocationBody,
)

logger: structlog.stdlib.BoundLogger = structlog.get_logger("locations")

router = APIRouter(prefix="/trips", tags=["trips-locations"])

_LOCATIONS_SELECT = (
    "location_id, trip_id, name, address, google_link, google_place_id, "
    "google_source_type, google_raw, note, added_by_user_id, city, "
    "working_hours, requires_booking, category"
)


def _resolve_user_email(supabase_client, user_id: str | None) -> str | None:
    """Resolve email from auth.users for added_by_user_id. Returns None on failure."""
    if not user_id:
        return None
    try:
        resp = supabase_client.auth.admin.get_user_by_id(user_id)
        user = getattr(resp, "user", None) if resp else None
        if user:
            return getattr(user, "email", None)
        return None
    except Exception:
        return None


def _loc_to_response(supabase_client, loc: dict) -> LocationResponse:
    """Build LocationResponse from a locations row dict."""
    added_by_uid = loc.get("added_by_user_id")
    uid_str = str(added_by_uid) if added_by_uid else None
    return LocationResponse(
        id=str(loc["location_id"]),
        name=loc.get("name", ""),
        address=loc.get("address"),
        google_link=loc.get("google_link"),
        google_place_id=loc.get("google_place_id"),
        google_source_type=loc.get("google_source_type"),
        google_raw=loc.get("google_raw"),
        note=loc.get("note"),
        added_by_user_id=uid_str,
        added_by_email=_resolve_user_email(supabase_client, uid_str),
        city=loc.get("city"),
        working_hours=loc.get("working_hours"),
        requires_booking=loc.get("requires_booking"),
        category=loc.get("category"),
    )


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
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
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
        "google_place_id": body.google_place_id,
        "google_source_type": body.google_source_type,
        "google_raw": body.google_raw,
        "note": body.note,
        "added_by_user_id": str(user_id),
        "city": body.city,
        "working_hours": body.working_hours,
        "requires_booking": body.requires_booking,
        "category": body.category,
    }
    result = supabase.table("locations").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("location_insert_failed", trip_id=str(trip_id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create location; please try again",
        )
    loc = result.data[0]
    # Fetch full row with all columns (insert().execute() returns row but may omit some columns)
    loc_id = loc.get("location_id")
    if loc_id:
        fetch = (
            supabase.table("locations")
            .select(_LOCATIONS_SELECT)
            .eq("location_id", str(loc_id))
            .eq("trip_id", str(trip_id))
            .execute()
        )
        if fetch.data and len(fetch.data) > 0:
            loc = fetch.data[0]
    logger.info(
        "location_added",
        location_id=str(loc["location_id"]),
        trip_id=str(trip_id),
        name=body.name,
    )
    return _loc_to_response(supabase, loc)


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
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
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
        supabase.table("locations").select(_LOCATIONS_SELECT).eq("trip_id", str(trip_id)).execute()
    )
    items = result.data if result.data else []
    logger.info("locations_listed", trip_id=str(trip_id), count=len(items))
    return [_loc_to_response(supabase, loc) for loc in items]


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
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
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
            "google_place_id": item.google_place_id,
            "google_source_type": item.google_source_type,
            "google_raw": item.google_raw,
            "note": item.note,
            "added_by_user_id": str(user_id),
            "city": item.city,
            "working_hours": item.working_hours,
            "requires_booking": item.requires_booking,
            "category": item.category,
        }
        for item in body
    ]
    result = supabase.table("locations").insert(rows).execute()
    if not result.data or len(result.data) != len(body):
        logger.error(
            "locations_batch_insert_failed",
            trip_id=str(trip_id),
            expected=len(body),
            got=len(result.data) if result.data else 0,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create one or more locations; please try again",
        )
    # Fetch full rows with all columns in a single query
    loc_ids = [str(loc["location_id"]) for loc in result.data if loc.get("location_id")]
    if loc_ids:
        fetch = (
            supabase.table("locations")
            .select(_LOCATIONS_SELECT)
            .eq("trip_id", str(trip_id))
            .in_("location_id", loc_ids)
            .execute()
        )
        fetched_by_id = {r["location_id"]: r for r in (fetch.data or [])}
    else:
        fetched_by_id = {}
    out = []
    for loc in result.data:
        lid = loc.get("location_id")
        full = fetched_by_id.get(str(lid), loc) if lid else loc
        out.append(_loc_to_response(supabase, full))
    logger.info("locations_batch_added", trip_id=str(trip_id), count=len(body))
    return out


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
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
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
        .select(_LOCATIONS_SELECT)
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not loc_result.data or len(loc_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    update_data: dict[str, object] = {}
    for field in (
        "name",
        "address",
        "google_link",
        "google_place_id",
        "google_source_type",
        "google_raw",
        "note",
        "city",
        "working_hours",
        "requires_booking",
        "category",
    ):
        if field in body.model_fields_set:
            update_data[field] = getattr(body, field)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )

    supabase.table("locations").update(update_data).eq("location_id", str(location_id)).eq(
        "trip_id", str(trip_id)
    ).execute()

    # Fetch full row (update().execute() returns representation but builder has no .select())
    fetch = (
        supabase.table("locations")
        .select(_LOCATIONS_SELECT)
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not fetch.data or len(fetch.data) == 0:
        logger.error(
            "location_update_fetch_failed",
            location_id=str(location_id),
            trip_id=str(trip_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Location was updated but could not be retrieved; please refresh",
        )
    loc = fetch.data[0]
    logger.info(
        "location_updated",
        location_id=str(location_id),
        trip_id=str(trip_id),
        fields=list(update_data.keys()),
    )
    return _loc_to_response(supabase, loc)


@router.delete(
    "/{trip_id}/locations/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_location(
    trip_id: UUID,
    location_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Delete a location from a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; location must
    belong to the trip; else 404 with descriptive message.
    Returns 204 No Content on success.
    """
    trip_result = (
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
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

    loc_result = (
        supabase.table("locations")
        .select("location_id")
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not loc_result.data or len(loc_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    supabase.table("locations").delete().eq("location_id", str(location_id)).execute()
    logger.info(
        "location_deleted",
        location_id=str(location_id),
        trip_id=str(trip_id),
    )
