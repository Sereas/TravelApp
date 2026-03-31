"""Google Routes API client for computing a single leg (origin -> destination).

Uses GOOGLE_ROUTES_API_KEY only. When the key is missing, callers should
treat the client as disabled.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

logger: structlog.stdlib.BoundLogger = structlog.get_logger("google_routes")


class GoogleRoutesDisabledError(RuntimeError):
    """Raised when Google Routes integration is not configured."""


@dataclass
class RouteLegResult:
    """Result of a single leg from Google Routes API."""

    distance_meters: int
    duration_seconds: int
    encoded_polyline: str | None
    raw_response: dict[str, Any]


# Maps our transport_mode (lowercase) to Google travelMode (uppercase)
_TRAVEL_MODE_MAP = {
    "walk": "WALK",
    "drive": "DRIVE",
    "transit": "TRANSIT",
}

# Routes API (standard), not Routes Preferred API
_COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"


class GoogleRoutesClient:
    """Thin wrapper around Google Routes API (computeRoute, single leg)."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise GoogleRoutesDisabledError("Google Routes API key is not configured")
        self._api_key = api_key
        self._http = httpx.Client(timeout=15.0)

    def close(self) -> None:
        self._http.close()

    def compute_leg(
        self,
        origin_lat: float,
        origin_lng: float,
        dest_lat: float,
        dest_lng: float,
        travel_mode: str,
    ) -> RouteLegResult:
        """
        Compute a single leg from origin to destination.
        travel_mode: one of walk, drive, transit (lowercase).
        Returns distance_meters, duration_seconds, encoded_polyline, raw_response.
        Raises GoogleRoutesDisabledError if not configured; httpx.HTTPStatusError on API errors.
        """
        mode = _TRAVEL_MODE_MAP.get(travel_mode.lower(), "WALK")
        body = {
            "origin": {
                "location": {
                    "latLng": {
                        "latitude": origin_lat,
                        "longitude": origin_lng,
                    }
                }
            },
            "destination": {
                "location": {
                    "latLng": {
                        "latitude": dest_lat,
                        "longitude": dest_lng,
                    }
                }
            },
            "travelMode": mode,
            "polylineQuality": "OVERVIEW",
        }
        start = time.perf_counter()
        try:
            resp = self._http.post(
                _COMPUTE_ROUTES_URL,
                json=body,
                headers={
                    "X-Goog-Api-Key": self._api_key,
                    "X-Goog-FieldMask": _FIELD_MASK,
                },
            )
            resp.raise_for_status()
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.warning(
                "routes_compute_failed",
                duration_ms=duration_ms,
                travel_mode=travel_mode,
                error_category="external_api",
            )
            raise
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        data: dict[str, Any] = resp.json()
        routes = data.get("routes") or []
        if not routes:
            logger.warning(
                "routes_no_results",
                duration_ms=duration_ms,
                travel_mode=travel_mode,
                error_category="external_api",
            )
            raise ValueError("Google Routes API returned no routes")
        route = routes[0]
        duration_str = route.get("duration") or "0s"
        duration_seconds = _parse_duration_seconds(duration_str)
        distance_meters = int(route.get("distanceMeters", 0))
        polyline = (route.get("polyline") or {}).get("encodedPolyline")
        logger.debug(
            "routes_compute_ok",
            duration_ms=duration_ms,
            travel_mode=travel_mode,
            distance_meters=distance_meters,
        )
        return RouteLegResult(
            distance_meters=distance_meters,
            duration_seconds=duration_seconds,
            encoded_polyline=polyline,
            raw_response=data,
        )


def _parse_duration_seconds(s: str) -> int:
    """Parse Google duration string e.g. '165s' or '2.5h' into seconds."""
    s = (s or "").strip()
    if not s:
        return 0
    if s.endswith("s"):
        return int(float(s[:-1]))
    if s.endswith("h"):
        return int(float(s[:-1]) * 3600)
    if s.endswith("m"):
        return int(float(s[:-1]) * 60)
    return int(float(s))
