"""Day options (itinerary) API: list, create, get, update, delete, reorder options for a day."""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    OptionResponse,
    ReorderOptionsBody,
    UpdateOptionBody,
)

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_options")

router = APIRouter(prefix="/trips", tags=["itinerary-options"])

_DAY_OPTIONS_SELECT = "option_id, day_id, option_index, created_at"


def _option_row_to_response(row: dict) -> OptionResponse:
    """Build OptionResponse from a day_options row dict."""
    created_at = row.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            created_at = None
    return OptionResponse(
        id=str(row["option_id"]),
        day_id=str(row["day_id"]),
        option_index=int(row.get("option_index", 1)),
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


def _ensure_day_in_trip(supabase, trip_id: UUID, day_id: UUID) -> None:
    """Raise 404 if day does not exist or does not belong to trip."""
    result = (
        supabase.table("trip_days")
        .select("day_id")
        .eq("day_id", str(day_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")


@router.get("/{trip_id}/days/{day_id}/options", response_model=list[OptionResponse])
async def list_options(
    trip_id: UUID,
    day_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all options for an itinerary day. Requires valid JWT.
    Trip must be owned; day must belong to trip; else 404.
    Returns 200 with array ordered by option_index (asc); empty → [].
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    result = (
        supabase.table("day_options")
        .select(_DAY_OPTIONS_SELECT)
        .eq("day_id", str(day_id))
        .order("option_index")
        .execute()
    )
    items = result.data if result.data else []
    logger.info("options_listed", trip_id=str(trip_id), day_id=str(day_id), count=len(items))
    return [_option_row_to_response(r) for r in items]


@router.post(
    "/{trip_id}/days/{day_id}/options",
    response_model=OptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_option(
    trip_id: UUID,
    day_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Create an option for a day. Backend assigns option_index (append: 1, 2, 3, …).
    Requires valid JWT. Trip/day must exist and be owned; else 404.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    max_result = (
        supabase.table("day_options")
        .select("option_index")
        .eq("day_id", str(day_id))
        .order("option_index", desc=True)
        .limit(1)
        .execute()
    )
    next_index = 1
    if max_result.data and len(max_result.data) > 0:
        next_index = int(max_result.data[0].get("option_index", 0)) + 1
    row = {"day_id": str(day_id), "option_index": next_index}
    result = supabase.table("day_options").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("option_insert_failed", day_id=str(day_id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create option; please try again",
        )
    option = result.data[0]
    logger.info(
        "option_created",
        option_id=str(option["option_id"]),
        day_id=str(day_id),
        option_index=next_index,
    )
    return _option_row_to_response(option)


@router.patch(
    "/{trip_id}/days/{day_id}/options/reorder",
    response_model=list[OptionResponse],
)
async def reorder_options(
    trip_id: UUID,
    day_id: UUID,
    body: ReorderOptionsBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Reorder options for a day. Body: ordered list of option_ids.
    Backend sets option_index to 1, 2, 3, … by position. 422 if any id not in this day or duplicate.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    if not body.option_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_ids must not be empty",
        )
    seen = set()
    for oid in body.option_ids:
        if oid in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Duplicate option_id in option_ids",
            )
        seen.add(oid)
    day_id_str = str(day_id)
    for position, option_id in enumerate(body.option_ids, start=1):
        opt_id_str = str(option_id) if isinstance(option_id, UUID) else option_id
        check = (
            supabase.table("day_options")
            .select("option_id")
            .eq("option_id", opt_id_str)
            .eq("day_id", day_id_str)
            .execute()
        )
        if not check.data or len(check.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Option not found in this day",
            )
        supabase.table("day_options").update({"option_index": position}).eq(
            "option_id", opt_id_str
        ).eq("day_id", day_id_str).execute()
    result = (
        supabase.table("day_options")
        .select(_DAY_OPTIONS_SELECT)
        .eq("day_id", day_id_str)
        .order("option_index")
        .execute()
    )
    items = result.data if result.data else []
    logger.info("options_reordered", day_id=day_id_str, count=len(items))
    return [_option_row_to_response(r) for r in items]


@router.get(
    "/{trip_id}/days/{day_id}/options/{option_id}",
    response_model=OptionResponse,
)
async def get_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Get one option by id. Day in trip and owned; option in day; else 404."""
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    result = (
        supabase.table("day_options")
        .select(_DAY_OPTIONS_SELECT)
        .eq("option_id", str(option_id))
        .eq("day_id", str(day_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    return _option_row_to_response(result.data[0])


@router.patch(
    "/{trip_id}/days/{day_id}/options/{option_id}",
    response_model=OptionResponse,
)
async def update_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    body: UpdateOptionBody,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Update an option (e.g. option_index for single-item move). 409 if new option_index conflicts.
    At least one field required.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    result = (
        supabase.table("day_options")
        .select(_DAY_OPTIONS_SELECT)
        .eq("option_id", str(option_id))
        .eq("day_id", str(day_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    update_data: dict[str, object] = {}
    if "option_index" in body.model_fields_set and body.option_index is not None:
        # Conflict check: another option in this day already has this index.
        conflict = (
            supabase.table("day_options")
            .select("option_id")
            .eq("day_id", str(day_id))
            .eq("option_index", body.option_index)
            .execute()
        )
        if conflict.data:
            for row in conflict.data:
                if str(row.get("option_id")) != str(option_id):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Another option already uses this option_index in this day",
                    )
        update_data["option_index"] = body.option_index
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    supabase.table("day_options").update(update_data).eq("option_id", str(option_id)).eq(
        "day_id", str(day_id)
    ).execute()
    updated = (
        supabase.table("day_options")
        .select(_DAY_OPTIONS_SELECT)
        .eq("option_id", str(option_id))
        .eq("day_id", str(day_id))
        .execute()
    )
    if not updated.data or len(updated.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Option was updated but could not be retrieved; please refresh",
        )
    logger.info("option_updated", option_id=str(option_id), day_id=str(day_id))
    return _option_row_to_response(updated.data[0])


@router.delete(
    "/{trip_id}/days/{day_id}/options/{option_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_option(
    trip_id: UUID,
    day_id: UUID,
    option_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Delete an option. Cascade deletes option_locations. 404 if not found or not owned."""
    _ensure_trip_owned(supabase, trip_id, user_id)
    _ensure_day_in_trip(supabase, trip_id, day_id)
    result = (
        supabase.table("day_options")
        .select("option_id")
        .eq("option_id", str(option_id))
        .eq("day_id", str(day_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    supabase.table("day_options").delete().eq("option_id", str(option_id)).eq(
        "day_id", str(day_id)
    ).execute()
    logger.info("option_deleted", option_id=str(option_id), day_id=str(day_id))
