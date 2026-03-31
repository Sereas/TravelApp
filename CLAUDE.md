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

# Playwright (Google list scraper in backend): after pip install, download Chromium once
playwright install chromium
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

- **`main.py`** — FastAPI app; registers all routers under `/api/v1/`; includes `RequestLoggingMiddleware` for request timing
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
- **`app/trips/[id]/page.tsx`** — The main trip detail page. Manages trip-level and locations-tab state; delegates itinerary state and rendering to `ItineraryTab` + `useItineraryState`.
- **`features/itinerary/useItineraryState.ts`** — Central hook for all itinerary state management: fetching the itinerary tree, optimistic updates (time_period, reorder, option details), and server sync with rollback on error.
- **`components/itinerary/ItineraryTab.tsx`** — Orchestrates the itinerary tab: wires `useItineraryState` to the component tree.
- **`components/itinerary/`** — Modular itinerary components: `ItineraryDayCard`, `ItineraryDayHeader`, `ItineraryDayRail`, `ItineraryDayTimeline`, `ItineraryLocationRow`, `ItineraryPlanSwitcher`, `ItineraryInspectorPanel`, `ItineraryRouteManager`, `UnscheduledLocationsPanel`.
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

**Performance:** Playwright-based frontend perf tests in `tests/perf/frontend/` (trip load timing); Python backend load tests in `tests/perf/` (`workspace_perf.py`, `run_trip_load.py`). Playwright config at `frontend/playwright.config.ts`.

## Database Performance Rules

DB requests and performance are the highest priority concern in this codebase.
These rules are non-negotiable for every new endpoint or DB interaction.

### Non-Negotiable Rules

1. **No N+1 queries, ever.** A Python `for` loop calling `.execute()` inside its body is forbidden.
   Use `IN()` for batch reads, `unnest()` RPCs for batch writes, `LEFT JOIN LATERAL` for 1:N aggregation.

2. **Use `_ensure_resource_chain` for all ownership verification.**
   Never call `_ensure_trip_owned`, `_ensure_day_in_trip`, `_ensure_option_in_day` separately.
   Use the single helper that resolves the entire chain in one DB round-trip.

3. **Multi-table writes must be atomic.**
   Any endpoint that writes to more than one table must do so inside a PL/pgSQL RPC (transaction boundary).
   Sequential Python DELETE+DELETE+INSERT is never acceptable.

4. **Never call `supabase.auth.admin.get_user_by_id()` in any request handler.**
   User email is stored in the `locations.added_by_email` column at INSERT time from the JWT payload.

5. **Never include `google_raw` in list or batch endpoint responses.**
   `google_raw` is returned only in the single `POST /trips/{id}/locations` response.

6. **All new read RPCs must be marked `STABLE`.**

7. **No `SELECT *`.** Every query must list explicit columns.

### Per-Endpoint Checklist (Required Before Writing Any New Endpoint)

- [ ] How many DB round-trips in the happy path? Target <= 3. If more, write an RPC.
- [ ] Does it verify ownership? Use `_ensure_resource_chain`, not individual helpers.
- [ ] Does it read from multiple tables? Consider a single SQL JOIN function.
- [ ] Does it write to multiple tables? Wrap in a PL/pgSQL RPC (transaction).
- [ ] Does it return `google_raw`? Remove it if this is a list or batch endpoint.
- [ ] Is there a `for` loop with `.execute()` inside it? Replace with batch operation.
- [ ] Does it look up a user's email? Read `added_by_email` from the DB row.

### Anti-Patterns: Never Repeat

| Anti-Pattern | Correct Alternative |
|---|---|
| `for id in ids: supabase.table(...).execute()` | Single `IN()` or `unnest()` RPC |
| `_ensure_trip_owned(); _ensure_day_in_trip(); _ensure_option_in_day()` | `_ensure_resource_chain(...)` |
| Sequential multi-table writes without a transaction | Single PL/pgSQL RPC |
| `supabase.auth.admin.get_user_by_id(uid)` in request handlers | `loc["added_by_email"]` from DB |
| `google_raw` in list endpoint `SELECT` | Use `_LOCATIONS_SELECT` (not WITH_RAW) |
| `.select("*")` | Explicit column list |

## Agents & Skills

This project has custom agents and skills in `.claude/`. Use them proactively.

### Agents (`.claude/agents/`)

| Agent | When to use |
|---|---|
| `architect` | Planning new features, evaluating architectural trade-offs, ADRs |
| `planner` | Breaking down complex features into step-by-step implementation plans |
| `code-reviewer` | Reviewing code changes before commit; knows project DB rules and patterns |
| `database-reviewer` | SQL/schema review; uses live Supabase MCP to inspect actual DB state |
| `database-optimizer` | Performance analysis, index recommendations, query plan analysis via Supabase MCP |
| `security-reviewer` | Security audit of new endpoints, auth code, input handling |
| `security-engineer` | Deep threat modeling, OWASP review, CI/CD security pipeline design |
| `tdd-guide` | Enforces test-first workflow; knows pytest (backend) and Vitest (frontend) patterns |
| `e2e-runner` | Writing and running Playwright E2E tests; knows project critical journeys |
| `build-error-resolver` | Fixing TypeScript/build errors (frontend) and ruff/pytest errors (backend) |
| `refactor-cleaner` | Removing dead code, unused exports, consolidating duplicates |

### Skills (`.claude/skills/`)

| Skill | When to use |
|---|---|
| `backlog-manager` | Add, read, or execute items in `backlog/front/` and `backlog/back/` |
| `postgres-patterns` | Quick reference for indexes, data types, RPC patterns, this project's batch/ownership patterns |
| `database-migrations` | Safe migration patterns; includes Supabase workflow with `apply_migration` MCP + local file requirement |
| `tdd-workflow` | Red-Green-Refactor cycle with git checkpoints; includes pytest and Vitest patterns |
| `e2e-testing` | Playwright POM patterns, flaky test handling, CI/CD integration |
| `security-review` | Full security checklist; includes FastAPI/Supabase-specific patterns |

### Reference: Good Patterns to Copy

- **Batch read:** `batch_add_locations_to_option` — single `IN()` validation, RPC insert
- **Batch write:** `batch_insert_option_locations` SQL — `unnest()` single INSERT
- **Batch update:** `reorder_option_locations` SQL — `UPDATE FROM unnest()`
- **Aggregated read:** `get_itinerary_routes` SQL — `LEFT JOIN LATERAL`, `STABLE`
- **Ownership baked into read:** `get_itinerary_tree(p_trip_id, p_user_id)` — `EXISTS` inline
- **Lazy 404:** `itinerary_tree.py::get_itinerary` — skip ownership RT if RPC returns data
- **Optimistic frontend update:** `handleSaveOptionDetails` in `useItineraryState.ts` — patch local state, no refetch
