"""Application configuration from environment.

Backend uses SUPABASE_SERVICE_ROLE_KEY for the Supabase client (server-side only).
Use anon key only for client-side apps; see docs/design/backend-and-supabase.md.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _bool_env(name: str) -> bool:
    """Parse a boolean env var. Accepts 1/true/yes (case-insensitive)."""
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


def _int_env(name: str, default: int) -> int:
    """Parse an integer env var, falling back to `default` if unset/invalid."""
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


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

        # Cost-guard kill switches. All default False.
        # - google_apis_disabled: master switch; blocks every Google endpoint.
        # - google_autocomplete_disabled: blocks /autocomplete AND /resolve
        #   (they are two halves of the same typeahead UX). Does NOT block
        #   /preview (URL-paste path) or list import.
        # - google_list_import_disabled: blocks the Google Maps list-import
        #   SSE endpoint only.
        self.google_apis_disabled: bool = _bool_env("GOOGLE_APIS_DISABLED")
        self.google_autocomplete_disabled: bool = _bool_env("GOOGLE_AUTOCOMPLETE_DISABLED")
        self.google_list_import_disabled: bool = _bool_env("GOOGLE_LIST_IMPORT_DISABLED")

        # Per-user daily quotas (enforced via bump_google_usage RPC).
        # Defaults sized to absorb a normal user's daily usage with headroom.
        self.google_daily_cap_autocomplete: int = _int_env("GOOGLE_DAILY_CAP_AUTOCOMPLETE", 2000)
        self.google_daily_cap_resolve: int = _int_env("GOOGLE_DAILY_CAP_RESOLVE", 200)
        self.google_daily_cap_preview: int = _int_env("GOOGLE_DAILY_CAP_PREVIEW", 200)
        self.google_daily_cap_list_import: int = _int_env("GOOGLE_DAILY_CAP_LIST_IMPORT", 500)

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
