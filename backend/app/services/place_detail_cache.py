"""Service for caching Google Place Details in Supabase.

Avoids redundant Place Details Pro API calls ($17/1k) by storing the
resolved data keyed by ``google_place_id``.  Global across all users
and trips — follows the same pattern as :mod:`place_photos`.

Two public functions:

* :func:`lookup_cached_place` — single SELECT, returns a
  :class:`PlaceResolution` on hit or ``None`` on miss.
* :func:`write_place_to_cache` — upsert; intended to run in a
  ``BackgroundTasks`` callback so it never blocks the response.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog

from backend.app.clients.google_places import PlaceResolution

logger: structlog.stdlib.BoundLogger = structlog.get_logger("place_detail_cache")

_SELECT_COLS = (
    "google_place_id, name, formatted_address, "
    "latitude, longitude, google_types, photo_resource_name"
)


def lookup_cached_place(
    supabase: Any,
    google_place_id: str,
) -> PlaceResolution | None:
    """Check place_detail_cache for a previously resolved place.

    Returns a :class:`PlaceResolution` on cache hit, ``None`` on miss.
    Swallows all exceptions so callers fall through to the Google API.
    """
    if not google_place_id:
        return None

    try:
        result = (
            supabase.table("place_detail_cache")
            .select(_SELECT_COLS)
            .eq("google_place_id", google_place_id)
            .execute()
        )
        if not result.data:
            logger.debug("place_cache_miss", google_place_id=google_place_id)
            return None

        row = result.data[0]
        logger.info("place_cache_hit", google_place_id=google_place_id)
        return PlaceResolution(
            place_id=row["google_place_id"],
            name=row["name"],
            formatted_address=row.get("formatted_address"),
            latitude=row.get("latitude"),
            longitude=row.get("longitude"),
            types=row.get("google_types") or [],
            first_photo_resource=row.get("photo_resource_name"),
        )
    except Exception:
        logger.warning(
            "place_cache_lookup_error",
            google_place_id=google_place_id,
            exc_info=True,
        )
        return None


def write_place_to_cache(
    supabase: Any,
    resolved: PlaceResolution,
    *,
    city: str | None = None,
    suggested_category: str | None = None,
) -> None:
    """Insert a resolved place into the cache (DO NOTHING on conflict).

    Intended to run as a background task — never raises.  On conflict
    (concurrent writes for the same place_id), the first writer wins;
    subsequent inserts are no-ops.  Same race-safety pattern as
    ``place_photos`` (ON CONFLICT DO NOTHING).
    """
    if not resolved.place_id:
        return

    try:
        supabase.table("place_detail_cache").upsert(
            {
                "google_place_id": resolved.place_id,
                "name": resolved.name,
                "formatted_address": resolved.formatted_address,
                "city": city,
                "latitude": resolved.latitude,
                "longitude": resolved.longitude,
                "google_types": resolved.types or [],
                "suggested_category": suggested_category,
                "photo_resource_name": resolved.first_photo_resource,
                "cached_at": datetime.now(UTC).isoformat(),
            },
            on_conflict="google_place_id",
            ignore_duplicates=True,
        ).execute()
        logger.info(
            "place_cache_write_ok",
            google_place_id=resolved.place_id,
        )
    except Exception:
        logger.error(
            "place_cache_write_failed",
            google_place_id=resolved.place_id,
            exc_info=True,
        )
