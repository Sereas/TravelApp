#!/usr/bin/env python3
"""
Quick benchmark for GET /api/v1/trips/{trip_id}/itinerary.
Prints timing from response headers (X-Itinerary-*).
Usage:
  With mock: pytest backend/tests/test_itinerary_tree.py -v -k returns_nested -s | grep X-Itinerary
  Live: TRIP_ID=... SUPABASE_JWT_OR_ACCESS_TOKEN=... python backend/scripts/bench_itinerary.py
"""

import os
import sys

import httpx


def main():
    base_url = os.environ.get("API_URL", "http://localhost:8000")
    token = os.environ.get("SUPABASE_JWT_OR_ACCESS_TOKEN")
    trip_id = os.environ.get("TRIP_ID")
    if not trip_id:
        print(
            "Set TRIP_ID (and optionally API_URL, SUPABASE_JWT_OR_ACCESS_TOKEN).",
            file=sys.stderr,
        )
        print(
            "Example: TRIP_ID=uuid SUPABASE_JWT_OR_ACCESS_TOKEN=eyJ... "
            "python backend/scripts/bench_itinerary.py",
            file=sys.stderr,
        )
        sys.exit(1)
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = f"{base_url}/api/v1/trips/{trip_id}/itinerary"
    n = 5
    times = []
    for i in range(n):
        r = httpx.get(url, headers=headers, timeout=30.0)
        if r.status_code != 200:
            print(f"Request {i + 1}: {r.status_code}", file=sys.stderr)
            continue
        ownership_ms = r.headers.get("X-Itinerary-Ownership-Ms", "")
        rpc_ms = r.headers.get("X-Itinerary-Rpc-Ms", "")
        build_ms = r.headers.get("X-Itinerary-Build-Ms", "")
        rows = r.headers.get("X-Itinerary-Rows", "")
        times.append((ownership_ms, rpc_ms, build_ms, rows))
        print(
            f"  {i + 1}: ownership_ms={ownership_ms} rpc_ms={rpc_ms} "
            f"build_ms={build_ms} rows={rows}"
        )
    if times:
        print(f"\nRan {len(times)} requests. Check server logs for full breakdown.")


if __name__ == "__main__":
    main()
