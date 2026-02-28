# Changelog

All notable changes to this project are documented here.

---

## Unreleased

### Frontend
- **Location form enrichment (post–Slice 11):** Add and edit location flows include all API-supported location fields: name (required), address (optional), Google Maps link (optional), note (optional), city (optional), working hours (optional), requires booking (optional), category (optional). LocationRow displays name, address, “Open in Google Maps” link when `google_link` is set, note, city, category, requires booking (mapped to labels), and "Added by" (email resolved from `added_by_user_id`). Documented in [docs/features/location-fields-and-ui.md](features/location-fields-and-ui.md).
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
