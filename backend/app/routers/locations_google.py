"""Google-powered location helpers: preview, autocomplete, resolve.

Three endpoints, all read-only against Supabase (quota bump only) and
pass-through to the Places API (New):

* ``/preview`` — URL-paste flow (unchanged legacy behaviour).
* ``/autocomplete`` — typeahead suggestions (Autocomplete (New) SKU, FREE
  when session completes, $2.83/1000 if abandoned).
* ``/resolve`` — on-pick resolution (Place Details (New) Pro, $17/1000).

All three funnel through the shared kill-switch + daily-quota guard in
``backend.app.core.google_guard`` so cost exposure is centrally capped.
"""

import asyncio
import re as _re
import time
from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel

from backend.app.clients.google_places import GooglePlacesClient, PlaceResolution
from backend.app.core.config import get_settings
from backend.app.core.google_guard import (
    bump_google_quota,
    bump_google_quota_sync,
    ensure_google_allowed,
)
from backend.app.core.rate_limit import limiter
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id, get_google_places_client
from backend.app.models.schemas import (
    AutocompleteRequest,
    AutocompleteResponse,
    AutocompleteSuggestionDTO,
    LocationPreviewResponse,
    ResolvePlaceRequest,
)
from backend.app.services.place_detail_cache import (
    lookup_cached_place,
    write_place_to_cache,
)

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

    Handles four shapes of addresses:

    - ``"<street>, <postcode> <city>, <country>"`` — postcode inline, e.g.
      ``"10 Rue X, 75001 Paris, France"`` → "Paris".
    - ``"<street>, <city>, <postcode>, <country>"`` — postcode as separate
      segment, e.g. ``"Main Blvd, Lahore, 54000, Pakistan"`` → "Lahore".
    - ``"<postcode> <town>, <country>"`` — postcode in parts[0], e.g.
      ``"37150 Chenonceaux, France"`` → "Chenonceaux".
    - ``"<venue>, <city-state>"`` — no postcode at all, e.g.
      ``"Victoria Peak, Hong Kong"`` → "Hong Kong".
    """
    if not address:
        return None
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 3:
        city_part = parts[-2]
        city = _re.sub(r"^\d[\d\s-]*\s*", "", city_part).strip()
        # If parts[-2] was a standalone postcode (e.g. "54000" in South
        # Asian / Middle Eastern addresses), fall back to parts[-3].
        if not city and len(parts) >= 4:
            city = parts[-3].strip()
        return city or None
    elif len(parts) == 2:
        # If parts[0] carries the postcode, the city is in the first segment
        # ("37150 Chenonceaux, France"). Otherwise fall back to parts[-1]
        # (postcode in the last segment for city-states with street, or no
        # postcode at all for bare city-states like "Victoria Peak, Hong
        # Kong"). The bare-town country case (e.g. "Étretat, France") is
        # expected to be short-circuited earlier by ``_resolve_city`` via
        # Google's locality types.
        city_part = parts[0] if _POSTCODE_PREFIX_RE.match(parts[0]) else parts[-1]
        return _re.sub(r"^\d[\d\s-]*\s*", "", city_part).strip() or None
    else:
        return None


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
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient = Depends(get_google_places_client),
):
    """Resolve a Google Maps link into normalized location data (no DB write).

    Split into two phases so ``place_detail_cache`` can sit in between:

    1. **Free phase** — follow redirects, parse the URL, run a free
       Text/Nearby Search (IDs Only) to discover the ``place_id``.
    2. **Cache check** — if the ``place_id`` is already cached, return
       instantly without calling Place Details or bumping the daily quota.
    3. **Paid phase (cache miss only)** — call Place Details Pro ($17/1k),
       bump quota, write result to cache in the background.
    """
    settings = get_settings()
    ensure_google_allowed(settings, "preview")

    google_link = (body.google_link or "").strip()
    if not google_link:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="google_link must not be empty",
        )

    # Phase 1: resolve URL → place_id (FREE)
    try:
        place_id = places_client.resolve_place_id_from_link(google_link)
    except Exception as exc:
        logger.warning("google_preview_failed", error=str(exc), error_category="external_api")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve Google Maps link",
        ) from exc

    # Phase 2: cache check
    cached = lookup_cached_place(supabase, place_id)
    if cached is not None:
        logger.info(
            "google_preview_cache_hit",
            place_id=cached.place_id,
            name=cached.name,
        )
        return LocationPreviewResponse(
            name=cached.name,
            address=cached.formatted_address,
            city=_resolve_city(cached),
            latitude=cached.latitude,
            longitude=cached.longitude,
            google_place_id=cached.place_id,
            suggested_category=_suggest_category(cached.types),
            photo_resource_name=cached.first_photo_resource,
        )

    # Phase 3: cache miss — paid Place Details call
    await bump_google_quota(supabase, user_id, "preview", settings.google_daily_cap_preview)
    try:
        resolved = places_client.get_place_by_id(place_id)
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
        cache_hit=False,
    )

    background_tasks.add_task(
        write_place_to_cache,
        supabase,
        resolved,
        city=city,
        suggested_category=suggested_category,
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


@router.post(
    "/autocomplete",
    response_model=AutocompleteResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("60/minute")
async def autocomplete_locations(
    request: Request,
    body: AutocompleteRequest,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient = Depends(get_google_places_client),
):
    """Typeahead autocomplete for the Add-a-location input.

    SKU: Autocomplete (New). Billed FREE as *Session Usage* when the
    caller subsequently invokes :func:`resolve_place` with the same
    ``session_token``. Otherwise billed per request at $2.83/1000 (first
    10k/mo free). The autocomplete response carries no Place Details data —
    ``main_text`` + ``secondary_text`` + ``types`` come directly from
    Google's structured prediction format and are free to render.

    Rate-limit: 60/min/user (SlowAPI burst) plus a daily cap enforced via
    ``bump_google_usage`` to bound sustained cost exposure.
    """
    settings = get_settings()
    ensure_google_allowed(settings, "autocomplete")

    location_bias_tuple: tuple[float, float, float] | None = None
    if body.location_bias:
        location_bias_tuple = (
            body.location_bias.lat,
            body.location_bias.lng,
            body.location_bias.radius_m,
        )

    # Run quota check and Places API call concurrently to shave ~150-200ms
    # off every typeahead response. Uses return_exceptions=True so that a
    # 429 from the quota thread doesn't leave the Places thread's exception
    # as an unraisable warning in the thread pool.
    start = time.perf_counter()
    quota_result, places_result = await asyncio.gather(
        asyncio.to_thread(
            bump_google_quota_sync,
            supabase,
            user_id,
            "autocomplete",
            settings.google_daily_cap_autocomplete,
        ),
        asyncio.to_thread(
            places_client.autocomplete,
            body.input,
            session_token=body.session_token,
            language=body.language,
            region=body.region,
            location_bias=location_bias_tuple,
        ),
        return_exceptions=True,
    )
    # Quota failure takes priority (429); Places failure is a 400.
    if isinstance(quota_result, HTTPException):
        raise quota_result
    if isinstance(quota_result, BaseException):
        raise quota_result
    if isinstance(places_result, BaseException):
        logger.warning(
            "places_autocomplete_failed",
            error=str(places_result),
            error_category="external_api",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Autocomplete request failed",
        ) from places_result
    raw_suggestions = places_result
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    logger.info(
        "places_autocomplete_done",
        had_session_token=True,
        duration_ms=duration_ms,
        results=len(raw_suggestions),
        query_length=len(body.input),
    )
    return AutocompleteResponse(
        suggestions=[
            AutocompleteSuggestionDTO(
                place_id=s.place_id,
                main_text=s.main_text,
                secondary_text=s.secondary_text,
                types=s.types,
            )
            for s in raw_suggestions
        ]
    )


@router.post(
    "/resolve",
    response_model=LocationPreviewResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("20/minute")
async def resolve_place(
    request: Request,
    body: ResolvePlaceRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
    places_client: GooglePlacesClient = Depends(get_google_places_client),
):
    """Resolve a Google place_id into ``LocationPreviewResponse``.

    Checks ``place_detail_cache`` first — on hit, returns cached data
    without calling Google or bumping the daily quota.  On miss, calls
    Place Details Pro and lazily writes the result to cache.

    SKU (on cache miss): Place Details (New) Pro — $17/1000 (first
    5k/mo free).  Forwarding ``session_token`` makes preceding
    autocomplete requests FREE.  On cache hit the session token is NOT
    forwarded, so autocomplete is billed standalone ($2.83/1k); net
    savings is still $14.17/1k.
    """
    settings = get_settings()
    ensure_google_allowed(settings, "resolve")

    # --- Cache check (before quota bump) ---
    cached = lookup_cached_place(supabase, body.place_id)
    if cached is not None:
        logger.info(
            "places_resolve_cache_hit",
            place_id=cached.place_id,
            had_session_token=body.session_token is not None,
        )
        return LocationPreviewResponse(
            name=cached.name,
            address=cached.formatted_address,
            city=_resolve_city(cached),
            latitude=cached.latitude,
            longitude=cached.longitude,
            google_place_id=cached.place_id,
            suggested_category=_suggest_category(cached.types),
            photo_resource_name=cached.first_photo_resource,
        )

    # --- Cache miss: call Google API ---
    await bump_google_quota(supabase, user_id, "resolve", settings.google_daily_cap_resolve)

    start = time.perf_counter()
    try:
        resolved = places_client.get_place_by_id(
            body.place_id,
            session_token=body.session_token,
        )
    except Exception as exc:
        logger.warning(
            "places_resolve_failed",
            error=str(exc),
            error_category="external_api",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve place",
        ) from exc
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    suggested_category = _suggest_category(resolved.types)
    city = _resolve_city(resolved)

    logger.info(
        "places_resolve_done",
        place_id=resolved.place_id,
        duration_ms=duration_ms,
        had_session_token=body.session_token is not None,
        cache_hit=False,
    )

    # Lazy cache write — runs after response is sent
    background_tasks.add_task(
        write_place_to_cache,
        supabase,
        resolved,
        city=city,
        suggested_category=suggested_category,
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
