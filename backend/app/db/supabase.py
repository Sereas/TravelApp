"""Supabase client for server-side operations.

Uses SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY from env.
See docs/design/backend-and-supabase.md for when to use each key.
"""

from functools import lru_cache

from backend.app.core.config import get_settings
from supabase import create_client


@lru_cache
def get_supabase_client():
    """Create and cache Supabase client. Prefer service_role key for backend."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set"
        )
    return create_client(settings.supabase_url, settings.supabase_key)
