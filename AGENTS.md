# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

TravelApp is a Python/FastAPI backend API and a Next.js Web frontend for travel planning (trips + locations CRUD). It uses Supabase as its database/auth backend. The frontend lives in `frontend/`.

### Running tests

**Backend:**
```bash
python3 -m pytest -v
```
All tests mock Supabase entirely — no real Supabase instance is needed to run the test suite (61 tests pass, 1 RLS integration test skipped by default).

**Frontend:** From repo root, `cd frontend` then:
```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint + Prettier check
npm run test        # Vitest
npm run build       # Next.js production build
```

### Running the dev server

```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

A `.env` file with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` is needed at the workspace root. Without a real Supabase instance, the server starts fine but API calls that touch the database will return 500. The `/health` endpoint works without Supabase.

### Supabase connection

The app connects to a hosted Supabase instance. Required env vars (from `config.py`):
- `SUPABASE_URL` — project URL (required for both DB access and JWT verification via JWKS)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS, used by backend)
- `SUPABASE_JWT_SECRET` — **optional** fallback for HS256 JWT verification; not needed when `SUPABASE_URL` is set (ES256 via JWKS is the primary method)

**JWT verification**: Supabase uses ES256 (asymmetric) JWTs. The backend verifies tokens via the JWKS endpoint at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. HS256 with `SUPABASE_JWT_SECRET` is only used as a fallback (e.g. in tests or legacy setups).

**Secret name mapping**: Cursor Secrets use different names than the app expects. The `.env` file (gitignored) bridges the gap:

| Cursor Secret | App Env Var | Required |
|---|---|---|
| `SUPABASE_URL` | `SUPABASE_URL` (same) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (same) | Yes |
| `SUPABASE_KEY` | `SUPABASE_ANON_KEY` | Yes (frontend) |
| `JWT_SECRET` | `SUPABASE_JWT_SECRET` | No (JWKS used instead) |

The `trips` table has a foreign key `user_id` referencing Supabase Auth users (`auth.users`), so you cannot insert trips for arbitrary UUIDs. Use an existing user ID from the database.

To query the database directly (bypassing the API), use the Supabase Python SDK:
```python
from supabase import create_client
import os
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
sb.table("trips").select("*").execute()
```

### API versioning

All API routes are under `/api/v1/` (e.g. `/api/v1/trips`, `/api/v1/trips/{id}/locations`). The `/health` endpoint remains at the root.

### Key caveats

- The `python3` binary is available (not `python`). Use `python3 -m pytest` and `python3 -m uvicorn ...` or ensure `$HOME/.local/bin` is on `PATH` for the `uvicorn`/`pytest` CLI commands.
- The `.env` file is gitignored — create it locally with dummy or real Supabase credentials. In Cursor Cloud, secrets are injected as environment variables automatically.
- `config.py` uses `@lru_cache` for settings. Tests clear this cache via the `reset_settings_cache` autouse fixture. If you modify env vars in a test, ensure you call `get_settings.cache_clear()`.
- **Linting/formatting**: `ruff` is configured in `pyproject.toml`. Run `ruff check .` and `ruff format --check .` to verify. Use `ruff check --fix .` and `ruff format .` to auto-fix. Rule B008 is ignored (needed for FastAPI `Depends()`).
