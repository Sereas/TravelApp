# Backend backlog

## BACK-001 — Review and improve backend logging (Render deployment)

- **Status:** done
- **Area:** back
- **Type:** improvement
- **Priority:** medium
- **Created:** 2026-03-30
- **Completed:** 2026-03-31

### Request
Audit the current backend logging, research best practices for a FastAPI + Render stack, and implement structured, verbose, storable logging. This is the foundation for a future log dashboard and failure alerting system.

### Current behavior
Basic logging exists (e.g. `RequestLoggingMiddleware` for request timing) but it is not verbose, not structured, and hard to find/search. Logs go to stdout on Render with no structured format, no correlation IDs, and limited context on errors or slow operations.

### Expected behavior
1. **Audit phase:** Document what is currently logged, where, and at what level. Identify gaps (unlogged errors, missing context, silent failures).
2. **Research phase:** Recommend a logging strategy for FastAPI on Render — structured JSON logging, log levels, correlation/request IDs, error context. Evaluate whether Render's built-in log drain is sufficient or if a log aggregator (e.g. Datadog, Betterstack, Axiom) should be added.
3. **Implementation phase:**
   - Structured JSON log format (timestamp, level, request_id, user_id, endpoint, duration, error details)
   - Consistent log levels: DEBUG for dev, INFO for request lifecycle, WARNING for degraded paths, ERROR for failures
   - Request correlation ID propagated through all log entries
   - Error logging with stack traces and request context
   - Key operation logging: DB queries (count + duration), external API calls (Google Places/Routes), auth failures
4. **Storable:** Logs should be in a format compatible with log drain / aggregator ingestion (JSON lines).

### Scope
- Backend Python code only (FastAPI app on Render)
- Logging configuration, middleware, and per-module logger setup
- Research + recommendation for log storage/dashboard (not implementation of the dashboard itself)

### Non-goals
- Implementing the log dashboard or alerting system (that's the follow-up)
- Frontend logging (separate item: FRONT-005)
- Changing application behavior or APIs

### Artifacts
- None

### References
- `backend/app/main.py` — FastAPI app with `RequestLoggingMiddleware`
- `backend/app/core/config.py` — settings
- `backend/app/dependencies.py` — auth dependency (potential auth failure logging)
- `backend/app/clients/` — Google API clients (external call logging)
- Render deployment docs for log drains
- See also: FRONT-005 for frontend companion item

### Acceptance criteria
- Documented audit of current logging state (what's logged, what's missing)
- Written recommendation for logging stack (format, aggregator, dashboard tool)
- All request/response cycles produce structured JSON log entries with request_id, user_id, endpoint, status, duration
- All unhandled exceptions log full stack trace with request context
- External API calls (Google Places, Routes) log call duration and success/failure
- Auth failures log the failure reason (expired token, invalid signature, etc.)
- Log output is JSON lines format, compatible with log drain ingestion

### Implementation notes
- **Audit:** Documented all existing logging across 15+ files. Found structlog already configured with JSON/console output, request middleware with correlation IDs, and auth failure logging.
- **Gaps fixed:**
  1. `user_id` now bound to structlog contextvars in auth dependency — all subsequent logs in a request include user context
  2. `format_exc_info` processor added to `core/logging.py` — stack traces render properly in JSON output
  3. Google Places client: added `structlog` logger with duration/success/failure logging on `resolve_from_link`, `_search_place_by_text`, `_search_place_nearby`
  4. Google Routes client: added `structlog` logger with duration/success/failure logging on `compute_leg`
  5. `place_photos.py`: converted from stdlib `logging` to `structlog` for consistency
  6. Startup config summary log in lifespan: logs which features are enabled (Supabase, Google Places, Google Routes, JWT, CORS origins)
  7. Request middleware: added `query` parameter to all request logs for debugging
- **Architect review follow-ups (implemented):**
  8. Ownership checks (`_ensure_trip_owned`, `_ensure_resource_chain`) now log `ownership_denied` with reason before raising 404
  9. `error_category` field added to ALL warning/error log events (`auth`, `external_api`, `db`, `internal`) — enables single alerting rules
  10. Instrumented Supabase client (`InstrumentedClient` in `db/supabase.py`) logs every `.execute()` at DEBUG level with table, operation, duration_ms, rows
  11. `get_route_with_fresh_segments` entry/exit logging with segment count, success count, duration
  12. Health check paths (`/health`, `/healthz`) logged at DEBUG to reduce noise
  13. `GooglePlacesDisabledError` 503 handler now logs the request
  14. Startup log includes `log_level` and `log_format` for config verification
- **Monitoring setup guide:** `backend/docs/logging-setup.md` — Betterstack setup (Render log drain), first dashboards, first alerts, cost guidance, log event reference
- **Files changed:** `core/logging.py`, `middleware.py`, `dependencies.py`, `main.py`, `db/supabase.py`, `clients/google_places.py`, `clients/google_routes.py`, `clients/google_list_scraper.py`, `services/place_photos.py`, `services/route_calculation.py`, `routers/trip_ownership.py`, `routers/trip_locations.py`, `routers/itinerary_days.py`, `routers/itinerary_options.py`, `routers/itinerary_option_locations.py`, `routers/itinerary_routes.py`, `routers/locations_google.py`, `tests/test_auth_jwt.py`, `backend/docs/logging-setup.md`
- **Validation:** ruff check + ruff format pass, 213/213 tests pass

## BACK-002 — Fix SSRF via Playwright page.goto() in Google list import

- **Status:** todo
- **Area:** back
- **Type:** bugfix
- **Priority:** critical
- **Created:** 2026-03-30

### Request
The Google list import endpoint passes a user-supplied URL directly to Playwright's `page.goto()` with no scheme or host validation. Any authenticated user can make the server's headless Chromium navigate to arbitrary URLs including internal network addresses, cloud metadata endpoints, and `file://` paths. Add server-side URL allowlist validation.

### Current behavior
`GoogleListScraper.extract_places()` calls `page.goto(list_url)` with the raw user input. The `ImportGoogleListBody` Pydantic model only enforces `min_length=1` — no scheme check, no hostname allowlist. An authenticated user can send any URL (e.g. `http://169.254.169.254/latest/meta-data/`, `file:///etc/passwd`, internal network IPs) and the server's Chromium will navigate to it.

### Expected behavior
Before any HTTP request or browser navigation, the URL must be validated:
1. Scheme must be `https://` only (reject `http://`, `file://`, `ftp://`, etc.)
2. Hostname must match an allowlist: `maps.app.goo.gl`, `goo.gl`, `www.google.com`, `maps.google.com`, `google.com`
3. Validation must reject all other URLs with a clear 422 error

### Scope
- URL validation on the `import-google-list` endpoint input
- Can be implemented as a Pydantic `field_validator` on `ImportGoogleListBody` and/or at the top of `GoogleListScraper.extract_places()`
- Both layers preferred (defense in depth)

### Non-goals
- Changing the Playwright scraping logic itself
- Modifying other endpoints

### Artifacts
- None

### References
- `backend/app/clients/google_list_scraper.py:91` — `page.goto(list_url)` with no validation
- `backend/app/models/schemas.py:629` — `ImportGoogleListBody` with only `min_length=1`
- `backend/app/routers/trip_locations.py:404` — endpoint passes URL straight through
- Identified by security review on 2026-03-30 (HIGH severity, SSRF)

### Acceptance criteria
- URLs with non-`https` schemes are rejected with 422
- URLs with hostnames not in the Google Maps allowlist are rejected with 422
- Valid Google Maps list URLs (`maps.app.goo.gl/...`, `www.google.com/maps/...`) continue to work
- Unit tests cover both valid and rejected URL patterns
- No way to bypass the validation via URL encoding, redirects, or other techniques

### Implementation notes
- None yet.

## BACK-003 — Add progress streaming to Google list import endpoint

- **Status:** todo
- **Area:** back
- **Type:** improvement
- **Priority:** medium
- **Created:** 2026-03-31

### Request
The Google list import endpoint currently processes all places synchronously and returns a single response at the end. For large lists (20-60+ places), the user sees no progress for a long time. Add a streaming response mechanism so the frontend can show real-time progress.

### Current behavior
`POST /{trip_id}/locations/import-google-list` processes all scraped places in a loop (scrape → enrich via Places API → deduplicate → batch insert) and returns a single JSON response when everything is done. No intermediate progress is communicated to the client.

### Expected behavior
The endpoint should communicate progress to the frontend during processing. Two approaches to evaluate:
1. **SSE (Server-Sent Events):** Convert the endpoint to stream progress events (e.g. `{"phase": "enriching", "current": 5, "total": 28}`) as each place is processed, with a final event containing the full result.
2. **Polling:** Return a job ID immediately, process in the background, and expose a `GET` endpoint for polling progress.

SSE is preferred for simplicity if FastAPI's `StreamingResponse` works well with the current deployment (Render).

Progress events should include:
- Phase: `scraping` | `enriching` | `inserting`
- `current`: number of items processed so far
- `total`: total number of items (known after scraping phase)
- `percent`: integer 0-100

### Scope
- `import-google-list` endpoint response mechanism
- New progress event schema
- Compatible with Render deployment

### Non-goals
- Changing the scraping or enrichment logic itself
- Frontend display (see FRONT-008)

### Artifacts
- None

### References
- `backend/app/routers/trip_locations.py:374-522` — current import endpoint
- `backend/app/clients/google_list_scraper.py` — scraper (scraping phase)
- `backend/app/clients/google_places.py` — Places API enrichment (enriching phase)
- See also: FRONT-008 for frontend companion item

### Acceptance criteria
- Progress events are streamed to the client as each place is processed
- Events include phase, current count, total count, and percentage
- Final event contains the full import result (imported/existing/failed counts and details)
- Endpoint remains backward-compatible or the frontend is updated in tandem
- Works correctly on Render deployment

### Implementation notes
- None yet.

## BACK-004 — Return richer details for failed items in Google list import

- **Status:** todo
- **Area:** back
- **Type:** improvement
- **Priority:** medium
- **Created:** 2026-03-31

### Request
When a place fails during Google list import, the response currently only includes the scraped name (often in a foreign script) and a generic error message. Return additional identifying details so the user can find and manually add the failed places.

### Current behavior
Failed items in `ImportedLocationSummary` include:
- `name`: the scraped name (often non-Latin script like Arabic/Russian, unrecognizable)
- `detail`: generic "Google Places enrichment failed: Places search returned no candidates"

The user cannot identify which real-world places these correspond to or find them to add manually.

### Expected behavior
For failed items, include additional context in the response:
1. **`latitude` / `longitude`**: The coordinates extracted by the scraper (always available). This lets the user look up the location on a map.
2. **`google_maps_url`**: Construct a Google Maps URL from the coordinates (e.g. `https://www.google.com/maps/@{lat},{lng},17z`) so the user can click through to identify the place.
3. **`original_name`**: The raw scraped name (keep as-is for reference).
4. **`failure_reason`**: A user-friendly message (e.g. "Could not find this place in Google Places" instead of raw exception text).

### Scope
- `ImportedLocationSummary` schema — add optional `latitude`, `longitude`, `google_maps_url` fields
- `import_google_list` endpoint — populate these fields for failed items from the scraped coordinates
- Sanitize the `detail` field to be user-friendly (no raw exception messages)

### Non-goals
- Automatically retrying failed items
- Frontend display changes (see FRONT-009)

### Artifacts
- None

### References
- `backend/app/models/schemas.py` — `ImportedLocationSummary` schema
- `backend/app/routers/trip_locations.py:444-451` — failed item handling in import loop
- `backend/app/clients/google_list_scraper.py` — `ScrapedPlace` provides lat/lng
- See also: FRONT-009 for frontend companion item

### Acceptance criteria
- Failed items include `latitude`, `longitude`, and `google_maps_url` in the response
- `detail` field contains a user-friendly message, not raw exception text
- `google_maps_url` is a clickable Google Maps link centered on the place coordinates
- Existing fields (`name`, `status`) are preserved

### Implementation notes
- None yet.

## BACK-005 — Expose `_search_place_by_text` as public method on GooglePlacesClient

- **Status:** todo
- **Area:** back
- **Type:** improvement
- **Priority:** low
- **Created:** 2026-03-31

### Request
The `import_google_list` endpoint in `trip_locations.py` calls `client._search_place_by_text()` directly — a private method (underscore-prefixed) of `GooglePlacesClient`. This couples the router to the internal API of the client. Expose a public method instead.

### Current behavior
`backend/app/routers/trip_locations.py` (~line 442) calls `client._search_place_by_text(name, latitude=lat, longitude=lng, radius_m=500.0)` which is a private method. This works but violates encapsulation and makes the client's internal API a de-facto public contract.

### Expected behavior
Add a public method on `GooglePlacesClient` (e.g. `search_by_text()` or `resolve_by_name()`) that wraps the same logic. Update the call site in `trip_locations.py` to use the public method. The private `_search_place_by_text` should remain private.

### Scope
- `backend/app/clients/google_places.py` — add public method
- `backend/app/routers/trip_locations.py` — update call site

### Non-goals
- Changing the search logic itself
- Modifying other endpoints

### Artifacts
- None

### References
- `backend/app/clients/google_places.py` — `_search_place_by_text()` private method
- `backend/app/routers/trip_locations.py:~442` — direct private method call
- Identified by code-reviewer during refactoring session on 2026-03-31

### Acceptance criteria
- A public method exists on `GooglePlacesClient` for text-based place search
- `trip_locations.py` uses the public method instead of the private one
- No behavioral change to the import flow
- Tests pass

### Implementation notes
- None yet.