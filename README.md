# shtabtravel

A travel planning web app for organizing trips: collect locations, build day-by-day itineraries with alternative options per day, and calculate walking/driving/transit routes between stops.

**Live demo:** [shtabtravel.vercel.app](https://shtabtravel.vercel.app)

---

## Tech stack

**Backend** — Python 3.12 · FastAPI · Supabase (PostgreSQL + Auth) · Pydantic · structlog · Docker

**Frontend** — Next.js 14 (App Router) · TypeScript · Tailwind CSS · Radix UI · MapLibre GL

**External APIs** — Google Places (location lookup) · Google Routes (distance, duration, encoded polylines)

---

## Features

- **Trips** — create and manage trips with optional date ranges
- **Locations** — add locations manually or by pasting a Google Maps URL (auto-fills name, address, city, coordinates, category, working hours)
- **Itinerary** — organize locations into a day-by-day plan; each day supports multiple alternative options (e.g. "plan A / plan B"); locations within an option have a time-of-day label (morning / afternoon / evening / night)
- **Routes** — create walking, driving, or transit routes between stops within a day option; distances and durations are computed via Google Routes API and cached per segment
- **Authentication** — Supabase Auth (email + password); all data is user-scoped

---

## Architecture highlights

**Itinerary tree via RPC** — the full nested structure (days → options → locations + routes) is fetched in one call using a Postgres RPC (`get_itinerary_tree`), replacing 5 sequential round-trips. Measured improvement: ~2.4 s → ~360 ms (~6.7×) against a hosted Supabase instance. See [`docs/design/itinerary-rpc-performance.md`](docs/design/itinerary-rpc-performance.md).

**Route segment cache** — route metrics are computed lazily ("retry-on-view") and cached per segment in a `segment_cache` table keyed by origin + destination + transport mode. Segments are shared across routes — computing A→B once serves every route that includes that leg. TRANSIT results expire after 12 h; WALK/DRIVE cache indefinitely. See [`docs/features/route-calculation-design.md`](docs/features/route-calculation-design.md).

**Ownership enforcement** — the backend uses the Supabase service-role key (bypasses RLS) and enforces user ownership explicitly in Python via a shared `_ensure_trip_owned()` helper called at the top of every nested-resource handler. Supabase RLS policies provide a second layer of protection for direct DB access. See [`docs/design/backend-and-supabase.md`](docs/design/backend-and-supabase.md).

**Optimistic UI** — the trip detail page applies optimistic updates for time-of-day changes and location reordering, with a server refetch as fallback on error.

---

## Running locally

### Backend

```bash
# Copy and fill in credentials
cp .env.example .env

# Install dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Start dev server
uvicorn backend.app.main:app --reload --port 8000

# Run tests (no real DB needed — all Supabase calls are mocked)
pytest
```

### Frontend

```bash
cd frontend

# Create frontend/.env.local with:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# NEXT_PUBLIC_API_URL=http://localhost:8000

npm install
npm run dev      # http://localhost:3000
npm run test     # Vitest
npm run typecheck
```

### Docker (backend only)

```bash
docker-compose up api
```

---

## Project structure

```
backend/
  app/
    routers/        # trips, trip_locations, itinerary_days/options/routes, locations_google
    services/       # route_calculation (segment cache logic)
    clients/        # google_places, google_routes
    models/         # Pydantic schemas
    db/             # Supabase client
    core/           # config, logging
  tests/            # pytest, fully mocked Supabase

frontend/
  src/
    app/            # Next.js App Router pages (trips, trip detail, login, auth)
    components/     # itinerary/, locations/, trips/, layout/, feedback/, ui/
    lib/            # api.ts (typed API client), supabase/ (browser/server/middleware)

docs/
  db/               # schema, RLS, migrations SQL
  migrations/       # Postgres migration scripts
  design/           # architecture and design decisions
  features/         # itinerary API spec, route calculation design
```

---

## API

All endpoints are under `/api/v1/` and require `Authorization: Bearer <supabase-jwt>` except `GET /health`.

Core resources: `trips`, `trips/{id}/locations`, `trips/{id}/days`, `trips/{id}/days/{id}/options`, `trips/{id}/days/{id}/options/{id}/locations`, `trips/{id}/days/{id}/options/{id}/routes`, `trips/{id}/itinerary`, `locations/google/preview`.

Full API reference: [`docs/api/README.md`](docs/api/README.md).

---

## Database schema

9 tables in Supabase (PostgreSQL): `trips`, `locations`, `trip_days`, `day_options`, `option_locations`, `option_routes`, `route_stops`, `route_segments`, `segment_cache`. Full schema: [`docs/db/schema.md`](docs/db/schema.md). Migrations: [`docs/migrations/`](docs/migrations/).
