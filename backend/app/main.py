"""FastAPI application: auth and trips (MVP Slice 2)."""

from fastapi import FastAPI

from backend.app.routers import infra, trip_locations, trips

app = FastAPI(
    title="Travel App API",
    description="MVP Core Trip Planning",
)

app.include_router(infra.router)
app.include_router(trips.router, prefix="/api")
app.include_router(trip_locations.router, prefix="/api")
