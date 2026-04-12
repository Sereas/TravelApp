"""Trip locations API: add, list, batch-add, update locations for a trip."""

import contextlib
import json
import time
from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from starlette.responses import StreamingResponse

from backend.app.clients.google_places import GooglePlacesClient
from backend.app.core.rate_limit import limiter
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import (
    get_current_user_email,
    get_current_user_id,
    get_google_places_client_optional,
)
from backend.app.models.schemas import (
    AddLocationBody,
    ImportedLocationSummary,
    ImportGoogleListBody,
    ImportGoogleListResponse,
    LocationResponse,
    UpdateLocationBody,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain
from backend.app.services.google_list_import import (
    ImportComplete,
    import_google_list_iter,
)
from backend.app.services.google_list_import import (
    ImportError as ImportServiceError,
)
from backend.app.services.location_projection import enrich_locations_with_photos
from backend.app.services.place_photos import ensure_place_photo

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# Magic bytes for validating actual file content (not just Content-Type header)
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # full check: RIFF????WEBP
}

logger: structlog.stdlib.BoundLogger = structlog.get_logger("locations")

router = APIRouter(prefix="/trips", tags=["trips-locations"])

_LOCATIONS_SELECT = (
    "location_id, trip_id, name, address, google_link, google_place_id, "
    "google_source_type, added_by_email, note, added_by_user_id, city, "
    "working_hours, requires_booking, category, latitude, longitude, user_image_url"
)


def _loc_to_response(loc: dict) -> LocationResponse:
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
        note=loc.get("note"),
        added_by_user_id=uid_str,
        added_by_email=loc.get("added_by_email"),
        city=loc.get("city"),
        working_hours=loc.get("working_hours"),
        requires_booking=loc.get("requires_booking"),
        category=loc.get("category"),
        latitude=loc.get("latitude"),
        longitude=loc.get("longitude"),
        image_url=loc.get("image_url"),
        user_image_url=loc.get("user_image_url"),
        attribution_name=loc.get("attribution_name"),
        attribution_uri=loc.get("attribution_uri"),
    )


@router.post(
    "/{trip_id}/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_location(
    trip_id: UUID,
    body: AddLocationBody,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """
    Add a location to a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.

    Photo fetching runs in the background — the response returns immediately
    with image_url=null.  The photo appears on the next list/tree fetch.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

    # Dedup: if a google_place_id is provided, check if it already exists in this trip.
    if body.google_place_id:
        dup = (
            supabase.table("locations")
            .select("location_id, name")
            .eq("trip_id", str(trip_id))
            .eq("google_place_id", body.google_place_id)
            .limit(1)
            .execute()
        )
        if dup.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A location with this Google Place already exists in the trip: "
                    f'"{dup.data[0]["name"]}" (id: {dup.data[0]["location_id"]})'
                ),
            )

    row = {
        "trip_id": str(trip_id),
        "name": body.name,
        "address": body.address,
        "google_link": body.google_link,
        "google_place_id": body.google_place_id,
        "google_source_type": body.google_source_type,
        "note": body.note,
        "added_by_user_id": str(user_id),
        "added_by_email": user_email,
        "city": body.city,
        "working_hours": body.working_hours,
        "requires_booking": body.requires_booking,
        "category": body.category,
    }
    if body.latitude is not None:
        row["latitude"] = body.latitude
    if body.longitude is not None:
        row["longitude"] = body.longitude
    result = supabase.table("locations").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("location_insert_failed", trip_id=str(trip_id), error_category="db")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create location; please try again",
        )
    loc = result.data[0]
    # Re-fetch with canonical column list
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
    # Queue background photo fetch — response returns immediately without image_url
    gp_id = loc.get("google_place_id")
    if gp_id and body.photo_resource_name and places_client:
        background_tasks.add_task(
            ensure_place_photo,
            supabase,
            places_client,
            gp_id,
            body.photo_resource_name,
        )
    logger.info(
        "location_added",
        location_id=str(loc["location_id"]),
        trip_id=str(trip_id),
        name=body.name,
    )
    return _loc_to_response(loc)


@router.get(
    "/{trip_id}/locations",
    response_model=list[LocationResponse],
)
async def list_locations(
    response: Response,
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """
    List all locations for a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Returns 200 with array of locations; empty array if trip has no locations.
    """
    t0 = time.perf_counter()
    _ensure_resource_chain(supabase, trip_id, user_id)
    ownership_ms = round((time.perf_counter() - t0) * 1000, 1)

    t1 = time.perf_counter()
    result = (
        supabase.table("locations").select(_LOCATIONS_SELECT).eq("trip_id", str(trip_id)).execute()
    )
    items = result.data if result.data else []
    query_ms = round((time.perf_counter() - t1) * 1000, 1)

    # Batch-fetch photo URLs for all locations with a google_place_id (single query)
    t2 = time.perf_counter()
    items_by_id = {str(loc["location_id"]): loc for loc in items}
    enrich_locations_with_photos(supabase, items_by_id)
    photo_ms = round((time.perf_counter() - t2) * 1000, 1)

    response.headers["X-Locations-Ownership-Ms"] = str(ownership_ms)
    response.headers["X-Locations-Query-Ms"] = str(query_ms)
    response.headers["X-Locations-Photo-Ms"] = str(photo_ms)
    response.headers["X-Locations-Rows"] = str(len(items))
    logger.info("locations_listed", trip_id=str(trip_id), count=len(items))
    return [_loc_to_response(loc) for loc in items]


@router.post(
    "/{trip_id}/locations/batch",
    response_model=list[LocationResponse],
    status_code=status.HTTP_201_CREATED,
)
async def batch_add_locations(
    trip_id: UUID,
    body: list[AddLocationBody],
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """
    Add multiple locations to a trip in one request. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
    Body must be a non-empty array; each item must have a non-empty name.

    Photo fetching runs in the background — the response returns immediately.
    """
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one location required",
        )
    _ensure_resource_chain(supabase, trip_id, user_id)
    rows = []
    for item in body:
        row = {
            "trip_id": str(trip_id),
            "name": item.name,
            "address": item.address,
            "google_link": item.google_link,
            "google_place_id": item.google_place_id,
            "google_source_type": item.google_source_type,
            "note": item.note,
            "added_by_user_id": str(user_id),
            "added_by_email": user_email,
            "city": item.city,
            "working_hours": item.working_hours,
            "requires_booking": item.requires_booking,
            "category": item.category,
        }
        if item.latitude is not None:
            row["latitude"] = item.latitude
        if item.longitude is not None:
            row["longitude"] = item.longitude
        rows.append(row)
    result = supabase.table("locations").insert(rows).execute()
    if not result.data or len(result.data) != len(body):
        logger.error(
            "locations_batch_insert_failed",
            trip_id=str(trip_id),
            expected=len(body),
            got=len(result.data) if result.data else 0,
            error_category="db",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create one or more locations; please try again",
        )
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
    final_locs = [fetched_by_id.get(str(loc.get("location_id")), loc) for loc in result.data]
    # Queue background photo fetches for locations with photo_resource_name
    if places_client:
        for item in body:
            if item.google_place_id and item.photo_resource_name:
                background_tasks.add_task(
                    ensure_place_photo,
                    supabase,
                    places_client,
                    item.google_place_id,
                    item.photo_resource_name,
                )
    out = [_loc_to_response(full) for full in final_locs]
    logger.info("locations_batch_added", trip_id=str(trip_id), count=len(body))
    return out


@router.post(
    "/{trip_id}/locations/import-google-list",
    response_model=ImportGoogleListResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("3/minute")
async def import_google_list(
    request: Request,
    trip_id: UUID,
    body: ImportGoogleListBody,
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """Import locations from a Google Maps shared list into a trip.

    Delegates all import logic to the google_list_import service.  This endpoint
    drains the async iterator and returns a single ImportGoogleListResponse.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

    if places_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    from backend.app.services.google_list_import import EnrichingItem

    imported: list[ImportedLocationSummary] = []
    existing: list[ImportedLocationSummary] = []
    failed: list[ImportedLocationSummary] = []

    async for event in import_google_list_iter(
        supabase,
        places_client,
        trip_id=str(trip_id),
        user_id=str(user_id),
        user_email=user_email,
        url=body.google_list_url,
    ):
        if isinstance(event, ImportServiceError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=event.message,
            )
        if isinstance(event, EnrichingItem):
            if event.status == "existing":
                existing.append(ImportedLocationSummary(name=event.name, status="existing"))
            elif event.status == "failed":
                failed.append(
                    ImportedLocationSummary(
                        name=event.name,
                        status="failed",
                        detail="Places API lookup failed",
                    )
                )
        elif isinstance(event, ImportComplete):
            for loc in event.inserted:
                imported.append(
                    ImportedLocationSummary(
                        name=loc.get("name", ""),
                        status="imported",
                    )
                )

    return ImportGoogleListResponse(
        imported_count=len(imported),
        existing_count=len(existing),
        failed_count=len(failed),
        imported=imported,
        existing=existing,
        failed=failed,
    )


# ---------------------------------------------------------------------------
# SSE streaming variant of Google list import (BACK-003)
# ---------------------------------------------------------------------------


def _sse_event(data: dict) -> str:
    """Format a single SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _event_to_sse_dict(
    event,
    *,
    total: int = 0,
    existing_count: int = 0,
    failed_count: int = 0,
    existing_items: list[dict] | None = None,
    failed_items: list[dict] | None = None,
) -> dict | None:
    """Map a service ImportEvent to the SSE data dict the frontend expects.

    Returns None for events that have no SSE representation.
    total: the scraping_done total, passed in for enriching events.
    existing_count/failed_count: running counters from the generator.
    existing_items/failed_items: accumulated EnrichingItem details, injected
    into the final complete event so the frontend can render the skipped/
    failed item lists (matches the non-streaming endpoint response shape).
    """
    from backend.app.services.google_list_import import (
        EnrichingItem,
        ImportComplete,
        SavingStarted,
        ScrapingDone,
        ScrapingStarted,
    )
    from backend.app.services.google_list_import import (
        ImportError as _ImportError,
    )

    if isinstance(event, ScrapingStarted):
        return {
            "event": "scraping",
            "message": "Exploring the list and having a look at the places",
        }
    if isinstance(event, ScrapingDone):
        return {
            "event": "scraping_done",
            "total": event.total_items,
            "message": f"Found {event.total_items} places",
        }
    if isinstance(event, EnrichingItem):
        return {
            "event": "enriching",
            "current": event.index,
            "total": total,
            "name": event.name,
            "status": event.status,
        }
    if isinstance(event, SavingStarted):
        return {
            "event": "saving",
            "message": "Almost there — saving your places...",
        }
    if isinstance(event, ImportComplete):
        imported_summaries = [
            {"name": loc.get("name", ""), "status": "imported", "detail": None}
            for loc in event.inserted
        ]
        return {
            "event": "complete",
            "imported_count": len(event.inserted),
            "existing_count": existing_count,
            "failed_count": failed_count,
            "imported": imported_summaries,
            "existing": list(existing_items or []),
            "failed": list(failed_items or []),
        }
    if isinstance(event, _ImportError):
        return {"event": "error", "message": event.message}
    return None


@router.post(
    "/{trip_id}/locations/import-google-list-stream",
    response_class=StreamingResponse,
)
@limiter.limit("3/minute")
async def import_google_list_stream(
    request: Request,
    trip_id: UUID,
    body: ImportGoogleListBody,
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """SSE streaming variant of import-google-list.

    Streams progress events as each place is processed, allowing the
    frontend to show a real-time progress bar. Delegates all import logic
    to google_list_import service — this function only handles SSE formatting
    and pre-stream HTTP error checks.
    """
    # Pre-stream checks (return proper HTTP errors, not SSE events)
    _ensure_resource_chain(supabase, trip_id, user_id)

    if places_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    async def event_generator():
        from backend.app.services.google_list_import import (
            EnrichingItem as _EnrichingItem,
        )
        from backend.app.services.google_list_import import (
            ScrapingDone as _ScrapingDone,
        )

        total_items = 0
        existing_count = 0
        failed_count = 0
        existing_items: list[dict] = []
        failed_items: list[dict] = []
        try:
            async for event in import_google_list_iter(
                supabase,
                places_client,
                trip_id=str(trip_id),
                user_id=str(user_id),
                user_email=user_email,
                url=body.google_list_url,
            ):
                if isinstance(event, _ScrapingDone):
                    total_items = event.total_items
                elif isinstance(event, _EnrichingItem):
                    if event.status == "existing":
                        existing_count += 1
                        existing_items.append(
                            {"name": event.name, "status": "existing", "detail": None}
                        )
                    elif event.status == "failed":
                        failed_count += 1
                        failed_items.append(
                            {"name": event.name, "status": "failed", "detail": None}
                        )
                sse_dict = _event_to_sse_dict(
                    event,
                    total=total_items,
                    existing_count=existing_count,
                    failed_count=failed_count,
                    existing_items=existing_items,
                    failed_items=failed_items,
                )
                if sse_dict is not None:
                    yield _sse_event(sse_dict)
        except Exception as exc:
            logger.error("import_stream_error", error=str(exc), error_category="internal")
            yield _sse_event({"event": "error", "message": "An unexpected error occurred."})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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

    Round-trip budget: ≤ 3 RT.
      RT 1 — ownership (verify_resource_chain)
      RT 2 — UPDATE (returns updated row via Prefer: return=representation)
      RT 3 — place_photos SELECT (only when google_place_id is present on the row)
    """
    if not body.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided for update",
        )
    _ensure_resource_chain(supabase, trip_id, user_id)  # RT 1

    update_data: dict[str, object] = {}
    for field in (
        "name",
        "address",
        "google_link",
        "google_place_id",
        "google_source_type",
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

    # RT 2: UPDATE returns the updated row via supabase-py's default
    # `Prefer: return=representation` header — no separate re-fetch needed.
    update_result = (
        supabase.table("locations")
        .update(update_data)
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not update_result.data or len(update_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )
    loc = update_result.data[0]

    # Enrich with photo URL (RT 3 — only when the row has a google_place_id).
    gp_id = loc.get("google_place_id")
    if gp_id:
        photo_row = (
            supabase.table("place_photos")
            .select("google_place_id, photo_url, attribution_name, attribution_uri")
            .eq("google_place_id", gp_id)
            .execute()
        )  # RT 3
        if photo_row.data:
            loc["image_url"] = photo_row.data[0]["photo_url"]
            loc["attribution_name"] = photo_row.data[0].get("attribution_name")
            loc["attribution_uri"] = photo_row.data[0].get("attribution_uri")
    logger.info(
        "location_updated",
        location_id=str(location_id),
        trip_id=str(trip_id),
        fields=list(update_data.keys()),
    )
    return _loc_to_response(loc)


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
    _ensure_resource_chain(supabase, trip_id, user_id)

    try:
        supabase.rpc(
            "delete_location_cascade",
            {"p_trip_id": str(trip_id), "p_location_id": str(location_id)},
        ).execute()
    except Exception as exc:
        if "LOCATION_NOT_FOUND" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Location not found",
            ) from exc
        raise

    logger.info(
        "location_deleted",
        location_id=str(location_id),
        trip_id=str(trip_id),
    )


@router.post(
    "/{trip_id}/locations/{location_id}/photo",
    response_model=LocationResponse,
)
async def upload_location_photo(
    trip_id: UUID,
    location_id: UUID,
    file: UploadFile,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Upload a user photo override for a location. Replaces any existing override."""
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid image type: {file.content_type}. Allowed: jpeg, png, webp",
        )
    _ensure_resource_chain(supabase, trip_id, user_id)

    # Verify location belongs to trip
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

    # Read and validate content
    content = await file.read()

    # HIGH-02: Validate magic bytes — reject files whose actual content
    # doesn't match the claimed Content-Type (e.g., HTML uploaded as JPEG).
    expected_magics = _MAGIC_BYTES.get(file.content_type, ())
    magic_ok = any(content.startswith(magic) for magic in expected_magics)
    # WebP: RIFF header + bytes 8-12 must be "WEBP" (not WAV/AVI/etc.)
    if magic_ok and file.content_type == "image/webp":
        magic_ok = len(content) >= 12 and content[8:12] == b"WEBP"
    if not magic_ok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File content does not match the declared image type",
        )

    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"File too large ({len(content)} bytes). Maximum: {_MAX_IMAGE_SIZE} bytes (5 MB)"
            ),
        )

    ext = _EXT_MAP.get(file.content_type, "jpg")
    storage_path = f"{trip_id}/{location_id}.{ext}"

    # Upsert to storage (remove old file first, ignore errors if it doesn't exist)
    bucket = supabase.storage.from_("user-photos")
    with contextlib.suppress(Exception):
        bucket.remove([storage_path])
    bucket.upload(
        storage_path,
        content,
        {"content-type": file.content_type, "upsert": "true"},
    )

    # Build public URL
    public_url = bucket.get_public_url(storage_path)

    # Update locations row
    supabase.table("locations").update({"user_image_url": public_url}).eq(
        "location_id", str(location_id)
    ).eq("trip_id", str(trip_id)).execute()

    # Fetch updated row
    fetch = (
        supabase.table("locations")
        .select(_LOCATIONS_SELECT)
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    loc = fetch.data[0] if fetch.data else loc_result.data[0]
    loc["user_image_url"] = public_url
    # Enrich with photo URL and attribution
    gp_id = loc.get("google_place_id")
    if gp_id:
        photos = (
            supabase.table("place_photos")
            .select("google_place_id, photo_url, attribution_name, attribution_uri")
            .eq("google_place_id", gp_id)
            .execute()
        )
        if photos.data:
            loc["image_url"] = photos.data[0]["photo_url"]
            loc["attribution_name"] = photos.data[0].get("attribution_name")
            loc["attribution_uri"] = photos.data[0].get("attribution_uri")
    logger.info(
        "location_photo_uploaded",
        location_id=str(location_id),
        trip_id=str(trip_id),
    )
    return _loc_to_response(loc)


@router.delete(
    "/{trip_id}/locations/{location_id}/photo",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_location_photo(
    trip_id: UUID,
    location_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Remove the user photo override, reverting to the Google photo (if any)."""
    _ensure_resource_chain(supabase, trip_id, user_id)

    loc_result = (
        supabase.table("locations")
        .select("location_id, user_image_url")
        .eq("location_id", str(location_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not loc_result.data or len(loc_result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    user_image_url = loc_result.data[0].get("user_image_url")
    if not user_image_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user photo to delete",
        )

    # Remove from storage (best-effort)
    bucket = supabase.storage.from_("user-photos")
    for ext in ("jpg", "png", "webp"):
        with contextlib.suppress(Exception):
            bucket.remove([f"{trip_id}/{location_id}.{ext}"])

    # Clear the column
    supabase.table("locations").update({"user_image_url": None}).eq(
        "location_id", str(location_id)
    ).eq("trip_id", str(trip_id)).execute()

    logger.info(
        "location_photo_deleted",
        location_id=str(location_id),
        trip_id=str(trip_id),
    )
