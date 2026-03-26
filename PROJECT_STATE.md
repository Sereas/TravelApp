# Project State Analysis

> Generated 2026-03-26 from branch `cursor/project-state-analysis-4003` (89 commits ahead of `main`)

## Health Summary

| Check | Result |
|-------|--------|
| `ruff check .` | ✅ All checks passed |
| `ruff format --check .` | ✅ 66 files formatted |
| `pytest -v` | ✅ 203 passed, 2 skipped, 7 deselected (live tests), 45 warnings |
| `npm run typecheck` | ✅ Clean |
| `npm run lint` | ✅ Passed (4 `<img>` → `next/image` warnings — non-blocking) |
| `npm run test` (Vitest) | ✅ 219 passed across 25 test files |
| `npm run build` | ✅ Production build successful |

**All four CI gates pass locally** (lint, test, frontend-lint, frontend-test).

---

## Codebase Overview

**Stack:** FastAPI 0.135 (Python 3.12) + Next.js 14.2 (React 18, TypeScript) + Supabase (PostgreSQL)

| Metric | Count |
|--------|-------|
| Python files (backend + tests + scripts) | 66 |
| TypeScript/TSX files (frontend) | 94 |
| Backend test cases | 203 |
| Frontend test cases | 219 |
| SQL migrations | 16 |
| Backend routers | 11 |
| Frontend routes/pages | 8 |

### Key File Sizes (lines)

| File | Lines | Role |
|------|-------|------|
| `frontend/src/app/trips/[id]/page.tsx` | 1,032 | Main trip detail page |
| `frontend/src/features/itinerary/useItineraryState.ts` | 878 | Central itinerary state hook |
| `frontend/src/components/itinerary/ItineraryDayCard.tsx` | 868 | Day card component |
| `backend/app/services/route_calculation.py` | 721 | Route calculation service |
| `frontend/src/lib/api.ts` | 713 | Typed API client |
| `backend/app/models/schemas.py` | 620 | All Pydantic models |

---

## Branch Diff from `main`

**89 commits, 161 files changed, +26,069 / −2,467 lines**

### Commit Breakdown

| Type | Count |
|------|-------|
| `feat` (features) | 31 |
| `fix` (bug fixes) | 21 |
| `style` / `chore` / `refactor` / `test` / `perf` | 23 |
| Merge / other | 14 |

### Major Features Introduced (since `main`)

1. **Itinerary System** — Full hierarchical itinerary (Trip → Days → Options → Locations → Routes → Segments) with drag-and-drop reorder, time-of-day assignment, plan/alternative management, and lazy route calculation
2. **Route Calculation** — Google Routes API integration with segment caching, polyline rendering on maps, and retry-on-view pattern
3. **Itinerary UI Redesign** — Timeline layout, travel journal aesthetic, CSS design tokens, plan switcher dropdown, day rail, inspector panel
4. **Place Photos** — Google photo caching, user uploads, attribution compliance
5. **Trip Sharing** — Public read-only access via share tokens
6. **Google Places Integration** — Preview flow for adding locations from Google Places
7. **Location Enhancements** — Categories, city filter, delete cascade, duplicate prevention by `google_place_id`
8. **DB Performance Overhaul** — N+1 elimination, ownership chain verification in single round-trip, batch RPCs (`unnest()`), index additions
9. **Design System** — Brand palette, serif headings, CSS variable tokens, sticky tabs/sidebar
10. **Route Creation UX** — Connector lines, pick mode dimming, compact toolbar

### Database Changes (16 migrations)

- Performance RPCs: `get_itinerary_tree`, `reorder_option_locations`, `batch_insert_option_locations`, resource chain helpers
- Route system: `option_routes`, `route_stops`, `route_segments`, `segment_cache` tables
- Day management: date reconciliation, reassign main option, smart cleanup RPCs
- Place photos: `place_photos` table with RLS, `user_image_url` column, attribution in itinerary tree
- Schema fixes: indexes, email denormalization, polyline storage

---

## Architecture Highlights

### Backend (11 routers)

| Router | Endpoints |
|--------|-----------|
| `trips.py` | CRUD for trips |
| `trip_locations.py` | Location CRUD with batch operations |
| `itinerary_tree.py` | Full itinerary tree fetch (single RPC) |
| `itinerary_days.py` | Day CRUD, reorder, date generation |
| `itinerary_options.py` | Alternative plan management |
| `itinerary_option_locations.py` | Location ↔ option assignment, reorder, time periods |
| `itinerary_routes.py` | Route CRUD with segment calculation |
| `locations_google.py` | Google Places preview/search |
| `shared_trips.py` | Public sharing via tokens |
| `trip_ownership.py` | Ownership verification helpers |
| `infra.py` | Health check |

### Frontend Component Tree

```
app/
├── page.tsx (landing)
├── login/ (auth)
├── trips/ (list + detail)
│   └── [id]/page.tsx
│       ├── Locations tab (LocationCard, AddLocationForm, EditLocationRow)
│       └── Itinerary tab (ItineraryTab)
│           ├── useItineraryState (central state hook)
│           ├── ItineraryDayCard
│           │   ├── ItineraryDayHeader
│           │   ├── ItineraryDayTimeline / ItineraryDayRail
│           │   ├── ItineraryLocationRow
│           │   ├── ItineraryRouteManager
│           │   └── ItineraryDayMap
│           ├── ItineraryPlanSwitcher
│           ├── ItineraryInspectorPanel
│           └── UnscheduledLocationsPanel
└── shared/[token]/ (read-only view)
```

---

## Warnings & Technical Debt

### Non-Blocking Warnings

1. **4 ESLint `@next/next/no-img-element` warnings** — `ItineraryLocationRow`, `LocationCard`, `PhotoUploadDialog`, `TripCard` use `<img>` instead of `next/image`
2. **45 pytest warnings** — FastAPI `HTTP_422_UNPROCESSABLE_ENTITY` deprecation (upstream) and PyJWT short HMAC key warnings (test-only)
3. **React `act()` warnings in tests** — `TripDetailPage` and `PhotoUploadDialog` tests have async state update warnings
4. **Vite CJS deprecation notice** — Vitest using deprecated CJS Node API

### Potential Concerns

1. **Large single-file components** — `trips/[id]/page.tsx` (1,032 lines) and `useItineraryState.ts` (878 lines) are substantial; further decomposition may help maintainability
2. **89 unmerged commits** — Large diff from `main`; may benefit from squash-merge or chunked PRs
3. **`.env` in repo** — Root `.env` file appears in the working tree (should be in `.gitignore` for production use)
4. **No e2e test coverage in CI** — Playwright tests exist but are not in the CI pipeline (only unit/integration tests run)

---

## CI Pipeline

4 jobs defined in `.github/workflows/ci.yml`:

1. **lint** — `ruff check` + `ruff format --check`
2. **test** — `pytest -v` (skips `live`-marked tests)
3. **frontend-lint** — `tsc --noEmit` + `next lint` + `prettier --check`
4. **frontend-test** — `vitest run`

All triggered on `push` to `main` and all `pull_request` targeting `main`.
