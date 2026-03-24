#!/usr/bin/env python3
"""Shared performance tooling for backend and UI perf tests."""

from __future__ import annotations

import json
import os
import socket
import time
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import jwt
import requests
from dotenv import load_dotenv
from supabase import create_client


API_PREFIX = "/api/v1"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ARTIFACTS_ROOT = REPO_ROOT / "tests" / "perf" / "artifacts"
HUMAN_REPORTS_DIR = ARTIFACTS_ROOT / "human"
MACHINE_REPORTS_DIR = ARTIFACTS_ROOT / "machine"
PLAYWRIGHT_ARTIFACTS_DIR = MACHINE_REPORTS_DIR / "playwright"

BACKEND_BENCHMARKS = {
    "GET /trips/{id}": {"target_ms": 350, "max_ms": 500},
    "GET /trips/{id}/locations": {"target_ms": 700, "max_ms": 950},
    "GET /trips/{id}/itinerary": {"target_ms": 550, "max_ms": 750},
}

FRONTEND_BENCHMARKS = {
    "login_page": {"target_ms": 1200, "max_ms": 2000},
    "trips_page": {"target_ms": 1800, "max_ms": 3000},
    "trip_detail_page": {"target_ms": 2500, "max_ms": 4000},
}

TRIPS_SELECT = "trip_id, user_id, trip_name, start_date, end_date, created_at"
LOCATIONS_SELECT = (
    "location_id, trip_id, name, address, google_link, note, latitude, longitude, "
    "added_by_user_id, added_by_email, city, working_hours, requires_booking, "
    "category, google_place_id, google_source_type, google_raw, created_at, user_image_url"
)
DAYS_SELECT = "day_id, trip_id, date, sort_order, created_at"
OPTIONS_SELECT = (
    "option_id, day_id, option_index, starting_city, ending_city, created_by, created_at"
)
OPTION_LOCATIONS_SELECT = "option_id, location_id, sort_order, time_period"
ROUTES_SELECT = (
    "route_id, option_id, transport_mode, label, duration_seconds, distance_meters, "
    "sort_order"
)
ROUTE_STOPS_SELECT = "route_id, location_id, stop_order"
ROUTE_SEGMENTS_SELECT = "id, route_id, segment_order, from_location_id, to_location_id, segment_cache_id"


@dataclass
class EndpointRun:
    label: str
    path: str
    method: str = "GET"
    params: dict[str, Any] | None = None


def load_env() -> None:
    load_dotenv(REPO_ROOT / ".env", override=False)
    load_dotenv(REPO_ROOT / "tests" / "perf" / ".env.perf.local", override=False)
    load_dotenv(REPO_ROOT / "frontend/.env.local", override=False)
    HUMAN_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    MACHINE_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYWRIGHT_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def get_perf_source_user_id() -> str:
    user_id = os.getenv("PERF_SOURCE_USER_ID", "").strip()
    if not user_id:
        raise RuntimeError("Missing PERF_SOURCE_USER_ID in tests/perf/.env.perf.local")
    return user_id


def get_perf_ui_email() -> str:
    email = os.getenv("PERF_UI_EMAIL", "").strip()
    if not email:
        raise RuntimeError("Missing PERF_UI_EMAIL in tests/perf/.env.perf.local")
    return email


def get_perf_ui_password() -> str:
    password = os.getenv("PERF_UI_PASSWORD", "").strip()
    if not password:
        raise RuntimeError("Missing PERF_UI_PASSWORD in tests/perf/.env.perf.local")
    return password


def get_perf_backend_url() -> str:
    return os.getenv("PERF_BACKEND_URL", "http://localhost:8000").strip()


def get_service_role_client():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY")
    return create_client(supabase_url, supabase_key)


def mint_jwt(user_id: str, email: str | None = None) -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise RuntimeError("Missing SUPABASE_JWT_SECRET")
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "email": email or "perf-local@example.com",
        "aud": "authenticated",
        "iat": now,
        "exp": now + timedelta(hours=8),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def backend_available(base_url: str) -> bool:
    try:
        response = requests.get(f"{base_url.rstrip('/')}/health", timeout=2.0)
        return response.ok
    except Exception:
        return False


def port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def _request_json(
    session: requests.Session,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> requests.Response:
    return session.request(method, url, headers=headers, params=params, timeout=timeout)


def _benchmark_status(avg_ms: float, target_ms: float, max_ms: float) -> str:
    if avg_ms <= target_ms:
        return "good"
    if avg_ms <= max_ms:
        return "warning"
    return "fail"


def _measure_endpoint(
    session: requests.Session,
    base_url: str,
    headers: dict[str, str],
    endpoint: EndpointRun,
    runs: int,
) -> dict[str, Any]:
    url = f"{base_url}{endpoint.path}"
    all_ms: list[float] = []
    last_response: requests.Response | None = None

    for _ in range(runs):
        t0 = time.perf_counter()
        response = _request_json(
            session,
            endpoint.method,
            url,
            headers=headers,
            params=endpoint.params,
        )
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
        all_ms.append(elapsed_ms)
        last_response = response

    assert last_response is not None
    server_headers = {}
    for k, v in last_response.headers.items():
        key_lower = k.lower()
        if key_lower == "x-request-id" or key_lower.startswith(("x-itinerary-", "x-locations-")):
            server_headers[k] = v

    benchmark = BACKEND_BENCHMARKS.get(endpoint.label, {"target_ms": 0, "max_ms": 0})
    avg_ms = round(sum(all_ms) / len(all_ms), 1)
    return {
        "label": endpoint.label,
        "url": url,
        "method": endpoint.method,
        "http_status": last_response.status_code,
        "runs": runs,
        "avg_ms": avg_ms,
        "min_ms": round(min(all_ms), 1),
        "max_ms": round(max(all_ms), 1),
        "all_ms": all_ms,
        "response_bytes": len(last_response.content),
        "server_headers": server_headers,
        "benchmark": benchmark,
        "benchmark_status": _benchmark_status(avg_ms, benchmark["target_ms"], benchmark["max_ms"]),
    }


def _write_report_files(kind: str, payload: dict[str, Any], markdown: str) -> dict[str, str]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = MACHINE_REPORTS_DIR / f"{kind}_{timestamp}.json"
    md_path = HUMAN_REPORTS_DIR / f"{kind}_{timestamp}.md"
    latest_json = MACHINE_REPORTS_DIR / f"{kind}_latest.json"
    latest_md = HUMAN_REPORTS_DIR / f"{kind}_latest.md"
    raw = json.dumps(payload, indent=2) + "\n"
    json_path.write_text(raw)
    md_path.write_text(markdown)
    latest_json.write_text(raw)
    latest_md.write_text(markdown)
    return {
        "json_path": str(json_path),
        "md_path": str(md_path),
        "latest_json": str(latest_json),
        "latest_md": str(latest_md),
    }


def _backend_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Backend Performance Report",
        "",
        f"- Timestamp: `{payload['timestamp']}`",
        f"- Backend URL: `{payload['backend_url']}`",
        f"- Trip: `{payload['trip_name']}` (`{payload['trip_id']}`)",
        "",
        "| Endpoint | Avg ms | Target | Max | Status | Bytes | Notes |",
        "|---|---:|---:|---:|---|---:|---|",
    ]
    for result in payload["results"]:
        notes = ", ".join(f"{k}={v}" for k, v in sorted(result["server_headers"].items()))
        benchmark = result["benchmark"]
        lines.append(
            f"| {result['label']} | {result['avg_ms']} | {benchmark['target_ms']} | "
            f"{benchmark['max_ms']} | {result['benchmark_status']} | {result['response_bytes']} | {notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def run_backend_report(
    *,
    backend_url: str,
    user_id: str,
    trip_id: str | None = None,
    runs: int = 3,
) -> dict[str, Any]:
    load_env()
    base_url = backend_url.rstrip("/")
    token = mint_jwt(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    session = requests.Session()

    if not backend_available(base_url):
        raise RuntimeError(f"Backend is not reachable at {base_url}")

    if trip_id is None:
        trip_id, trip_name = discover_first_trip(base_url=base_url, user_id=user_id)
    else:
        trip_name = ""

    endpoints = [
        EndpointRun(label="GET /trips/{id}", path=f"{API_PREFIX}/trips/{trip_id}"),
        EndpointRun(label="GET /trips/{id}/locations", path=f"{API_PREFIX}/trips/{trip_id}/locations"),
        EndpointRun(
            label="GET /trips/{id}/itinerary",
            path=f"{API_PREFIX}/trips/{trip_id}/itinerary",
            params={"include_empty_options": "true"},
        ),
    ]
    results = [
        _measure_endpoint(session, base_url, headers, endpoint, runs) for endpoint in endpoints
    ]
    payload = {
        "timestamp": datetime.now(UTC).isoformat(),
        "backend_url": base_url,
        "trip_id": trip_id,
        "trip_name": trip_name,
        "benchmarks": BACKEND_BENCHMARKS,
        "results": results,
    }
    payload["report_files"] = _write_report_files("backend_perf", payload, _backend_markdown(payload))
    return payload


def discover_first_trip(*, base_url: str, user_id: str) -> tuple[str, str]:
    session = requests.Session()
    headers = {"Authorization": f"Bearer {mint_jwt(user_id)}"}
    url = f"{base_url}{API_PREFIX}/trips"
    response = _request_json(session, "GET", url, headers=headers)
    response.raise_for_status()
    trips = response.json()
    if not trips:
        raise RuntimeError(f"No trips found for user {user_id}")
    first = trips[0]
    return first["id"], first.get("name", "")


def _find_user_by_email(admin, email: str):
    users = admin.list_users(page=1, per_page=1000)
    for user in users:
        if getattr(user, "email", None) == email:
            return user
    return None


def ensure_perf_ui_user(email: str, password: str) -> dict[str, str]:
    load_env()
    supabase = get_service_role_client()
    admin = supabase.auth.admin
    user = _find_user_by_email(admin, email)
    attrs = {"email": email, "password": password, "email_confirm": True}
    if user is None:
        created = admin.create_user(attrs)
        user = created.user
    else:
        admin.update_user_by_id(user.id, {"password": password, "email_confirm": True})
    return {"user_id": str(user.id), "email": email}


def _fetch_all(table, select_cols: str, *, eq: tuple[str, str] | None = None, in_filter: tuple[str, list[str]] | None = None) -> list[dict[str, Any]]:
    query = table.select(select_cols)
    if eq:
        query = query.eq(eq[0], eq[1])
    if in_filter and in_filter[1]:
        query = query.in_(in_filter[0], in_filter[1])
    result = query.execute()
    return result.data or []


def _delete_user_trips(supabase, user_id: str) -> list[str]:
    trips = _fetch_all(supabase.table("trips"), "trip_id", eq=("user_id", user_id))
    trip_ids = [str(row["trip_id"]) for row in trips]
    if not trip_ids:
        return trip_ids

    day_rows = _fetch_all(
        supabase.table("trip_days"),
        "day_id",
        in_filter=("trip_id", trip_ids),
    )
    day_ids = [str(row["day_id"]) for row in day_rows]

    option_rows = _fetch_all(
        supabase.table("day_options"),
        "option_id",
        in_filter=("day_id", day_ids),
    )
    option_ids = [str(row["option_id"]) for row in option_rows]

    route_rows = _fetch_all(
        supabase.table("option_routes"),
        "route_id",
        in_filter=("option_id", option_ids),
    )
    route_ids = [str(row["route_id"]) for row in route_rows]

    if route_ids:
        supabase.table("route_segments").delete().in_("route_id", route_ids).execute()
        supabase.table("route_stops").delete().in_("route_id", route_ids).execute()
        supabase.table("option_routes").delete().in_("route_id", route_ids).execute()

    if option_ids:
        supabase.table("option_locations").delete().in_("option_id", option_ids).execute()
        supabase.table("day_options").delete().in_("option_id", option_ids).execute()

    if day_ids:
        supabase.table("trip_days").delete().in_("day_id", day_ids).execute()

    supabase.table("locations").delete().in_("trip_id", trip_ids).execute()
    for trip_id in trip_ids:
        supabase.table("trips").delete().eq("trip_id", trip_id).execute()
    return trip_ids


def _insert_rows(supabase, table_name: str, rows: Iterable[dict[str, Any]]) -> None:
    rows = list(rows)
    if rows:
        supabase.table(table_name).insert(rows).execute()


def clone_workspace_to_perf_user(*, source_user_id: str, perf_user_id: str) -> dict[str, Any]:
    load_env()
    supabase = get_service_role_client()

    _delete_user_trips(supabase, perf_user_id)

    source_trips = _fetch_all(supabase.table("trips"), TRIPS_SELECT, eq=("user_id", source_user_id))
    source_trip_ids = [str(row["trip_id"]) for row in source_trips]
    if not source_trip_ids:
        raise RuntimeError(f"No trips found for source user {source_user_id}")

    source_locations = _fetch_all(
        supabase.table("locations"),
        LOCATIONS_SELECT,
        in_filter=("trip_id", source_trip_ids),
    )
    source_days = _fetch_all(
        supabase.table("trip_days"),
        DAYS_SELECT,
        in_filter=("trip_id", source_trip_ids),
    )
    source_day_ids = [str(row["day_id"]) for row in source_days]
    source_options = _fetch_all(
        supabase.table("day_options"),
        OPTIONS_SELECT,
        in_filter=("day_id", source_day_ids),
    )
    source_option_ids = [str(row["option_id"]) for row in source_options]
    source_option_locations = _fetch_all(
        supabase.table("option_locations"),
        OPTION_LOCATIONS_SELECT,
        in_filter=("option_id", source_option_ids),
    )
    source_routes = _fetch_all(
        supabase.table("option_routes"),
        ROUTES_SELECT,
        in_filter=("option_id", source_option_ids),
    )
    source_route_ids = [str(row["route_id"]) for row in source_routes]
    source_route_stops = _fetch_all(
        supabase.table("route_stops"),
        ROUTE_STOPS_SELECT,
        in_filter=("route_id", source_route_ids),
    )
    source_route_segments = _fetch_all(
        supabase.table("route_segments"),
        ROUTE_SEGMENTS_SELECT,
        in_filter=("route_id", source_route_ids),
    )

    trip_map = {str(row["trip_id"]): str(uuid4()) for row in source_trips}
    location_map = {str(row["location_id"]): str(uuid4()) for row in source_locations}
    day_map = {str(row["day_id"]): str(uuid4()) for row in source_days}
    option_map = {str(row["option_id"]): str(uuid4()) for row in source_options}
    route_map = {str(row["route_id"]): str(uuid4()) for row in source_routes}
    route_segment_map = {str(row["id"]): str(uuid4()) for row in source_route_segments}

    _insert_rows(
        supabase,
        "trips",
        [{
            "trip_id": trip_map[str(row["trip_id"])],
            "user_id": perf_user_id,
            "trip_name": row.get("trip_name"),
            "start_date": row.get("start_date"),
            "end_date": row.get("end_date"),
            "created_at": row.get("created_at"),
        } for row in source_trips]
    )
    _insert_rows(
        supabase,
        "locations",
        [{
            "location_id": location_map[str(row["location_id"])],
            "trip_id": trip_map[str(row["trip_id"])],
            "name": row.get("name"),
            "address": row.get("address"),
            "google_link": row.get("google_link"),
            "note": row.get("note"),
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "added_by_user_id": perf_user_id,
            "added_by_email": row.get("added_by_email"),
            "city": row.get("city"),
            "working_hours": row.get("working_hours"),
            "requires_booking": row.get("requires_booking"),
            "category": row.get("category"),
            "google_place_id": row.get("google_place_id"),
            "google_source_type": row.get("google_source_type"),
            "google_raw": row.get("google_raw"),
            "created_at": row.get("created_at"),
            "user_image_url": row.get("user_image_url"),
        } for row in source_locations]
    )
    _insert_rows(
        supabase,
        "trip_days",
        [{
            "day_id": day_map[str(row["day_id"])],
            "trip_id": trip_map[str(row["trip_id"])],
            "date": row.get("date"),
            "sort_order": row.get("sort_order"),
            "created_at": row.get("created_at"),
        } for row in source_days]
    )
    _insert_rows(
        supabase,
        "day_options",
        [{
            "option_id": option_map[str(row["option_id"])],
            "day_id": day_map[str(row["day_id"])],
            "option_index": row.get("option_index"),
            "starting_city": row.get("starting_city"),
            "ending_city": row.get("ending_city"),
            "created_by": row.get("created_by"),
            "created_at": row.get("created_at"),
        } for row in source_options]
    )
    _insert_rows(
        supabase,
        "option_locations",
        [{
            "option_id": option_map[str(row["option_id"])],
            "location_id": location_map[str(row["location_id"])],
            "sort_order": row.get("sort_order"),
            "time_period": row.get("time_period"),
        } for row in source_option_locations]
    )
    _insert_rows(
        supabase,
        "option_routes",
        [{
            "route_id": route_map[str(row["route_id"])],
            "option_id": option_map[str(row["option_id"])],
            "transport_mode": row.get("transport_mode"),
            "label": row.get("label"),
            "duration_seconds": row.get("duration_seconds"),
            "distance_meters": row.get("distance_meters"),
            "sort_order": row.get("sort_order"),
        } for row in source_routes]
    )
    _insert_rows(
        supabase,
        "route_stops",
        [{
            "route_id": route_map[str(row["route_id"])],
            "location_id": location_map[str(row["location_id"])],
            "stop_order": row.get("stop_order"),
        } for row in source_route_stops]
    )
    _insert_rows(
        supabase,
        "route_segments",
        [{
            "id": route_segment_map[str(row["id"])],
            "route_id": route_map[str(row["route_id"])],
            "segment_order": row.get("segment_order"),
            "from_location_id": location_map[str(row["from_location_id"])],
            "to_location_id": location_map[str(row["to_location_id"])],
            "segment_cache_id": row.get("segment_cache_id"),
        } for row in source_route_segments]
    )

    representative_trip_id = trip_map[str(source_trips[0]["trip_id"])]
    summary = {
        "source_user_id": source_user_id,
        "perf_user_id": perf_user_id,
        "trip_count": len(source_trips),
        "location_count": len(source_locations),
        "day_count": len(source_days),
        "option_count": len(source_options),
        "route_count": len(source_routes),
        "representative_trip_id": representative_trip_id,
        "representative_trip_name": source_trips[0].get("trip_name"),
    }
    return summary


def prepare_ui_perf_context(
    *,
    source_user_id: str | None = None,
    perf_email: str | None = None,
    perf_password: str | None = None,
) -> dict[str, Any]:
    load_env()
    source_user_id = source_user_id or get_perf_source_user_id()
    perf_email = perf_email or get_perf_ui_email()
    perf_password = perf_password or get_perf_ui_password()
    user = ensure_perf_ui_user(perf_email, perf_password)
    sync = clone_workspace_to_perf_user(
        source_user_id=source_user_id,
        perf_user_id=user["user_id"],
    )
    context = {
        "timestamp": datetime.now(UTC).isoformat(),
        "source_user_id": source_user_id,
        "perf_user_id": user["user_id"],
        "representative_trip_id": sync["representative_trip_id"],
        "representative_trip_name": sync["representative_trip_name"],
        "benchmarks": FRONTEND_BENCHMARKS,
        "sync_summary": sync,
    }
    context_path = MACHINE_REPORTS_DIR / "ui_perf_context_latest.json"
    context_path.write_text(json.dumps(context, indent=2) + "\n")
    return context
