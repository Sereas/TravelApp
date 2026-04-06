#!/usr/bin/env python3
"""Verify route calculation for a given route_id. Run from repo root with .env set.

.venv/bin/python backend/scripts/verify_route.py 15d46353-ff6e-4ff0-bf74-a1a77c2ed7d6
.venv/bin/python backend/scripts/verify_route.py 15d46353-ff6e-4ff0-bf74-a1a77c2ed7d6 --force
"""

import json
import sys

# Run from repo root so backend is on path
sys.path.insert(0, ".")

from backend.app.db.supabase import get_supabase_client
from backend.app.services.route_calculation import (
    get_route_with_fresh_segments,
    get_route_with_segments,
)

ROUTE_ID = "15d46353-ff6e-4ff0-bf74-a1a77c2ed7d6"


def main():
    route_id = sys.argv[1] if len(sys.argv) > 1 else ROUTE_ID
    force = "--force" in sys.argv or "-f" in sys.argv
    supabase = get_supabase_client()

    # 1) Check route exists and get context
    r = (
        supabase.table("option_routes")
        .select("route_id, option_id, transport_mode")
        .eq("route_id", route_id)
        .execute()
    )
    if not r.data or len(r.data) == 0:
        print(f"ERROR: Route {route_id} not found in option_routes")
        sys.exit(1)
    print("Route found:", r.data[0])

    stops = (
        supabase.table("route_stops")
        .select("option_location_id, stop_order")
        .eq("route_id", route_id)
        .order("stop_order")
        .execute()
    )
    n_stops = len(stops.data or [])
    print(f"Stops: {n_stops}")
    if n_stops < 2:
        print("ERROR: Need at least 2 stops to compute segments")
        sys.exit(1)

    # 2) Get route with segments (stored only, no recompute)
    with_segments = get_route_with_segments(supabase, route_id)
    if with_segments is None:
        print("ERROR: get_route_with_segments returned None")
        sys.exit(1)
    print("\n--- GET route with segments (cached only) ---")
    print(json.dumps(with_segments.model_dump(), indent=2, default=str))
    _print_retry_metadata(with_segments)

    # 3) get_route_with_fresh_segments (retry-on-view; force_refresh if --force)
    mode = (r.data[0].get("transport_mode")) or "walk"
    print(f"\n--- get_route_with_fresh_segments (transport_mode={mode}, force_refresh={force}) ---")
    try:
        fresh = get_route_with_fresh_segments(
            supabase, route_id, transport_mode=mode, force_refresh=force
        )
        print(json.dumps(fresh.model_dump(), indent=2, default=str))
        _print_retry_metadata(fresh)
        print("\nOK: get_route_with_fresh_segments succeeded")
        if fresh.route_status != "ok":
            print(f"WARNING: route_status = {fresh.route_status} (some segments not success)")
    except Exception as e:
        print(f"ERROR: get_route_with_fresh_segments failed: {e}")
        sys.exit(1)

    print("\nDone.")


def _print_retry_metadata(response):
    """Print retry eligibility metadata for any segment that is not success."""
    for seg in response.segments:
        if seg.status == "success":
            continue
        print("\n  Segment retry metadata:")
        print(f"    segment_order: {seg.segment_order}")
        print(f"    status: {seg.status}")
        print(f"    error_type: {seg.error_type}")
        print(f"    error_message: {seg.error_message}")
        print(f"    provider_http_status: {seg.provider_http_status}")
        print(f"    next_retry_at: {seg.next_retry_at}")


if __name__ == "__main__":
    main()
