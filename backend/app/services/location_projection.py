"""Single source of truth for building LocationSummary from DB rows.

Used by trip_locations, itinerary_option_locations, and itinerary_tree routers
to eliminate duplicated column lists, photo-enrichment loops, and summary builders.
"""

from __future__ import annotations

from uuid import UUID

from backend.app.models.schemas import LocationSummary

# ---------------------------------------------------------------------------
# Single canonical column list (no google_raw — CLAUDE.md rule #5)
# ---------------------------------------------------------------------------

LOCATION_SUMMARY_COLUMNS: tuple[str, ...] = (
    "id",
    "name",
    "address",
    "note",
    "city",
    "category",
    "requires_booking",
    "google_place_id",
    "latitude",
    "longitude",
    "user_image_url",
)

# Full select string used in .select() calls on the locations table.
# Note: locations table uses "location_id" as PK, not "id".
_LOCATION_SUMMARY_SELECT = (
    "location_id, name, city, address, google_link, google_place_id, "
    "category, note, working_hours, requires_booking, "
    "latitude, longitude, user_image_url"
)


# ---------------------------------------------------------------------------
# select_locations
# ---------------------------------------------------------------------------


def select_locations(
    supabase,
    *,
    trip_id: str | UUID | None = None,
    location_ids: list[str | UUID] | None = None,
) -> list[dict]:
    """Fetch location rows from DB.

    Exactly one of trip_id / location_ids must be provided.

    Returns list of raw dicts (not yet enriched with photos).
    """
    both = trip_id is not None and location_ids is not None
    neither = trip_id is None and location_ids is None
    if both or neither:
        raise ValueError(
            "select_locations requires exactly one of trip_id or location_ids"
        )

    if trip_id is not None:
        result = (
            supabase.table("locations")
            .select(_LOCATION_SUMMARY_SELECT)
            .eq("trip_id", str(trip_id))
            .execute()
        )
    else:
        str_ids = [str(lid) for lid in (location_ids or [])]
        result = (
            supabase.table("locations")
            .select(_LOCATION_SUMMARY_SELECT)
            .in_("location_id", str_ids)
            .execute()
        )
    return result.data or []


# ---------------------------------------------------------------------------
# enrich_locations_with_photos
# ---------------------------------------------------------------------------


def enrich_locations_with_photos(
    supabase, locations_by_id: dict[str, dict]
) -> None:
    """Mutate each row in-place to add image_url / attribution_name / attribution_uri.

    Issues a SINGLE IN() query against place_photos regardless of list length.
    Rows without google_place_id get image_url=None.
    """
    place_ids = [
        loc["google_place_id"]
        for loc in locations_by_id.values()
        if loc.get("google_place_id")
    ]
    if not place_ids:
        # Still stamp Nones so callers don't get KeyErrors
        for loc in locations_by_id.values():
            loc.setdefault("image_url", None)
            loc.setdefault("attribution_name", None)
            loc.setdefault("attribution_uri", None)
        return

    photos = (
        supabase.table("place_photos")
        .select("google_place_id, photo_url, attribution_name, attribution_uri")
        .in_("google_place_id", place_ids)
        .execute()
    )
    photo_map: dict[str, dict] = {
        row["google_place_id"]: row for row in (photos.data or [])
    }
    for loc in locations_by_id.values():
        photo_row = photo_map.get(loc.get("google_place_id") or "")
        loc["image_url"] = photo_row["photo_url"] if photo_row else None
        loc["attribution_name"] = photo_row.get("attribution_name") if photo_row else None
        loc["attribution_uri"] = photo_row.get("attribution_uri") if photo_row else None


# ---------------------------------------------------------------------------
# build_location_summary
# ---------------------------------------------------------------------------


def build_location_summary(row: dict | None, location_id: str) -> LocationSummary:
    """Translate a raw DB row (optionally enriched with photos) into LocationSummary.

    Returns a minimal stub if row is None.
    """
    if not row:
        return LocationSummary(id=location_id, name="")
    return LocationSummary(
        id=location_id,
        name=row.get("name", ""),
        city=row.get("city"),
        address=row.get("address"),
        google_link=row.get("google_link"),
        category=row.get("category"),
        note=row.get("note"),
        working_hours=row.get("working_hours"),
        requires_booking=row.get("requires_booking"),
        image_url=row.get("image_url"),
        user_image_url=row.get("user_image_url"),
        attribution_name=row.get("attribution_name"),
        attribution_uri=row.get("attribution_uri"),
        latitude=row.get("latitude"),
        longitude=row.get("longitude"),
    )
