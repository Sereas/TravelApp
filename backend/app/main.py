"""FastAPI application: auth and trips (MVP Slice 2)."""

from fastapi import FastAPI

from backend.app.core.logging import setup_logging
from backend.app.middleware import RequestLoggingMiddleware
from backend.app.routers import infra, trip_locations, trips

setup_logging()

app = FastAPI(
    title="Travel App API",
    description="MVP Core Trip Planning",
)

app.add_middleware(RequestLoggingMiddleware)

app.include_router(infra.router)
app.include_router(trips.router, prefix="/api/v1")
app.include_router(trip_locations.router, prefix="/api/v1")
