"""Application configuration from environment.

Backend uses SUPABASE_SERVICE_ROLE_KEY for the Supabase client (server-side only).
Use anon key only for client-side apps; see docs/design/backend-and-supabase.md.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@lru_cache
def get_settings():
    """Load settings from environment (cached). Prefer service_role for backend."""
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    # Backend must use service_role; fallback to anon only for minimal local dev
    supabase_key = service_key or anon_key
    return type(
        "Settings",
        (),
        {
            "supabase_url": os.getenv("SUPABASE_URL", ""),
            "supabase_key": supabase_key,
            "supabase_jwt_secret": os.getenv("SUPABASE_JWT_SECRET", ""),
        },
    )()
