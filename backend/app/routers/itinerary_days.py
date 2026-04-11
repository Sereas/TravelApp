"""Trip days (itinerary) API: list, create, get, update, delete days for a trip."""

from datetime import date, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    CreateDayBody,
    DayResponse,
    ReassignDayDateBody,
    ReconcileDaysBody,
    ReorderDaysBody,
    UpdateDayBody,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_days")

router = APIRouter(prefix="/trips", tags=["itinerary-days"])

_TRIP_DAYS_SELECT = "day_id, trip_id, date, sort_order, created_at, active_option_id"


def _create_main_option_for_day(supabase, day_id: str) -> None:
    """Insert one main (empty) option for the day: option_index=1."""
    supabase.table("day_options").insert({"day_id": day_id, "option_index": 1}).execute()


def _day_row_to_response(row: dict) -> DayResponse:
    """Build DayResponse from a trip_days row dict."""
    d = row.get("date")
    if isinstance(d, str) and d:
        try:
            d = date.fromisoformat(d)
        except ValueError:
            d = None
    elif d is not None and not isinstance(d, date):
        d = None
    created_at = row.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            created_at = None
    active_option_id = row.get("active_option_id")
    return DayResponse(
        id=str(row["day_id"]),
        trip_id=str(row["trip_id"]),
        date=d,
        sort_order=int(row.get("sort_order", 0)),
        created_at=created_at,
        active_option_id=str(active_option_id) if active_option_id else None,
    )


@router.get("/{trip_id}/days", response_model=list[DayResponse])
async def list_days(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all itinerary days for a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Returns 200 with array of days ordered by sort_order (asc); empty → [].
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("trip_id", str(trip_id))
        .order("sort_order")
        .execute()
    )
    items = result.data if result.data else []
    logger.info("days_listed", trip_id=str(trip_id), count=len(items))
    return [_day_row_to_response(r) for r in items]


@router.post(
    "/{trip_id}/days",
    response_model=DayResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_day(
    trip_id: UUID,
    body: CreateDayBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Create an itinerary day for a trip. Backend assigns sort_order (append).
    Requires valid JWT. Trip must exist and be owned by the user; else 404.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    # Append: max(sort_order) + 1 for this trip
    max_result = (
        supabase.table("trip_days")
        .select("sort_order")
        .eq("trip_id", str(trip_id))
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    next_order = 0
    if max_result.data and len(max_result.data) > 0:
        next_order = int(max_result.data[0].get("sort_order", 0)) + 1
    row = {
        "trip_id": str(trip_id),
        "date": body.date.isoformat() if body.date else None,
        "sort_order": next_order,
    }
    result = supabase.table("trip_days").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("day_insert_failed", trip_id=str(trip_id), error_category="db")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create day; please try again",
        )
    day = result.data[0]
    day_id_str = str(day["day_id"])
    _create_main_option_for_day(supabase, day_id_str)
    logger.info(
        "day_created",
        day_id=day_id_str,
        trip_id=str(trip_id),
        sort_order=next_order,
    )
    return _day_row_to_response(day)


@router.patch(
    "/{trip_id}/days/reorder",
    response_model=list[DayResponse],
)
async def reorder_days(
    trip_id: UUID,
    body: ReorderDaysBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Reorder days within a trip.

    Body: ordered list of day_ids. Backend sets sort_order to 0, 1, 2, …
    by position. 422 for empty or invalid list; 404 if any id not in trip.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    if not body.day_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="day_ids must not be empty",
        )
    # Ensure all provided ids actually belong to this trip.
    existing_result = (
        supabase.table("trip_days").select("day_id").eq("trip_id", str(trip_id)).execute()
    )
    existing_ids = {str(row["day_id"]) for row in (existing_result.data or [])}
    body_ids = [str(did) for did in body.day_ids]
    missing = [did for did in body_ids if did not in existing_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more day_ids do not belong to this trip",
        )
    # Apply new order via single unnest-based RPC (replaces N UPDATE loop)
    supabase.rpc("reorder_trip_days", {"p_trip_id": str(trip_id), "p_day_ids": body_ids}).execute()
    result = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("trip_id", str(trip_id))
        .order("sort_order")
        .execute()
    )
    items = result.data if result.data else []
    logger.info("days_reordered", trip_id=str(trip_id), count=len(items))
    return [_day_row_to_response(r) for r in items]


@router.get("/{trip_id}/days/{day_id}", response_model=DayResponse)
async def get_day(
    trip_id: UUID,
    day_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Get one itinerary day by id. Trip must exist and be owned; day must belong to trip; else 404.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")
    return _day_row_to_response(result.data[0])


@router.patch("/{trip_id}/days/{day_id}", response_model=DayResponse)
async def update_day(
    trip_id: UUID,
    day_id: UUID,
    body: UpdateDayBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update an itinerary day. Trip must exist and be owned; day must belong to trip; else 404.
    At least one field required in body.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")
    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    update_data: dict[str, object] = {}
    if "date" in body.model_fields_set:
        update_data["date"] = body.date.isoformat() if body.date else None
    if "sort_order" in body.model_fields_set:
        update_data["sort_order"] = body.sort_order
    if "active_option_id" in body.model_fields_set:
        # active_option_id is persisted per-day so the user's currently-chosen
        # option survives logout/login and is what shared viewers see. We must
        # ensure the referenced option actually belongs to *this* day before
        # writing — otherwise a crafted request could point day A at an option
        # from day B (or even another user's trip). `_ensure_resource_chain`
        # above already verified the trip ownership + day-in-trip chain, so we
        # only need to verify option.day_id == day_id here.
        if body.active_option_id is None:
            update_data["active_option_id"] = None
        else:
            option_check = (
                supabase.table("day_options")
                .select("option_id")
                .eq("option_id", body.active_option_id)
                .eq("day_id", str(day_id))
                .limit(1)
                .execute()
            )
            if not option_check.data:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="active_option_id does not belong to this day",
                )
            update_data["active_option_id"] = body.active_option_id
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    supabase.table("trip_days").update(update_data).eq("day_id", str(day_id)).eq(
        "trip_id", str(trip_id)
    ).execute()
    updated = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not updated.data or len(updated.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Day was updated but could not be retrieved; please refresh",
        )
    logger.info("day_updated", day_id=str(day_id), trip_id=str(trip_id))
    return _day_row_to_response(updated.data[0])


@router.post("/{trip_id}/days/{day_id}/reassign-date", status_code=status.HTTP_204_NO_CONTENT)
async def reassign_day_date(
    trip_id: UUID,
    day_id: UUID,
    body: ReassignDayDateBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Move the currently-selected option to the day that owns *new_date*.

    * No conflict (no day with that date): if the source day has only this
      one option, just update the day's date.  Otherwise create a new day
      for the target date and move the option there.
    * Conflict (another day already owns the date): move the selected option
      to the existing target day (becomes its new main).  Source day keeps
      its original date and promotes the next option to main.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

    # Verify the source day exists
    src = (
        supabase.table("trip_days")
        .select("day_id, date")
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not src.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")

    new_date_str = body.new_date.isoformat()
    option_id = body.option_id

    # How many options does the source day have?
    src_opts = supabase.table("day_options").select("option_id").eq("day_id", str(day_id)).execute()
    src_option_count = len(src_opts.data) if src_opts.data else 0

    # Check if another day already has this date
    conflict = (
        supabase.table("trip_days")
        .select("day_id")
        .eq("trip_id", str(trip_id))
        .eq("date", new_date_str)
        .neq("day_id", str(day_id))
        .execute()
    )

    if not conflict.data and src_option_count <= 1:
        # Simple case: sole option, no conflict — just change the day's date
        supabase.table("trip_days").update({"date": new_date_str}).eq("day_id", str(day_id)).eq(
            "trip_id", str(trip_id)
        ).execute()
    else:
        # Need to move the selected option to a (possibly new) target day
        if conflict.data:
            target_day_id = conflict.data[0]["day_id"]
        else:
            # Create a new day for the target date
            max_sort = (
                supabase.table("trip_days")
                .select("sort_order")
                .eq("trip_id", str(trip_id))
                .order("sort_order", desc=True)
                .limit(1)
                .execute()
            )
            next_sort = (max_sort.data[0]["sort_order"] + 1) if max_sort.data else 0
            new_day = (
                supabase.table("trip_days")
                .insert(
                    {
                        "trip_id": str(trip_id),
                        "date": new_date_str,
                        "sort_order": next_sort,
                    }
                )
                .execute()
            )
            target_day_id = new_day.data[0]["day_id"]
            # Create a placeholder main option (RPC will bump it to index 2)
            _create_main_option_for_day(supabase, target_day_id)

        supabase.rpc(
            "move_option_to_day",
            {
                "p_option_id": option_id,
                "p_source_day_id": str(day_id),
                "p_target_day_id": target_day_id,
            },
        ).execute()

    # Clean up the source day if it's now empty and dateless
    supabase.rpc("delete_empty_dateless_days", {"p_trip_id": str(trip_id)}).execute()

    logger.info(
        "day_date_reassigned",
        day_id=str(day_id),
        trip_id=str(trip_id),
        new_date=new_date_str,
        had_conflict=bool(conflict.data),
    )


@router.delete("/{trip_id}/days/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_day(
    trip_id: UUID,
    day_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Delete an itinerary day. Trip must exist and be owned; day must belong to trip; else 404.
    Returns 204 No Content. Cascade deletes day_options and option_locations (DB).
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trip_days")
        .select("day_id")
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")
    supabase.table("trip_days").delete().eq("day_id", str(day_id)).eq(
        "trip_id", str(trip_id)
    ).execute()
    logger.info("day_deleted", day_id=str(day_id), trip_id=str(trip_id))


@router.post(
    "/{trip_id}/days/generate",
    response_model=list[DayResponse],
    status_code=status.HTTP_201_CREATED,
)
async def generate_days(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Generate trip days from trip start_date/end_date.

    Idempotent: only creates days for dates not already covered.
    If all dates are covered, returns existing days without error.

    - Requires trip to exist and be owned.
    - 400 when dates are missing or invalid.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)
    trip_result = (
        supabase.table("trips")
        .select("trip_id, start_date, end_date")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not trip_result.data or len(trip_result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    trip = trip_result.data[0]
    start = trip.get("start_date")
    end = trip.get("end_date")
    if not start or not end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trip must have start_date and end_date to generate days",
        )
    if isinstance(start, str):
        try:
            start = date.fromisoformat(start)
        except ValueError:
            start = None
    if isinstance(end, str):
        try:
            end = date.fromisoformat(end)
        except ValueError:
            end = None
    if not isinstance(start, date) or not isinstance(end, date) or start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid start_date or end_date on trip",
        )
    # Clean up empty dateless days before generating
    supabase.rpc("delete_empty_dateless_days", {"p_trip_id": str(trip_id)}).execute()
    # Fetch existing days to find which dates are already covered
    existing_days = (
        supabase.table("trip_days")
        .select("day_id, date, sort_order")
        .eq("trip_id", str(trip_id))
        .order("sort_order")
        .execute()
    )
    existing_dates: set[str] = set()
    max_sort_order = -1
    if existing_days.data:
        for d in existing_days.data:
            if d.get("date"):
                existing_dates.add(d["date"])
            if d["sort_order"] > max_sort_order:
                max_sort_order = d["sort_order"]
    # Build rows only for missing dates
    rows = []
    current = start
    sort_order = max_sort_order + 1
    while current <= end:
        iso = current.isoformat()
        if iso not in existing_dates:
            rows.append(
                {
                    "trip_id": str(trip_id),
                    "date": iso,
                    "sort_order": sort_order,
                }
            )
            sort_order += 1
        current = current + timedelta(days=1)
    if not rows:
        # All dates already covered — return existing days
        result = (
            supabase.table("trip_days")
            .select(_TRIP_DAYS_SELECT)
            .eq("trip_id", str(trip_id))
            .order("sort_order")
            .execute()
        )
        items = result.data if result.data else []
        return [_day_row_to_response(r) for r in items]
    insert_result = supabase.table("trip_days").insert(rows).execute()
    if not insert_result.data or len(insert_result.data) == 0:
        logger.error("days_generate_insert_failed", trip_id=str(trip_id), error_category="db")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate days; please try again",
        )
    for day_row in insert_result.data:
        _create_main_option_for_day(supabase, str(day_row["day_id"]))
    # Reorder all days by date so newly inserted days interleave correctly
    supabase.rpc("reorder_days_by_date", {"p_trip_id": str(trip_id)}).execute()
    # Fetch back ordered by sort_order
    result = (
        supabase.table("trip_days")
        .select(_TRIP_DAYS_SELECT)
        .eq("trip_id", str(trip_id))
        .order("sort_order")
        .execute()
    )
    items = result.data if result.data else []
    logger.info("days_generated", trip_id=str(trip_id), count=len(items))
    return [_day_row_to_response(r) for r in items]


@router.post(
    "/{trip_id}/days/reconcile",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reconcile_days(
    trip_id: UUID,
    body: ReconcileDaysBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Reconcile days when trip dates change.

    Actions:
    - shift: Move all dated days by offset_days. Single RPC call.
    - clear_dates: Remove dates from specified days. Single RPC call.
    - delete: Delete specified days and their itineraries. Single RPC call.

    All actions reorder remaining days by date afterward.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

    trip_id_str = str(trip_id)

    if body.action == "shift":
        supabase.rpc(
            "shift_day_dates",
            {"p_trip_id": trip_id_str, "p_offset_days": body.offset_days},
        ).execute()
        logger.info(
            "days_shifted",
            trip_id=trip_id_str,
            offset=body.offset_days,
        )
    elif body.action == "clear_dates":
        supabase.rpc(
            "reconcile_clear_dates",
            {"p_trip_id": trip_id_str, "p_day_ids": body.day_ids},
        ).execute()
        logger.info(
            "days_dates_reconciled",
            trip_id=trip_id_str,
            count=len(body.day_ids or []),
        )
    elif body.action == "delete":
        supabase.rpc(
            "delete_days_batch",
            {"p_trip_id": trip_id_str, "p_day_ids": body.day_ids},
        ).execute()
        logger.info(
            "days_deleted",
            trip_id=trip_id_str,
            count=len(body.day_ids or []),
        )
