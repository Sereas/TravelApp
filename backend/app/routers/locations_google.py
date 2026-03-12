"""Google-powered location helpers (preview, later autocomplete).

These endpoints never write to the database. They are used by the UI to
resolve a Google Maps link (and later free-text queries) into normalized
location data that can be passed to the existing trip locations endpoints.
"""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.app.clients.google_places import (
    GooglePlacesDisabledError,
    get_google_places_client,
)
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import LocationPreviewResponse

logger: structlog.stdlib.BoundLogger = structlog.get_logger("locations-google")

router = APIRouter(prefix="/locations/google", tags=["locations-google"])


class GoogleLinkPreviewBody(BaseModel):
    """Request body for Google link preview."""

    google_link: str


@router.post(
    "/preview",
    response_model=LocationPreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def preview_location_from_google_link(
    body: GoogleLinkPreviewBody,
    _: UUID = Depends(get_current_user_id),
):
    """Resolve a Google Maps link into normalized location data (no DB write).

    - Requires a valid JWT (same auth as other app endpoints).
    - Calls Google Places only once per request.
    - Returns data the UI can use to pre-fill trip location fields, including
      the full raw JSON payload so later POST /trips/{trip_id}/locations can
      simply persist it without re-calling Google.
    """
    google_link = (body.google_link or "").strip()
    if not google_link:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="google_link must not be empty",
        )
    try:
        client = get_google_places_client()
        resolved = client.resolve_from_link(google_link)
    except GooglePlacesDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        ) from None
    except Exception as exc:  # noqa: BLE001
        logger.warning("google_preview_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve Google Maps link",
        ) from exc

    # Simple category suggestion based on Google types; UI may map this further.
    suggested_category: str | None = None
    lower_types = {t.lower() for t in resolved.types}
    if "museum" in lower_types:
        suggested_category = "Museum"
    elif "restaurant" in lower_types:
        suggested_category = "Restaurant"
    elif "cafe" in lower_types or "café" in lower_types:
        suggested_category = "Café"
    elif "bar" in lower_types:
        suggested_category = "Bar"

    logger.info(
        "google_preview_succeeded",
        place_id=resolved.place_id,
        name=resolved.name,
    )
    return LocationPreviewResponse(
        name=resolved.name,
        address=resolved.formatted_address,
        latitude=resolved.latitude,
        longitude=resolved.longitude,
        google_place_id=resolved.place_id,
        suggested_category=suggested_category,
        working_hours=resolved.opening_hours_text,
        website=resolved.website,
        phone=resolved.formatted_phone_number,
        google_raw=resolved.raw,
    )

