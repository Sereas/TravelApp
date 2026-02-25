# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

TravelApp is a Python/FastAPI backend API for travel planning (trips + locations CRUD). It uses Supabase as its database/auth backend. There is no frontend.

### Running tests

```bash
python3 -m pytest -v
```

All tests mock Supabase entirely — no real Supabase instance is needed to run the test suite (61 tests pass, 1 RLS integration test skipped by default).

### Running the dev server

```bash
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

A `.env` file with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` is needed at the workspace root. Without a real Supabase instance, the server starts fine but API calls that touch the database will return 500. The `/health` endpoint works without Supabase.

### Supabase connection

The app connects to a hosted Supabase instance. Required env vars (set via Cursor Secrets):
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS, used by backend)
- `SUPABASE_JWT_SECRET` — needed for the API to verify auth tokens

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
