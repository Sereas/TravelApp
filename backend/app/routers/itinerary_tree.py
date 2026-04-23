"""Full itinerary tree endpoint: days → options → locations with LocationSummary."""

import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Response

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    ItineraryDay,
    ItineraryOption,
    ItineraryOptionLocation,
    ItineraryResponse,
    ItineraryRoute,
    RouteSegmentSummary,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain
from backend.app.services.location_projection import build_location_summary

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_tree")

router = APIRouter(prefix="/trips", tags=["itinerary-tree"])


def _build_itinerary_response(
    day_rows: list[dict],
    option_rows: list[dict],
    ol_rows: list[dict],
    locations_by_id: dict[str, dict],
    include_empty_options: bool,
) -> ItineraryResponse:
    """Build ItineraryResponse from flat day/option/option_location/location data."""
    day_ids = [str(d["day_id"]) for d in day_rows]
    options_by_day: dict[str, list[ItineraryOption]] = {did: [] for did in day_ids}
    for row in sorted(
        option_rows,
        key=lambda r: (str(r.get("day_id")), int(r.get("option_index", 1))),
    ):
        did = str(row["day_id"])
        opt = ItineraryOption(
            id=str(row["option_id"]),
            option_index=int(row.get("option_index", 1)),
            starting_city=row.get("starting_city"),
            ending_city=row.get("ending_city"),
            created_by=row.get("created_by"),
            created_at=row.get("created_at"),
            locations=[],
        )
        options_by_day.setdefault(did, []).append(opt)

    locations_by_option: dict[str, list[ItineraryOptionLocation]] = {
        str(o["option_id"]): [] for o in option_rows
    }
    for row in ol_rows:
        opt_id = str(row["option_id"])
        loc_id = str(row["location_id"])
        loc_row = locations_by_id.get(loc_id)
        summary = build_location_summary(loc_row, loc_id)
        node = ItineraryOptionLocation(
            id=str(row["id"]) if row.get("id") else loc_id,
            location_id=loc_id,
            sort_order=int(row.get("sort_order", 0)),
            time_period=str(row.get("time_period", "")),
            location=summary,
        )
        locations_by_option.setdefault(opt_id, []).append(node)

    days: list[ItineraryDay] = []
    for d in day_rows:
        did = str(d["day_id"])
        opts_with_locations: list[ItineraryOption] = []
        for opt in options_by_day.get(did, []):
            locs = sorted(
                locations_by_option.get(opt.id, []),
                key=lambda loc: loc.sort_order,
            )
            if not locs and not include_empty_options:
                continue
            opt.locations = locs
            opts_with_locations.append(opt)
        active_option_id = d.get("active_option_id")
        days.append(
            ItineraryDay(
                id=did,
                date=d.get("date"),
                sort_order=int(d.get("sort_order", 0)),
                created_at=d.get("created_at"),
                active_option_id=(str(active_option_id) if active_option_id else None),
                options=opts_with_locations,
            )
        )
    return ItineraryResponse(days=days)


def _rpc_rows_to_tree_data(
    rows: list[dict],
) -> tuple[list[dict], list[dict], list[dict], dict[str, dict]]:
    """Convert get_itinerary_tree RPC flat rows into day/option/ol/locations_by_id."""
    day_rows: list[dict] = []
    option_rows: list[dict] = []
    ol_rows: list[dict] = []
    locations_by_id: dict[str, dict] = {}
    seen_days: set[str] = set()
    seen_options: set[str] = set()

    for r in rows:
        did = str(r["day_id"])
        if did not in seen_days:
            seen_days.add(did)
            day_rows.append(
                {
                    "day_id": r["day_id"],
                    "date": r.get("day_date"),
                    "sort_order": r.get("day_sort_order", 0),
                    "created_at": r.get("day_created_at"),
                    "active_option_id": r.get("day_active_option_id"),
                }
            )
        oid = r.get("option_id")
        if oid is not None:
            oid_str = str(oid)
            if oid_str not in seen_options:
                seen_options.add(oid_str)
                option_rows.append(
                    {
                        "option_id": oid,
                        "day_id": r["day_id"],
                        "option_index": r.get("option_index", 1),
                        "starting_city": r.get("option_starting_city"),
                        "ending_city": r.get("option_ending_city"),
                        "created_by": r.get("option_created_by"),
                        "created_at": r.get("option_created_at"),
                    }
                )
        lid = r.get("location_id")
        if lid is not None:
            ol_rows.append(
                {
                    "id": r.get("ol_id"),
                    "option_id": r["option_id"],
                    "location_id": lid,
                    "sort_order": r.get("ol_sort_order", 0),
                    "time_period": r.get("time_period") or "",
                }
            )
            lid_str = str(lid)
            if lid_str not in locations_by_id:
                locations_by_id[lid_str] = {
                    "location_id": lid,
                    "name": r.get("loc_name") or "",
                    "city": r.get("loc_city"),
                    "address": r.get("loc_address"),
                    "google_link": r.get("loc_google_link"),
                    "category": r.get("loc_category"),
                    "note": r.get("loc_note"),
                    "working_hours": r.get("loc_working_hours"),
                    "useful_link": r.get("loc_useful_link"),
                    "requires_booking": r.get("loc_requires_booking"),
                    "image_url": r.get("loc_photo_url"),
                    "user_image_url": r.get("loc_user_image_url"),
                    "user_image_crop": r.get("loc_user_image_crop"),
                    "attribution_name": r.get("loc_attribution_name"),
                    "attribution_uri": r.get("loc_attribution_uri"),
                    "latitude": r.get("loc_latitude"),
                    "longitude": r.get("loc_longitude"),
                }

    # Preserve day order (sort_order) and option order (option_index)
    day_rows.sort(key=lambda d: (d.get("sort_order", 0), str(d["day_id"])))
    option_rows.sort(key=lambda o: (str(o["day_id"]), o.get("option_index", 1)))
    ol_rows.sort(key=lambda ol: (str(ol["option_id"]), ol.get("sort_order", 0)))
    return day_rows, option_rows, ol_rows, locations_by_id


def _attach_routes_to_itinerary(supabase, itinerary: ItineraryResponse) -> None:
    """Fetch routes via RPC and attach them to each option in the itinerary tree."""
    all_option_ids = [opt.id for d in itinerary.days for opt in d.options]
    if all_option_ids:
        routes_rpc = supabase.rpc(
            "get_itinerary_routes", {"p_option_ids": all_option_ids}
        ).execute()
        routes_by_option: dict[str, list[ItineraryRoute]] = {}
        for r in routes_rpc.data or []:
            oid = str(r["option_id"])
            rid = str(r["route_id"])
            dur = r.get("duration_seconds")
            dist = r.get("distance_meters")
            route_status = "pending" if (dur is None and dist is None) else "ok"
            segments = [
                RouteSegmentSummary(
                    segment_order=int(s["segment_order"]),
                    duration_seconds=s.get("duration_seconds"),
                    distance_meters=s.get("distance_meters"),
                    encoded_polyline=s.get("encoded_polyline"),
                )
                for s in (r.get("segments") or [])
            ]
            route = ItineraryRoute(
                route_id=rid,
                label=r.get("label"),
                transport_mode=r.get("transport_mode", "walk"),
                duration_seconds=dur,
                distance_meters=dist,
                sort_order=int(r.get("sort_order", 0)),
                option_location_ids=[str(lid) for lid in (r.get("stop_option_location_ids") or [])],
                route_status=route_status,
                segments=segments,
            )
            routes_by_option.setdefault(oid, []).append(route)
        for d in itinerary.days:
            for opt in d.options:
                opt.routes = routes_by_option.get(opt.id, [])


@router.get(
    "/{trip_id}/itinerary",
    response_model=ItineraryResponse,
)
async def get_itinerary(
    response: Response,
    trip_id: UUID,
    include_empty_options: bool = False,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
) -> ItineraryResponse:
    """
    Return full itinerary tree for a trip: days → options → locations with embedded LocationSummary.

    - Validates trip ownership (404 if not found / not owned).
    - Loads tree in one RPC call (get_itinerary_tree) after ownership check.
    - Orders days by sort_order, options by option_index, locations by sort_order.
    """
    trip_id_str = str(trip_id)
    user_id_str = str(user_id)

    # Ownership check is baked into the RPC via p_user_id (EXISTS subquery).
    # 0 rows → trip missing, wrong owner, or genuinely empty; lazy 404 below.
    t1 = time.perf_counter()
    rpc_result = supabase.rpc(
        "get_itinerary_tree", {"p_trip_id": trip_id_str, "p_user_id": user_id_str}
    ).execute()
    rows = rpc_result.data or []
    rpc_ms = round((time.perf_counter() - t1) * 1000, 1)

    if not rows:
        # Lazy 404: only hit the DB a second time when the result is empty.
        # Common case (trip has days) saves one full round-trip.
        _ensure_resource_chain(supabase, trip_id, user_id)
        response.headers["X-Itinerary-Rpc-Ms"] = str(rpc_ms)
        logger.info("itinerary_empty", trip_id=trip_id_str, rpc_ms=rpc_ms)
        return ItineraryResponse(days=[])

    t2 = time.perf_counter()
    day_rows, option_rows, ol_rows, locations_by_id = _rpc_rows_to_tree_data(rows)
    if not day_rows:
        return ItineraryResponse(days=[])
    itinerary_response = _build_itinerary_response(
        day_rows, option_rows, ol_rows, locations_by_id, include_empty_options
    )
    # Attach routes via single RPC (replaces 4 sequential queries)
    _attach_routes_to_itinerary(supabase, itinerary_response)
    build_ms = round((time.perf_counter() - t2) * 1000, 1)

    response.headers["X-Itinerary-Rpc-Ms"] = str(rpc_ms)
    response.headers["X-Itinerary-Build-Ms"] = str(build_ms)
    response.headers["X-Itinerary-Rows"] = str(len(rows))
    logger.info(
        "itinerary_built",
        trip_id=trip_id_str,
        days=len(itinerary_response.days),
        rpc_ms=rpc_ms,
        build_ms=build_ms,
        rows=len(rows),
    )
    return itinerary_response
