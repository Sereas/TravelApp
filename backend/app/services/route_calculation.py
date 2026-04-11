"""Route calculation: retry-on-view only, no automated retries.

Entry point: get_route_with_fresh_segments() — used when user views route or explicitly refreshes.
Cache is reused when eligible; only missing/stale/retry-eligible segments are recomputed.

Phase 4: Google leg calls are dispatched concurrently via asyncio.gather +
asyncio.to_thread.  Cache writes go through the batch_upsert_segment_cache RPC
(single call) and route_segments are persisted via persist_route_segments RPC
(single atomic call).  Supabase client calls remain synchronous.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from typing import Any

import structlog

from backend.app.clients.google_routes import GoogleRoutesClient
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

# -------- Concurrency cap for Google Routes API calls --------
# Per-request semaphore; avoids rate-limit spikes on long routes.
GOOGLE_ROUTES_MAX_CONCURRENT_LEGS = 4


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


# ---------------------------------------------------------------------------
# Phase 4: segment computation helpers — async, concurrent Google calls
# ---------------------------------------------------------------------------


def _build_segment_cache_row(
    origin_place_id: str | None,
    dest_place_id: str | None,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    transport_mode: str,
    now: datetime,
    cache_key_val: str,
    fingerprint: str,
    existing_retry_count: int = 0,
    *,
    leg=None,
    error_exc: Exception | None = None,
) -> dict[str, Any]:
    """Build a segment_cache row dict for batch upsert."""
    base = {
        "origin_place_id": origin_place_id,
        "destination_place_id": dest_place_id,
        "origin_lat": origin_lat,
        "origin_lng": origin_lng,
        "destination_lat": dest_lat,
        "destination_lng": dest_lng,
        "transport_mode": transport_mode,
        "cache_key": cache_key_val,
        "input_fingerprint": fingerprint,
        "last_attempt_at": now.isoformat(),
        "provider": "google",
    }

    if error_exc is not None:
        http_status = getattr(getattr(error_exc, "response", None), "status_code", None)
        raw_msg = str(error_exc)
        msg = "Route calculation failed for this segment"
        status, error_type, cooldown_minutes = classify_provider_error(
            http_status, raw_msg, transport_mode
        )
        next_retry = _add_minutes(now, cooldown_minutes) if cooldown_minutes else None
        return {
            **base,
            "status": status,
            "error_type": error_type,
            "error_code": None,
            "error_message": msg,
            "provider_http_status": http_status,
            "next_retry_at": next_retry.isoformat() if next_retry else None,
            "cache_expires_at": None,
            "retry_count": existing_retry_count + 1,
        }

    if leg is None:
        raise ValueError("Either leg or error_exc must be provided")

    cache_expires_at = None
    if transport_mode == "transit":
        cache_expires_at = _add_minutes(now, TRANSIT_SUCCESS_TTL_MINUTES).isoformat()

    return {
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


async def _compute_one_segment_async(
    google_client: GoogleRoutesClient,
    origin_place_id: str | None,
    origin_lat: float,
    origin_lng: float,
    dest_place_id: str | None,
    dest_lat: float,
    dest_lng: float,
    transport_mode: str,
    existing_retry_count: int,
    semaphore: asyncio.Semaphore,
) -> tuple[str, dict[str, Any]]:
    """
    Call Google for one leg via asyncio.to_thread (respects semaphore cap).
    Returns (cache_key, row_dict).  Never raises — errors are encoded in the row.
    """
    cache_key_val = _cache_key(
        origin_place_id, dest_place_id,
        origin_lat, origin_lng,
        dest_lat, dest_lng,
        transport_mode,
    )
    fingerprint = _input_fingerprint(
        origin_place_id, dest_place_id,
        origin_lat, origin_lng,
        dest_lat, dest_lng,
        transport_mode,
    )
    now = _now_utc()

    async with semaphore:
        try:
            leg = await asyncio.to_thread(
                google_client.compute_leg,
                origin_lat, origin_lng,
                dest_lat, dest_lng,
                transport_mode,
            )
            row = _build_segment_cache_row(
                origin_place_id, dest_place_id,
                origin_lat, origin_lng,
                dest_lat, dest_lng,
                transport_mode, now,
                cache_key_val, fingerprint,
                existing_retry_count=0,
                leg=leg,
            )
        except Exception as exc:
            logger.warning(
                "route_segment_calculation_error",
                error=str(exc),
                cache_key=cache_key_val,
                error_category="external_api",
            )
            row = _build_segment_cache_row(
                origin_place_id, dest_place_id,
                origin_lat, origin_lng,
                dest_lat, dest_lng,
                transport_mode, now,
                cache_key_val, fingerprint,
                existing_retry_count=existing_retry_count,
                error_exc=exc,
            )
            logger.warning(
                "google_routes_leg_failed",
                key=cache_key_val,
                status=row["status"],
                error_type=row.get("error_type"),
                http_status=row.get("provider_http_status"),
                error_category="external_api",
            )

    return cache_key_val, row


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


async def get_route_with_fresh_segments(
    supabase: Any,
    route_id: str,
    transport_mode: str | None = None,
    force_refresh: bool = False,
    google_routes_client: GoogleRoutesClient | None = None,
) -> RouteWithSegmentsResponse:
    """
    Load route and segments; for each segment decide reuse vs recompute (retry-on-view).
    Recompute when: force_refresh, or missing cache, or fingerprint changed, or
    status allows retry and cooldown expired.

    Phase 4: Google calls run concurrently (asyncio.gather).
    Cache writes are batched into a single RPC (batch_upsert_segment_cache).
    Segment rows + route totals are persisted atomically (persist_route_segments).
    """
    start = time.perf_counter()
    route_row = (
        supabase.table("option_routes")
        .select(
            "route_id, option_id, label, transport_mode, sort_order, "
            "duration_seconds, distance_meters"
        )
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
        .select("option_location_id, stop_order")
        .eq("route_id", route_id)
        .order("stop_order")
        .execute()
    )
    ordered = sorted((stops.data or []), key=lambda r: r["stop_order"])
    ol_ids = [str(s["option_location_id"]) for s in ordered]
    if len(ordered) < 2:
        # Zero or one stop: no segments to compute; persist zero totals
        supabase.rpc(
            "persist_route_segments",
            {
                "p_route_id": route_id,
                "p_segment_rows": [],
                "p_total_duration": 0,
                "p_total_distance": 0,
            },
        ).execute()
        return RouteWithSegmentsResponse(
            route_id=route_id,
            option_id=option_id,
            label=route.get("label"),
            transport_mode=mode,
            duration_seconds=0,
            distance_meters=0,
            sort_order=int(route.get("sort_order", 0)),
            option_location_ids=ol_ids,
            segments=[],
            route_status="ok",
        )

    # Resolve option_location_id → location_id via option_locations
    ol_rows = (
        supabase.table("option_locations").select("id, location_id").in_("id", ol_ids).execute()
    )
    ol_to_loc = {str(r["id"]): str(r["location_id"]) for r in (ol_rows.data or [])}
    location_ids = [ol_to_loc.get(str(s["option_location_id"])) for s in ordered]
    if any(lid is None for lid in location_ids):
        raise LookupError("Route references deleted option_location; recalculation not possible")
    loc_rows = (
        supabase.table("locations")
        .select("location_id, google_place_id, latitude, longitude")
        .in_("location_id", list(set(location_ids)))
        .execute()
    )
    loc_by_id = {str(r["location_id"]): r for r in (loc_rows.data or [])}

    result = await _get_route_segments_impl(
        supabase,
        route_id,
        route,
        option_id,
        mode,
        ordered,
        ol_ids,
        location_ids,
        loc_by_id,
        google_routes_client,
        force_refresh,
    )
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    successful = sum(1 for s in result.segments if s.status == "success")
    logger.info(
        "route_segments_computed",
        route_id=route_id,
        transport_mode=mode,
        segments=len(result.segments),
        successful_segments=successful,
        force_refresh=force_refresh,
        route_status=result.route_status,
        duration_ms=duration_ms,
    )
    return result


async def _get_route_segments_impl(
    supabase: Any,
    route_id: str,
    route: dict,
    option_id: str,
    mode: str,
    ordered: list,
    ol_ids: list[str],
    location_ids: list[str],
    loc_by_id: dict,
    google_client: GoogleRoutesClient | None,
    force_refresh: bool,
) -> RouteWithSegmentsResponse:
    """
    Inner async implementation for route segment computation.

    Phase 4 changes vs prior sync implementation:
    - Google calls dispatched concurrently via asyncio.gather + asyncio.to_thread.
    - Cache writes batched into one batch_upsert_segment_cache RPC call.
    - Segment rows + totals persisted atomically via persist_route_segments RPC.
    """
    # Load existing route_segments and their cache rows (used for cache-hit checks)
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

    # ---------------------------------------------------------------------------
    # Step 1: classify each segment — cache hit or needs Google call
    # ---------------------------------------------------------------------------

    # Per-segment inputs keyed by segment index
    seg_inputs: list[dict] = []          # params for each segment (all N-1 segments)
    cache_hit_rows: dict[int, dict] = {}  # seg_index → existing cache row (no Google needed)
    needs_google: list[int] = []          # seg indices that need a Google call
    # Cache every row fetched in Step 1 (hit OR miss triggering recompute) so
    # Step 2 can read retry_count without issuing per-segment SELECTs. Avoids
    # the N+1 round-trips against `segment_cache` previously caused by a second
    # _fetch_cached_segment call inside the Google-dispatch loop.
    fetched_cache_rows: dict[int, dict | None] = {}

    for i in range(len(ordered) - 1):
        from_loc_id = location_ids[i]
        to_loc_id = location_ids[i + 1]
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

        missing_coords = (
            from_lat_raw is None or from_lng_raw is None
            or to_lat_raw is None or to_lng_raw is None
        )

        seg_inputs.append(
            {
                "from_loc_id": from_loc_id,
                "to_loc_id": to_loc_id,
                "from_place": from_place,
                "to_place": to_place,
                "from_lat": from_lat,
                "from_lng": from_lng,
                "to_lat": to_lat,
                "to_lng": to_lng,
                "missing_coords": missing_coords,
            }
        )

        if missing_coords:
            continue  # will generate INPUT_ERROR row below without Google

        fingerprint = _input_fingerprint(
            from_place, to_place, from_lat, from_lng, to_lat, to_lng, mode
        )
        cache_key_val = _cache_key(
            from_place, to_place, from_lat, from_lng, to_lat, to_lng, mode
        )

        # Check cache by segment order from existing route_segments
        existing_for_order = next(
            (s for s in existing_segments if int(s["segment_order"]) == i), None
        )
        cache_row: dict[str, Any] | None = None
        if existing_for_order:
            cache_row = cache_rows_by_id.get(str(existing_for_order["segment_cache_id"]))

        # If not found by segment order, try by cache_key (shared across routes)
        if cache_row is None:
            cache_row = _fetch_cached_segment(supabase, cache_key_val)

        # Capture the row (hit or miss) so Step 2 can read retry_count without
        # re-selecting from segment_cache.
        fetched_cache_rows[i] = cache_row

        do_recompute = should_recompute_on_view(cache_row, force_refresh, fingerprint, mode)

        if do_recompute:
            needs_google.append(i)
        else:
            cache_hit_rows[i] = cache_row  # type: ignore[assignment]

    # ---------------------------------------------------------------------------
    # Step 2: dispatch Google calls concurrently for segments that need it
    # ---------------------------------------------------------------------------

    google_results: dict[int, tuple[str, dict]] = {}  # seg_index → (cache_key, row)

    if needs_google and google_client is not None:
        semaphore = asyncio.Semaphore(GOOGLE_ROUTES_MAX_CONCURRENT_LEGS)
        tasks = []
        for i in needs_google:
            s = seg_inputs[i]
            # Reuse the cache row already fetched in Step 1 (if any) instead of
            # issuing another SELECT. For cache-miss segments this is None,
            # which correctly maps to retry_count = 0.
            existing_cache_row = fetched_cache_rows.get(i)
            existing_retry = (
                (existing_cache_row.get("retry_count") or 0) if existing_cache_row else 0
            )
            tasks.append(
                _compute_one_segment_async(
                    google_client,
                    s["from_place"], s["from_lat"], s["from_lng"],
                    s["to_place"], s["to_lat"], s["to_lng"],
                    mode,
                    existing_retry,
                    semaphore,
                )
            )
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        for idx, seg_i in enumerate(needs_google):
            r = raw_results[idx]
            if isinstance(r, Exception):
                # Unexpected — _compute_one_segment_async should never raise
                logger.error(
                    "unexpected_segment_compute_error",
                    seg_index=seg_i,
                    error=str(r),
                    error_category="internal",
                )
                # Build an error row inline
                s = seg_inputs[seg_i]
                now = _now_utc()
                ck = _cache_key(
                    s["from_place"], s["to_place"],
                    s["from_lat"], s["from_lng"],
                    s["to_lat"], s["to_lng"],
                    mode,
                )
                fp = _input_fingerprint(
                    s["from_place"], s["to_place"],
                    s["from_lat"], s["from_lng"],
                    s["to_lat"], s["to_lng"],
                    mode,
                )
                err_row = _build_segment_cache_row(
                    s["from_place"], s["to_place"],
                    s["from_lat"], s["from_lng"],
                    s["to_lat"], s["to_lng"],
                    mode, now, ck, fp,
                    existing_retry_count=0,
                    error_exc=r,
                )
                google_results[seg_i] = (ck, err_row)
            else:
                google_results[seg_i] = r

    elif needs_google and google_client is None:
        # Google not configured — build config_error rows for all pending segments
        now = _now_utc()
        for i in needs_google:
            s = seg_inputs[i]
            ck = _cache_key(
                s["from_place"], s["to_place"],
                s["from_lat"], s["from_lng"],
                s["to_lat"], s["to_lng"],
                mode,
            )
            fp = _input_fingerprint(
                s["from_place"], s["to_place"],
                s["from_lat"], s["from_lng"],
                s["to_lat"], s["to_lng"],
                mode,
            )
            row = {
                "origin_place_id": s["from_place"],
                "destination_place_id": s["to_place"],
                "origin_lat": s["from_lat"],
                "origin_lng": s["from_lng"],
                "destination_lat": s["to_lat"],
                "destination_lng": s["to_lng"],
                "transport_mode": mode,
                "cache_key": ck,
                "input_fingerprint": fp,
                "last_attempt_at": now.isoformat(),
                "provider": "google",
                "status": STATUS_CONFIG_ERROR,
                "error_type": "not_configured",
                "error_message": "Google Routes API not configured",
                "provider_http_status": None,
                "next_retry_at": _add_minutes(now, COOLDOWN_CONFIG_MINUTES).isoformat(),
                "cache_expires_at": None,
                "retry_count": 0,
            }
            google_results[i] = (ck, row)

    # ---------------------------------------------------------------------------
    # Step 3: batch upsert all computed rows into segment_cache (single RPC)
    # ---------------------------------------------------------------------------

    computed_rows_by_cache_key: dict[str, dict] = {}
    if google_results:
        rows_to_upsert = [row for (_ck, row) in google_results.values()]
        upserted = supabase.rpc(
            "batch_upsert_segment_cache", {"p_rows": rows_to_upsert}
        ).execute()
        # Index returned rows by cache_key so we can look up IDs
        for returned_row in (upserted.data or []):
            ck = returned_row.get("cache_key") or ""
            computed_rows_by_cache_key[ck] = returned_row
        # Fall back to our built rows for any that didn't return (shouldn't happen)
        for seg_i in google_results:
            ck, built_row = google_results[seg_i]
            if ck not in computed_rows_by_cache_key:
                computed_rows_by_cache_key[ck] = built_row

    # ---------------------------------------------------------------------------
    # Step 4: assemble final segment list + route_segments rows for persistence
    # ---------------------------------------------------------------------------

    segments_out: list[RouteSegmentResponse] = []
    total_distance = 0
    total_duration = 0
    any_non_success = False
    persist_segment_rows: list[dict] = []

    for i in range(len(ordered) - 1):
        s = seg_inputs[i]
        from_loc_id = s["from_loc_id"]
        to_loc_id = s["to_loc_id"]

        if s["missing_coords"]:
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

        # Determine the final cache row for this segment
        if i in google_results:
            ck, _ = google_results[i]
            cache_row = computed_rows_by_cache_key.get(ck)
        else:
            cache_row = cache_hit_rows.get(i)

        if cache_row is None:
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
            continue

        status = cache_row.get("status") or ""
        status = STATUS_LEGACY_TO_NEW.get(status, status)
        if status != STATUS_SUCCESS:
            any_non_success = True
        total_distance += cache_row.get("distance_meters") or 0
        total_duration += cache_row.get("duration_seconds") or 0
        segments_out.append(_segment_response(i, from_loc_id, to_loc_id, cache_row))

        cache_id = cache_row.get("id")
        if cache_id:
            persist_segment_rows.append(
                {
                    "segment_order": i,
                    "from_location_id": from_loc_id,
                    "to_location_id": to_loc_id,
                    "segment_cache_id": str(cache_id),
                }
            )

    # ---------------------------------------------------------------------------
    # Step 5: persist route_segments + update option_routes totals atomically
    #
    # Skip the write when the DB already matches what we'd write: no new Google
    # computations happened AND every segment_cache_id is unchanged AND the
    # option_routes totals already match. This keeps full-cache-hit reads
    # read-only instead of churning DELETE+INSERT+UPDATE on every view.
    # ---------------------------------------------------------------------------

    def _persist_needed() -> bool:
        if google_results:
            return True  # new computation, always persist
        if len(existing_segments) != len(persist_segment_rows):
            return True  # structural change
        existing_by_order = {
            int(s["segment_order"]): s for s in existing_segments
        }
        for row in persist_segment_rows:
            existing_row = existing_by_order.get(int(row["segment_order"]))
            if existing_row is None:
                return True
            if str(existing_row.get("segment_cache_id")) != str(
                row["segment_cache_id"]
            ):
                return True
        if int(route.get("duration_seconds") or 0) != int(total_duration):
            return True
        return int(route.get("distance_meters") or 0) != int(total_distance)

    if _persist_needed():
        supabase.rpc(
            "persist_route_segments",
            {
                "p_route_id": route_id,
                "p_segment_rows": persist_segment_rows,
                "p_total_duration": total_duration,
                "p_total_distance": total_distance,
            },
        ).execute()

    return RouteWithSegmentsResponse(
        route_id=route_id,
        option_id=option_id,
        label=route.get("label"),
        transport_mode=mode,
        duration_seconds=total_duration,
        distance_meters=total_distance,
        sort_order=int(route.get("sort_order", 0)),
        option_location_ids=ol_ids,
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
        .select("option_location_id, stop_order")
        .eq("route_id", route_id)
        .order("stop_order")
        .execute()
    )
    ordered = sorted((stops.data or []), key=lambda r: r["stop_order"])
    ol_ids = [str(s["option_location_id"]) for s in ordered]
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
            option_location_ids=ol_ids,
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
        option_location_ids=ol_ids,
        segments=segments_out,
        route_status="error" if any_error else "ok",
    )
