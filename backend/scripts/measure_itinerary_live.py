#!/usr/bin/env python3
"""
Measure GET /api/v1/trips/{trip_id}/itinerary with real Supabase auth and trip.
Uses env: SUPABASE_URL, SUPABASE_ANON_KEY, API_URL, TEST_EMAIL, TEST_PASSWORD.
Or pass trip name to find: --trip "France Summer '26"
Credentials are read from env only (not stored in repo).
"""

import argparse
import os
import sys

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)
API_URL = (
    os.environ.get("API_URL") or os.environ.get("NEXT_PUBLIC_API_URL") or "http://localhost:8000"
)
TEST_EMAIL = os.environ.get("TEST_EMAIL")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD")


def load_env_local(path: str) -> None:
    """Load KEY=VALUE from path into os.environ if file exists."""
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip()
                if k and os.environ.get(k) is None:
                    os.environ[k] = v


def main():
    parser = argparse.ArgumentParser(description="Measure itinerary endpoint with live auth")
    parser.add_argument(
        "--trip",
        default=os.environ.get("TRIP_NAME"),
        help='Trip name to find (e.g. "France Summer \'26")',
    )
    parser.add_argument("--runs", type=int, default=3, help="Number of itinerary requests to run")
    args = parser.parse_args()

    # Load .env and frontend/.env.local so we can use NEXT_PUBLIC_* or SUPABASE_* from there
    load_env_local(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    load_env_local(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env.local"))

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    api = (
        os.environ.get("API_URL")
        or os.environ.get("NEXT_PUBLIC_API_URL")
        or "http://localhost:8000"
    )
    email = os.environ.get("TEST_EMAIL")
    password = os.environ.get("TEST_PASSWORD")
    trip_name = args.trip

    if not url or not anon:
        print(
            "Missing SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*). "
            "Set in env or frontend/.env.local.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not email or not password:
        print("Missing TEST_EMAIL and TEST_PASSWORD.", file=sys.stderr)
        sys.exit(1)
    if not trip_name:
        print("Missing --trip or TRIP_NAME.", file=sys.stderr)
        sys.exit(1)

    # 1) Sign in
    with httpx.Client(timeout=15.0) as client:
        r = client.post(
            f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={"apikey": anon, "Content-Type": "application/json"},
        )
        if r.status_code != 200:
            ct = r.headers.get("content-type", "")
            body = r.json() if ct.startswith("application/json") else r.text
            print(f"Login failed: {r.status_code}", body, file=sys.stderr)
            sys.exit(1)
        data = r.json()
        access_token = data.get("access_token")
        if not access_token:
            print("Login response missing access_token", file=sys.stderr)
            sys.exit(1)

        headers = {"Authorization": f"Bearer {access_token}"}

        # 2) List trips and find by name
        r2 = client.get(f"{api.rstrip('/')}/api/v1/trips", headers=headers)
        if r2.status_code != 200:
            print(f"Trips list failed: {r2.status_code}", file=sys.stderr)
            sys.exit(1)
        trips = r2.json()
        trip = next((t for t in trips if t.get("name") == trip_name), None)
        if not trip:
            names = [t.get("name") for t in trips]
            print(f"Trip not found: {trip_name}. Available: {names}", file=sys.stderr)
            sys.exit(1)
        trip_id = trip.get("id") or trip.get("trip_id")
        if not trip_id:
            print("Trip object missing trip_id/id", file=sys.stderr)
            sys.exit(1)
        print(f"Trip: {trip_name} (id={trip_id})\n")

        # 3) Measure itinerary
        itinerary_url = f"{api.rstrip('/')}/api/v1/trips/{trip_id}/itinerary"
        runs = []
        for i in range(args.runs):
            r3 = client.get(itinerary_url, headers=headers)
            if r3.status_code != 200:
                print(f"  Run {i + 1}: HTTP {r3.status_code}", file=sys.stderr)
                continue
            ownership_ms = r3.headers.get("X-Itinerary-Ownership-Ms", "")
            rpc_ms = r3.headers.get("X-Itinerary-Rpc-Ms", "")
            build_ms = r3.headers.get("X-Itinerary-Build-Ms", "")
            rows = r3.headers.get("X-Itinerary-Rows", "")
            body = r3.json()
            days = len(body.get("days", []))
            runs.append((ownership_ms, rpc_ms, build_ms, rows, days))
            print(
                f"  Run {i + 1}: ownership_ms={ownership_ms}  rpc_ms={rpc_ms}  "
                f"build_ms={build_ms}  rows={rows}  days={days}"
            )

    if not runs:
        print("No successful runs.", file=sys.stderr)
        sys.exit(1)
    print()

    # Averages (if numeric)
    def to_float(s):
        try:
            return float(s)
        except (TypeError, ValueError):
            return None

    o_vals = [to_float(r[0]) for r in runs if to_float(r[0]) is not None]
    r_vals = [to_float(r[1]) for r in runs if to_float(r[1]) is not None]
    b_vals = [to_float(r[2]) for r in runs if to_float(r[2]) is not None]
    if o_vals and r_vals and b_vals:
        avg_o = sum(o_vals) / len(o_vals)
        avg_r = sum(r_vals) / len(r_vals)
        avg_b = sum(b_vals) / len(b_vals)
        print(f"  Average: ownership_ms={avg_o:.1f}  rpc_ms={avg_r:.1f}  build_ms={avg_b:.1f}")
        print(f"  Total (ownership + rpc + build): ~{(avg_o + avg_r + avg_b):.0f} ms")


if __name__ == "__main__":
    main()
