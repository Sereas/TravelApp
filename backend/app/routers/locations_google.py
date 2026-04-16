"""Google-powered location helpers (preview, later autocomplete).

These endpoints never write to the database. They are used by the UI to
resolve a Google Maps link (and later free-text queries) into normalized
location data that can be passed to the existing trip locations endpoints.
"""

import re as _re
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from backend.app.clients.google_places import GooglePlacesClient, PlaceResolution
from backend.app.core.rate_limit import limiter
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


# Google Places types that indicate the place IS itself a city/town/neighborhood,
# so the place's display name is the city. Used by _resolve_city to avoid
# mis-parsing 2-part addresses like "Étretat, France" as '<venue>, <country>'.
_LOCALITY_TYPES: frozenset[str] = frozenset(
    {
        "locality",
        "sublocality",
        "sublocality_level_1",
        "administrative_area_level_2",
        "administrative_area_level_3",
    }
)


# Leading-postcode pattern: 3+ digits followed by whitespace. Matches French
# ("37150 Chenonceaux"), Monaco ("98000 Monaco"), German, US-ZIP, Russian, etc.
# Excludes short street numbers like "10 Downing".
_POSTCODE_PREFIX_RE = _re.compile(r"^\d{3,}\s")


def _extract_city(address: str | None) -> str | None:
    """Extract city name from a Google formatted address, stripping postcodes.

    Handles three shapes of 2-part addresses:

    - ``"<postcode> <town>, <country>"`` — postcode in parts[0], e.g.
      ``"37150 Chenonceaux, France"`` → "Chenonceaux". (Small towns where
      Google elides the street segment.)
    - ``"<street>, <postcode> <city>"`` — postcode in parts[-1], e.g.
      ``"Pl. du Casino, 98000 Monaco"`` → "Monaco". (City-states with street.)
    - ``"<venue>, <city-state>"`` — no postcode at all, e.g.
      ``"Victoria Peak, Hong Kong"`` → "Hong Kong". (Fallback.)
    """
    if not address:
        return None
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 3:
        city_part = parts[-2]
    elif len(parts) == 2:
        # If parts[0] carries the postcode, the city is in the first segment
        # ("37150 Chenonceaux, France"). Otherwise fall back to parts[-1]
        # (postcode in the last segment for city-states with street, or no
        # postcode at all for bare city-states like "Victoria Peak, Hong
        # Kong"). The bare-town country case (e.g. "Étretat, France") is
        # expected to be short-circuited earlier by ``_resolve_city`` via
        # Google's locality types.
        city_part = parts[0] if _POSTCODE_PREFIX_RE.match(parts[0]) else parts[-1]
    else:
        return None
    return _re.sub(r"^\d[\d\s-]*\s*", "", city_part).strip() or None


def _resolve_city(resolved: PlaceResolution) -> str | None:
    """Determine the city for a resolved Google Place.

    Preference order:
    1. If the place itself is a locality/town/neighborhood (per Google's
       ``types``), the place's own name IS the city.
       Example: pasting a link to Étretat returns ``types=["locality", ...]``
       and ``name="Étretat"`` — the city is "Étretat", not "France".
    2. Otherwise, fall back to parsing the formatted address with
       :func:`_extract_city`, which handles typical venues in regular cities
       ("10 Rue X, 75001 Paris, France" → "Paris") and 2-part city-state
       addresses ("Victoria Peak, Hong Kong" → "Hong Kong").
    """
    if set(resolved.types) & _LOCALITY_TYPES:
        return (resolved.name or "").strip() or None
    return _extract_city(resolved.formatted_address)


class GoogleLinkPreviewBody(BaseModel):
    """Request body for Google link preview."""

    google_link: str


@router.post(
    "/preview",
    response_model=LocationPreviewResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("20/minute")
async def preview_location_from_google_link(
    request: Request,
    body: GoogleLinkPreviewBody,
    _: UUID = Depends(get_current_user_id),
    places_client: GooglePlacesClient = Depends(get_google_places_client),
):
    """Resolve a Google Maps link into normalized location data (no DB write).

    - Requires a valid JWT (same auth as other app endpoints).
    - In the common case, issues two sequential Google Places calls: a free
      Text Search / Nearby Search (IDs Only) to find the place_id, followed
      by a Place Details Pro lookup ($17/1k) for the user-facing fields.
      When the URL already contains an explicit ``place_id:``, only the
      Place Details call is made.
    - Returns data the UI can use to pre-fill trip location fields. The
      ``photo_resource_name`` is echoed back so that a later ``POST
      /trips/{trip_id}/locations`` can trigger one lazy photo-bytes fetch
      without calling Google Places again.
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
    city = _resolve_city(resolved)

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
        photo_resource_name=resolved.first_photo_resource,
    )
