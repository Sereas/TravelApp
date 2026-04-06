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
    ReorderOptionLocationsBody,
    UpdateOptionLocationBody,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_option_locations")

router = APIRouter(prefix="/trips", tags=["itinerary-option-locations"])

_OPTION_LOCATIONS_SELECT = "id, option_id, location_id, sort_order, time_period"
_LOCATION_SUMMARY_SELECT = (
    "location_id, name, city, address, google_link, google_place_id, "
    "category, note, working_hours, requires_booking, user_image_url"
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
        image_url=loc_row.get("image_url"),
        user_image_url=loc_row.get("user_image_url"),
        attribution_name=loc_row.get("attribution_name"),
        attribution_uri=loc_row.get("attribution_uri"),
    )


def _enrich_locations_with_photos(supabase, locations_by_id: dict[str, dict]) -> None:
    """Batch-fetch photo URLs and inject image_url into location dicts (single query)."""
    place_ids = [
        loc["google_place_id"] for loc in locations_by_id.values() if loc.get("google_place_id")
    ]
    if not place_ids:
        return
    photos = (
        supabase.table("place_photos")
        .select("google_place_id, photo_url, attribution_name, attribution_uri")
        .in_("google_place_id", place_ids)
        .execute()
    )
    photo_map = {row["google_place_id"]: row for row in (photos.data or [])}
    for loc in locations_by_id.values():
        photo_row = photo_map.get(loc.get("google_place_id") or "")
        loc["image_url"] = photo_row["photo_url"] if photo_row else None
        loc["attribution_name"] = photo_row.get("attribution_name") if photo_row else None
        loc["attribution_uri"] = photo_row.get("attribution_uri") if photo_row else None


def _option_location_row_to_response(
    row: dict,
    *,
    loc_row: dict | None = None,
) -> OptionLocationResponse:
    """Build OptionLocationResponse from an option_locations row dict plus optional location row."""
    loc_id = str(row["location_id"])
    summary = _build_location_summary(loc_row, loc_id)
    return OptionLocationResponse(
        id=str(row["id"]),
        option_id=str(row["option_id"]),
        location_id=loc_id,
        sort_order=int(row.get("sort_order", 0)),
        time_period=str(row.get("time_period", "")),
        location=summary,
    )


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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
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
    _enrich_locations_with_photos(supabase, locations_by_id)
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    _ensure_location_in_trip(supabase, trip_id, body.location_id)
    # Duplicates are now allowed — same location can appear multiple times in an option
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
            error_category="db",
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
    if loc_data:
        _enrich_locations_with_photos(supabase, {str(rec.get("location_id")): loc_data})
    logger.info(
        "option_location_added",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        location_id=str(rec.get("location_id")),
    )
    return _option_location_row_to_response(rec, loc_row=loc_data)


@router.patch(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/reorder",
    response_model=list[OptionLocationResponse],
)
async def reorder_option_locations(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    body: ReorderOptionLocationsBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Reorder locations within an option. Body: ordered list of ol_ids (option_locations.id).
    Backend sets sort_order to 0, 1, 2, … by position.
    422 if any id not in this option or duplicate ol_id.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    option_id_str = str(option_id)
    if not body.ol_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ol_ids must not be empty",
        )
    seen: set[str] = set()
    for oid in body.ol_ids:
        oid_str = str(oid)
        if oid_str in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Duplicate ol_id in ol_ids",
            )
        seen.add(oid_str)
    # Fetch current option_locations for this option to validate all ol_ids belong
    current = (
        supabase.table("option_locations")
        .select("id")
        .eq("option_id", option_id_str)
        .execute()
    )
    current_ids = {str(r["id"]) for r in (current.data or [])}
    if seen != current_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ol_ids must match exactly the option_locations in this option",
        )
    supabase.rpc(
        "reorder_option_locations",
        {"p_option_id": option_id_str, "p_ol_ids": [str(oid) for oid in body.ol_ids]},
    ).execute()
    result = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("option_id", option_id_str)
        .order("sort_order")
        .execute()
    )
    items = result.data if result.data else []
    loc_rows = (
        supabase.table("locations")
        .select(_LOCATION_SUMMARY_SELECT)
        .eq("trip_id", str(trip_id))
        .in_("location_id", [str(r["location_id"]) for r in items])
        .execute()
    )
    loc_by_id = {str(r["location_id"]): r for r in (loc_rows.data or [])}
    _enrich_locations_with_photos(supabase, loc_by_id)
    logger.info(
        "option_locations_reordered",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=option_id_str,
        count=len(items),
    )
    return [
        _option_location_row_to_response(r, loc_row=loc_by_id.get(str(r["location_id"])))
        for r in items
    ]


@router.patch(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id}",
    response_model=OptionLocationResponse,
)
async def update_option_location(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    ol_id: UUID,
    body: UpdateOptionLocationBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update an option-location link (sort_order and/or time_period).
    Trip/day/option must exist and be owned; link must exist; else 404.
    422 if no fields provided. Addressed by ol_id (surrogate key).
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    existing = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("id", str(ol_id))
        .eq("option_id", str(option_id))
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
    supabase.table("option_locations").update(update_data).eq("id", str(ol_id)).execute()
    updated = (
        supabase.table("option_locations")
        .select(_OPTION_LOCATIONS_SELECT)
        .eq("id", str(ol_id))
        .execute()
    )
    if not updated.data or len(updated.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Option-location was updated but could not be retrieved; please refresh",
        )
    rec = updated.data[0]
    location_id = str(rec["location_id"])
    loc_row = (
        supabase.table("locations")
        .select(_LOCATION_SUMMARY_SELECT)
        .eq("trip_id", str(trip_id))
        .eq("location_id", location_id)
        .execute()
    )
    loc_data = (loc_row.data or [None])[0] if loc_row.data else None
    if loc_data:
        _enrich_locations_with_photos(supabase, {location_id: loc_data})
    logger.info(
        "option_location_updated",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        ol_id=str(ol_id),
    )
    return _option_location_row_to_response(rec, loc_row=loc_data)


@router.delete(
    "/{trip_id}/days/{day_id}/options/{option_id}/locations/{ol_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_location_from_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    ol_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Remove a location from an option by its surrogate ol_id.
    Trip/day/option must exist and be owned; link must exist; else 404.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    option_id_str = str(option_id)
    ol_id_str = str(ol_id)
    # Single atomic RPC: handles route cleanup + option_locations delete in one transaction
    try:
        supabase.rpc(
            "remove_location_from_option",
            {"p_option_id": option_id_str, "p_ol_id": ol_id_str},
        ).execute()
    except Exception as exc:
        detail = str(exc)
        if "OPTION_LOCATION_NOT_FOUND" in detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Option-location not found",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove location from option; please try again",
        ) from exc
    logger.info(
        "option_location_removed",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        ol_id=str(ol_id),
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id, option_id=option_id)
    option_id_str = str(option_id)
    trip_id_str = str(trip_id)
    # Duplicates are allowed — same location can appear multiple times
    location_ids_to_add: list[str] = [str(item.location_id) for item in body]
    # Batch-validate: all locations belong to trip (single query, deduplicated)
    unique_location_ids = list(set(location_ids_to_add))
    loc_check = (
        supabase.table("locations")
        .select("location_id")
        .eq("trip_id", trip_id_str)
        .in_("location_id", unique_location_ids)
        .execute()
    )
    found_ids = {str(r["location_id"]) for r in (loc_check.data or [])}
    missing = [lid for lid in unique_location_ids if lid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Location does not belong to this trip",
        )
    # Batch insert via RPC (single DB call)
    rpc_result = supabase.rpc(
        "batch_insert_option_locations",
        {
            "p_option_id": option_id_str,
            "p_location_ids": location_ids_to_add,
            "p_sort_orders": [item.sort_order for item in body],
            "p_time_periods": [item.time_period for item in body],
        },
    ).execute()
    if not rpc_result.data or len(rpc_result.data) == 0:
        logger.error(
            "option_locations_batch_insert_failed",
            trip_id=trip_id_str,
            day_id=str(day_id),
            option_id=option_id_str,
            error_category="db",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create one or more option-locations; please try again",
        )
    # Fetch location summaries in one query
    loc_rows = (
        supabase.table("locations")
        .select(_LOCATION_SUMMARY_SELECT)
        .eq("trip_id", trip_id_str)
        .in_("location_id", location_ids_to_add)
        .execute()
    )
    loc_by_id = {str(r["location_id"]): r for r in (loc_rows.data or [])}
    _enrich_locations_with_photos(supabase, loc_by_id)
    created: list[OptionLocationResponse] = []
    for rec in rpc_result.data:
        loc_data = loc_by_id.get(str(rec.get("location_id")))
        created.append(_option_location_row_to_response(rec, loc_row=loc_data))
    logger.info(
        "option_locations_batch_added",
        trip_id=str(trip_id),
        day_id=str(day_id),
        option_id=str(option_id),
        count=len(created),
    )
    return created
