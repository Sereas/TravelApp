"""FastAPI application: auth and trips (MVP Slice 2)."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.logging import setup_logging
from backend.app.middleware import RequestLoggingMiddleware
from backend.app.routers import infra, trip_locations, trips

setup_logging()

app = FastAPI(
    title="Travel App API",
    description="MVP Core Trip Planning",
)

_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(
        ","
    )
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(infra.router)
app.include_router(trips.router, prefix="/api/v1")
app.include_router(trip_locations.router, prefix="/api/v1")
