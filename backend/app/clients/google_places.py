"""Google Places API client.

Integration is optional and controlled by the GOOGLE_PLACES_API_KEY env var.
When the key is missing, callers should treat the client as disabled and avoid
calling Google to preserve quotas.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
import structlog

logger: structlog.stdlib.BoundLogger = structlog.get_logger("google_places")

# Google place IDs are alphanumeric strings (may contain underscores/hyphens).
# Validating this prevents path traversal when interpolating into API URLs.
_PLACE_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")


class GooglePlacesDisabledError(RuntimeError):
    """Raised when Google Places integration is not configured."""


class GoogleListParseError(RuntimeError):
    """Raised when parsing a Google Maps shared list fails."""


@dataclass
class PlaceResolution:
    """Normalized subset of Place Details plus raw payload."""

    place_id: str
    name: str
    formatted_address: str | None
    latitude: float | None
    longitude: float | None
    types: list[str]
    website: str | None
    formatted_phone_number: str | None
    opening_hours_text: list[str]
    photos: list[dict[str, Any]]
    raw: dict[str, Any]


class GooglePlacesClient:
    """Thin wrapper around the **new** Places API (v1)."""

    _SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
    _NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
    _MEDIA_URL = "https://places.googleapis.com/v1"
    # Text Search rejects overlong / invalid queries; stay under common API limits.
    _TEXT_QUERY_MAX_BYTES = 256

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise GooglePlacesDisabledError("GOOGLE_PLACES_API_KEY is not configured")
        self._api_key = api_key
        self._http = httpx.Client(timeout=10.0)

    def close(self) -> None:
        self._http.close()

    def fetch_photo_bytes(
        self,
        photo_resource_name: str,
        max_width_px: int = 600,
        max_height_px: int = 400,
    ) -> bytes:
        """Download photo bytes for a Places photo resource.

        Uses skipHttpRedirect=true to get the photoUri in JSON, then downloads
        the actual image bytes from that URI.
        """
        url = (
            f"{self._MEDIA_URL}/{photo_resource_name}/media"
            f"?maxWidthPx={max_width_px}&maxHeightPx={max_height_px}"
            f"&key={self._api_key}&skipHttpRedirect=true"
        )
        resp = self._http.get(url)
        resp.raise_for_status()
        photo_uri = resp.json().get("photoUri")
        if not photo_uri:
            raise RuntimeError(f"No photoUri in response for {photo_resource_name}")
        img_resp = self._http.get(photo_uri)
        img_resp.raise_for_status()
        return img_resp.content

    def get_place_by_id(self, place_id: str) -> PlaceResolution:
        """Look up a place directly by its Google place_id."""
        if not _PLACE_ID_RE.match(place_id):
            raise ValueError(f"Invalid place_id format: {place_id!r}")
        field_mask = (
            "id,"
            "displayName,"
            "formattedAddress,"
            "location,"
            "types,"
            "websiteUri,"
            "nationalPhoneNumber,"
            "regularOpeningHours.weekdayDescriptions,"
            "photos"
        )
        headers = {
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": field_mask,
        }
        url = f"https://places.googleapis.com/v1/places/{place_id}"
        start = time.perf_counter()
        resp = self._http.get(url, headers=headers)
        resp.raise_for_status()
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        data = resp.json()
        logger.debug("places_get_by_id", duration_ms=duration_ms, place_id=place_id)
        return self._place_to_resolution(data, raw=data)

    @staticmethod
    def _extract_place_id_from_url(url: str) -> str | None:
        """Extract a place_id from URLs like …/maps/place/?q=place_id:ChIJ..."""
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        for val in qs.get("q", []):
            if val.startswith("place_id:"):
                pid = val[len("place_id:"):]
                if pid and _PLACE_ID_RE.match(pid):
                    return pid
        return None

    def _try_place_id_lookup(self, place_id: str, start: float) -> PlaceResolution:
        """Attempt a direct place_id lookup; log and re-raise on failure."""
        try:
            result = self.get_place_by_id(place_id)
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.info(
                "places_resolve_ok",
                duration_ms=duration_ms,
                place_id=result.place_id,
                resolved_name=result.name,
                method="place_id_lookup",
            )
            return result
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.warning(
                "places_resolve_failed",
                duration_ms=duration_ms,
                error_category="external_api",
                method="place_id_lookup",
                exc_info=True,
            )
            raise

    def resolve_from_link(self, google_link: str) -> PlaceResolution:
        """Resolve a Google Maps URL using name + location bias via Places API (new).

        Flow:
        0. If the URL contains a place_id, look it up directly (no search needed).
        1. Follow short maps.app.goo.gl redirects to get the long Maps URL.
        2. Parse a human-readable name and precise lat/lng from the URL.
        3. Call places:searchText with that name and a circular locationBias.
        4. If we have a name but no coordinates, search by name alone.
        5. If the /place/ slug is DMS coordinates (not a venue name), ignore it and
           use places:searchNearby at the parsed lat/lng when available.
        6. Fallback: call places:searchText with a truncated URL as textQuery.
        """
        start = time.perf_counter()

        # Fast path: URL contains an explicit place_id
        pid = self._extract_place_id_from_url(google_link)
        if pid:
            return self._try_place_id_lookup(pid, start)

        long_url = self._follow_redirects_if_needed(google_link)

        # Check again after redirect expansion
        pid = self._extract_place_id_from_url(long_url)
        if pid:
            return self._try_place_id_lookup(pid, start)

        name, lat, lng = self._extract_name_and_location_from_url(long_url)
        if name and self._is_coordinate_style_place_slug(name):
            name = None
        try:
            if name and lat is not None and lng is not None:
                result = self._search_place_by_text(
                    name, latitude=lat, longitude=lng, radius_m=500.0
                )
            elif name:
                result = self._search_place_by_text(name)
            elif lat is not None and lng is not None:
                result = self._search_place_nearby(lat, lng)
            else:
                result = self._search_place_by_text(self._truncate_text_query(long_url))
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.warning(
                "places_resolve_failed",
                duration_ms=duration_ms,
                error_category="external_api",
                exc_info=True,
            )
            raise
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        logger.info(
            "places_resolve_ok",
            duration_ms=duration_ms,
            place_id=result.place_id,
            resolved_name=result.name,
        )
        return result

    def _follow_redirects_if_needed(self, url: str) -> str:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if "maps.app.goo.gl" not in host and "goo.gl" not in host:
            return url
        # Follow redirects manually and stop as soon as we land on a Google Maps
        # URL.  Using follow_redirects=True would blindly chase all hops including
        # Google's bot-detection redirect to /sorry/index (HTTP 429), which leaves
        # us with a CAPTCHA URL we cannot parse or search against.
        current_url = url
        ua = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        for _ in range(5):
            resp = self._http.get(
                current_url,
                follow_redirects=False,
                headers={"User-Agent": ua},
            )
            location = resp.headers.get("location") or ""
            if not location or resp.status_code not in (301, 302, 303, 307, 308):
                break
            current_url = location
            if "google.com/maps" in current_url:
                return current_url
        return current_url

    def _extract_name_and_location_from_url(
        self, url: str
    ) -> tuple[str | None, float | None, float | None]:
        """Extract place display name and high-precision lat/lng from a Google Maps URL."""
        parsed = urlparse(url)
        decoded_path = unquote(parsed.path)
        name: str | None = None
        lat: float | None = None
        lng: float | None = None

        # Name: segment after /place/ before the next slash, decode '+' as space.
        path_parts = [p for p in decoded_path.split("/") if p]
        for i, part in enumerate(path_parts):
            if part == "place" and i + 1 < len(path_parts):
                raw_name = path_parts[i + 1]
                name = raw_name.replace("+", " ")
                break

        # Lat/lng: from !3dLAT!4dLNG pattern inside the URL (place pin).
        decoded_full = unquote(url)
        m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", decoded_full)
        if m:
            try:
                lat = float(m.group(1))
                lng = float(m.group(2))
            except ValueError:
                lat = lng = None

        # Viewport center: /...@lat,lng,17z/ when pin coords are absent.
        if lat is None or lng is None:
            m_at = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", decoded_full)
            if m_at:
                try:
                    lat = float(m_at.group(1))
                    lng = float(m_at.group(2))
                except ValueError:
                    lat = lng = None

        return name, lat, lng

    @staticmethod
    def _is_coordinate_style_place_slug(name: str) -> bool:
        """True if Maps /place/... segment is a coordinate label, not a venue name.

        Dropped pins often use DMS in the path (e.g. ``45°49'40.9\"N+6°12'01.0\"E``).
        Passing that string to Text Search triggers INVALID_ARGUMENT (400).
        """
        n = name.strip()
        if not n:
            return False
        return ("°" in n or "\u00b0" in n) or bool(
            re.search(r"[NSEW]", n, re.I) and re.search(r"\d\s*['\u2032]\s*\d", n)
        )

    @staticmethod
    def _truncate_text_query(text: str, max_bytes: int = 256) -> str:
        """Trim UTF-8 safely so ``textQuery`` stays within API size limits."""
        if not text:
            return text
        encoded = text.encode("utf-8")
        if len(encoded) <= max_bytes:
            return text
        trunc = encoded[:max_bytes]
        while trunc and (trunc[-1] & 0xC0) == 0x80:
            trunc = trunc[:-1]
        return trunc.decode("utf-8", errors="ignore")

    def _place_to_resolution(self, place: dict, *, raw: dict) -> PlaceResolution:
        location = place.get("location") or {}
        opening = (place.get("regularOpeningHours") or {}).get("weekdayDescriptions", []) or []
        display_name = place.get("displayName") or {}
        return PlaceResolution(
            place_id=str(place.get("id") or ""),
            name=str(display_name.get("text") or ""),
            formatted_address=place.get("formattedAddress"),
            latitude=location.get("latitude"),
            longitude=location.get("longitude"),
            types=[str(t) for t in (place.get("types") or [])],
            website=place.get("websiteUri"),
            formatted_phone_number=place.get("nationalPhoneNumber"),
            opening_hours_text=[str(t) for t in opening],
            photos=place.get("photos") or [],
            raw=raw,
        )

    def _search_place_nearby(self, latitude: float, longitude: float) -> PlaceResolution:
        """Resolve a map pin using Nearby Search (no text query)."""
        field_mask = (
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.types,"
            "places.websiteUri,"
            "places.nationalPhoneNumber,"
            "places.regularOpeningHours.weekdayDescriptions,"
            "places.photos"
        )
        headers = {
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": field_mask,
        }
        for radius in (120.0, 500.0):
            payload: dict[str, Any] = {
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": latitude, "longitude": longitude},
                        "radius": radius,
                    }
                },
                "maxResultCount": 20,
                "rankPreference": "DISTANCE",
            }
            start = time.perf_counter()
            resp = self._http.post(self._NEARBY_URL, json=payload, headers=headers)
            resp.raise_for_status()
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            data = resp.json()
            places = data.get("places") or []
            logger.debug(
                "places_nearby_search",
                duration_ms=duration_ms,
                radius=radius,
                results=len(places),
            )
            if places:
                return self._place_to_resolution(places[0], raw=data)
        raise RuntimeError("Places nearby search returned no candidates near coordinates")

    def _search_place_by_text(
        self,
        text_query: str,
        *,
        latitude: float | None = None,
        longitude: float | None = None,
        radius_m: float | None = None,
    ) -> PlaceResolution:
        """Search by text using places:searchText, optionally with locationBias."""
        field_mask = (
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.location,"
            "places.types,"
            "places.websiteUri,"
            "places.nationalPhoneNumber,"
            "places.regularOpeningHours.weekdayDescriptions,"
            "places.photos"
        )
        headers = {
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": field_mask,
        }
        payload: dict[str, Any] = {
            "textQuery": self._truncate_text_query(
                text_query, max_bytes=self._TEXT_QUERY_MAX_BYTES
            ),
            "pageSize": 1,
        }
        if latitude is not None and longitude is not None and radius_m is not None:
            payload["locationBias"] = {
                "circle": {
                    "center": {
                        "latitude": latitude,
                        "longitude": longitude,
                    },
                    "radius": radius_m,
                }
            }
        start = time.perf_counter()
        resp = self._http.post(self._SEARCH_URL, json=payload, headers=headers)
        resp.raise_for_status()
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        data = resp.json()
        places = data.get("places") or []
        logger.debug(
            "places_text_search",
            duration_ms=duration_ms,
            results=len(places),
        )
        if not places:
            raise RuntimeError("Places search returned no candidates")
        return self._place_to_resolution(places[0] or {}, raw=data)
