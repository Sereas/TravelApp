"""Google-powered location helpers (preview, later autocomplete).

These endpoints never write to the database. They are used by the UI to
resolve a Google Maps link (and later free-text queries) into normalized
location data that can be passed to the existing trip locations endpoints.
"""

import re as _re
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.app.clients.google_places import GooglePlacesClient
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.models.schemas import LocationPreviewResponse

logger: structlog.stdlib.BoundLogger = structlog.get_logger("locations-google")

router = APIRouter(prefix="/locations/google", tags=["locations-google"])

_CATEGORY_MAP: list[tuple[set[str], str]] = [
    ({"museum"}, "Museum"),
    (
        {
            "restaurant",
            "seafood_restaurant",
            "fine_dining_restaurant",
            "fast_food_restaurant",
        },
        "Restaurant",
    ),
    ({"cafe", "café", "coffee_shop"}, "Café"),
    ({"bar", "wine_bar", "cocktail_bar"}, "Bar"),
    ({"night_club", "karaoke"}, "Nightlife"),
    ({"lodging", "hotel", "motel", "resort_hotel"}, "Accommodation"),
    ({"church", "cathedral", "synagogue", "mosque", "place_of_worship"}, "Church"),
    ({"park", "garden", "botanical_garden", "playground"}, "Park"),
    ({"national_park", "nature_reserve", "state_park"}, "Nature"),
    ({"hiking_area", "campground"}, "Hiking"),
    ({"beach"}, "Beach"),
    ({"shopping_mall", "clothing_store"}, "Shopping"),
    ({"market", "farmers_market", "supermarket", "grocery_store"}, "Market"),
    ({"store"}, "Shopping"),
    ({"castle", "historical_landmark", "ruins"}, "Historic site"),
    ({"city_hall", "town_square"}, "City"),
    ({"spa", "wellness_center", "sauna", "hot_spring"}, "Spa / Wellness"),
    ({"tourist_attraction", "landmark", "monument"}, "Viewpoint"),
    ({"parking", "parking_lot", "parking_garage"}, "Parking"),
    ({"bus_station", "train_station", "airport", "transit_station"}, "Transport"),
]


def _suggest_category(types: list[str]) -> str | None:
    lower_types = {t.lower() for t in types}
    for keywords, category in _CATEGORY_MAP:
        if lower_types & keywords:
            return category
    return None


def _extract_city(address: str | None) -> str | None:
    """Extract city name from a Google formatted address, stripping postcodes."""
    if not address:
        return None
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 3:
        city_part = parts[-2]
    elif len(parts) == 2:
        city_part = parts[0]
    else:
        return None
    return _re.sub(r"^\d[\d\s-]*\s*", "", city_part).strip() or None


def _clean_working_hours(hours: list[str]) -> list[str]:
    """Normalize Unicode spaces and shorten day names in hours strings."""
    cleaned = []
    for h in hours:
        h = h.replace("\u202f", " ").replace("\u2009", "").replace("\u2013", "-")
        h = h.replace("Monday", "Mon").replace("Tuesday", "Tue")
        h = h.replace("Wednesday", "Wed").replace("Thursday", "Thu")
        h = h.replace("Friday", "Fri").replace("Saturday", "Sat")
        h = h.replace("Sunday", "Sun")
        cleaned.append(h.strip())
    return cleaned


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
    places_client: GooglePlacesClient = Depends(get_google_places_client),
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
        resolved = places_client.resolve_from_link(google_link)
    except Exception as exc:
        logger.warning("google_preview_failed", error=str(exc), error_category="external_api")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve Google Maps link",
        ) from exc

    suggested_category = _suggest_category(resolved.types)
    city = _extract_city(resolved.formatted_address)
    clean_hours = _clean_working_hours(resolved.opening_hours_text)

    logger.info(
        "google_preview_succeeded",
        place_id=resolved.place_id,
        name=resolved.name,
    )
    return LocationPreviewResponse(
        name=resolved.name,
        address=resolved.formatted_address,
        city=city,
        latitude=resolved.latitude,
        longitude=resolved.longitude,
        google_place_id=resolved.place_id,
        suggested_category=suggested_category,
        working_hours=clean_hours,
        website=resolved.website,
        phone=resolved.formatted_phone_number,
        google_raw=resolved.raw,
    )
