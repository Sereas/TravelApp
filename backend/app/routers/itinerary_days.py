"""Trip days (itinerary) API: list, create, get, update, delete days for a trip."""

from datetime import date, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import CreateDayBody, DayResponse, ReorderDaysBody, UpdateDayBody

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_days")

router = APIRouter(prefix="/trips", tags=["itinerary-days"])

_TRIP_DAYS_SELECT = (
    "day_id, trip_id, date, sort_order, starting_city, ending_city, created_by, created_at"
)


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
    return DayResponse(
        id=str(row["day_id"]),
        trip_id=str(row["trip_id"]),
        date=d,
        sort_order=int(row.get("sort_order", 0)),
        starting_city=row.get("starting_city"),
        ending_city=row.get("ending_city"),
        created_by=row.get("created_by"),
        created_at=created_at,
    )


def _ensure_trip_owned(supabase, trip_id: UUID, user_id: UUID) -> None:
    """Raise 404 if trip does not exist or is not owned by user."""
    result = (
        supabase.table("trips").select("trip_id, user_id").eq("trip_id", str(trip_id)).execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if result.data[0].get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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
        "starting_city": body.starting_city,
        "ending_city": body.ending_city,
        "created_by": body.created_by,
    }
    result = supabase.table("trip_days").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("day_insert_failed", trip_id=str(trip_id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create day; please try again",
        )
    day = result.data[0]
    logger.info(
        "day_created",
        day_id=str(day["day_id"]),
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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
    # Apply new order
    for position, day_id in enumerate(body_ids):
        supabase.table("trip_days").update({"sort_order": position}).eq("day_id", day_id).eq(
            "trip_id", str(trip_id)
        ).execute()
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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
    if "starting_city" in body.model_fields_set:
        update_data["starting_city"] = body.starting_city
    if "ending_city" in body.model_fields_set:
        update_data["ending_city"] = body.ending_city
    if "created_by" in body.model_fields_set:
        update_data["created_by"] = body.created_by
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
    _ensure_trip_owned(supabase, trip_id, user_id)
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

    - Requires trip to exist and be owned.
    - 400 when dates are missing or invalid.
    - 409 when trip already has days.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
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
    # Ensure no existing days
    existing_days = (
        supabase.table("trip_days").select("day_id").eq("trip_id", str(trip_id)).execute()
    )
    if existing_days.data and len(existing_days.data) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Trip already has days; cannot generate",
        )
    # Generate days inclusive of both start and end
    rows = []
    current = start
    sort_order = 0
    while current <= end:
        rows.append(
            {
                "trip_id": str(trip_id),
                "date": current.isoformat(),
                "sort_order": sort_order,
                "starting_city": None,
                "ending_city": None,
                "created_by": None,
            }
        )
        current = current + timedelta(days=1)
        sort_order += 1
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No days to generate for given start/end dates",
        )
    insert_result = supabase.table("trip_days").insert(rows).execute()
    if not insert_result.data or len(insert_result.data) == 0:
        logger.error("days_generate_insert_failed", trip_id=str(trip_id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate days; please try again",
        )
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
