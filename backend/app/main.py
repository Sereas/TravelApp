"""FastAPI application: auth and trips (MVP Slice 2)."""

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.clients.google_places import GooglePlacesClient, GooglePlacesDisabledError
from backend.app.clients.google_routes import GoogleRoutesClient, GoogleRoutesDisabledError
from backend.app.core.config import get_settings
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

_logger = structlog.get_logger("lifespan")

_cors_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3001,https://shtabtravel.vercel.app",
    ).split(",")
]


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncGenerator[None]:
    """Create singleton Google API clients at startup, close on shutdown."""
    settings = get_settings()
    _logger.info(
        "app_startup",
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        log_format=os.getenv("LOG_FORMAT", "json").lower(),
        supabase_url_set=bool(settings.supabase_url),
        google_places_configured=bool(settings.google_places_api_key),
        google_routes_configured=bool(settings.google_routes_api_key),
        jwt_secret_set=bool(settings.supabase_jwt_secret),
        cors_origin_count=len(_cors_origins),
    )

    # Google Places client
    places_client: GooglePlacesClient | None = None
    try:
        api_key = settings.google_places_api_key or ""
        places_client = GooglePlacesClient(api_key)
        _logger.info("google_places_client_ready")
    except GooglePlacesDisabledError:
        _logger.info("google_places_client_disabled")

    # Google Routes client
    routes_client: GoogleRoutesClient | None = None
    try:
        api_key = settings.google_routes_api_key or ""
        routes_client = GoogleRoutesClient(api_key)
        _logger.info("google_routes_client_ready")
    except GoogleRoutesDisabledError:
        _logger.info("google_routes_client_disabled")

    application.state.google_places_client = places_client
    application.state.google_routes_client = routes_client

    yield

    if places_client is not None:
        places_client.close()
        _logger.info("google_places_client_closed")
    if routes_client is not None:
        routes_client.close()
        _logger.info("google_routes_client_closed")


app = FastAPI(
    title="Travel App API",
    description="MVP Core Trip Planning",
    lifespan=_lifespan,
)


@app.exception_handler(GooglePlacesDisabledError)
async def _google_places_disabled_handler(request, exc):
    from fastapi.responses import JSONResponse

    _logger.warning(
        "google_places_disabled_request",
        path=request.url.path,
        error_category="external_api",
    )
    return JSONResponse(
        status_code=503,
        content={"detail": "Google integration is not configured"},
    )


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
