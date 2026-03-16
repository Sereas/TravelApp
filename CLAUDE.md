# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack travel itinerary planning app ("shtabtravel"). Backend is a FastAPI (Python 3.12+) REST API backed by Supabase (PostgreSQL). Frontend is Next.js 14 App Router + TypeScript deployed on Vercel.

## Commands

### Backend (run from repo root)

```bash
# Dev server
uvicorn backend.app.main:app --reload

# Tests (all)
pytest

# Single test file
pytest backend/tests/test_trips_create.py

# Lint / format
ruff check .
ruff format .
```

### Frontend (run from `frontend/`)

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
npm run lint         # eslint + prettier check
npm run lint:fix     # Auto-fix lint/format
npm run typecheck    # tsc --noEmit
```

### Docker

```bash
docker-compose up api             # Production image
docker-compose --profile dev up   # Dev with hot-reload
```

## Environment Variables

**Backend** (`.env` at repo root):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required
- `SUPABASE_JWT_SECRET` — HS256 fallback for local/test (ES256 via JWKS is preferred in prod)
- `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY` — optional; Google integrations disabled when absent
- `CORS_ALLOWED_ORIGINS` — comma-separated list (defaults include `localhost:3000` and `shtabtravel.vercel.app`)

**Frontend** (`.env.local` inside `frontend/`):
- `NEXT_PUBLIC_API_URL` — backend base URL (defaults to `http://localhost:8000`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Architecture

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app; registers all routers under `/api/v1/`
- **`core/config.py`** — Settings loaded from env via `get_settings()` (lru_cached)
- **`dependencies.py`** — `get_current_user_id()` FastAPI dependency; validates Supabase JWT (ES256 JWKS → HS256 fallback); extracts `user_id: UUID`
- **`db/supabase.py`** — `get_supabase_client()` dependency; backend always uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses Supabase RLS — ownership is enforced manually in Python)
- **`models/schemas.py`** — All Pydantic request/response models
- **`routers/trip_ownership.py`** — `_ensure_trip_owned(supabase, trip_id, user_id)` helper; raises 404 if trip missing or not owned by caller — used at the top of every nested-resource endpoint
- **`services/route_calculation.py`** — Route segment computation via Google Routes API; "retry-on-view" caching in `segment_cache` table
- **`clients/`** — Thin wrappers around Google Places and Google Routes APIs

### Database Tables (Supabase/Postgres)

Key tables: `trips`, `locations`, `trip_days`, `day_options`, `option_locations`, `option_routes`, `route_stops`, `route_segments`, `segment_cache`.

Key Supabase RPCs called from Python:
- `get_itinerary_tree(p_trip_id)` — returns full nested itinerary as flat rows
- `create_route_with_stops(p_option_id, p_transport_mode, p_label, p_location_ids)`
- `get_option_routes(p_option_id)`
- `batch_insert_option_locations(p_option_id, p_location_ids, p_sort_orders, p_time_periods)`
- `reorder_option_locations(p_option_id, p_location_ids)`

### Itinerary Data Model (hierarchical)

```
Trip
 └── Days (trip_days) — ordered by sort_order
      └── Options (day_options) — option_index 1 = main, 2+ = alternatives
           ├── Locations (option_locations) — ordered by sort_order; each has time_period
           └── Routes (option_routes) — each route has ordered stops (route_stops)
                └── Segments (route_segments → segment_cache) — per-leg distance/duration/polyline
```

The full tree is fetched in one shot via `GET /api/v1/trips/{trip_id}/itinerary` (calls `get_itinerary_tree` RPC). Individual create/update/delete operations go through granular endpoints.

### Route Calculation ("retry-on-view")

Route metrics are computed lazily: segments are only calculated when the user views a route (`GET …/routes/{id}?include_segments=true`) or explicitly recalculates. Results are cached in `segment_cache` keyed by `cache_key` (place_ids or lat/lng + transport_mode). Cache is reused unless: `force_refresh=true`, fingerprint changed, or cooldown expired. No background jobs.

### Frontend (`frontend/src/`)

- **`lib/api.ts`** — Single typed `api` object with all backend calls. Gets Supabase access token from the browser session and injects it as `Authorization: Bearer` on every request.
- **`app/trips/[id]/page.tsx`** — The main trip detail page. Holds all itinerary + locations state locally with `useState`. Performs optimistic updates for time_period changes and location reordering; falls back to server refetch on error.
- **`middleware.ts`** — Next.js middleware that runs `updateSession` on every request to keep the Supabase session cookie fresh.
- **`lib/supabase/`** — Three Supabase client factories: `client.ts` (browser), `server.ts` (Server Components), `middleware.ts` (middleware).
- **`components/`** — Organized by domain: `itinerary/`, `locations/`, `trips/`, `layout/`, `feedback/`, `ui/` (shadcn primitives).

### Authentication Flow

1. User logs in via Supabase Auth (email/password) on `/login`.
2. Auth callback at `/auth/callback` sets session cookies via `@supabase/ssr`.
3. Next.js middleware refreshes session on every request.
4. Frontend reads session → gets `access_token` → sends as `Bearer` to backend.
5. Backend validates JWT via Supabase JWKS (ES256), falls back to HS256 secret for local dev.

### Testing

**Backend:** pytest with fully mocked Supabase clients in `conftest.py`. No real DB or network calls in unit tests. `mock_supabase_trips_and_days` is the most comprehensive fixture, simulating the full trips/days/options/locations/option_locations table hierarchy including RPC responses.

**Frontend:** Vitest + React Testing Library (jsdom). Test files co-located with components (`*.test.tsx`).
