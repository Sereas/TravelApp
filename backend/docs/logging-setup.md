# Logging Setup Guide

## Current Architecture

The backend uses **structlog** with JSON output in production and console output in development.

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Python log level. Use `DEBUG` to see DB query timing. |
| `LOG_FORMAT` | `json` | `json` for production (log drain), `console` for local dev. |

### What Gets Logged

Every log line includes these fields automatically (via structlog contextvars):

| Field | Source | Example |
|---|---|---|
| `timestamp` | structlog TimeStamper | `2026-03-31T14:22:01.123Z` |
| `level` | structlog | `info`, `warning`, `error` |
| `logger_name` | Per-module logger | `http`, `auth`, `google_places`, `db` |
| `request_id` | RequestLoggingMiddleware | `a1b2c3d4` |
| `user_id` | Auth dependency | `11111111-2222-3333-4444-555555555555` |
| `error_category` | All warning/error events | `auth`, `external_api`, `db`, `internal` |

### Log Event Reference

**Request lifecycle:**
- `request_completed` — every HTTP request (method, path, status_code, duration_ms)
- `request_error` — unhandled exception (includes stack trace)

**Auth:**
- `auth_failed` — with `reason`: `missing_authorization_header`, `invalid_or_expired_token`, `token_missing_subject`, `invalid_subject`, `no_jwt_verification_configured`
- `auth_success` — DEBUG level, includes user_id
- `ownership_denied` — 404 from ownership checks, with `reason`: `trip_not_found`, `trip_not_owned`, `resource_chain_failed`

**Google Places API:**
- `places_resolve_ok` — successful resolve (duration_ms, place_id, resolved_name)
- `places_resolve_failed` — failed resolve (duration_ms)
- `places_text_search` — DEBUG, individual search call
- `places_nearby_search` — DEBUG, nearby search call

**Google Routes API:**
- `routes_compute_ok` — DEBUG, successful leg computation (duration_ms, distance_meters)
- `routes_compute_failed` — WARNING, failed leg (duration_ms, travel_mode)
- `routes_no_results` — WARNING, API returned no routes
- `google_routes_leg_failed` — in route_calculation service (includes error classification)
- `route_segments_computed` — summary of segment computation (segments, recomputed, duration_ms)

**Database (DEBUG level):**
- `db_execute` — every Supabase .execute() call (table, operation, duration_ms, rows)

**Startup:**
- `app_startup` — config summary (log_level, features enabled, cors_origin_count)
- `google_places_client_ready` / `google_places_client_disabled`
- `google_routes_client_ready` / `google_routes_client_disabled`

---

## Setting Up Log Monitoring

### Recommended: Betterstack (formerly Logtail)

Best fit for FastAPI on Render: native integration, auto-parses JSON, free tier sufficient for early-stage.

| | Betterstack | Axiom | Datadog |
|---|---|---|---|
| Free tier | 1 GB/mo, 3 days | 500 MB/mo | No log free tier |
| Paid entry | $25/mo (5 GB, 30 days) | $25/mo (1 TB) | $15/host + $1.70/GB |
| Render integration | Native (one-click) | Manual HTTP | Manual |
| JSON auto-parse | Yes | Yes | Yes |
| Alerting | Built-in, free | Built-in, free | Built-in, complex |

### Step-by-Step Setup

#### 1. Create Betterstack Account
- Sign up at https://betterstack.com
- Create a new Source: type **HTTP**, name it `shtabtravel-api`
- Copy the **Source Token**

#### 2. Configure Render Log Drain
- Go to **Render Dashboard** > your Web Service > **Settings** > **Log Streams**
- Click **Add Log Stream**
- Select **Betterstack** as destination (or **Custom** with the HTTP endpoint)
- Paste the Source Token
- Save

All stdout JSON lines are now forwarded to Betterstack in real-time.

#### 3. Set Environment Variables on Render
```
LOG_LEVEL=INFO
LOG_FORMAT=json
```

#### 4. Verify
- Hit any API endpoint
- Check Betterstack Live Tail: you should see structured JSON with all fields parsed into columns

### First Dashboards

**Dashboard 1: Request Overview**
- Total requests/minute (count `request_completed`)
- P50, P95, P99 latency from `duration_ms`
- Error rate: `status_code >= 500` / total
- Top 10 slowest endpoints by `path`

**Dashboard 2: External API Health**
- Google Places success rate: `places_resolve_ok` vs `places_resolve_failed`
- Google Routes success rate: `routes_compute_ok` vs `routes_compute_failed`
- Average `duration_ms` per external API call
- Rate limit detection: `routes_compute_failed` with `http_status=429`

**Dashboard 3: Auth & Security**
- `auth_failed` events by `reason`
- `ownership_denied` events (potential unauthorized access attempts)

### First Alerts

| Alert | Condition | Channel |
|---|---|---|
| Error spike | 5+ events with `status_code >= 500` in 5 min | Slack/email |
| Google API down | 3+ `error_category=external_api` errors in 10 min | Slack/email |
| Latency degradation | P95 `duration_ms` > 3000ms for 10 min | Slack |
| Auth anomaly | 20+ `auth_failed` events in 5 min | Slack/email |
| DB errors | Any event with `error_category=db` | Slack/email |

### Useful Queries

```
# Find all errors for a specific request
request_id:"a1b2c3d4"

# Find all activity for a user
user_id:"11111111-2222-3333-4444-555555555555"

# Slow requests (> 2 seconds)
event:"request_completed" AND duration_ms:>2000

# All DB insert failures
error_category:"db"

# External API failures
error_category:"external_api"

# All unexpected internal errors (the one alert rule to rule them all)
level:"error" AND error_category:"internal"
```

### Cost Estimate

For a travel planning app with 50-200 active users:
- ~500 MB - 2 GB logs/month at INFO level
- Free tier (1 GB) likely sufficient initially
- $25/month when outgrown (5 GB, 30-day retention)
- Enable DEBUG level temporarily for deep debugging only (generates ~5-10x more data)

### Debugging with DEBUG Level

To temporarily enable DB query logging:
```bash
# On Render: set LOG_LEVEL=DEBUG in environment variables
# Locally:
LOG_LEVEL=DEBUG LOG_FORMAT=console uvicorn backend.app.main:app --reload
```

This enables `db_execute` events showing every Supabase call with table, operation, duration, and row count. Keep at INFO in production to manage log volume.
