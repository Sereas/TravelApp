# Changelog

All notable changes to this project are documented here.

---

## Unreleased

### Backend / Database
- **segment_cache (Supabase):** Added columns `input_fingerprint`, `error_type`, `error_code`, `provider_http_status`, `last_attempt_at`, `next_retry_at`, `cache_expires_at`, `retry_count`; backfilled `last_attempt_at` from `calculated_at`; normalized status `ok`→`success`, `error`→`retryable_error`; new check constraint for status; indexes on `next_retry_at` and `input_fingerprint`. Applied via Supabase MCP. Migration: `docs/migrations/002_segment_cache_retry_fingerprint.sql`.
- **Itinerary tables (Supabase):** Added `trip_days`, `day_options`, and `option_locations` with RLS (trip-owner only). Applied via Supabase MCP; added index on `option_locations(location_id)` and updated RLS policies to use `(select auth.uid())` per advisor. Documented in [docs/features/itinerary-backend.md](features/itinerary-backend.md), [docs/db/schema.md](db/schema.md), [docs/db/rls.md](db/rls.md).
- **Itinerary days API (Slice 2):** CRUD for trip days under `/api/v1/trips/{trip_id}/days`: `GET` list (ordered by sort_order), `POST` create (backend assigns sort_order append), `GET` one, `PATCH` update, `DELETE`. JWT required; 404 when trip not found or not owned. Spec: [docs/features/itinerary-api.md](features/itinerary-api.md).
- **Day options API (Slice 3):** List/create/get/update/delete/reorder under `/api/v1/trips/{trip_id}/days/{day_id}/options`. `GET` list ordered by option_index; `POST` create (no body, backend assigns option_index 1, 2, …); `PATCH .../reorder` with `option_ids`; 422 on empty/duplicate/unknown id. JWT required; 404 when trip/day/option not found or not owned. Spec: [docs/features/itinerary-api.md](features/itinerary-api.md).
- **Option-locations API (Slice 4):** List/add/update/delete/batch-add option-locations under `/api/v1/trips/{trip_id}/days/{day_id}/options/{option_id}/locations[...]`. Validates trip ownership, day in trip, option in day, and that each location belongs to the trip; enforces uniqueness of `(option_id, location_id)` with 409 conflicts; batch endpoint is all-or-nothing and preserves request order. Spec: [docs/features/itinerary-api.md](features/itinerary-api.md).
- **Day reorder & generate API (Slice 5):** `PATCH /api/v1/trips/{trip_id}/days/reorder` to set day `sort_order` from an ordered `day_ids` list (422 on empty; 404 if any id not in trip) and `POST /api/v1/trips/{trip_id}/days/generate` to create days from trip `start_date`/`end_date` (inclusive). Generate returns 400 when dates are missing/invalid and 409 when the trip already has days. Spec: [docs/features/itinerary-api.md](features/itinerary-api.md).
- **Full itinerary API (Slice 6):** `GET /api/v1/trips/{trip_id}/itinerary` returning nested days → options → locations using `ItineraryResponse`. Validates trip ownership; days ordered by sort_order, options by option_index, option-locations by sort_order; each location embeds a `LocationSummary` built from the `locations` table. Spec: [docs/features/itinerary-api.md](features/itinerary-api.md).

### Frontend
- **Slice 14:** Trip page — add day and generate days from dates. Itinerary tab: "Add day" (POST day) so a new day appears in the list; when trip has start_date and end_date and zero days, "Generate days from dates" (POST .../days/generate). After success, itinerary is refetched. 409 (trip already has days) and other errors show user feedback. "Add day" also available in the Days header when itinerary has days.
- **Slice 13:** Trip page — itinerary tab and read-only view. Tabs "Locations" | "Itinerary" with trip header above; Itinerary tab fetches `GET /api/v1/trips/{id}/itinerary` and shows days (date or "Day N") with one option per day and ordered locations (time_period + name, city). No pool section in Itinerary tab; all locations on Locations tab. Empty state: "No days yet. Add a day or generate days from your trip dates." Design: [docs/design/itinerary-tab-placement.md](design/itinerary-tab-placement.md).
- **Delete trip and delete location (beyond plan):** Delete trip and delete location UI with confirmation dialogs (ConfirmDialog component, destructive variant). Trip detail page: red "Delete trip" button; on confirm calls `api.trips.delete`, redirects to `/trips` on success, shows error banner on failure. Each location card: red "Delete" button; on confirm calls `api.locations.delete`, removes card from list on success, shows error banner on failure. Backend DELETE endpoints pre-existed. Documented in [docs/features/delete-trip-and-location.md](features/delete-trip-and-location.md).
- **Location form enrichment (post–Slice 11):** Add and edit location flows include all API-supported location fields: name (required), address (optional), Google Maps link (optional), note (optional), city (optional), working hours (optional), requires booking (optional), category (optional). Trip detail page uses **LocationCard** (not LocationRow): category icon and pill badge, booking badges (Booking needed / Booked ✓), inline metadata (city, address, hours, Maps link), compact note and added-by email; condensed layout. Trip detail also has category filter chips with counts (when 2+ categories), "Group by city" toggle (when 2+ cities), and 2-column responsive grid for location cards; location form inputs use `autoComplete="off"`. LocationRow remains available for backwards compatibility but is not used on trip detail. Documented in [docs/features/location-fields-and-ui.md](features/location-fields-and-ui.md).
- **Slice 11:** Trip page — edit trip details and add/edit location.
- **Slice 10:** Trip page — view trip details and locations list (`/trips/[id]`).
- **Slice 9:** Home page — create trip (CreateTripDialog).
- **Slice 8:** Home page — trips list and empty state (`/trips`).
- **Slice 7:** API client with JWT forwarding (`lib/api.ts`).
- **Slice 6:** Protected routes and session handling (middleware).
- **Slice 5:** Landing page and Supabase Auth (login, Google, password reset).
- **Slice 3:** Reusable UI components (button, input, trip card, location row, empty state).
- **Slice 2:** Design tokens and layout shell (PageShell, SiteHeader, CSS variables).
- **Slice 1:** Next.js scaffold and tooling (ESLint, Prettier, Vitest).
