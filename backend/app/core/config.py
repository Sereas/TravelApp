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
        anon_key = os.getenv("SUPABASE_ANON_KEY", "")
        # Backend must use service_role; fallback to anon only for minimal local dev
        supabase_key = service_key or anon_key
        self.supabase_url: str = os.getenv("SUPABASE_URL", "")
        self.supabase_key: str = supabase_key
        self.supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
        # Optional Google Places API key; when absent, Google integration is disabled.
        self.google_places_api_key: str | None = os.getenv("GOOGLE_PLACES_API_KEY") or None


@lru_cache
def get_settings() -> Settings:
    """Load settings from environment (cached)."""
    return Settings()
