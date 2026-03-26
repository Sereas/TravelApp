"""Google Places API client.

Integration is optional and controlled by the GOOGLE_PLACES_API_KEY env var.
When the key is missing, callers should treat the client as disabled and avoid
calling Google to preserve quotas.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlparse

import httpx

from backend.app.core.config import get_settings


class GooglePlacesDisabledError(RuntimeError):
    """Raised when Google Places integration is not configured."""


class GoogleListParseError(RuntimeError):
    """Raised when parsing a Google Maps shared list fails."""


@dataclass
class ListPlace:
    """A place extracted from a Google Maps shared list."""

    name: str
    latitude: float
    longitude: float


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
    _MEDIA_URL = "https://places.googleapis.com/v1"

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

    def resolve_from_link(self, google_link: str) -> PlaceResolution:
        """Resolve a Google Maps URL using name + location bias via Places API (new).

        Flow:
        1. Follow short maps.app.goo.gl redirects to get the long Maps URL.
        2. Parse a human-readable name and precise lat/lng from the URL.
        3. Call places:searchText with that name and a circular locationBias.
        4. If we have a name but no coordinates, search by name alone.
        5. Fallback: call places:searchText with the full URL as textQuery.
        """
        long_url = self._follow_redirects_if_needed(google_link)
        name, lat, lng = self._extract_name_and_location_from_url(long_url)
        if name and lat is not None and lng is not None:
            return self._search_place_by_text(name, latitude=lat, longitude=lng, radius_m=500.0)
        if name:
            return self._search_place_by_text(name)
        return self._search_place_by_text(long_url)

    # ------------------------------------------------------------------
    # Google Maps shared-list parsing
    # ------------------------------------------------------------------

    _COORDS_RE = re.compile(r"\[null,null,(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)\]")
    _BROWSER_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )
    _LIST_PAGE_SIZE = 20

    # Matches the address+coord block that Google embeds per place in getlist responses.
    _ADDR_COORD_RE = re.compile(
        r'\[null,\[null,null,"([^"]*)",null,"([^"]*)",'
        r"\[null,null,(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)\]"
    )
    # Preload link to the actual list data endpoint.
    _GETLIST_RE = re.compile(r'href="(/maps/preview/entitylist/getlist[^"]+)"')

    def parse_shared_list(self, url: str) -> list[ListPlace]:
        """Parse a Google Maps shared list URL and return place names + coords.

        Supports short (maps.app.goo.gl) and already-expanded URLs.
        Handles pagination for lists with more than 20 items.

        Raises ``GoogleListParseError`` on CAPTCHA / 429 or when no places are
        found in the response.
        """
        long_url = self._follow_list_redirects(url)
        data_param = self._extract_data_param(long_url)
        if not data_param:
            raise GoogleListParseError(
                "Could not extract data parameter from the Google Maps list URL. "
                "Make sure the URL is a valid shared list link."
            )

        # Phase 1: fetch the initial HTML page (it contains a preload link to the real data).
        initial_html = self._fetch_list_page(data_param, 0)
        getlist_url = self._extract_getlist_url(initial_html)

        if getlist_url:
            all_places = self._fetch_and_parse_getlist(getlist_url)
        else:
            all_places = self._parse_list_response(initial_html)

        if not all_places:
            raise GoogleListParseError(
                "No places found in the Google Maps list. "
                "The list may be empty, private, or the URL may be invalid."
            )
        return all_places

    def _follow_list_redirects(self, url: str) -> str:
        """Follow redirects from a short/shared list URL until we find ``data=``."""
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if "data=" in url:
            return url
        if "maps.app.goo.gl" not in host and "goo.gl" not in host:
            return url
        current_url = url
        for _ in range(8):
            resp = self._http.get(
                current_url,
                follow_redirects=False,
                headers={"User-Agent": self._BROWSER_UA},
            )
            location = resp.headers.get("location") or ""
            if not location or resp.status_code not in (301, 302, 303, 307, 308):
                break
            current_url = location
            if "data=" in current_url:
                return current_url
        return current_url

    @staticmethod
    def _extract_data_param(url: str) -> str | None:
        """Extract the ``data=`` query-string value from a full Maps URL."""
        m = re.search(r"[?&]data=([^&]+)", url)
        if m:
            return unquote(m.group(1))
        m = re.search(r"/data=([^?&]+)", url)
        if m:
            return unquote(m.group(1))
        return None

    def _fetch_list_page(self, data_param: str, page: int) -> str:
        """Fetch the Maps HTML page for a list.  Adds pagination params."""
        offset = page * self._LIST_PAGE_SIZE
        dp = data_param
        if "7i20" not in dp:
            dp = dp.rstrip("!") + f"!7i{self._LIST_PAGE_SIZE}"
        if re.search(r"!8i\d+", dp):
            dp = re.sub(r"!8i\d+", f"!8i{offset}", dp)
        else:
            dp = dp + f"!8i{offset}"

        fetch_url = f"https://www.google.com/maps/@/data={dp}?ucbcb=1"
        resp = self._http.get(
            fetch_url,
            headers={"User-Agent": self._BROWSER_UA},
            follow_redirects=True,
            timeout=15.0,
        )
        if resp.status_code == 429 or "sorry" in resp.url.path.lower():
            raise GoogleListParseError(
                "Google returned a CAPTCHA or rate-limit response. "
                "Try opening the list in your browser, copying the full URL "
                "(starts with google.com/maps/…) and pasting that instead."
            )
        resp.raise_for_status()
        return resp.text

    def _extract_getlist_url(self, html: str) -> str | None:
        """Find the preloaded ``/maps/preview/entitylist/getlist`` URL in the HTML."""
        import html as html_mod

        m = self._GETLIST_RE.search(html)
        if not m:
            return None
        path = html_mod.unescape(m.group(1))
        return "https://www.google.com" + path

    def _fetch_and_parse_getlist(self, getlist_url: str) -> list[ListPlace]:
        """Fetch the getlist endpoint and parse place data from it."""
        resp = self._http.get(
            getlist_url,
            headers={"User-Agent": self._BROWSER_UA},
            follow_redirects=True,
            timeout=15.0,
        )
        if resp.status_code == 429 or "sorry" in resp.url.path.lower():
            raise GoogleListParseError(
                "Google returned a CAPTCHA or rate-limit response. Try again in a few minutes."
            )
        resp.raise_for_status()
        return self._parse_list_response(resp.text)

    def _parse_list_response(self, text: str) -> list[ListPlace]:
        """Extract places from a getlist or HTML response.

        Uses two strategies:
        1. Address+coord regex (most reliable — extracts address context for name hint).
        2. Coord-only regex as fallback (name will be resolved via Places API).
        """
        places: list[ListPlace] = []
        seen_coords: set[tuple[str, str]] = set()

        # Strategy 1: address block with embedded coords
        for m in self._ADDR_COORD_RE.finditer(text):
            full_addr, short_addr, lat_s, lng_s = m.group(1), m.group(2), m.group(3), m.group(4)
            key = (lat_s, lng_s)
            if key in seen_coords:
                continue
            seen_coords.add(key)
            name = self._name_from_addresses(full_addr, short_addr)
            places.append(ListPlace(name=name, latitude=float(lat_s), longitude=float(lng_s)))

        # Strategy 2: bare coords not yet seen (name = placeholder, enrichment resolves it)
        for m in self._COORDS_RE.finditer(text):
            lat_s, lng_s = m.group(1), m.group(2)
            key = (lat_s, lng_s)
            if key in seen_coords:
                continue
            seen_coords.add(key)
            places.append(ListPlace(name="", latitude=float(lat_s), longitude=float(lng_s)))

        return places

    @staticmethod
    def _name_from_addresses(full_addr: str, short_addr: str) -> str:
        """Extract a place name by diffing the full and short address strings.

        Google's full address often embeds the venue name (e.g.
        ``"2 Bayfront Ave B1, #01 Din Tai Fung, Singapore 018972"`` vs
        ``"2 Bayfront Ave B1, #01, Singapore 018972"``).  The extra segment
        in the full address that's absent in the short one is usually the name.
        """
        if not full_addr:
            return ""
        if not short_addr:
            return full_addr.split(",")[0].strip()
        full_parts = [p.strip() for p in full_addr.split(",")]
        short_parts = {p.strip().lower() for p in short_addr.split(",")}
        extras = [p for p in full_parts if p.strip().lower() not in short_parts and len(p) > 1]
        if extras:
            return extras[0]
        return full_addr.split(",")[0].strip()

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
        for _ in range(5):
            resp = self._http.get(current_url, follow_redirects=False)
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
            "places.regularOpeningHours.weekdayDescriptions,"
            "places.photos"
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
            raw=data,
        )


def get_google_places_client() -> GooglePlacesClient:
    """Return a GooglePlacesClient or raise GooglePlacesDisabledError if not configured."""
    settings = get_settings()
    api_key = settings.google_places_api_key or ""
    return GooglePlacesClient(api_key)
