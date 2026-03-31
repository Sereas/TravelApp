"""Service for fetching and caching Google Places photos in Supabase Storage."""

from __future__ import annotations

from typing import Any

import structlog

from backend.app.clients.google_places import GooglePlacesClient

logger: structlog.stdlib.BoundLogger = structlog.get_logger("place_photos")


def ensure_place_photo(
    supabase: Any,
    google_places_client: GooglePlacesClient,
    google_place_id: str,
    photos: list[dict[str, Any]],
) -> str | None:
    """Fetch and cache a photo for a Google Place, returning the public URL.

    Called synchronously — failure returns None and logs (does not raise).

    1. Check place_photos table for existing entry → return photo_url if found.
    2. If photos list is empty → return None.
    3. Fetch first photo bytes from Google.
    4. Upload to Supabase Storage place-photos bucket.
    5. Insert into place_photos table (ON CONFLICT DO NOTHING for race safety).
    6. Return public URL.
    """
    try:
        existing = (
            supabase.table("place_photos")
            .select("photo_url")
            .eq("google_place_id", google_place_id)
            .execute()
        )
        if existing.data:
            return existing.data[0]["photo_url"]

        if not photos:
            return None

        first_photo = photos[0]
        photo_resource = first_photo.get("name", "")
        if not photo_resource:
            return None

        width = first_photo.get("widthPx")
        height = first_photo.get("heightPx")
        authors = first_photo.get("authorAttributions") or []
        attribution_name = authors[0].get("displayName") if authors else None
        attribution_uri = authors[0].get("uri") if authors else None

        image_bytes = google_places_client.fetch_photo_bytes(photo_resource)

        storage_path = f"{google_place_id}.jpg"
        supabase.storage.from_("place-photos").upload(
            storage_path,
            image_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )

        photo_url = supabase.storage.from_("place-photos").get_public_url(storage_path)

        supabase.table("place_photos").upsert(
            {
                "google_place_id": google_place_id,
                "storage_path": storage_path,
                "photo_url": photo_url,
                "width_px": width,
                "height_px": height,
                "attribution_name": attribution_name,
                "attribution_uri": attribution_uri,
                "photo_resource": photo_resource,
            },
            on_conflict="google_place_id",
        ).execute()

        return photo_url

    except Exception:
        logger.error(
            "photo_fetch_failed",
            google_place_id=google_place_id,
            error_category="external_api",
            exc_info=True,
        )
        return None
