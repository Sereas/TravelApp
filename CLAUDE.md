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

# E2E (Playwright)
npm run test:e2e         # Headless
npm run test:e2e:headed  # With browser
npm run test:e2e:ui      # Interactive UI mode
npm run test:e2e:debug   # Debug mode
npm run test:e2e:report  # View last report
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
- `LOG_LEVEL`, `LOG_FORMAT` — structlog config (`INFO`/`json` defaults)
- `FRONTEND_BASE_URL` — used for share link generation

**Frontend** (`.env.local` inside `frontend/`):
- `NEXT_PUBLIC_API_URL` — backend base URL (defaults to `http://localhost:8000`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**E2E** (`.env.e2e` inside `frontend/`):
- Test credentials and URLs for Playwright E2E tests (see `.env.e2e.example`)

## Architecture

### Backend (`backend/app/`)

- **`main.py`** — FastAPI app with lifespan for singleton client init; registers all routers under `/api/v1/` (except `infra`); middleware stack: SecurityHeaders → RequestLogging → SlowAPI → CORS; custom exception handlers for rate limits (429) and disabled Google APIs (503); exposes perf headers (`X-Itinerary-Ownership-Ms`, `X-Itinerary-Rpc-Ms`)
- **`middleware.py`** — `RequestLoggingMiddleware` (logs method/path/status/duration with request IDs) + `SecurityHeadersMiddleware` (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- **`core/config.py`** — Settings loaded from env via `get_settings()` (lru_cached)
- **`core/logging.py`** — Structlog setup; JSON logs in production, pretty console in dev
- **`core/rate_limit.py`** — Slowapi limiter; user-id-based for auth endpoints, IP-based for public; default 100/minute
- **`dependencies.py`** — `get_current_user_id()` and `get_current_user_email()` FastAPI dependencies; validates Supabase JWT (ES256 JWKS → HS256 fallback); Google client singletons (`get_google_places_client()`, `get_google_places_client_optional()`, `get_google_routes_client()`)
- **`db/supabase.py`** — `get_supabase_client()` dependency with instrumentation wrapper; logs every `.execute()` at DEBUG with table/rpc name, operation type, duration, row counts; uses `SUPABASE_SERVICE_ROLE_KEY` exclusively (bypasses RLS — ownership enforced in Python)
- **`models/schemas.py`** — All Pydantic request/response models with validators (category, required_booking, image type/size)
- **`utils/url_validation.py`** — SSRF prevention for Google Maps list import; validates scheme, hostname whitelist, rejects IPs

#### Routers (`backend/app/routers/`)

| Router | Purpose |
|--------|---------|
| `trips.py` | Trip CRUD (create, list, get, update, delete) |
| `trip_locations.py` | Location CRUD + image upload + Google Maps list import (SSE streaming) |
| `locations_google.py` | Google Places preview/resolution (read-only, no DB writes) |
| `itinerary_days.py` | Day CRUD + date reconciliation + reorder/generate |
| `itinerary_options.py` | Option CRUD + reorder; tracks starting/ending cities |
| `itinerary_option_locations.py` | Option-location CRUD + reorder + batch-add |
| `itinerary_routes.py` | Route CRUD + segment recalculation |
| `itinerary_tree.py` | Full itinerary tree in one shot (`get_itinerary_tree` RPC) |
| `shared_trips.py` | Public share tokens + owner sharing management; rate-limited by IP |
| `trip_ownership.py` | `_ensure_resource_chain()` helper (single DB round-trip ownership check) |
| `infra.py` | Health check (`/health`) for probes |

#### Services (`backend/app/services/`)

- **`route_calculation.py`** — Route segment computation via Google Routes API; "retry-on-view" caching in `segment_cache` table with TTLs and cooldowns
- **`place_photos.py`** — Fetch and cache Google Places photos in Supabase Storage; returns public URLs; handles race conditions with ON CONFLICT DO NOTHING

#### Clients (`backend/app/clients/`)

- **`google_places.py`** — Google Places API v1 wrapper (SearchText); returns `PlaceResolution` dataclass
- **`google_routes.py`** — Google Routes API client; returns `RouteLegResult` (distance, duration, polyline)
- **`google_list_scraper.py`** — Playwright-based scraper for Google Maps shared lists; hybrid DOM + getlist endpoint approach; handles pagination and consent

### Database Tables (Supabase/Postgres)

Key tables: `trips`, `locations`, `trip_days`, `day_options`, `option_locations`, `option_routes`, `route_stops`, `route_segments`, `segment_cache`, `place_photos`, `trip_shares`.

Key Supabase RPCs called from Python:
- `get_itinerary_tree(p_trip_id, p_user_id)` — returns full nested itinerary; ownership baked in via `EXISTS`
- `get_itinerary_routes(p_option_ids)` — batch route fetch with `LEFT JOIN LATERAL`
- `create_route_with_stops(p_option_id, p_transport_mode, p_label, p_option_location_ids)`
- `update_route_with_stops(p_route_id, p_option_id, ...)` — atomic route+stops update
- `get_option_routes(p_option_id)`
- `batch_insert_option_locations(p_option_id, p_location_ids, p_sort_orders, p_time_periods)`
- `reorder_option_locations(p_option_id, p_ol_ids)`
- `reorder_trip_days(p_trip_id, p_day_ids)`, `reorder_day_options(p_day_id, p_option_ids)`
- `delete_days_batch(p_trip_id, p_day_ids)`, `delete_location_cascade(p_trip_id, p_location_id)`
- `remove_location_from_option(p_option_id, p_ol_id)`
- `move_option_to_day(p_option_id, p_source_day_id, p_target_day_id)`
- `reconcile_clear_dates(p_trip_id, p_day_ids)`, `shift_day_dates(p_trip_id, p_offset_days)`
- `get_shared_trip_data(p_share_token)` — public share data without auth
- `verify_resource_chain(p_trip_id, p_user_id, p_day_id, p_option_id)` — single-query ownership chain

### Itinerary Data Model (hierarchical)

```
Trip
 └── Days (trip_days) — ordered by sort_order
      └── Options (day_options) — option_index 1 = main, 2+ = alternatives
           ├── Locations (option_locations) — ordered by sort_order; each has time_period
           └── Routes (option_routes) — each route has ordered stops (route_stops → option_location_id)
                └── Segments (route_segments → segment_cache) — per-leg distance/duration/polyline
```

The full tree is fetched in one shot via `GET /api/v1/trips/{trip_id}/itinerary` (calls `get_itinerary_tree` RPC). Individual create/update/delete operations go through granular endpoints.

### Route Calculation ("retry-on-view")

Route metrics are computed lazily: segments are only calculated when the user views a route (`GET …/routes/{id}?include_segments=true`) or explicitly recalculates. Results are cached in `segment_cache` keyed by `cache_key` (place_ids or lat/lng + transport_mode). Cache is reused unless: `force_refresh=true`, fingerprint changed, or cooldown expired. No background jobs.

### Frontend (`frontend/src/`)

#### App Routes

| Route | Purpose |
|-------|---------|
| `/` | Home/redirect |
| `/login` | Supabase Auth (email/password) |
| `/auth/callback` | OAuth callback, sets session cookies |
| `/auth/logout` | Logout handler |
| `/auth/update-password` | Password recovery |
| `/trips` | Trip listing |
| `/trips/[id]` | Trip detail page (locations + itinerary tabs) |
| `/shared/[token]` | Public shared trip viewer (read-only, no auth) |

#### Key Files

- **`lib/api.ts`** — Single typed `api` object (~827 lines) with namespaced endpoints (`api.trips`, `api.locations`, `api.google`, `api.itinerary`, `api.sharing`); SSE streaming support for Google List imports; custom `ApiError` class
- **`features/itinerary/useItineraryState.ts`** — Central hook (~960 lines) for all itinerary state: fetching tree, optimistic updates (time_period, reorder, option details), auto-recalculating routes with missing segments, server sync with rollback
- **`middleware.ts`** — Skips Supabase refresh for `/shared/*` paths; delegates auth to `updateSession()`
- **`lib/supabase/`** — Three Supabase client factories: `client.ts` (browser), `server.ts` (Server Components), `middleware.ts` (middleware with public path config)
- **`lib/location-constants.ts`** — 31 category definitions with colors, icons, gradients; `REQUIRES_BOOKING_OPTIONS`; `CATEGORY_META` styling metadata
- **`lib/read-only-context.ts`** — React context for read-only mode (shared trips)

#### Components (organized by domain)

- **`itinerary/`** — `ItineraryTab`, `ItineraryDayCard`, `ItineraryDayHeader`, `ItineraryDayRail`, `ItineraryDayTimeline`, `ItineraryLocationRow`, `ItineraryPlanSwitcher`, `ItineraryInspectorPanel`, `ItineraryRouteManager`, `ItineraryDayMap`, `SidebarMap`, `AddLocationsToOptionDialog`, `UnscheduledLocationsPanel`
- **`locations/`** — `LocationCard`, `AddLocationForm`, `EditLocationRow`, `PhotoUploadDialog`, `ImportGoogleListDialog`, `CategoryIcon`
- **`trips/`** — `TripCard`, `CreateTripDialog`, `ShareTripDialog`, `EditTripForm`, `TripDateRangePicker`, `InlineDateInput`, `DateChangeDialog`, `TripGradient`
- **`layout/`** — `PageShell`, `SiteHeader`, `UserNav`
- **`feedback/`** — `LoadingSpinner`, `ErrorBanner`, `EmptyState`
- **`ui/`** — shadcn/Radix primitives: button, card, input, label, dialog, popover, tabs, badge, progress, calendar, date-picker, confirm-dialog

#### Key Dependencies

- **Framework:** Next.js 14.2, React 18.3, TypeScript 5.6
- **UI:** Radix UI, Tailwind CSS 3.4, lucide-react icons, class-variance-authority
- **Maps:** MapLibre GL 4.3 (open-source)
- **Auth/DB:** @supabase/ssr, @supabase/supabase-js 2.97
- **Date:** date-fns 4.1, react-day-picker 9.14
- **Animation:** motion 12.38

### Authentication Flow

1. User logs in via Supabase Auth (email/password) on `/login`.
2. Auth callback at `/auth/callback` sets session cookies via `@supabase/ssr`.
3. Next.js middleware refreshes session on every request (skips `/shared/*`).
4. Frontend reads session → gets `access_token` → sends as `Bearer` to backend.
5. Backend validates JWT via Supabase JWKS (ES256), falls back to HS256 secret for local dev.
6. Shared trips bypass auth entirely — `GET /shared/{token}` is public, rate-limited by IP.

### Testing

**Backend:** pytest (32 test files) with fully mocked Supabase clients in `conftest.py`. No real DB or network calls in unit tests. `mock_supabase_trips_and_days` is the most comprehensive fixture, simulating the full table hierarchy including RPC responses. Live Google Places tests marked with `@live` marker (excluded by default).

**Frontend:** Vitest + React Testing Library (jsdom). Test files co-located with components (`*.test.tsx`).

**E2E:** Playwright tests in `frontend/e2e/specs/` organized by domain:
- `auth/` — login, logout, signup-and-reset
- `locations/` — add, edit/delete, features, Google list import
- `itinerary/` — core-planning, day-options, plan-switcher, routes, schedule-locations, state-edge-cases
- `sharing/` — share-trip, sharing-advanced
- `smoke/` — critical-path (smoke test)

Page Object Models in `frontend/e2e/pages/`, helpers in `frontend/e2e/helpers/`, global setup/teardown for auth.

**Performance:** Backend load tests in `tests/perf/` with JSON artifacts in `tests/perf/artifacts/`.

### CI/CD (`.github/workflows/ci.yml`)

| Job | What it runs |
|-----|-------------|
| `lint` | `ruff check` + `ruff format --check` |
| `test` | `pytest` (backend) |
| `frontend-lint` | `tsc --noEmit` + ESLint |
| `frontend-test` | Vitest unit tests |
| `e2e` | Playwright E2E (push to main only); starts backend + frontend, uploads artifacts on failure |

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

5. **All new read RPCs must be marked `STABLE`.**

6. **No `SELECT *`.** Every query must list explicit columns.

### Per-Endpoint Checklist (Required Before Writing Any New Endpoint)

- [ ] How many DB round-trips in the happy path? Target <= 3. If more, write an RPC.
- [ ] Does it verify ownership? Use `_ensure_resource_chain`, not individual helpers.
- [ ] Does it read from multiple tables? Consider a single SQL JOIN function.
- [ ] Does it write to multiple tables? Wrap in a PL/pgSQL RPC (transaction).
- [ ] Is there a `for` loop with `.execute()` inside it? Replace with batch operation.
- [ ] Does it look up a user's email? Read `added_by_email` from the DB row.

### Anti-Patterns: Never Repeat

| Anti-Pattern | Correct Alternative |
|---|---|
| `for id in ids: supabase.table(...).execute()` | Single `IN()` or `unnest()` RPC |
| `_ensure_trip_owned(); _ensure_day_in_trip(); _ensure_option_in_day()` | `_ensure_resource_chain(...)` |
| Sequential multi-table writes without a transaction | Single PL/pgSQL RPC |
| `supabase.auth.admin.get_user_by_id(uid)` in request handlers | `loc["added_by_email"]` from DB |
| `.select("*")` | Explicit column list |

## CRITICAL: Multi-Agent Team Architecture

**YOU ARE THE ORCHESTRATOR. YOU MUST DELEGATE TO YOUR TEAM.**

This is a multi-agent team system. You (the main Claude Code session) are the **team lead**. You coordinate work by dispatching to specialist teammates. You do NOT:

- Perform code review yourself before committing
- Analyse SQL or schema changes inline
- Debug build/type errors ad-hoc in the main thread
- Do security audits with a casual "looks fine"
- Identify dead code by manual grep
- Skip dispatch because a task "feels simple"

You DO:

- Dispatch to the right teammate for every task listed below
- Run teammates in **parallel** when tasks are independent
- Run teammates **sequentially** when output from one feeds the next
- Synthesise teammate output into a coherent result for the user
- Enforce mandatory workflow gates — no exceptions

**If you find yourself about to handle one of the tasks below inline, STOP and dispatch to the appropriate teammate instead.**

---

## Team Overview

| Teammate | Role | Specialty |
|----------|------|-----------|
| `architect` | System Designer | Feature design, trade-offs, ADRs. Knows FastAPI + Next.js 14 + Supabase stack and itinerary data hierarchy. |
| `planner` | Implementation Planner | Breaks complex features into phased plans with file paths and edge cases. |
| `code-reviewer` | Quality Guardian | Pre-commit review. Enforces DB perf rules, N+1 checks, React/Next.js patterns, Pydantic models. |
| `database-reviewer` | DB & Schema Expert | SQL/schema review against project non-negotiables. Live `EXPLAIN ANALYZE` and index inspection via Supabase MCP. |
| `security-reviewer` | Security Auditor | OWASP Top 10, JWT validation, injection/XSS, Supabase RLS bypass checks on new endpoints. |
| `tdd-guide` | Test Enforcer | Red-Green-Refactor cycle. Knows `mock_supabase_trips_and_days` fixture and Vitest + RTL patterns. Targets 80%+ coverage. |
| `e2e-runner` | E2E Specialist | Playwright POM patterns. Knows critical journeys: create trip → add day → add locations → reorder → switch options → view routes. |
| `build-error-resolver` | Build Fixer | Minimal-diff fixes only. Gets `ruff`/`pytest`/`tsc`/`next build` green fast. No architectural changes. |
| `refactor-cleaner` | Cleanup Expert | Uses knip (frontend) / vulture (backend) to find dead code. Safe removal with verification. |

---

## Teammate Dispatch Rules

### Mandatory Gates — No Exceptions

These teammates MUST be dispatched at specific workflow points regardless of task size.

| Gate | Teammate(s) | Trigger |
|------|-------------|---------|
| **Pre-commit** | `code-reviewer` | Before EVERY `git commit` — review the staged diff. Do not commit until review passes. |
| **New or modified endpoint** | `database-reviewer` + `security-reviewer` (parallel) | Any change to `backend/app/routers/`, `backend/app/db/`, or any `*.sql` file. |
| **Schema / migration change** | `database-reviewer` | Any new file in `supabase/migrations/` or change to an RPC. Uses Supabase MCP to verify live state. |
| **Build failure** | `build-error-resolver` | When `ruff check`, `pytest`, `npm run typecheck`, or `npm run build` fails — delegate immediately. |
| **Auth or input handling change** | `security-reviewer` | Any endpoint touching `dependencies.py`, JWT handling, user input, file uploads, or `clients/*.py`. |

### Automatic Dispatch — Trigger on Task Type

| Trigger keywords / context | Teammate | Notes |
|---------------------------|----------|-------|
| "plan feature", "how should we", "design", trade-off, ADR | `architect` | Dispatch before any implementation begins. |
| "break down", "plan this", multi-step implementation | `planner` | Returns phased plan with file paths and edge cases. |
| "write tests", "TDD", "test-first", new feature | `tdd-guide` | Enforces Red-Green-Refactor. Targets 80%+ coverage. |
| "E2E", "test the flow", Playwright | `e2e-runner` | Knows critical user journeys for shtabtravel. |
| "clean up", "dead code", "unused exports", consolidation | `refactor-cleaner` | Static analysis first, then safe removal. |
| SQL, indexes, query performance, slow queries | `database-reviewer` | Can run `EXPLAIN ANALYZE` via Supabase MCP. |

### Parallel vs Sequential Dispatch

Run these combinations **in parallel** (independent work, no shared state):

- **New endpoint design**: `architect` ‖ `security-reviewer` → synthesise → then implement
- **New endpoint review**: `database-reviewer` ‖ `security-reviewer` → then `code-reviewer` pre-commit
- **New feature plan**: `architect` ‖ `planner` → synthesise into one plan before coding
- **Post-refactor verification**: `code-reviewer` ‖ `tdd-guide` (verify tests still pass)

Run these **sequentially** (output of one feeds the next):

- **Full feature workflow**: `architect` → `planner` → implement → `database-reviewer` + `security-reviewer` (parallel) → `code-reviewer` (pre-commit)
- **Schema migration**: `database-reviewer` (review SQL) → apply migration → `database-reviewer` (verify live state via Supabase MCP)
- **Refactor**: `refactor-cleaner` (identify) → implement removals → `build-error-resolver` (if build breaks) → `code-reviewer` (pre-commit)

### Never Handle Inline

These task types MUST be delegated. Doing them yourself in the main thread is not acceptable:

1. **Pre-commit review** → `code-reviewer` (not a self-review)
2. **SQL or schema review** → `database-reviewer` (not a glance at the diff)
3. **Security audit** → `security-reviewer` (not "looks fine to me")
4. **Build/type error debugging** → `build-error-resolver` (not ad-hoc inline fixes)
5. **Dead code identification** → `refactor-cleaner` (not manual grep)

---

## Skills (`.claude/skills/`) — Reference Material

Skills are loaded by you or your teammates as reference during task execution. They are NOT substitutes for dispatching to a teammate.

| Skill | When to load | What it provides |
|-------|-------------|-----------------|
| `backlog-manager` | "add to backlog", "what's in backlog" | Reads/writes `backlog/front/` and `backlog/back/`. Structured templates. |
| `postgres-patterns` | Writing SQL, RPCs, batch operations | `unnest()` patterns, `_ensure_resource_chain`, index types, ownership/batch patterns for this project. |
| `database-migrations` | Creating or modifying migrations | Safe workflow: `apply_migration` MCP + local file in `supabase/migrations/`. Rollback and zero-downtime guidance. |
| `tdd-workflow` | Starting a feature with tests | Red-Green-Refactor cycle with git checkpoints. pytest and Vitest command patterns. |
| `e2e-testing` | Writing or debugging Playwright tests | POM patterns, flaky test quarantine, CI/CD artifact management. |
| `security-review` | Auth, user input, new API endpoints | Full security checklist. FastAPI auth patterns, Supabase RLS/service-role gotchas. |

---

## Reference: Good Patterns to Copy

- **Batch read:** `batch_add_locations_to_option` — single `IN()` validation, RPC insert
- **Batch write:** `batch_insert_option_locations` SQL — `unnest()` single INSERT
- **Batch update:** `reorder_option_locations` SQL — `UPDATE FROM unnest()`
- **Aggregated read:** `get_itinerary_routes` SQL — `LEFT JOIN LATERAL`, `STABLE`
- **Ownership baked into read:** `get_itinerary_tree(p_trip_id, p_user_id)` — `EXISTS` inline
- **Lazy 404:** `itinerary_tree.py::get_itinerary` — skip ownership RT if RPC returns data
- **Optimistic frontend update:** `handleSaveOptionDetails` in `useItineraryState.ts` — patch local state, no refetch
- **Atomic route update:** `update_route_with_stops` SQL — updates route + stops in one transaction
- **Cascade delete:** `delete_location_cascade` SQL — removes location from all options/routes atomically
- **SSRF prevention:** `utils/url_validation.py` — whitelist-based URL validation for external imports
