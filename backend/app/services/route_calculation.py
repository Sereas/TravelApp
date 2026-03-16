"""Route calculation: retry-on-view only, no automated retries.

Entry point: get_route_with_fresh_segments() — used when user views route or explicitly refreshes.
Cache is reused when eligible; only missing/stale/retry-eligible segments are recomputed.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog

from backend.app.clients.google_routes import (
    GoogleRoutesClient,
    get_google_routes_client,
)
from backend.app.models.schemas import (
    RouteSegmentResponse,
    RouteWithSegmentsResponse,
)

logger: structlog.stdlib.BoundLogger = structlog.get_logger("route_calculation")

# -------- Status values (explicit, no generic "error") --------
STATUS_SUCCESS = "success"
STATUS_RETRYABLE_ERROR = "retryable_error"
STATUS_CONFIG_ERROR = "config_error"
STATUS_INPUT_ERROR = "input_error"
STATUS_NO_ROUTE = "no_route"

# Legacy: map old DB values to new
STATUS_LEGACY_TO_NEW = {"ok": STATUS_SUCCESS, "error": STATUS_RETRYABLE_ERROR}

# -------- TTL / cooldown (minutes) — no auto-retry; only on view or force_refresh --------
# Success: TRANSIT expires so we refresh; WALK/DRIVE indefinite (cache_expires_at NULL)
TRANSIT_SUCCESS_TTL_MINUTES = 12 * 60  # 12 hours

# Cooldown before retry on view (minutes)
COOLDOWN_RETRYABLE_MINUTES = 5
COOLDOWN_CONFIG_MINUTES = 30
COOLDOWN_NO_ROUTE_WALK_DRIVE_MINUTES = 24 * 60  # 24 hours
COOLDOWN_NO_ROUTE_TRANSIT_MINUTES = 4 * 60  # 4 hours

# -------- Helpers --------


def _input_fingerprint(
    origin_place_id: str | None,
    dest_place_id: str | None,
    origin_lat: float | None,
    origin_lng: float | None,
    dest_lat: float | None,
    dest_lng: float | None,
    transport_mode: str,
) -> str:
    """Deterministic fingerprint for cache invalidation when inputs change."""

    def _ll(lat: float | None, lng: float | None) -> str:
        if lat is not None and lng is not None:
            return f"{round(lat, 5)}_{round(lng, 5)}"
        return "none"

    o_place = origin_place_id or "n"
    d_place = dest_place_id or "n"
    o_ll = _ll(origin_lat, origin_lng)
    d_ll = _ll(dest_lat, dest_lng)
    return f"{o_place}|{d_place}|{o_ll}|{d_ll}|{transport_mode}"


def _cache_key(
    origin_place_id: str | None,
    dest_place_id: str | None,
    origin_lat: float | None,
    origin_lng: float | None,
    dest_lat: float | None,
    dest_lng: float | None,
    transport_mode: str,
) -> str:
    """Lookup key (same as before); direction matters."""
    if origin_place_id and dest_place_id:
        return f"{origin_place_id}|{dest_place_id}|{transport_mode}"

    def _ll(a: float | None, b: float | None) -> str:
        if a is not None and b is not None:
            return f"{round(a, 5)}_{round(b, 5)}"
        return "none"

    return f"latlng:{_ll(origin_lat, origin_lng)}:{_ll(dest_lat, dest_lng)}|{transport_mode}"


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _add_minutes(dt: datetime, minutes: int) -> datetime:
    from datetime import timedelta

    return dt + timedelta(minutes=minutes)


def classify_provider_error(
    http_status: int | None,
    message: str,
    transport_mode: str,
) -> tuple[str, str, int | None]:
    """
    Classify failure into (status, error_type, next_retry_minutes).
    next_retry_minutes: cooldown until next_retry_at = last_attempt_at + this.
    """
    status = STATUS_RETRYABLE_ERROR
    error_type = "unknown"
    cooldown_minutes = COOLDOWN_RETRYABLE_MINUTES

    if http_status is not None:
        if http_status in (401, 403):
            status = STATUS_CONFIG_ERROR
            error_type = "forbidden_or_unauthorized"
            cooldown_minutes = COOLDOWN_CONFIG_MINUTES
        elif http_status in (400, 404, 422):
            status = STATUS_INPUT_ERROR
            error_type = "bad_request"
            cooldown_minutes = 0  # retry only when input fingerprint changes
        elif http_status in (429, 500, 502, 503, 504):
            status = STATUS_RETRYABLE_ERROR
            error_type = "server_or_rate_limit"
            cooldown_minutes = COOLDOWN_RETRYABLE_MINUTES
        else:
            status = STATUS_RETRYABLE_ERROR
            error_type = "http_error"
            cooldown_minutes = COOLDOWN_RETRYABLE_MINUTES

    # "no routes" from API (we treat as no_route)
    if "no route" in (message or "").lower() or "no routes" in (message or "").lower():
        status = STATUS_NO_ROUTE
        error_type = "no_route"
        cooldown_minutes = (
            COOLDOWN_NO_ROUTE_TRANSIT_MINUTES
            if transport_mode == "transit"
            else COOLDOWN_NO_ROUTE_WALK_DRIVE_MINUTES
        )

    return status, error_type, cooldown_minutes


def should_recompute_on_view(
    cache_row: dict[str, Any] | None,
    force_refresh: bool,
    current_fingerprint: str,
    transport_mode: str,
) -> bool:
    """
    Decide whether to recompute this segment when user views the route.
    No automated retries; only on view (or force_refresh).
    """
    if force_refresh:
        return True
    if not cache_row:
        return True

    status = cache_row.get("status") or ""
    status = STATUS_LEGACY_TO_NEW.get(status, status)
    cached_fingerprint = cache_row.get("input_fingerprint")
    next_retry_at = cache_row.get("next_retry_at")
    cache_expires_at = cache_row.get("cache_expires_at")
    now = _now_utc()

    # Input changed -> invalidate cache
    if cached_fingerprint is not None and current_fingerprint != cached_fingerprint:
        return True

    if status == STATUS_SUCCESS:
        # Reuse success unless TRANSIT TTL expired
        if cache_expires_at is not None:
            try:
                exp = cache_expires_at if isinstance(cache_expires_at, datetime) else None
                if exp is None and isinstance(cache_expires_at, str):
                    exp = datetime.fromisoformat(cache_expires_at.replace("Z", "+00:00"))
                if exp is not None and now >= exp:
                    return True
            except Exception:
                pass
        return False

    if status == STATUS_INPUT_ERROR:
        # Retry only when fingerprint changed (already handled above)
        return False

    # retryable_error, config_error, no_route: retry only after cooldown
    if next_retry_at is not None:
        try:
            at = next_retry_at if isinstance(next_retry_at, datetime) else None
            if at is None and isinstance(next_retry_at, str):
                at = datetime.fromisoformat(next_retry_at.replace("Z", "+00:00"))
            if at is not None and now >= at:
                return True
        except Exception:
            return True  # on parse error, allow retry
    return False


def _fetch_cached_segment(
    supabase: Any,
    cache_key: str,
) -> dict[str, Any] | None:
    """Return full segment_cache row by cache_key or None."""
    r = (
        supabase.table("segment_cache")
        .select(
            "id, status, input_fingerprint, distance_meters, duration_seconds, encoded_polyline, "
            "error_type, error_code, error_message, provider_http_status, "
            "next_retry_at, cache_expires_at, retry_count"
        )
        .eq("cache_key", cache_key)
        .execute()
    )
    if r.data and len(r.data) > 0:
        return r.data[0]
    return None


def _compute_one_segment(
    supabase: Any,
    google_client: GoogleRoutesClient | None,
    origin_place_id: str | None,
    origin_lat: float,
    origin_lng: float,
    dest_place_id: str | None,
    dest_lat: float,
    dest_lng: float,
    transport_mode: str,
) -> tuple[str, dict[str, Any]]:
    """
    Call Google for one leg; classify success/failure; upsert segment_cache.
    Returns (segment_cache_id, row_dict for response).
    """
    cache_key = _cache_key(
        origin_place_id,
        dest_place_id,
        origin_lat,
        origin_lng,
        dest_lat,
        dest_lng,
        transport_mode,
    )
    fingerprint = _input_fingerprint(
        origin_place_id,
        dest_place_id,
        origin_lat,
        origin_lng,
        dest_lat,
        dest_lng,
        transport_mode,
    )
    now = _now_utc()

    # Build base row for upsert
    base = {
        "origin_place_id": origin_place_id,
        "destination_place_id": dest_place_id,
        "origin_lat": origin_lat,
        "origin_lng": origin_lng,
        "destination_lat": dest_lat,
        "destination_lng": dest_lng,
        "transport_mode": transport_mode,
        "cache_key": cache_key,
        "input_fingerprint": fingerprint,
        "last_attempt_at": now.isoformat(),
        "provider": "google",
    }

    if not google_client:
        row = {
            **base,
            "status": STATUS_CONFIG_ERROR,
            "error_type": "not_configured",
            "error_message": "Google Routes API not configured",
            "provider_http_status": None,
            "next_retry_at": _add_minutes(now, COOLDOWN_CONFIG_MINUTES).isoformat(),
            "cache_expires_at": None,
            "retry_count": 0,
        }
        ins = supabase.table("segment_cache").upsert(row, on_conflict="cache_key").execute()
        if ins.data and len(ins.data) > 0:
            return str(ins.data[0]["id"]), row
        # fetch by key
        existing = _fetch_cached_segment(supabase, cache_key)
        if existing:
            return str(existing["id"]), {**existing, **row}
        raise RuntimeError("Failed to upsert segment_cache")

    try:
        leg = google_client.compute_leg(
            origin_lat,
            origin_lng,
            dest_lat,
            dest_lng,
            transport_mode,
        )
    except Exception as e:
        http_status = getattr(getattr(e, "response", None), "status_code", None)
        msg = str(e)
        status, error_type, cooldown_minutes = classify_provider_error(
            http_status,
            msg,
            transport_mode,
        )
        next_retry = _add_minutes(now, cooldown_minutes) if cooldown_minutes else None
        existing = _fetch_cached_segment(supabase, cache_key)
        retry_count = (existing.get("retry_count") or 0) + 1 if existing else 1
        row = {
            **base,
            "status": status,
            "error_type": error_type,
            "error_code": None,
            "error_message": msg,
            "provider_http_status": http_status,
            "next_retry_at": next_retry.isoformat() if next_retry else None,
            "cache_expires_at": None,
            "retry_count": retry_count,
        }
        logger.warning(
            "google_routes_leg_failed",
            key=cache_key,
            status=status,
            error_type=error_type,
            http_status=http_status,
        )
        supabase.table("segment_cache").upsert(row, on_conflict="cache_key").execute()
        again = _fetch_cached_segment(supabase, cache_key)
        if again:
            return str(again["id"]), {**again, **row}
        raise RuntimeError("Failed to upsert segment_cache after error") from e

    # Success
    cache_expires_at = None
    if transport_mode == "transit":
        cache_expires_at = _add_minutes(now, TRANSIT_SUCCESS_TTL_MINUTES).isoformat()

    row = {
        **base,
        "distance_meters": leg.distance_meters,
        "duration_seconds": leg.duration_seconds,
        "encoded_polyline": leg.encoded_polyline,
        "raw_provider_response": leg.raw_response,
        "status": STATUS_SUCCESS,
        "error_type": None,
        "error_code": None,
        "error_message": None,
        "provider_http_status": None,
        "next_retry_at": None,
        "cache_expires_at": cache_expires_at,
        "retry_count": 0,
        "calculated_at": now.isoformat(),
    }
    supabase.table("segment_cache").upsert(row, on_conflict="cache_key").execute()
    again = _fetch_cached_segment(supabase, cache_key)
    if again:
        return str(again["id"]), {**again, **row}
    raise RuntimeError("Failed to upsert segment_cache after success")


def _segment_response(
    segment_order: int,
    from_location_id: str,
    to_location_id: str,
    cache_row: dict[str, Any],
) -> RouteSegmentResponse:
    """Build RouteSegmentResponse from cache row; include retry metadata when not success."""
    status = cache_row.get("status") or ""
    status = STATUS_LEGACY_TO_NEW.get(status, status)
    next_retry = cache_row.get("next_retry_at")
    if hasattr(next_retry, "isoformat"):
        next_retry = next_retry.isoformat()
    return RouteSegmentResponse(
        segment_order=segment_order,
        from_location_id=from_location_id,
        to_location_id=to_location_id,
        distance_meters=cache_row.get("distance_meters"),
        duration_seconds=cache_row.get("duration_seconds"),
        encoded_polyline=cache_row.get("encoded_polyline"),
        status=status,
        error_type=cache_row.get("error_type"),
        error_message=cache_row.get("error_message"),
        provider_http_status=cache_row.get("provider_http_status"),
        next_retry_at=next_retry,
    )


def get_route_with_fresh_segments(
    supabase: Any,
    route_id: str,
    transport_mode: str | None = None,
    force_refresh: bool = False,
) -> RouteWithSegmentsResponse:
    """
    Load route and segments; for each segment decide reuse vs recompute (retry-on-view).
    Recompute when: force_refresh, or missing cache, or fingerprint changed, or
    status allows retry and cooldown expired.
    Update option_routes totals and route_segments; return route with segment status.
    """
    route_row = (
        supabase.table("option_routes")
        .select("route_id, option_id, label, transport_mode, sort_order")
        .eq("route_id", route_id)
        .execute()
    )
    if not route_row.data or len(route_row.data) == 0:
        raise LookupError("Route not found")
    route = route_row.data[0]
    option_id = str(route["option_id"])
    mode = (transport_mode or route.get("transport_mode") or "walk").lower()

    stops = (
        supabase.table("route_stops")
        .select("location_id, stop_order")
        .eq("route_id", route_id)
        .order("stop_order")
        .execute()
    )
    ordered = sorted((stops.data or []), key=lambda r: r["stop_order"])
    location_ids = [str(s["location_id"]) for s in ordered]
    if len(ordered) < 2:
        # Zero or one stop: no segments to compute; persist zero totals
        supabase.table("option_routes").update(
            {
                "duration_seconds": 0,
                "distance_meters": 0,
            }
        ).eq("route_id", route_id).execute()
        return RouteWithSegmentsResponse(
            route_id=route_id,
            option_id=option_id,
            label=route.get("label"),
            transport_mode=mode,
            duration_seconds=0,
            distance_meters=0,
            sort_order=int(route.get("sort_order", 0)),
            location_ids=location_ids,
            segments=[],
            route_status="ok",
        )
    loc_rows = (
        supabase.table("locations")
        .select("location_id, google_place_id, latitude, longitude")
        .in_("location_id", location_ids)
        .execute()
    )
    loc_by_id = {str(r["location_id"]): r for r in (loc_rows.data or [])}

    google_client = get_google_routes_client()

    # Load existing route_segments and their cache rows
    rs_rows = (
        supabase.table("route_segments")
        .select("segment_order, from_location_id, to_location_id, segment_cache_id")
        .eq("route_id", route_id)
        .order("segment_order")
        .execute()
    )
    existing_segments = sorted((rs_rows.data or []), key=lambda r: r["segment_order"])
    cache_ids = [str(s["segment_cache_id"]) for s in existing_segments]
    cache_rows_by_id: dict[str, dict] = {}
    if cache_ids:
        cache_list = (
            supabase.table("segment_cache")
            .select(
                "id, cache_key, status, input_fingerprint, distance_meters, "
                "duration_seconds, encoded_polyline, error_type, error_code, "
                "error_message, provider_http_status, next_retry_at, "
                "cache_expires_at, retry_count"
            )
            .in_("id", cache_ids)
            .execute()
        )
        cache_rows_by_id = {str(r["id"]): r for r in (cache_list.data or [])}

    segments_out: list[RouteSegmentResponse] = []
    total_distance = 0
    total_duration = 0
    any_non_success = False
    # After loop we'll write route_segments for new/changed
    segment_order_to_cache_id: dict[int, str] = {}

    for i in range(len(ordered) - 1):
        from_stop = ordered[i]
        to_stop = ordered[i + 1]
        from_loc_id = str(from_stop["location_id"])
        to_loc_id = str(to_stop["location_id"])
        from_loc = loc_by_id.get(from_loc_id) or {}
        to_loc = loc_by_id.get(to_loc_id) or {}
        from_place = from_loc.get("google_place_id")
        to_place = to_loc.get("google_place_id")
        from_lat_raw = from_loc.get("latitude")
        from_lng_raw = from_loc.get("longitude")
        to_lat_raw = to_loc.get("latitude")
        to_lng_raw = to_loc.get("longitude")
        from_lat = float(from_lat_raw or 0.0)
        from_lng = float(from_lng_raw or 0.0)
        to_lat = float(to_lat_raw or 0.0)
        to_lng = float(to_lng_raw or 0.0)

        # Skip Google call if either endpoint is missing coordinates (avoid 0,0 requests)
        missing_coords = (
            from_lat_raw is None or from_lng_raw is None or to_lat_raw is None or to_lng_raw is None
        )
        if missing_coords:
            segments_out.append(
                RouteSegmentResponse(
                    segment_order=i,
                    from_location_id=from_loc_id,
                    to_location_id=to_loc_id,
                    distance_meters=None,
                    duration_seconds=None,
                    encoded_polyline=None,
                    status=STATUS_INPUT_ERROR,
                    error_type="missing_coordinates",
                    error_message="One or both locations are missing coordinates",
                    provider_http_status=None,
                    next_retry_at=None,
                )
            )
            any_non_success = True
            continue

        fingerprint = _input_fingerprint(
            from_place,
            to_place,
            from_lat,
            from_lng,
            to_lat,
            to_lng,
            mode,
        )
        cache_key = _cache_key(
            from_place,
            to_place,
            from_lat,
            from_lng,
            to_lat,
            to_lng,
            mode,
        )

        # Existing segment cache row (by segment_order)
        existing_for_order = next(
            (s for s in existing_segments if int(s["segment_order"]) == i),
            None,
        )
        cache_row: dict[str, Any] | None = None
        if existing_for_order:
            cache_row = cache_rows_by_id.get(str(existing_for_order["segment_cache_id"]))

        # If we don't have a cached row, try fetch by cache_key (might exist from another route)
        if cache_row is None:
            cache_row = _fetch_cached_segment(supabase, cache_key)

        do_recompute = should_recompute_on_view(cache_row, force_refresh, fingerprint, mode)

        if do_recompute:
            cache_id, new_row = _compute_one_segment(
                supabase,
                google_client,
                from_place,
                from_lat,
                from_lng,
                to_place,
                to_lat,
                to_lng,
                mode,
            )
            cache_row = new_row
            segment_order_to_cache_id[i] = cache_id
        else:
            cache_id = cache_row.get("id") if cache_row else None
            if cache_id:
                segment_order_to_cache_id[i] = str(cache_id)

        if cache_row:
            status = cache_row.get("status") or ""
            status = STATUS_LEGACY_TO_NEW.get(status, status)
            if status != STATUS_SUCCESS:
                any_non_success = True
            total_distance += cache_row.get("distance_meters") or 0
            total_duration += cache_row.get("duration_seconds") or 0
            segments_out.append(_segment_response(i, from_loc_id, to_loc_id, cache_row))
        else:
            any_non_success = True
            segments_out.append(
                RouteSegmentResponse(
                    segment_order=i,
                    from_location_id=from_loc_id,
                    to_location_id=to_loc_id,
                    distance_meters=None,
                    duration_seconds=None,
                    encoded_polyline=None,
                    status=STATUS_INPUT_ERROR,
                    error_type="missing_cache",
                    error_message="No cache and compute failed",
                )
            )

    # Persist route_segments: delete all then batch-insert in a single round-trip
    supabase.table("route_segments").delete().eq("route_id", route_id).execute()
    if segment_order_to_cache_id:
        segment_rows = [
            {
                "route_id": route_id,
                "segment_order": seg_order,
                "from_location_id": str(ordered[seg_order]["location_id"]),
                "to_location_id": str(ordered[seg_order + 1]["location_id"]),
                "segment_cache_id": cache_id,
            }
            for seg_order, cache_id in segment_order_to_cache_id.items()
        ]
        supabase.table("route_segments").insert(segment_rows).execute()

    supabase.table("option_routes").update(
        {
            "duration_seconds": total_duration,
            "distance_meters": total_distance,
        }
    ).eq("route_id", route_id).execute()

    return RouteWithSegmentsResponse(
        route_id=route_id,
        option_id=option_id,
        label=route.get("label"),
        transport_mode=mode,
        duration_seconds=total_duration,
        distance_meters=total_distance,
        sort_order=int(route.get("sort_order", 0)),
        location_ids=location_ids,
        segments=segments_out,
        route_status="error" if any_non_success else "ok",
    )


def get_route_with_segments(supabase: Any, route_id: str) -> RouteWithSegmentsResponse | None:
    """Load option_route + route_stops + route_segments JOIN segment_cache (no recompute)."""
    route_row = (
        supabase.table("option_routes")
        .select(
            "route_id, option_id, label, transport_mode, duration_seconds, "
            "distance_meters, sort_order",
        )
        .eq("route_id", route_id)
        .execute()
    )
    if not route_row.data or len(route_row.data) == 0:
        return None
    route = route_row.data[0]
    stops = (
        supabase.table("route_stops")
        .select("location_id, stop_order")
        .eq("route_id", route_id)
        .order("stop_order")
        .execute()
    )
    ordered = sorted((stops.data or []), key=lambda r: r["stop_order"])
    location_ids = [str(s["location_id"]) for s in ordered]
    rs_rows = (
        supabase.table("route_segments")
        .select("segment_order, from_location_id, to_location_id, segment_cache_id")
        .eq("route_id", route_id)
        .order("segment_order")
        .execute()
    )
    seg_rows = sorted((rs_rows.data or []), key=lambda r: r["segment_order"])
    if not seg_rows:
        return RouteWithSegmentsResponse(
            route_id=str(route["route_id"]),
            option_id=str(route["option_id"]),
            label=route.get("label"),
            transport_mode=str(route.get("transport_mode", "walk")),
            duration_seconds=route.get("duration_seconds"),
            distance_meters=route.get("distance_meters"),
            sort_order=int(route.get("sort_order", 0)),
            location_ids=location_ids,
            segments=[],
            route_status="ok",
        )
    cache_ids = [str(s["segment_cache_id"]) for s in seg_rows]
    cache_list = (
        supabase.table("segment_cache")
        .select(
            "id, status, distance_meters, duration_seconds, encoded_polyline, "
            "error_type, error_message, provider_http_status, next_retry_at"
        )
        .in_("id", cache_ids)
        .execute()
    )
    cache_by_id = {str(r["id"]): r for r in (cache_list.data or [])}
    segments_out = []
    any_error = False
    for s in seg_rows:
        c = cache_by_id.get(str(s["segment_cache_id"])) or {}
        status = c.get("status") or "success"
        status = STATUS_LEGACY_TO_NEW.get(status, status)
        if status != STATUS_SUCCESS:
            any_error = True
        segments_out.append(
            _segment_response(
                int(s["segment_order"]),
                str(s["from_location_id"]),
                str(s["to_location_id"]),
                c,
            )
        )
    return RouteWithSegmentsResponse(
        route_id=str(route["route_id"]),
        option_id=str(route["option_id"]),
        label=route.get("label"),
        transport_mode=str(route.get("transport_mode", "walk")),
        duration_seconds=route.get("duration_seconds"),
        distance_meters=route.get("distance_meters"),
        sort_order=int(route.get("sort_order", 0)),
        location_ids=location_ids,
        segments=segments_out,
        route_status="error" if any_error else "ok",
    )
