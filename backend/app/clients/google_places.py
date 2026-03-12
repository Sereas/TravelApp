"""Google Places API client.

Integration is optional and controlled by the GOOGLE_PLACES_API_KEY env var.
When the key is missing, callers should treat the client as disabled and avoid
calling Google to preserve quotas.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
import re

import httpx

from backend.app.core.config import get_settings


class GooglePlacesDisabledError(RuntimeError):
    """Raised when Google Places integration is not configured."""


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
    raw: dict[str, Any]


class GooglePlacesClient:
    """Thin wrapper around the **new** Places API (v1)."""

    _SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise GooglePlacesDisabledError("GOOGLE_PLACES_API_KEY is not configured")
        self._api_key = api_key
        self._http = httpx.Client(timeout=5.0)

    def close(self) -> None:
        self._http.close()

    def resolve_from_link(self, google_link: str) -> PlaceResolution:
        """Resolve a Google Maps URL using name + location bias via Places API (new).

        Flow:
        1. Follow short maps.app.goo.gl redirects to get the long Maps URL.
        2. Parse a human-readable name and precise lat/lng from the URL.
        3. Call places:searchText with that name and a circular locationBias.
        4. Fallback: if parsing fails, call places:searchText with the full URL
           as textQuery (best-effort).
        """
        long_url = self._follow_redirects_if_needed(google_link)
        name, lat, lng = self._extract_name_and_location_from_url(long_url)
        if name and lat is not None and lng is not None:
            return self._search_place_by_text(name, latitude=lat, longitude=lng, radius_m=500.0)
        return self._search_place_by_text(long_url)

    def _follow_redirects_if_needed(self, url: str) -> str:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if "maps.app.goo.gl" not in host and "goo.gl" not in host:
            return url
        resp = self._http.get(url, follow_redirects=True)
        return str(resp.url)

    def _extract_name_and_location_from_url(self, url: str) -> tuple[str | None, float | None, float | None]:
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

        # Lat/lng: from !3dLAT!4dLNG pattern inside the URL.
        decoded_full = unquote(url)
        m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", decoded_full)
        if m:
            try:
                lat = float(m.group(1))
                lng = float(m.group(2))
            except ValueError:
                lat = lng = None

        return name, lat, lng

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
            "places.regularOpeningHours.weekdayDescriptions"
        )
        headers = {
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": field_mask,
        }
        payload: dict[str, Any] = {
            "textQuery": text_query,
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
        resp = self._http.post(self._SEARCH_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        places = data.get("places") or []
        if not places:
            raise RuntimeError("Places search returned no candidates")
        place = places[0] or {}
        location = place.get("location") or {}
        opening = (place.get("regularOpeningHours") or {}).get(
            "weekdayDescriptions", []
        ) or []
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
            raw=data,
        )


def get_google_places_client() -> GooglePlacesClient:
    """Return a GooglePlacesClient or raise GooglePlacesDisabledError if not configured."""
    settings = get_settings()
    api_key = settings.google_places_api_key or ""
    return GooglePlacesClient(api_key)

