"""Application configuration from environment.

Backend uses SUPABASE_SERVICE_ROLE_KEY for the Supabase client (server-side only).
Use anon key only for client-side apps; see docs/design/backend-and-supabase.md.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    def __init__(self) -> None:
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.supabase_url: str = os.getenv("SUPABASE_URL", "")

        # CRIT-03: Backend MUST use service_role key. If Supabase URL is
        # configured (i.e., not a purely local/test setup), the service role
        # key is required — silently falling back to anon key would create
        # inconsistent RLS behaviour with SECURITY DEFINER RPCs.
        if self.supabase_url and not service_key:
            raise ValueError(
                "SUPABASE_SERVICE_ROLE_KEY is required when SUPABASE_URL is set. "
                "The backend must not run with the anon key."
            )

        self.supabase_key: str = service_key
        self.supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
        # Optional Google Places API key; when absent, Google integration is disabled.
        self.google_places_api_key: str | None = os.getenv("GOOGLE_PLACES_API_KEY") or None
        # Optional Google Routes API key (Routes API only; not shared with Places).
        self.google_routes_api_key: str | None = os.getenv("GOOGLE_ROUTES_API_KEY") or None

        # MED-07: CORS origins centralized in Settings (previously at module level in main.py)
        _default_cors = "http://localhost:3000,http://localhost:3001,https://shtabtravel.vercel.app"
        self.cors_origins: list[str] = [
            o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", _default_cors).split(",")
        ]

        # LOW-01: Validate FRONTEND_BASE_URL scheme at startup
        self.frontend_base_url: str = os.getenv(
            "FRONTEND_BASE_URL", "https://shtabtravel.vercel.app"
        )
        if not self.frontend_base_url.startswith(("https://", "http://")):
            raise ValueError(
                f"FRONTEND_BASE_URL must start with https:// or http://, "
                f"got: {self.frontend_base_url}"
            )


@lru_cache
def get_settings() -> Settings:
    """Load settings from environment (cached)."""
    return Settings()
