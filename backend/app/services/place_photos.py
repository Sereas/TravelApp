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
    photo_resource_name: str,
) -> str | None:
    """Fetch and cache a photo for a Google Place, returning the public URL.

    Called synchronously — failure returns None and logs (does not raise).

    1. Check place_photos table for existing entry → return photo_url if found.
    2. Fetch photo bytes from Google using the resource name.
    3. Upload to Supabase Storage place-photos bucket.
    4. Insert into place_photos table (ON CONFLICT DO NOTHING for race safety).
    5. Return public URL.
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

        if not photo_resource_name:
            return None

        image_bytes = google_places_client.fetch_photo_bytes(photo_resource_name)

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
                "photo_resource": photo_resource_name,
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
