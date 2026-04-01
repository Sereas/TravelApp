"""Trip locations API: add, list, batch-add, update locations for a trip."""

import asyncio
import contextlib
import json
import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from starlette.responses import StreamingResponse

from backend.app.clients.google_list_scraper import GoogleListScraper
from backend.app.clients.google_places import (
    GoogleListParseError,
    GooglePlacesClient,
)
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
from backend.app.routers.locations_google import (
    _clean_working_hours,
    _extract_city,
    _suggest_category,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain
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

# List/update selects — excludes google_raw to keep list responses small.
# google_raw can be 5-15 KB per location; never needed in list views.
_LOCATIONS_SELECT = (
    "location_id, trip_id, name, address, google_link, google_place_id, "
    "google_source_type, added_by_email, note, added_by_user_id, city, "
    "working_hours, requires_booking, category, latitude, longitude, user_image_url"
)
# Used only for the single-item POST response where the client may need raw data.
_LOCATIONS_SELECT_WITH_RAW = _LOCATIONS_SELECT + ", google_raw"


def _extract_lat_lng_from_google_raw(raw: dict | None) -> tuple[float | None, float | None]:
    """Best-effort extraction of latitude/longitude from stored Google raw JSON."""
    if not isinstance(raw, dict):
        return None, None
    places = raw.get("places")
    if isinstance(places, list) and places:
        location = places[0].get("location") or {}
        return location.get("latitude"), location.get("longitude")
    result = raw.get("result")
    if isinstance(result, dict):
        geom = result.get("geometry") or {}
        loc = geom.get("location") or {}
        return loc.get("lat"), loc.get("lng")
    return None, None


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
        google_raw=loc.get("google_raw"),
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
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """
    Add a location to a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; else 404.
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
        "google_raw": body.google_raw,
        "note": body.note,
        "added_by_user_id": str(user_id),
        "added_by_email": user_email,
        "city": body.city,
        "working_hours": body.working_hours,
        "requires_booking": body.requires_booking,
        "category": body.category,
    }
    # If this location came from a Google preview, persist coordinates into dedicated columns.
    lat, lng = _extract_lat_lng_from_google_raw(body.google_raw)
    if lat is not None:
        row["latitude"] = lat
    if lng is not None:
        row["longitude"] = lng
    result = supabase.table("locations").insert(row).execute()
    if not result.data or len(result.data) == 0:
        logger.error("location_insert_failed", trip_id=str(trip_id), error_category="db")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create location; please try again",
        )
    loc = result.data[0]
    # Fetch full row with all columns (including google_raw — single POST response only)
    loc_id = loc.get("location_id")
    if loc_id:
        fetch = (
            supabase.table("locations")
            .select(_LOCATIONS_SELECT_WITH_RAW)
            .eq("location_id", str(loc_id))
            .eq("trip_id", str(trip_id))
            .execute()
        )
        if fetch.data and len(fetch.data) > 0:
            loc = fetch.data[0]
    # Fetch photo if this location has a google_place_id and photos in raw data
    gp_id = loc.get("google_place_id")
    if gp_id and places_client:
        raw = loc.get("google_raw") or body.google_raw or {}
        photos = (raw.get("places") or [{}])[0].get("photos") or [] if raw else []
        if photos:
            url = ensure_place_photo(supabase, places_client, gp_id, photos)
            if url:
                loc["image_url"] = url
                # Fetch attribution from the cached row
                attr_row = (
                    supabase.table("place_photos")
                    .select("attribution_name, attribution_uri")
                    .eq("google_place_id", gp_id)
                    .execute()
                )
                if attr_row.data:
                    loc["attribution_name"] = attr_row.data[0].get("attribution_name")
                    loc["attribution_uri"] = attr_row.data[0].get("attribution_uri")
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
    google_raw is NOT included in list responses (payload size).
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
    place_ids = [loc["google_place_id"] for loc in items if loc.get("google_place_id")]
    photo_map: dict[str, dict] = {}
    if place_ids:
        photos = (
            supabase.table("place_photos")
            .select("google_place_id, photo_url, attribution_name, attribution_uri")
            .in_("google_place_id", place_ids)
            .execute()
        )
        photo_map = {row["google_place_id"]: row for row in (photos.data or [])}
    for loc in items:
        photo_row = photo_map.get(loc.get("google_place_id") or "")
        loc["image_url"] = photo_row["photo_url"] if photo_row else None
        loc["attribution_name"] = photo_row.get("attribution_name") if photo_row else None
        loc["attribution_uri"] = photo_row.get("attribution_uri") if photo_row else None
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
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
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
            "google_raw": item.google_raw,
            "note": item.note,
            "added_by_user_id": str(user_id),
            "added_by_email": user_email,
            "city": item.city,
            "working_hours": item.working_hours,
            "requires_booking": item.requires_booking,
            "category": item.category,
        }
        lat, lng = _extract_lat_lng_from_google_raw(item.google_raw)
        if lat is not None:
            row["latitude"] = lat
        if lng is not None:
            row["longitude"] = lng
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
    # Fetch full rows (without google_raw — batch responses stay lean)
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
    # Warm place_photos cache for new locations with google_place_id + photos
    # 1. Collect unique google_place_ids that have photos in the request body
    place_id_to_photos: dict[str, list] = {}
    for item in body:
        if item.google_place_id and item.google_raw:
            photos = (item.google_raw.get("places") or [{}])[0].get("photos") or []
            if photos:
                place_id_to_photos.setdefault(item.google_place_id, photos)
    if place_id_to_photos:
        # 2. Check which are already cached (single query)
        cached = (
            supabase.table("place_photos")
            .select("google_place_id, photo_url, attribution_name, attribution_uri")
            .in_("google_place_id", list(place_id_to_photos.keys()))
            .execute()
        )
        cached_map: dict[str, dict] = {row["google_place_id"]: row for row in (cached.data or [])}
        # 3. Fetch and cache photos for misses
        if places_client:
            for gp_id, photos in place_id_to_photos.items():
                if gp_id not in cached_map:
                    url = ensure_place_photo(supabase, places_client, gp_id, photos)
                    if url:
                        cached_map[gp_id] = {"photo_url": url}
        # 4. Attach image_url to response rows
        for loc in final_locs:
            gp_id = loc.get("google_place_id")
            if gp_id and gp_id in cached_map:
                loc["image_url"] = cached_map[gp_id].get("photo_url")
                loc["attribution_name"] = cached_map[gp_id].get("attribution_name")
                loc["attribution_uri"] = cached_map[gp_id].get("attribution_uri")
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

    Uses Playwright to scrape place names and coordinates from the shared list,
    enriches each via Google Places API, deduplicates against existing trip
    locations, and batch-inserts new ones.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

    if places_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    scraper = GoogleListScraper()
    try:
        scraped_places = await scraper.extract_places(body.google_list_url)
    except GoogleListParseError as exc:
        logger.warning("google_list_parse_error", error=str(exc), error_category="external_api")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse Google Maps list. Please check the URL and try again.",
        ) from None

    logger.info(
        "google_list_scraped",
        trip_id=str(trip_id),
        count=len(scraped_places),
    )

    # Fetch existing place_ids for dedup (single DB query)
    existing_rows = (
        supabase.table("locations").select("google_place_id").eq("trip_id", str(trip_id)).execute()
    ).data or []

    existing_place_ids: set[str] = {
        r["google_place_id"] for r in existing_rows if r.get("google_place_id")
    }

    imported: list[ImportedLocationSummary] = []
    existing: list[ImportedLocationSummary] = []
    failed: list[ImportedLocationSummary] = []

    rows_to_insert: list[dict] = []
    seen_place_ids: set[str] = set()

    for place in scraped_places:
        display_name = place.name or f"({place.latitude}, {place.longitude})"
        has_coords = place.latitude != 0.0 and place.longitude != 0.0

        try:
            resolved = places_client._search_place_by_text(
                place.name if place.name else f"{place.latitude},{place.longitude}",
                latitude=place.latitude if has_coords else None,
                longitude=place.longitude if has_coords else None,
                radius_m=500.0 if has_coords else None,
            )
        except Exception as exc:
            failed.append(
                ImportedLocationSummary(
                    name=display_name,
                    status="failed",
                    detail=f"Google Places enrichment failed: {exc}",
                )
            )
            continue

        if resolved.place_id in existing_place_ids or resolved.place_id in seen_place_ids:
            existing.append(
                ImportedLocationSummary(
                    name=resolved.name or display_name,
                    status="existing",
                    detail=f"google_place_id {resolved.place_id} already in trip",
                )
            )
            continue

        seen_place_ids.add(resolved.place_id)

        suggested_category = _suggest_category(resolved.types)
        city = _extract_city(resolved.formatted_address)
        clean_hours = _clean_working_hours(resolved.opening_hours_text)

        google_link = f"https://www.google.com/maps/place/?q=place_id:{resolved.place_id}"

        row = {
            "trip_id": str(trip_id),
            "name": resolved.name or display_name,
            "address": resolved.formatted_address,
            "google_link": google_link,
            "google_place_id": resolved.place_id,
            "google_source_type": "google_list_import",
            "google_raw": resolved.raw,
            "added_by_user_id": str(user_id),
            "added_by_email": user_email,
            "city": city,
            "working_hours": " | ".join(clean_hours) if clean_hours else None,
            "category": suggested_category,
            "latitude": resolved.latitude,
            "longitude": resolved.longitude,
            "note": place.note,
        }
        rows_to_insert.append((row, resolved.photos))
        imported.append(
            ImportedLocationSummary(
                name=resolved.name or display_name,
                status="imported",
            )
        )

    if rows_to_insert:
        db_rows = [row for row, _ in rows_to_insert]
        result = supabase.table("locations").insert(db_rows).execute()
        if not result.data or len(result.data) != len(db_rows):
            logger.error(
                "google_list_import_batch_failed",
                trip_id=str(trip_id),
                expected=len(db_rows),
                got=len(result.data) if result.data else 0,
                error_category="db",
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to insert some locations; please try again",
            )

        # Fetch photos for each imported location (best-effort, non-blocking).
        for (row, photos), _inserted in zip(rows_to_insert, result.data, strict=True):
            gp_id = row.get("google_place_id")
            if gp_id and photos:
                with contextlib.suppress(Exception):
                    ensure_place_photo(supabase, places_client, gp_id, photos)

    logger.info(
        "google_list_imported",
        trip_id=str(trip_id),
        imported=len(imported),
        existing=len(existing),
        failed=len(failed),
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
    frontend to show a real-time progress bar.
    """
    # Pre-stream checks (return proper HTTP errors, not SSE events)
    _ensure_resource_chain(supabase, trip_id, user_id)

    if places_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    async def event_generator():
        try:
            # Phase 1: Scraping
            yield _sse_event(
                {
                    "event": "scraping",
                    "message": "Exploring the list and having a look at the places",
                }
            )

            scraper = GoogleListScraper()
            try:
                scraped_places = await scraper.extract_places(body.google_list_url)
            except GoogleListParseError as exc:
                logger.warning(
                    "google_list_parse_error", error=str(exc), error_category="external_api"
                )
                yield _sse_event(
                    {
                        "event": "error",
                        "message": "Failed to parse Google Maps list. "
                        "Please check the URL and try again.",
                    }
                )
                return

            total = len(scraped_places)
            yield _sse_event(
                {
                    "event": "scraping_done",
                    "total": total,
                    "message": f"Found {total} places",
                }
            )

            logger.info("google_list_scraped", trip_id=str(trip_id), count=total)

            # Fetch existing place_ids for dedup (single DB query)
            existing_rows = (
                supabase.table("locations")
                .select("google_place_id")
                .eq("trip_id", str(trip_id))
                .execute()
            ).data or []
            existing_place_ids: set[str] = {
                r["google_place_id"] for r in existing_rows if r.get("google_place_id")
            }

            imported: list[ImportedLocationSummary] = []
            existing_list: list[ImportedLocationSummary] = []
            failed: list[ImportedLocationSummary] = []
            rows_to_insert: list[tuple[dict, list]] = []
            seen_place_ids: set[str] = set()

            # Phase 2: Enrichment (per-place progress)
            for i, place in enumerate(scraped_places, 1):
                if await request.is_disconnected():
                    logger.info("import_stream_client_disconnected", trip_id=str(trip_id))
                    return

                display_name = place.name or f"({place.latitude}, {place.longitude})"
                has_coords = place.latitude != 0.0 and place.longitude != 0.0

                try:
                    resolved = await asyncio.to_thread(
                        places_client._search_place_by_text,
                        place.name if place.name else f"{place.latitude},{place.longitude}",
                        latitude=place.latitude if has_coords else None,
                        longitude=place.longitude if has_coords else None,
                        radius_m=500.0 if has_coords else None,
                    )
                except Exception as exc:
                    logger.warning(
                        "google_list_enrichment_failed",
                        place_name=display_name,
                        error=str(exc),
                        error_category="external_api",
                    )
                    failed.append(
                        ImportedLocationSummary(
                            name=display_name,
                            status="failed",
                            detail="Places API lookup failed",
                        )
                    )
                    yield _sse_event(
                        {
                            "event": "enriching",
                            "current": i,
                            "total": total,
                            "name": display_name,
                            "status": "failed",
                        }
                    )
                    continue

                if resolved.place_id in existing_place_ids or resolved.place_id in seen_place_ids:
                    existing_list.append(
                        ImportedLocationSummary(
                            name=resolved.name or display_name, status="existing"
                        )
                    )
                    yield _sse_event(
                        {
                            "event": "enriching",
                            "current": i,
                            "total": total,
                            "name": resolved.name or display_name,
                            "status": "existing",
                        }
                    )
                    continue

                seen_place_ids.add(resolved.place_id)
                suggested_category = _suggest_category(resolved.types)
                city = _extract_city(resolved.formatted_address)
                clean_hours = _clean_working_hours(resolved.opening_hours_text)
                google_link = f"https://www.google.com/maps/place/?q=place_id:{resolved.place_id}"

                row = {
                    "trip_id": str(trip_id),
                    "name": resolved.name or display_name,
                    "address": resolved.formatted_address,
                    "google_link": google_link,
                    "google_place_id": resolved.place_id,
                    "google_source_type": "google_list_import",
                    "google_raw": resolved.raw,
                    "added_by_user_id": str(user_id),
                    "added_by_email": user_email,
                    "city": city,
                    "working_hours": " | ".join(clean_hours) if clean_hours else None,
                    "category": suggested_category,
                    "latitude": resolved.latitude,
                    "longitude": resolved.longitude,
                    "note": place.note,
                }
                rows_to_insert.append((row, resolved.photos))
                imported.append(
                    ImportedLocationSummary(name=resolved.name or display_name, status="imported")
                )
                yield _sse_event(
                    {
                        "event": "enriching",
                        "current": i,
                        "total": total,
                        "name": resolved.name or display_name,
                        "status": "imported",
                    }
                )

            # Phase 3: Batch insert + photos
            if rows_to_insert:
                yield _sse_event(
                    {
                        "event": "saving",
                        "message": "Almost there — saving your places...",
                    }
                )

                db_rows = [row for row, _ in rows_to_insert]
                insert_result = supabase.table("locations").insert(db_rows).execute()
                if not insert_result.data or len(insert_result.data) != len(db_rows):
                    yield _sse_event(
                        {"event": "error", "message": "Failed to save locations. Please try again."}
                    )
                    return

                for (row, photos), _inserted in zip(
                    rows_to_insert, insert_result.data, strict=True
                ):
                    gp_id = row.get("google_place_id")
                    if gp_id and photos:
                        with contextlib.suppress(Exception):
                            await asyncio.to_thread(
                                ensure_place_photo, supabase, places_client, gp_id, photos
                            )

            logger.info(
                "google_list_imported",
                trip_id=str(trip_id),
                imported=len(imported),
                existing=len(existing_list),
                failed=len(failed),
            )

            # Phase 4: Complete
            yield _sse_event(
                {
                    "event": "complete",
                    "imported_count": len(imported),
                    "existing_count": len(existing_list),
                    "failed_count": len(failed),
                    "imported": [s.model_dump() for s in imported],
                    "existing": [s.model_dump() for s in existing_list],
                    "failed": [s.model_dump() for s in failed],
                }
            )

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
    places_client: GooglePlacesClient | None = Depends(get_google_places_client_optional),
):
    """
    Update a location's user-facing fields for a trip. Requires valid JWT.
    Trip must exist and be owned by the authenticated user; location must belong
    to the trip; else 404 with descriptive message.
    """
    _ensure_resource_chain(supabase, trip_id, user_id)

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

    # Fetch updated row (without google_raw)
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
            error_category="db",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Location was updated but could not be retrieved; please refresh",
        )
    loc = fetch.data[0]
    # Enrich with photo URL (and warm cache if google_place_id changed)
    gp_id = loc.get("google_place_id")
    if gp_id:
        old_gp_id = loc_result.data[0].get("google_place_id")
        gp_id_changed = "google_place_id" in body.model_fields_set and gp_id != old_gp_id
        raw_changed = "google_raw" in body.model_fields_set
        photo_row = (
            supabase.table("place_photos")
            .select("google_place_id, photo_url, attribution_name, attribution_uri")
            .eq("google_place_id", gp_id)
            .execute()
        )
        if photo_row.data:
            loc["image_url"] = photo_row.data[0]["photo_url"]
            loc["attribution_name"] = photo_row.data[0].get("attribution_name")
            loc["attribution_uri"] = photo_row.data[0].get("attribution_uri")
        elif (gp_id_changed or raw_changed) and places_client:
            # New google_place_id or updated raw with photos — warm the cache
            raw = body.google_raw or {}
            photos = (raw.get("places") or [{}])[0].get("photos") or [] if raw else []
            if photos:
                url = ensure_place_photo(supabase, places_client, gp_id, photos)
                if url:
                    loc["image_url"] = url
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
