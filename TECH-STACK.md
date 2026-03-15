# Tech stack (for deployment)

**Backend:** Python 3.12, FastAPI, Uvicorn, Supabase SDK, Pydantic, structlog. Optional: Google Places/Routes API.

**Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Supabase JS + @supabase/ssr. Radix UI, MapLibre GL, date-fns.

**Infra:** Docker (backend only), GitHub Actions. Env: `.env` (backend), `frontend/.env.local` (frontend).

**External:** Supabase (PostgreSQL, Auth).
