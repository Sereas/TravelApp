# shtabtravel

Travel planning web app for building trips, collecting places, and turning them into day-by-day itineraries.

**Live demo:** [shtabtravel.vercel.app](https://shtabtravel.vercel.app)

## What it does

- Create trips with optional date ranges
- Save locations manually or from Google Maps links
- Organize places into itinerary days
- Keep multiple plan options for the same day
- Group stops by time of day
- Build walking, driving, or transit routes between stops
- View route-aware daily plans with maps, photos, and notes

## Why this project is interesting

This project combines product design and engineering depth in one app:

- A planner-style UI for managing multi-day itineraries
- A FastAPI backend with explicit ownership enforcement
- Supabase for auth and PostgreSQL storage
- Google Places and Google Routes integrations
- Route caching and itinerary aggregation to keep the experience responsive

## Tech stack

**Frontend**

- Next.js 14
- TypeScript
- Tailwind CSS
- Radix UI
- MapLibre GL

**Backend**

- Python 3.12
- FastAPI
- Supabase (PostgreSQL + Auth)
- Pydantic
- structlog

**External APIs**

- Google Places API
- Google Routes API

## Running locally

### Backend

```bash
cp .env.example .env

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn backend.app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects `frontend/.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project structure

```text
backend/
  app/
  tests/

frontend/
  src/

supabase/
  migrations/

tests/
  perf/
```

## Status

This is an actively evolving portfolio project. The current focus is on itinerary UX, route-aware planning, and keeping the full-stack architecture clean as the product grows.
