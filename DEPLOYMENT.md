# Deployment (production)

Deploy **backend** and **frontend** separately; Supabase is already hosted.

## Components

| Component | Deploy as |
|-----------|-----------|
| Backend | Docker or Python (FastAPI/Uvicorn). Use `requirements-prod.txt`. Set `PORT` (e.g. Render). |
| Frontend | Next.js on Vercel/Netlify. Set `NEXT_PUBLIC_API_URL` to backend URL. |
| DB/Auth | Supabase: set Site URL and Redirect URLs to frontend URL. |

## Env (backend)

- **Required:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ALLOWED_ORIGINS` (frontend origin).
- **Optional:** `SUPABASE_JWT_SECRET`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY`.

Copy `.env.example` to `.env` and fill in.

## Env (frontend)

- **Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (backend URL).

## Order

1. Supabase: run migrations in `docs/migrations/`; set Auth URL/redirects to frontend URL.
2. Deploy backend; note its URL. Set `CORS_ALLOWED_ORIGINS` to that frontend origin.
3. Deploy frontend with `NEXT_PUBLIC_API_URL` = backend URL.

## Docker

From repo root: `docker build -t travelapp-api .` then run with `-e PORT=8000` and env file. Image uses `requirements-prod.txt` and listens on `$PORT`.
