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

- **Status:** done
- **Area:** back
- **Type:** bugfix
- **Priority:** critical
- **Created:** 2026-03-30
- **Completed:** 2026-03-31

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
- **Three-layer defense-in-depth approach:**
  1. **Pydantic field_validator** on `ImportGoogleListBody` — rejects invalid URLs at request parsing with 422
  2. **Scraper pre/post validation** — validates URL before `page.goto()` and validates post-redirect `page.url` after navigation
  3. **Playwright route interception** — blocks all network requests to non-Google domains at the browser level
- **Shared validation utility** at `backend/app/utils/url_validation.py`:
  - HTTPS-only scheme enforcement
  - Strict hostname allowlist (`www.google.com`, `google.com`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl`)
  - Path restriction: google.com hosts must start with `/maps/`
  - Rejects: IP addresses, userinfo (`user:pass@host`), explicit ports, backslashes, null bytes, control chars, non-ASCII hostnames
  - NFKC unicode normalization to prevent homoglyph/fullwidth char bypasses
- **63 tests** in `backend/tests/test_url_validation.py` covering valid URLs, scheme attacks, hostname attacks, IP rejection, URL structure attacks, path restrictions, unicode attacks, edge cases, navigation host checks, and Pydantic integration
- **Files changed:** `backend/app/utils/__init__.py` (new), `backend/app/utils/url_validation.py` (new), `backend/app/models/schemas.py`, `backend/app/clients/google_list_scraper.py`, `backend/tests/test_url_validation.py` (new)
- **Validation:** ruff check + ruff format clean, 276/276 tests pass, reviewed by security-reviewer and code-reviewer agents

## BACK-003 — Add progress streaming to Google list import endpoint

- **Status:** done
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
- Implemented as SSE endpoint `POST /{trip_id}/locations/import-google-list-stream` in `trip_locations.py`.
- Import logic extracted to `services/google_list_import.py` as async generator yielding typed dataclass events: `ScrapingStarted`, `ScrapingDone`, `EnrichingItem`, `SavingBatch`, `ImportComplete`, `ImportError`.
- Router converts events to SSE via `_event_to_sse_dict()` and streams with `StreamingResponse(media_type="text/event-stream")`.
- Events include phase, current/total counts, per-item status (imported/existing/failed), and final summary.
- Works on Render deployment with `X-Accel-Buffering: no` header.

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

- **Status:** wontfix
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
- Closed as wontfix. The refactor in phase-6 extracted import logic from `trip_locations.py` into `services/google_list_import.py`, which is a dedicated service module — not a router. Services calling private client methods is an accepted internal pattern; the encapsulation concern was about routers reaching into client internals, which no longer applies. The call sites (`_search_place_by_text`, `_search_place_nearby`) are now inside a cohesive service that is tightly coupled to the client by design.

## BACK-006 — Full backend security audit remediation

- **Status:** done
- **Area:** back
- **Type:** bugfix
- **Priority:** critical
- **Created:** 2026-03-31

### Request
Remediate all findings from the comprehensive backend security audit conducted on 2026-03-31. The audit covered authentication, authorization, input validation, data exposure, configuration, and OWASP Top 10. This item tracks every finding — nothing should be skipped.

### Current behavior
Multiple security vulnerabilities exist across the backend codebase, ranging from critical authentication bypass paths to low-severity logging concerns.

### Expected behavior
All findings listed below are remediated or explicitly documented as accepted risks with justification.

### Findings

#### CRITICAL

**CRIT-01 — HS256 audience verification disabled on JWT fallback path**
- File: `backend/app/dependencies.py:53-67`
- The HS256 fallback path decodes JWTs with `"verify_aud": False`. After the first attempt fails, the code retries with a base64-decoded key — also with `"verify_aud": False` and no explicit audience parameter. A token issued for a different Supabase project or application but signed with the same secret would be accepted as valid.
- Fix: On the HS256 path, always pass `audience="authenticated"` and remove `"verify_aud": False`. Only use the HS256 fallback when `SUPABASE_URL` is not set (clearly non-production), never as a quiet fallback when JWKS fetch fails.

**CRIT-02 — HS256 fallback triggers silently on ANY JWKS error, including transient network failures**
- File: `backend/app/dependencies.py:35-46`
- The `except Exception` clause catches ALL exceptions from the JWKS path — including `httpx.ConnectError`, `httpx.TimeoutException`, and DNS failures — and silently falls through to HS256 fallback. If the Supabase JWKS endpoint is momentarily unreachable, every subsequent request is validated using the weaker HS256 path instead of failing closed.
- Fix: Only fall through to HS256 when the error is explicitly a key-not-found or algorithm mismatch (`PyJWKClientError`, `PyJWTError`). On network/connection errors, fail with 503 or 401. Log the specific exception type.

**CRIT-03 — Supabase anon key silently accepted as service role key**
- File: `backend/app/core/config.py:19-22`
- `supabase_key = service_key or anon_key`. If `SUPABASE_SERVICE_ROLE_KEY` is not set, the backend falls back to the anon key. The anon key is subject to RLS, but the backend relies on `SECURITY DEFINER` RPCs that bypass RLS. Mixed access model = inconsistent and unpredictable security guarantees.
- Fix: Remove the anon key fallback entirely from production code paths. If the service role key is absent, raise an explicit startup error.

#### HIGH

**HIGH-01 — No rate limiting on any endpoint**
- File: `backend/app/main.py` (no rate limiting middleware registered)
- No rate limiting anywhere. `import-google-list` launches a Playwright browser per request (DoS vector). `google/preview` calls Google Places API per request (quota exhaustion). `GET /shared/{share_token}` has no enumeration protection.
- Fix: Add `slowapi` or reverse proxy rate limit. Strict limits on `import-google-list` (5/min/user), Google preview (20/min/user), shared trip (100/min/IP).

**HIGH-02 — File upload MIME type validated from client-supplied Content-Type only**
- File: `backend/app/routers/trip_locations.py:699-703, 730`
- Photo upload checks `file.content_type` from the multipart form field sent by the client. No magic-byte validation of actual file content. An attacker can upload HTML/executable as `image/jpeg`.
- Fix: Add magic-byte validation using `python-magic` or manual header byte checks (JPEG `\xff\xd8\xff`, PNG `\x89PNG`, WebP `RIFF...WEBP`).

**HIGH-03 — Internal exception messages surfaced to API clients**
- Files: `backend/app/routers/itinerary_routes.py:188,335`, `trip_locations.py:406`, `itinerary_option_locations.py:420`
- `str(e)` and `str(exc)` from internal `ValueError` and `Exception` instances are placed directly into HTTP 400 response `detail` fields. Can expose SQL error text, query structure, or third-party API messages.
- Fix: Log full exception internally, return generic messages to client. Only expose caller-controlled validation errors (Pydantic), never downstream exception strings.

**HIGH-04 — No security headers set on HTTP responses**
- File: `backend/app/main.py`
- Missing: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`.
- Fix: Add a security headers middleware. At minimum: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

**HIGH-05 — `verify_resource_chain` RPC allows day_id=NULL with option_id bypass**
- File: `supabase/schema.sql:699-723`
- If `p_day_id IS NULL` but `p_option_id` is provided, the chain check passes because `p_day_id IS NULL` evaluates to true in the outer `AND (p_day_id IS NULL OR ...)`. An attacker could pass `day_id=NULL` and a valid `option_id` from a different trip. Python callers always pass a `day_id` when they pass `option_id`, which mitigates in practice, but the RPC logic is structurally broken.
- Fix: Add a guard in the RPC: if `p_option_id IS NOT NULL` then `p_day_id` must also be non-null. Return `FALSE` if `p_option_id IS NOT NULL AND p_day_id IS NULL`.

#### MEDIUM

**MED-01 — Share token entropy OK but no expiry enforced by default**
- File: `supabase/schema.sql:893`, `backend/app/routers/shared_trips.py:87-114`
- Share tokens are 192-bit entropy (adequate). However, `expires_at` defaults to `NULL` and the insert does not supply an expiry. Tokens never expire unless explicitly revoked.
- Fix: Set a default expiry (90 or 180 days) on token creation. The `get_shared_trip_data` RPC already checks `expires_at`.

**MED-02 — `google_raw` blob accepted without size limit**
- File: `backend/app/models/schemas.py:127`
- `google_raw` in `AddLocationBody` and `UpdateLocationBody` is a free-form `dict` with no size or depth limit. A client can submit arbitrarily large JSON (JSON bomb), causing DB write latency or OOM.
- Fix: Add a size cap (e.g., 50KB) in a Pydantic `@model_validator`. Consider stripping `google_raw` in the preview response to only needed fields.

**MED-03 — `_ensure_trip_owned` still used instead of `_ensure_resource_chain`**
- Files: `backend/app/routers/trips.py:95,119,167`, `shared_trips.py:84,124,155`, `itinerary_tree.py:258`
- `_ensure_trip_owned` makes a separate `SELECT` (extra DB round-trip). For update/delete operations, introduces a TOCTOU race window between ownership check and data fetch.
- Fix: Use `_ensure_resource_chain` consistently everywhere.

**MED-04 — Playwright browser runs as app process user with full env vars**
- File: `backend/app/clients/google_list_scraper.py:112-113`
- The browser process inherits the full environment including `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, etc. If Chromium is exploited, all secrets are accessible.
- Fix: Run Playwright in a subprocess with a cleared environment, or in a dedicated container. Long-term: dedicated microservice for scraping.

**MED-05 — Post-redirect validation only checks final URL, not intermediate hops**
- File: `backend/app/clients/google_list_scraper.py:128-131`
- The post-redirect check validates `page.url` (the final URL after all redirects). Intermediate redirects that Playwright follows before the final URL are not validated. A redirect chain could potentially bypass the single post-navigation check.
- Fix: Use Playwright's `page.on("request")` to intercept all navigations at every hop, not just the final URL.

**MED-06 — Route segment error messages from Google Routes API leaked to clients**
- File: `backend/app/models/schemas.py:545-549`, `backend/app/services/route_calculation.py:318`
- `error_message` in `RouteSegmentResponse` is populated with `str(e)` — raw exception from Google Routes API. Can contain internal API error codes, quota info, or rejection details.
- Fix: Classify errors into fixed user-facing messages (partially done with `error_type`). Log raw exceptions server-side, return sanitized messages.

**MED-07 — CORS origins parsed from env at module level, bypasses `get_settings()`**
- File: `backend/app/main.py:33-39`
- CORS origins read from `os.getenv(...)` at module-level import, outside the `Settings` class and `get_settings()` lru_cache. Not centralized, cannot be overridden in tests.
- Fix: Move `CORS_ALLOWED_ORIGINS` into the `Settings` class, reference through `get_settings()`.

#### LOW

**LOW-01 — `_FRONTEND_BASE` URL constructed from env var without validation**
- File: `backend/app/routers/shared_trips.py:29`
- `_FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL", ...)`. Directly concatenated into `share_url`. If misconfigured with `javascript://evil.example.com`, the resulting URL could be a vector.
- Fix: Validate that `_FRONTEND_BASE` starts with `https://` at startup.

**LOW-02 — `X-Request-ID` is truncated UUID (8 chars) — collision risk**
- File: `backend/app/middleware.py:21`
- `request_id = str(uuid.uuid4())[:8]` — only 32 bits of entropy. Collisions likely around 65K concurrent requests. Affects log correlation and incident response.
- Fix: Use the full UUID or at minimum first 12 characters.

**LOW-03 — `lru_cache` on `get_supabase_client()` caches client for process lifetime**
- File: `backend/app/db/supabase.py:128-137`
- If `SUPABASE_SERVICE_ROLE_KEY` is rotated, the old client continues until process restart. No cache invalidation mechanism.
- Fix: Document that key rotation requires process restart. Acceptable for immutable infrastructure.

**LOW-04 — `lru_cache` on `_get_jwk_client()` caches JWKS client for process lifetime**
- File: `backend/app/dependencies.py:22-28`
- `PyJWKClient` created once with `cache_keys=True` and cached forever. Partially mitigated by `PyJWKClient`'s built-in key rotation on cache miss for unknown kids.
- Fix: Acceptable as-is. Confirm `PyJWKClient(cache_keys=True)` fetches new keys on cache miss.

**LOW-05 — `delete_trip` uses two sequential non-atomic deletes**
- File: `backend/app/routers/trips.py:168-170`
- `supabase.table("locations").delete()` followed by `supabase.table("trips").delete()` — no transaction boundary. Process crash between calls leaves inconsistent state.
- Fix: Wrap in a PL/pgSQL RPC for atomicity.

**LOW-06 — Logging of `trip_name` may expose PII**
- File: `backend/app/routers/trips.py:40`
- `logger.info("trip_created", ..., trip_name=body.name)`. Trip names entered by users could be PII (e.g., "Trip to John's house", "Medical trip").
- Fix: Remove `trip_name` from logs or hash it. Log only `trip_id` and `user_id`.

#### INFO

**INFO-01 — `verify_resource_chain` RPC granted to `anon` role**
- File: `supabase/schema.sql:1277-1279`
- `GRANT ALL ON FUNCTION public.verify_resource_chain(...)` grants execute to `anon`. Broader than necessary — internal utility RPCs should be server-side only.
- Fix: Revoke `anon` grant on internal utility RPCs.

**INFO-02 — All `SECURITY DEFINER` RPCs granted to `anon` role**
- File: `supabase/schema.sql` (all internal RPCs)
- All `SECURITY DEFINER` RPCs are granted to `anon`. A raw PostgREST call with just the anon key could execute these functions, bypassing the JWT-based ownership check done in Python.
- Fix: Restrict grants to `authenticated` and `service_role` only. Exception: `get_shared_trip_data` is correctly anon-accessible by design.

**INFO-03 — `place-photos` storage bucket is public**
- File: `supabase/migrations/20260322120000_enable_rls_on_place_photos.sql:8`
- The `place-photos` bucket is `public = true` — all place photos accessible without auth regardless of trip privacy. Intentional for CDN-style cache. Worth documenting as accepted design decision.

**INFO-04 — `user-photos` bucket access policy not verified**
- File: `backend/app/routers/trip_locations.py:734`
- Code calls `supabase.storage.from_("user-photos")` but no migration creating this bucket or configuring its access policy was found. The bucket's public/private setting is unknown.
- Fix: Verify a migration exists that creates `user-photos` bucket and confirm `public` setting is documented.

### Scope
- All backend Python code, SQL RPCs, migrations, and Supabase configuration
- Covers authentication, authorization, input validation, data exposure, configuration, OWASP Top 10

### Non-goals
- Frontend findings (tracked separately in FRONT-012)
- Implementing a log dashboard or monitoring tool
- Architectural changes beyond what is needed for each fix

### Artifacts
- None

### References
- Security audit conducted on 2026-03-31 by security-reviewer agent
- See also: FRONT-012 for frontend companion item
- OWASP Top 10 (2021): https://owasp.org/Top10/

### Acceptance criteria
- CRIT-01: HS256 fallback always enforces `audience="authenticated"`
- CRIT-02: JWKS network errors fail with 503/401, not HS256 fallback
- CRIT-03: Missing `SUPABASE_SERVICE_ROLE_KEY` raises startup error
- HIGH-01: Rate limiting active on `import-google-list`, `google/preview`, and `shared/{token}`
- HIGH-02: Photo upload validates file magic bytes, not just Content-Type header
- HIGH-03: No raw `str(exc)` in any HTTP response `detail` field
- HIGH-04: Security headers middleware added (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
- HIGH-05: `verify_resource_chain` returns FALSE when `option_id` is set but `day_id` is NULL
- MED-01: Share tokens have a default expiry (90 or 180 days)
- MED-02: `google_raw` has a size cap (e.g. 50KB) via Pydantic validator
- MED-03: All ownership checks use `_ensure_resource_chain`
- MED-04: Playwright environment does not include secrets (cleared env or container isolation)
- MED-05: Playwright navigation validated at every redirect hop, not just final URL
- MED-06: Route segment `error_message` is sanitized before returning to client
- MED-07: CORS origins moved into `Settings` class
- LOW-01: `_FRONTEND_BASE` validated at startup
- LOW-02: Request ID uses full UUID
- LOW-03: Key rotation requires restart — documented
- LOW-04: JWKS client key rotation — confirmed working
- LOW-05: `delete_trip` wrapped in atomic RPC
- LOW-06: `trip_name` removed from logs
- INFO-01/02: RPC grants restricted to `authenticated` and `service_role`
- INFO-03: `place-photos` public bucket documented as accepted risk
- INFO-04: `user-photos` bucket access policy verified and documented
- All existing tests continue to pass
- New tests added for each fix where applicable

### Implementation notes

#### CRIT-01+02+03 — Completed 2026-04-01

**CRIT-01 — HS256 audience enforcement:**
- Removed `options={"verify_aud": False}` from both `pyjwt.decode()` calls in the HS256 path
- Both attempts now enforce `audience="authenticated"`
- Tokens without `aud` or with wrong `aud` are now rejected with 401

**CRIT-02 — JWKS network error handling (fail closed):**
- Added specific `except pyjwt.exceptions.PyJWKClientConnectionError: raise` before the general `except pyjwt.PyJWTError` catch
- PyJWT wraps network errors (`ConnectionError`, `TimeoutError`) in `PyJWKClientConnectionError` — this is now re-raised instead of silently falling through to HS256
- Only genuine JWT validation errors (bad signature, expired, wrong algorithm) fall through to HS256
- Security reviewer caught that the initial fix was insufficient (PyJWKClientConnectionError is a subclass of PyJWTError) — fixed with the re-raise pattern

**CRIT-03 — Service role key required:**
- `Settings.__init__` now raises `ValueError` if `SUPABASE_URL` is set but `SUPABASE_SERVICE_ROLE_KEY` is empty
- Prevents silent fallback to anon key in production
- Guard is safe for test environments where `SUPABASE_URL=""` is standard

**Tests (TDD Red-Green):**
- 6 new tests added, 4 existing tests updated with `aud="authenticated"`, `make_test_jwt()` updated in conftest.py
- Files changed: `backend/app/dependencies.py`, `backend/app/core/config.py`, `backend/tests/test_auth_jwt.py`, `backend/tests/conftest.py`
- Validation: ruff clean, 282/282 tests pass. Reviewed by security-reviewer + code-reviewer.

**Remaining:** HIGH-01 through HIGH-05, MED-01 through MED-07, LOW-01 through LOW-06, INFO-01 through INFO-04 still pending.

#### HIGH-02/03/04/05 — Completed 2026-04-01 (HIGH-01 rate limiting deferred — requires `slowapi` install)

**HIGH-02 — Photo upload magic-byte validation:**
- Added `_MAGIC_BYTES` dict mapping Content-Type → expected header bytes (JPEG `\xff\xd8\xff`, PNG `\x89PNG\r\n\x1a\n`, WebP `RIFF` + bytes 8-12 `WEBP`)
- Validation runs after `await file.read()` and before size check
- Rejects files whose content doesn't match claimed Content-Type with 422
- Note: polyglot files (valid header + malicious payload) still pass — full mitigation requires image re-encoding (Pillow), deferred to future improvement

**HIGH-03 — Sanitized error messages:**
- `itinerary_routes.py`: both `except ValueError` blocks now log full error internally, return generic "Route calculation failed"
- `trip_locations.py`: `GoogleListParseError` now returns generic "Failed to parse Google Maps list" instead of raw exception text
- Updated `test_google_list_import.py` to match new sanitized message

**HIGH-04 — Security headers middleware:**
- New `SecurityHeadersMiddleware` in `middleware.py` adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- Registered as outermost middleware in `main.py` (before CORS) so headers appear on all responses including CORS preflights
- Security reviewer caught initial wrong middleware ordering — fixed

**HIGH-05 — Resource chain NULL day_id guard:**
- Python-level guard in `_ensure_resource_chain`: raises 404 if `option_id` is set without `day_id`
- Security reviewer confirmed the SQL RPC is not actually vulnerable (NULL comparison evaluates to FALSE), but Python guard catches it earlier with distinct logging
- Corrected misleading code comment

**Tests (TDD Red-Green):** 18 new tests across 4 files: `test_photo_upload.py`, `test_error_sanitization.py`, `test_security_headers.py`, `test_resource_chain.py`

**Files changed:** `backend/app/routers/trip_locations.py`, `backend/app/routers/itinerary_routes.py`, `backend/app/routers/trip_ownership.py`, `backend/app/middleware.py`, `backend/app/main.py`, `backend/tests/test_google_list_import.py`

**Validation:** ruff clean, 300/300 tests pass. Reviewed by security-reviewer + code-reviewer. Two reviewer findings addressed (middleware ordering + GoogleListParseError leak).

**Remaining:** HIGH-01 (rate limiting, requires `slowapi` install), MED-01 through MED-07, LOW-01 through LOW-06, INFO-01 through INFO-04.

#### HIGH-01 — Rate limiting — Completed 2026-04-01

**Implementation:**
- New module `backend/app/core/rate_limit.py`: `Limiter` singleton with in-memory storage, `get_user_rate_limit_key` (JWT sub extraction via base64 decode, IP fallback), default 100/min global limit
- `slowapi>=0.1.9` added to `requirements.txt` and `requirements-prod.txt`
- `SlowAPIMiddleware` registered in `main.py` between logging and CORS middleware
- Custom 429 handler with RFC-compliant `Retry-After: 60` header
- `Retry-After` added to CORS `expose_headers`

**Per-endpoint limits:**
- `POST /{trip_id}/locations/import-google-list`: 3/minute per user (Playwright browser launch)
- `POST /locations/google/preview`: 20/minute per user (Google Places API)
- `GET /shared/{share_token}`: 60/minute per IP (unauthenticated, token enumeration protection)

**Reviewer findings addressed:**
- Security reviewer caught `Retry-After` header was using human-readable string instead of integer seconds — fixed to `"60"`
- Code reviewer caught conftest fixture lacked try/finally teardown guard — fixed
- Removed redundant case-insensitive header lookup, stale TDD docstring

**Known accepted risks (documented):**
- Unverified JWT `sub` for keying means attacker can exhaust another user's bucket by forging tokens with their UUID (medium risk, inherent trade-off)
- In-memory storage resets on deploy and doesn't work across multiple instances (acceptable for single-container Render)
- `get_remote_address` may resolve to proxy IP on Render for unauthenticated endpoints — monitor in production

**Tests:** 5 new tests in `test_rate_limiting.py` (429 behavior, Retry-After header, per-user isolation, JWT key extraction, IP fallback). Autouse fixture in conftest disables limiter for all other tests.

**Files changed:** `backend/app/core/rate_limit.py` (new), `backend/app/main.py`, `backend/app/routers/trip_locations.py`, `backend/app/routers/locations_google.py`, `backend/app/routers/shared_trips.py`, `requirements.txt`, `requirements-prod.txt`, `backend/tests/test_rate_limiting.py` (new), `backend/tests/conftest.py`

**Validation:** ruff clean, 305/305 tests pass. Reviewed by architect, planner, security-reviewer, code-reviewer.

**Remaining:** MED-01 through MED-07, LOW-01 through LOW-06, INFO-01 through INFO-04.

#### MED/LOW/INFO — All completed 2026-04-01

**MED-01 — Share token expiry:** `expires_at` set to 180 days on insert. Existing pre-migration tokens remain indefinite until revoked/recreated.

**MED-02 — google_raw size cap:** `@field_validator` on BOTH `AddLocationBody` and `UpdateLocationBody` caps at 50KB (byte-accurate via `.encode()`). Security reviewer caught missing validator on UpdateLocationBody + char vs byte issue — both fixed.

**MED-03 — _ensure_resource_chain everywhere:** Replaced all 7 `_ensure_trip_owned` calls in `trips.py`, `shared_trips.py`, `itinerary_tree.py`. Removed dead `_ensure_trip_owned` function entirely. Updated test mocks to support `.rpc("verify_resource_chain")`.

**MED-04 — Playwright env clearing:** Added `_BROWSER_ENV_ALLOWLIST` and pass filtered `env=_browser_env` to `browser.launch()`. Strips all application secrets while keeping OS-level vars Chromium needs.

**MED-05 — Already mitigated:** Architect confirmed `page.route("**/*")` already intercepts intermediate redirect hops. No code change needed.

**MED-06 — Route segment error_message sanitized:** `error_message` stored as generic "Route calculation failed for this segment" instead of raw `str(e)`. Raw error logged internally. `classify_provider_error` still receives raw message for classification.

**MED-07 — CORS origins in Settings:** `cors_origins` parsed from env in `Settings` class. `main.py` now reads `get_settings().cors_origins`.

**LOW-01 — Frontend base URL validated:** `frontend_base_url` in Settings validates scheme at startup (must be https:// or http://). `shared_trips.py` reads from Settings.

**LOW-02 — Full UUID request IDs:** `str(uuid.uuid4())` (36 chars) replaces truncated 8-char version.

**LOW-03 — Key rotation docs:** Docstring on `get_supabase_client()` notes process restart required.

**LOW-04 — JWKS rotation confirmed:** Docstring on `_get_jwk_client()` confirms `cache_keys=True` auto-fetches on unknown kid.

**LOW-05 — Atomic delete_trip:** Removed redundant `locations.delete()` — FK cascades handle entire hierarchy.

**LOW-06 — trip_name PII removed:** Removed `trip_name=body.name` from `trip_created` log event.

**INFO-01/02 — RPC grants restricted:** SQL migration `20260401100000_restrict_anon_rpc_grants.sql` revokes `anon` from all RPCs (except `get_shared_trip_data`), all tables, and `ALTER DEFAULT PRIVILEGES` to prevent future auto-grants. Security reviewer caught missing default privileges revocation — fixed.

**INFO-03 — place-photos public bucket:** Accepted design decision. Both `place-photos` and `user-photos` buckets are `public = true` for CDN-style serving.

**INFO-04 — user-photos bucket verified:** Migration `20260322130000_add_user_image_url.sql` creates bucket with `public = true`.

**Files changed:** `shared_trips.py`, `schemas.py`, `trips.py`, `itinerary_tree.py`, `google_list_scraper.py`, `route_calculation.py`, `config.py`, `main.py`, `middleware.py`, `supabase.py`, `dependencies.py`, `trip_ownership.py`, migration SQL, + test files

**Tests:** 326/326 pass. 15 new tests + mock updates for _ensure_resource_chain migration. Reviewed by architect, tdd-guide, security-reviewer, code-reviewer, build-error-resolver.

**BACK-006 is now fully complete.** All CRIT (3), HIGH (5), MED (7), LOW (6), and INFO (4) items are resolved.