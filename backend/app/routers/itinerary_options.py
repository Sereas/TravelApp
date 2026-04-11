"""Day options (itinerary) API: list, create, get, update, delete, reorder options for a day."""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    CreateOptionBody,
    OptionResponse,
    ReorderOptionsBody,
    UpdateOptionBody,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_options")

router = APIRouter(prefix="/trips", tags=["itinerary-options"])

_DAY_OPTIONS_SELECT = (
    "option_id, day_id, option_index, starting_city, ending_city, created_by, created_at"
)


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
        starting_city=row.get("starting_city"),
        ending_city=row.get("ending_city"),
        created_by=row.get("created_by"),
        created_at=created_at,
    )


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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)
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
    body: CreateOptionBody | None = None,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    Create an option for a day. Backend assigns option_index (append: 1, 2, 3, …).
    Requires valid JWT. Trip/day must exist and be owned; else 404.
    """
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)
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
    data = body if body is not None else CreateOptionBody()
    row: dict[str, object] = {"day_id": str(day_id), "option_index": next_index}
    if data.starting_city is not None:
        row["starting_city"] = data.starting_city
    if data.ending_city is not None:
        row["ending_city"] = data.ending_city
    if data.created_by is not None:
        row["created_by"] = data.created_by
    # postgrest-py insert() uses Prefer: return=representation by default (full inserted row).
    result = supabase.table("day_options").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("option_insert_failed", day_id=str(day_id), error_category="db")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create option; please try again",
        )
    option = result.data[0]
    persisted = option.get("created_by")
    logger.info(
        "option_created",
        option_id=str(option["option_id"]),
        day_id=str(day_id),
        option_index=next_index,
        label_requested=data.created_by,
        label_in_insert_row=row.get("created_by"),
        label_from_db_after_insert=persisted,
    )
    if data.created_by is not None and persisted != data.created_by:
        logger.warning(
            "option_created_by_mismatch",
            option_id=str(option["option_id"]),
            day_id=str(day_id),
            sent_to_db=data.created_by,
            returned_by_postgrest=persisted,
            error_category="db",
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)
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
    opt_id_strs = [str(oid) if isinstance(oid, UUID) else oid for oid in body.option_ids]
    # Batch-validate all option_ids belong to this day (single IN query)
    check = (
        supabase.table("day_options")
        .select("option_id")
        .eq("day_id", day_id_str)
        .in_("option_id", opt_id_strs)
        .execute()
    )
    found_ids = {str(r["option_id"]) for r in (check.data or [])}
    if any(oid not in found_ids for oid in opt_id_strs):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Option not found in this day",
        )
    # Batch reorder via single unnest-based RPC (replaces N UPDATE loop)
    supabase.rpc(
        "reorder_day_options", {"p_day_id": day_id_str, "p_option_ids": opt_id_strs}
    ).execute()
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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)
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
    At least one field required. Uses update_option_with_conflict_check RPC for atomicity:
    2 round-trips total (ownership + RPC update).
    """
    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)  # RT 1
    body_fields = body.model_fields_set
    params: dict[str, object] = {
        "p_option_id": str(option_id),
        "p_day_id": str(day_id),
        "p_option_index": body.option_index if "option_index" in body_fields else None,
        "p_set_option_index": "option_index" in body_fields,
        "p_starting_city": body.starting_city if "starting_city" in body_fields else None,
        "p_set_starting_city": "starting_city" in body_fields,
        "p_ending_city": body.ending_city if "ending_city" in body_fields else None,
        "p_set_ending_city": "ending_city" in body_fields,
        "p_created_by": body.created_by if "created_by" in body_fields else None,
        "p_set_created_by": "created_by" in body_fields,
    }
    try:
        result = supabase.rpc("update_option_with_conflict_check", params).execute()  # RT 2
    except Exception as exc:
        detail = str(exc)
        if "OPTION_NOT_FOUND" in detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Option not found"
            ) from exc
        if "OPTION_INDEX_CONFLICT" in detail:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another option already uses this option_index in this day",
            ) from exc
        raise
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    logger.info("option_updated", option_id=str(option_id), day_id=str(day_id))
    return _option_row_to_response(result.data[0])


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
    _ensure_resource_chain(supabase, trip_id, user_id, day_id=day_id)
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
