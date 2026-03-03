"""Option-locations (itinerary) API: list, add, update, delete, batch-add for an option."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    AddOptionLocationBody,
    LocationSummary,
    OptionLocationResponse,
    UpdateOptionLocationBody,
)
from backend.app.routers.itinerary_options import _ensure_day_in_trip
from backend.app.routers.trip_ownership import _ensure_trip_owned

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_option_locations")

router = APIRouter(prefix="/trips", tags=["itinerary-option-locations"])

_OPTION_LOCATIONS_SELECT = "option_id, location_id, sort_order, time_period"
_LOCATION_SUMMARY_SELECT = (
    "location_id, name, city, address, google_link, category, note, working_hours, requires_booking"
)


def _build_location_summary(loc_row: dict | None, location_id: str) -> LocationSummary:
    """Build a LocationSummary from a locations row (or fallback)."""
    if not loc_row:
        return LocationSummary(id=location_id, name="")
    return LocationSummary(
        id=location_id,
        name=loc_row.get("name", ""),
        city=loc_row.get("city"),
        address=loc_row.get("address"),
        google_link=loc_row.get("google_link"),
        category=loc_row.get("category"),
        note=loc_row.get("note"),
        working_hours=loc_row.get("working_hours"),
        requires_booking=loc_row.get("requires_booking"),
    )


def _option_location_row_to_response(
    row: dict,
    *,
    loc_row: dict | None = None,
) -> OptionLocationResponse:
    """Build OptionLocationResponse from an option_locations row dict plus optional location row."""
    loc_id = str(row["location_id"])
    summary = _build_location_summary(loc_row, loc_id)
    return OptionLocationResponse(
        option_id=str(row["option_id"]),
        location_id=loc_id,
        sort_order=int(row.get("sort_order", 0)),
        time_period=str(row.get("time_period", "")),
        location=summary,
    )


def _ensure_option_in_day(supabase, day_id: UUID, option_id: UUID) -> None:
    """Raise 404 if option does not exist or does not belong to day."""
    result = (
        supabase.table("day_options")
        .select("option_id, day_id")
        .eq("option_id", str(option_id))
        .eq("day_id", str(day_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")


def _ensure_location_in_trip(supabase, trip_id: UUID, location_id: UUID) -> None:
    """Raise 400 if location does not belong to trip."""
    result = (
        supabase.table("locations")
        .select("location_id, trip_id")
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        # Spec allows 400 or 404; we use 400 with clear message.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Location does not belong to this trip",
        )


@router.get(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations",
    response_model=list[OptionLocationResponse],
)
async def list_option_locations(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all locations attached to an option for a given day.
    Requires valid JWT; trip must be owned; day and option must belong to trip; else 404.
    Returns 200 with array ordered by sort_order (asc); empty → [].
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    result = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("option_id", str(option_id))
        .order("sort_order")
        .execute()
    )
    items = result.data if result.data else []
    # Fetch locations in a single query to embed LocationSummary
    location_ids = [str(r["location_id"]) for r in items if r.get("location_id")]
    locations_by_id: dict[str, dict] = {}
    if location_ids:
        loc_result = (
            supabase.table("locations")
            .select(_LOCATION_SUMMARY_SELECT)
            .eq("trip_id", str(trip_id))
            .in_("location_id", location_ids)
            .execute()
        )
        for loc in loc_result.data or []:
            locations_by_id[str(loc["location_id"])] = loc
    logger.info(
        "option_locations_listed",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        count=len(items),
    )
    return [
        _option_location_row_to_response(r, loc_row=locations_by_id.get(str(r["location_id"])))
        for r in items
    ]


@router.post(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations",
    response_model=OptionLocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_location_to_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    body: AddOptionLocationBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Add a location to an option for a day.
    Requires valid JWT. Trip/day/option must exist and be owned; location must belong to trip.
    409 if (option_id, location_id) already exists.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    _ensure_location_in_trip(supabase, trip_id, body.location_id)
    # Uniqueness: (option_id, location_id)
    existing = (
        supabase.table("option_locations")
        .select("option_id, location_id")
        .eq("option_id", str(option_id))
        .eq("location_id", str(body.location_id))
        .execute()
    )
    if existing.data and len(existing.data) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location already added to this option",
        )
    row = {
        "option_id": str(option_id),
        "location_id": str(body.location_id),
        "sort_order": body.sort_order,
        "time_period": body.time_period,
    }
    result = supabase.table("option_locations").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error(
            "option_location_insert_failed",
            trip_id=str(trip_id),
            day_id=str(day_id),
            option_id=str(option_id),
            location_id=str(body.location_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add location to option; please try again",
        )
    rec = result.data[0]
    loc_row = (
        supabase.table("locations")
        .select(_LOCATION_SUMMARY_SELECT)
        .eq("trip_id", str(trip_id))
        .eq("location_id", str(rec.get("location_id")))
        .execute()
    )
    loc_data = (loc_row.data or [None])[0] if loc_row.data else None
    logger.info(
        "option_location_added",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        location_id=str(rec.get("location_id")),
    )
    return _option_location_row_to_response(rec, loc_row=loc_data)


@router.patch(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/{location_id}",
    response_model=OptionLocationResponse,
)
async def update_option_location(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    location_id: UUID,
    body: UpdateOptionLocationBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update an option-location link (sort_order and/or time_period).
    Trip/day/option must exist and be owned; link must exist; else 404.
    422 if no fields provided.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    existing = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("option_id", str(option_id))
        .eq("location_id", str(location_id))
        .execute()
    )
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Option-location not found",
        )
    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    update_data: dict[str, object] = {}
    if "sort_order" in body.model_fields_set and body.sort_order is not None:
        update_data["sort_order"] = body.sort_order
    if "time_period" in body.model_fields_set and body.time_period is not None:
        update_data["time_period"] = body.time_period
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    supabase.table("option_locations").update(update_data).eq("option_id", str(option_id)).eq(
        "location_id", str(location_id)
    ).execute()
    updated = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("option_id", str(option_id))
        .eq("location_id", str(location_id))
        .execute()
    )
    if not updated.data or len(updated.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Option-location was updated but could not be retrieved; please refresh",
        )
    rec = updated.data[0]
    loc_row = (
        supabase.table("locations")
        .select(_LOCATION_SUMMARY_SELECT)
        .eq("trip_id", str(trip_id))
        .eq("location_id", str(location_id))
        .execute()
    )
    loc_data = (loc_row.data or [None])[0] if loc_row.data else None
    logger.info(
        "option_location_updated",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        location_id=str(location_id),
    )
    return _option_location_row_to_response(rec, loc_row=loc_data)


@router.delete(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_location_from_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    location_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Remove a location from an option.
    Trip/day/option must exist and be owned; link must exist; else 404.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    existing = (
        supabase.table("option_locations")
        .select("option_id, location_id")
        .eq("option_id", str(option_id))
        .eq("location_id", str(location_id))
        .execute()
    )
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Option-location not found",
        )
    supabase.table("option_locations").delete().eq("option_id", str(option_id)).eq(
        "location_id", str(location_id)
    ).execute()
    logger.info(
        "option_location_removed",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        location_id=str(location_id),
    )


@router.post(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/batch",
    response_model=list[OptionLocationResponse],
    status_code=status.HTTP_201_CREATED,
)
async def batch_add_locations_to_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    body: list[AddOptionLocationBody],
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Batch-add multiple locations to an option. All-or-nothing semantics.
    Trip/day/option must exist and be owned. Each location must belong to trip.
    409 if any (option_id, location_id) already exists. 422 on empty array.
    """
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one option-location required",
        )
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    _ensure_option_in_day(supabase, day_id, option_id)
    seen_pairs: set[tuple[str, str]] = set()
    # Validation pass: check locations belong to trip and no conflicts.
    for item in body:
        _ensure_location_in_trip(supabase, trip_id, item.location_id)
        key = (str(option_id), str(item.location_id))
        if key in seen_pairs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Duplicate location in batch for this option",
            )
        seen_pairs.add(key)
        existing = (
            supabase.table("option_locations")
            .select("option_id, location_id")
            .eq("option_id", str(option_id))
            .eq("location_id", str(item.location_id))
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Location already added to this option",
            )
    # Insert pass: now we can safely write rows.
    created: list[OptionLocationResponse] = []
    for item in body:
        row = {
            "option_id": str(option_id),
            "location_id": str(item.location_id),
            "sort_order": item.sort_order,
            "time_period": item.time_period,
        }
        result = supabase.table("option_locations").insert(row).execute()
        if not result.data or len(result.data) == 0:
            logger.error(
                "option_locations_batch_insert_failed",
                trip_id=str(trip_id),
                day_id=str(day_id),
                option_id=str(option_id),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create one or more option-locations; please try again",
            )
        rec = result.data[0]
        loc_row = (
            supabase.table("locations")
            .select(_LOCATION_SUMMARY_SELECT)
            .eq("trip_id", str(trip_id))
            .eq("location_id", str(rec.get("location_id")))
            .execute()
        )
        loc_data = (loc_row.data or [None])[0] if loc_row.data else None
        created.append(_option_location_row_to_response(rec, loc_row=loc_data))
    logger.info(
        "option_locations_batch_added",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        count=len(created),
    )
    return created
