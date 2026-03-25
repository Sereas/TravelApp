"""FastAPI application: auth and trips (MVP Slice 2)."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.logging import setup_logging
from backend.app.middleware import RequestLoggingMiddleware
from backend.app.routers import (
    infra,
    itinerary_days,
    itinerary_option_locations,
    itinerary_options,
    itinerary_routes,
    itinerary_tree,
    locations_google,
    shared_trips,
    trip_locations,
    trips,
)

setup_logging()

app = FastAPI(
    title="Travel App API",
    description="MVP Core Trip Planning",
)

_cors_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3001,https://shtabtravel.vercel.app",
    ).split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Itinerary-Ownership-Ms",
        "X-Itinerary-Rpc-Ms",
        "X-Itinerary-Build-Ms",
        "X-Itinerary-Rows",
        "X-Locations-Ownership-Ms",
        "X-Locations-Query-Ms",
        "X-Locations-Photo-Ms",
        "X-Locations-Rows",
    ],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(infra.router)
app.include_router(trips.router, prefix="/api/v1")
app.include_router(trip_locations.router, prefix="/api/v1")
app.include_router(locations_google.router, prefix="/api/v1")
app.include_router(itinerary_days.router, prefix="/api/v1")
app.include_router(itinerary_options.router, prefix="/api/v1")
app.include_router(itinerary_option_locations.router, prefix="/api/v1")
app.include_router(itinerary_routes.router, prefix="/api/v1")
app.include_router(itinerary_tree.router, prefix="/api/v1")
app.include_router(shared_trips.router, prefix="/api/v1")
