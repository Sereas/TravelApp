"""Unified Google Maps shared list import logic.

Both the non-streaming endpoint (drains iterator to return ImportGoogleListResponse)
and the SSE streaming endpoint (yields each event as a JSON dict) consume this single
async generator.  No business logic lives in the routers.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import structlog

from backend.app.clients.google_list_scraper import GoogleListScraper
from backend.app.clients.google_places import GoogleListParseError
from backend.app.routers.locations_google import (
    _clean_working_hours,
    _resolve_city,
    _suggest_category,
)
from backend.app.services.place_photos import ensure_place_photo

logger: structlog.stdlib.BoundLogger = structlog.get_logger("google_list_import_service")


# ---------------------------------------------------------------------------
# Event dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ScrapingStarted:
    """Fired immediately before the Playwright scrape begins."""


@dataclass
class ScrapingDone:
    """Fired after scraping completes; total = number of scraped items."""

    total_items: int


@dataclass
class EnrichingItem:
    """Fired once per scraped place after Places API resolution.

    status: 'imported' | 'existing' | 'failed'
    """

    index: int
    name: str
    status: str = "imported"


@dataclass
class SavingStarted:
    """Fired just before the batch DB insert."""

    count: int


@dataclass
class ImportComplete:
    """Final event: summary of the import run."""

    inserted: list[dict] = field(default_factory=list)  # raw location dicts
    skipped: list[str] = field(default_factory=list)  # names of dupes / failures


@dataclass
class ImportError:
    """Fired on unrecoverable errors (scrape failure, parse error)."""

    message: str


# Union type for type checkers / documentation
ImportEvent = (
    ScrapingStarted
    | ScrapingDone
    | EnrichingItem
    | SavingStarted
    | ImportComplete
    | ImportError
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_note(existing_note: str | None, used_nearby: bool, original_name: str) -> str | None:
    parts: list[str] = []
    if used_nearby:
        parts.append(f'Nearest place to dropped pin "{original_name}"')
    if existing_note:
        parts.append(existing_note)
    return " · ".join(parts) if parts else None


def _build_row(
    resolved,
    *,
    trip_id: str,
    user_id: str,
    user_email: str | None,
    display_name: str,
    used_nearby: bool,
    place_note: str | None,
) -> dict:
    """Build a DB-ready location dict from a resolved PlaceResolution."""
    suggested_category = _suggest_category(resolved.types)
    city = _resolve_city(resolved)
    clean_hours = _clean_working_hours(resolved.opening_hours_text)
    google_link = f"https://www.google.com/maps/place/?q=place_id:{resolved.place_id}"
    return {
        "trip_id": trip_id,
        "name": resolved.name or display_name,
        "address": resolved.formatted_address,
        "google_link": google_link,
        "google_place_id": resolved.place_id,
        "google_source_type": "google_list_import",
        "added_by_user_id": user_id,
        "added_by_email": user_email,
        "city": city,
        "working_hours": " | ".join(clean_hours) if clean_hours else None,
        "category": suggested_category,
        "latitude": resolved.latitude,
        "longitude": resolved.longitude,
        "note": _build_note(place_note, used_nearby, display_name),
    }


async def _resolve_place(places_client, place, *, display_name: str, has_coords: bool):
    """Attempt Places API resolution with text→nearby fallback.

    Returns (resolved, used_nearby) or (None, False).
    """
    from backend.app.clients.google_places import GooglePlacesClient

    is_coord_slug = GooglePlacesClient._is_coordinate_style_place_slug
    name_is_coords = place.name and is_coord_slug(place.name)
    search_name = None if name_is_coords else (place.name or None)

    resolved = None
    used_nearby = False

    try:
        if search_name:
            resolved = await asyncio.to_thread(
                places_client._search_place_by_text,
                search_name,
                latitude=place.latitude if has_coords else None,
                longitude=place.longitude if has_coords else None,
                radius_m=500.0 if has_coords else None,
            )
        elif has_coords:
            resolved = await asyncio.to_thread(
                places_client._search_place_nearby,
                place.latitude,
                place.longitude,
            )
            used_nearby = True
    except Exception:
        # Text search failed — retry without location bias
        if search_name and has_coords:
            with contextlib.suppress(Exception):
                resolved = await asyncio.to_thread(
                    places_client._search_place_by_text,
                    search_name,
                )
        # Still nothing — fall back to nearby coords
        if resolved is None and has_coords and search_name:
            with contextlib.suppress(Exception):
                resolved = await asyncio.to_thread(
                    places_client._search_place_nearby,
                    place.latitude,
                    place.longitude,
                )
                used_nearby = True

    return resolved, used_nearby


# ---------------------------------------------------------------------------
# Core iterator
# ---------------------------------------------------------------------------


async def import_google_list_iter(
    supabase,
    places_client,
    *,
    trip_id: str,
    user_id: str,
    user_email: str | None,
    url: str,
) -> AsyncIterator[ImportEvent]:
    """Single source of truth for the Google Maps shared list import flow.

    Yields ImportEvent instances as it progresses.  Callers decide how to
    present them (drain to JSON response or map to SSE data dicts).
    """
    yield ScrapingStarted()

    # Phase 1: Scraping
    scraper = GoogleListScraper()
    try:
        scraped_places = await scraper.extract_places(url)
    except GoogleListParseError as exc:
        raw = str(exc)
        _INTERNAL_MARKERS = ("CAPTCHA", "rate-limit", "Playwright", "Failed to scrape")
        if any(m in raw for m in _INTERNAL_MARKERS):
            user_message = (
                "We're having temporary technical difficulties importing this list. "
                "Please try again in a few minutes."
            )
        else:
            user_message = raw
        logger.warning("google_list_parse_error", error=raw, error_category="external_api")
        yield ImportError(message=user_message)
        return

    total = len(scraped_places)
    logger.info("google_list_scraped", trip_id=trip_id, count=total)
    yield ScrapingDone(total_items=total)

    # Fetch existing place_ids for dedup (single DB query)
    existing_rows = (
        supabase.table("locations")
        .select("google_place_id")
        .eq("trip_id", trip_id)
        .execute()
    ).data or []
    existing_place_ids: set[str] = {
        r["google_place_id"] for r in existing_rows if r.get("google_place_id")
    }

    rows_to_insert: list[tuple[dict, str | None]] = []
    seen_place_ids: set[str] = set()
    skipped_names: list[str] = []

    # Phase 2: Enrichment
    for i, place in enumerate(scraped_places, 1):
        display_name = place.name or f"({place.latitude}, {place.longitude})"
        has_coords = place.latitude != 0.0 and place.longitude != 0.0

        resolved, used_nearby = await _resolve_place(
            places_client, place, display_name=display_name, has_coords=has_coords
        )

        if resolved is None:
            logger.warning(
                "google_list_enrichment_failed",
                place_name=display_name,
                error_category="external_api",
            )
            skipped_names.append(display_name)
            yield EnrichingItem(index=i, name=display_name, status="failed")
            continue

        if resolved.place_id in existing_place_ids or resolved.place_id in seen_place_ids:
            skipped_names.append(resolved.name or display_name)
            yield EnrichingItem(index=i, name=resolved.name or display_name, status="existing")
            continue

        seen_place_ids.add(resolved.place_id)
        row = _build_row(
            resolved,
            trip_id=trip_id,
            user_id=user_id,
            user_email=user_email,
            display_name=display_name,
            used_nearby=used_nearby,
            place_note=place.note,
        )
        rows_to_insert.append((row, resolved.first_photo_resource))
        yield EnrichingItem(
            index=i,
            name=resolved.name or display_name,
            status="imported",
        )

    # Phase 3: Batch insert
    inserted_locs: list[dict] = []
    if rows_to_insert:
        yield SavingStarted(count=len(rows_to_insert))
        db_rows = [row for row, _ in rows_to_insert]
        insert_result = supabase.table("locations").insert(db_rows).execute()
        if not insert_result.data or len(insert_result.data) != len(db_rows):
            logger.error(
                "google_list_import_batch_failed",
                trip_id=trip_id,
                expected=len(db_rows),
                got=len(insert_result.data) if insert_result.data else 0,
                error_category="db",
            )
            yield ImportError(message="Failed to save locations. Please try again.")
            return

        inserted_locs = insert_result.data

        # Warm photo cache (best-effort, concurrent)
        async def _warm_photo(gp_id: str, resource: str) -> None:
            with contextlib.suppress(Exception):
                await asyncio.to_thread(
                    ensure_place_photo, supabase, places_client, gp_id, resource
                )

        photo_tasks = [
            _warm_photo(row["google_place_id"], photo_resource)
            for (row, photo_resource), _ in zip(rows_to_insert, inserted_locs, strict=True)
            if row.get("google_place_id") and photo_resource
        ]
        if photo_tasks:
            await asyncio.gather(*photo_tasks, return_exceptions=True)

    logger.info(
        "google_list_imported",
        trip_id=trip_id,
        inserted=len(inserted_locs),
        skipped=len(skipped_names),
    )
    yield ImportComplete(inserted=inserted_locs, skipped=skipped_names)
