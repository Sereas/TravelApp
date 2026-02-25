# TravelApp

Trip planning and in-trip assistance: collect locations, organize day-by-day itineraries, and (later) visualize on a map. Backend API (FastAPI + Supabase) and Web client (Next.js).

---

## Quick start

### Backend

- **Run API:** From repo root, `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000` (or `python3 -m uvicorn ...`). Requires `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- **Tests:** `python3 -m pytest -v` (mocks Supabase; no real DB needed).
- **Lint/format:** `ruff check .` and `ruff format --check .` (see `pyproject.toml`).

### Frontend

- **Install and run dev server:** `cd frontend && npm install && npm run dev`. App at http://localhost:3000.
- **Tests:** `cd frontend && npm run test`.
- **Lint and typecheck:** `cd frontend && npm run lint` and `npm run typecheck`.
- **Build:** `cd frontend && npm run build`.

---

## Repository

- **`backend/`** — FastAPI app; trips and locations under `/api/v1`; auth via Supabase JWT.
- **`frontend/`** — Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui baseline; design tokens and layout in `src/app/globals.css` and `src/components/layout/`.
- **`docs/`** — Specs, slice plans, design docs. See [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) for workflow and stack; [docs/design/design-system-web.md](docs/design/design-system-web.md) for Web design system.

CI (GitHub Actions): backend lint + test; frontend typecheck, lint, test on push/PR to `main`.
