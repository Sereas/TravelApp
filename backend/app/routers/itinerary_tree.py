"""Full itinerary tree endpoint: days → options → locations with LocationSummary."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends

from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_id
from backend.app.models.schemas import (
    ItineraryDay,
    ItineraryOption,
    ItineraryOptionLocation,
    ItineraryResponse,
    LocationSummary,
)
from backend.app.routers.trip_ownership import _ensure_trip_owned

logger: structlog.stdlib.BoundLogger = structlog.get_logger("itinerary_tree")

router = APIRouter(prefix="/trips", tags=["itinerary-tree"])

_LOCATION_SUMMARY_SELECT = (
    "location_id, name, city, address, google_link, category, note, working_hours, requires_booking"
)


@router.get(
    "/{trip_id}/itinerary",
    response_model=ItineraryResponse,
)
async def get_itinerary(
    trip_id: UUID,
    include_empty_options: bool = False,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
) -> ItineraryResponse:
    """
    Return full itinerary tree for a trip: days → options → locations with embedded LocationSummary.

    - Validates trip ownership (404 if not found / not owned).
    - Orders days by sort_order, options by option_index, locations by sort_order.
    """
    _ensure_trip_owned(supabase, trip_id, user_id)
    trip_id_str = str(trip_id)

    # Fetch days
    days_result = (
        supabase.table("trip_days")
        .select(
            "day_id, trip_id, date, sort_order, starting_city, ending_city, created_by, created_at"
        )
        .eq("trip_id", trip_id_str)
        .order("sort_order")
        .execute()
    )
    day_rows = days_result.data or []
    if not day_rows:
        logger.info("itinerary_empty", trip_id=trip_id_str)
        return ItineraryResponse(days=[])
    day_ids = [str(d["day_id"]) for d in day_rows]

    # Fetch options for these days
    options_result = (
        supabase.table("day_options")
        .select("option_id, day_id, option_index, created_at")
        .in_("day_id", day_ids)
        .execute()
    )
    option_rows = options_result.data or []
    option_ids = [str(o["option_id"]) for o in option_rows]

    # Fetch option-locations for these options
    if option_ids:
        ol_result = (
            supabase.table("option_locations")
            .select("option_id, location_id, sort_order, time_period")
            .in_("option_id", option_ids)
            .order("sort_order")
            .execute()
        )
        ol_rows = ol_result.data or []
    else:
        ol_rows = []

    # Fetch locations for these location_ids to build LocationSummary
    location_ids = {str(r["location_id"]) for r in ol_rows if r.get("location_id")}
    locations_by_id: dict[str, dict] = {}
    if location_ids:
        loc_result = (
            supabase.table("locations")
            .select(_LOCATION_SUMMARY_SELECT)
            .eq("trip_id", trip_id_str)
            .in_("location_id", list(location_ids))
            .execute()
        )
        for loc in loc_result.data or []:
            lid = str(loc["location_id"])
            locations_by_id[lid] = loc

    # Build maps for options and locations for quick assembly
    options_by_day: dict[str, list[ItineraryOption]] = {did: [] for did in day_ids}
    for row in sorted(
        option_rows,
        key=lambda r: (str(r.get("day_id")), int(r.get("option_index", 1))),
    ):
        did = str(row["day_id"])
        opt = ItineraryOption(
            id=str(row["option_id"]),
            option_index=int(row.get("option_index", 1)),
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
        if loc_row is None:
            # If location missing, skip embedding but keep basic node.
            summary = LocationSummary(id=loc_id, name="")
        else:
            summary = LocationSummary(
                id=loc_id,
                name=loc_row.get("name", ""),
                city=loc_row.get("city"),
                address=loc_row.get("address"),
                google_link=loc_row.get("google_link"),
                category=loc_row.get("category"),
                note=loc_row.get("note"),
                working_hours=loc_row.get("working_hours"),
                requires_booking=loc_row.get("requires_booking"),
            )
        node = ItineraryOptionLocation(
            location_id=loc_id,
            sort_order=int(row.get("sort_order", 0)),
            time_period=str(row.get("time_period", "")),
            location=summary,
        )
        locations_by_option.setdefault(opt_id, []).append(node)

    # Build days with nested options
    days: list[ItineraryDay] = []
    for d in day_rows:
        did = str(d["day_id"])
        # Attach locations; drop empty options if include_empty_options is False.
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
        days.append(
            ItineraryDay(
                id=did,
                date=d.get("date"),
                sort_order=int(d.get("sort_order", 0)),
                starting_city=d.get("starting_city"),
                ending_city=d.get("ending_city"),
                created_by=d.get("created_by"),
                created_at=d.get("created_at"),
                options=opts_with_locations,
            )
        )

    logger.info("itinerary_built", trip_id=trip_id_str, days=len(days))
    return ItineraryResponse(days=days)
