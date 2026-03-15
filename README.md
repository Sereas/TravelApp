# TravelApp

Trip planning and in-trip assistance: collect locations, organize day-by-day itineraries, and (later) visualize on a map. Backend API (FastAPI + Supabase) and Web client (Next.js).

**Deployment:** See [DEPLOYMENT.md](DEPLOYMENT.md). Tech stack: [TECH-STACK.md](TECH-STACK.md).

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

## Agents and workflow (.cursor)

Feature work, new ideas, bug fixing, and questions should be run **through the agents** defined under `.cursor/agents/`. The **Coordinator** is the entry point: invoke it when you are unsure which agent to use; it routes to the right role and enforces the workflow.

**Flow:** Ideation → Specification → (optional) Architecture review → Delivery planning → Execution.

| Role | When to use |
|------|--------------|
| **Coordinator** | Start here. Routes work, enforces stages, checks DoD. |
| **Inventor** | New ideas or “what to build” — ideation only; no specs or code. |
| **Analyst** | Agreed idea → strict, testable feature spec in `docs/features/`. |
| **Seneschal** | Optional: architecture review of a spec or tools/platform advice. |
| **Illuminator** | Optional: UX/UI — journeys, flows, hierarchy, design system, or UI review/polish. |
| **Quartermaster** | Accepted spec → slice plan in `docs/plan/`. |
| **Surgeon** | Implement one slice at a time (code, tests, docs); slice assigned from the plan. |

Full agent instructions and workflow details: **`.cursor/agents/README.md`**. Principles and workflow model: `docs/PROJECT_CONTEXT.md`.

---

## Repository

- **`backend/`** — FastAPI app; trips and locations under `/api/v1`; auth via Supabase JWT. Itinerary API (days, options, option-locations, full tree): see [docs/features/itinerary-api.md](docs/features/itinerary-api.md); error policy and entry points (tree vs option-locations CRUD) are summarized in **AGENTS.md** under “Itinerary API”.
- **`frontend/`** — Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui. Components: `layout/` (PageShell, SiteHeader), `ui/` (Button, Card, Input, Label), `trips/` (TripCard), `locations/` (LocationRow), `feedback/` (EmptyState, ErrorBanner, LoadingSpinner). Design system: [docs/design/design-system-web.md](docs/design/design-system-web.md); local overview: [frontend/README.md](frontend/README.md).
- **`docs/`** — Specs, slice plans, design docs. See [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) for workflow and stack; [docs/design/design-system-web.md](docs/design/design-system-web.md) for Web design system.

CI (GitHub Actions): backend lint + test; frontend typecheck, lint, test on push/PR to `main`.
