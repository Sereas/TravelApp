"""
MED-07: CORS origins parsed into Settings.
LOW-01: FRONTEND_BASE_URL scheme validation at startup.

Both are RED phase — the current Settings class does not have a ``cors_origins``
attribute (MED-07) and does not validate the FRONTEND_BASE_URL env var (LOW-01).
"""

import pytest

# ---------------------------------------------------------------------------
# MED-07 — CORS origins in Settings
# ---------------------------------------------------------------------------


class TestCorsOriginsInSettings:
    """
    Settings must parse CORS_ALLOWED_ORIGINS from the environment and expose
    it as a list attribute ``cors_origins``.
    """

    def test_cors_origins_parsed_as_list(self, monkeypatch):
        """
        MED-07 — RED.

        When ``CORS_ALLOWED_ORIGINS`` is set to a comma-separated string,
        ``Settings().cors_origins`` must be a list of individual origin strings.

        Currently FAILS because ``Settings`` has no ``cors_origins`` attribute;
        the CORS configuration is read ad-hoc in ``main.py`` via ``os.getenv``.
        """
        from backend.app.core.config import get_settings

        monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com,https://app.example.com")
        get_settings.cache_clear()

        settings = get_settings()

        assert hasattr(settings, "cors_origins"), "Settings must expose a 'cors_origins' attribute."
        assert settings.cors_origins == ["https://example.com", "https://app.example.com"], (
            f"Expected ['https://example.com', 'https://app.example.com'], "
            f"got {settings.cors_origins!r}. "
            "CORS_ALLOWED_ORIGINS must be split on commas and stripped."
        )

    def test_cors_origins_default_includes_localhost(self, monkeypatch):
        """
        When ``CORS_ALLOWED_ORIGINS`` is unset, the defaults must include
        localhost:3000 and the production Vercel domain.

        Currently FAILS for the same reason (no cors_origins attribute).
        """
        from backend.app.core.config import get_settings

        monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
        get_settings.cache_clear()

        settings = get_settings()

        assert hasattr(settings, "cors_origins"), "Settings must expose a 'cors_origins' attribute."
        origins = settings.cors_origins
        assert any("localhost" in o for o in origins), (
            f"Default cors_origins must include a localhost entry. Got: {origins!r}"
        )
        assert any("shtabtravel.vercel.app" in o for o in origins), (
            f"Default cors_origins must include shtabtravel.vercel.app. Got: {origins!r}"
        )

    def test_cors_origins_single_value(self, monkeypatch):
        """A single origin (no comma) is returned as a one-element list."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://single.example.com")
        get_settings.cache_clear()

        settings = get_settings()

        assert hasattr(settings, "cors_origins"), "Settings must expose a 'cors_origins' attribute."
        assert settings.cors_origins == ["https://single.example.com"], (
            f"Single origin must yield a one-element list, got {settings.cors_origins!r}"
        )

    def test_cors_origins_strips_whitespace(self, monkeypatch):
        """Spaces around commas are stripped from each origin."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("CORS_ALLOWED_ORIGINS", " https://a.com , https://b.com ")
        get_settings.cache_clear()

        settings = get_settings()

        assert hasattr(settings, "cors_origins"), "Settings must expose a 'cors_origins' attribute."
        assert settings.cors_origins == ["https://a.com", "https://b.com"], (
            f"Whitespace must be stripped from origins, got {settings.cors_origins!r}"
        )


# ---------------------------------------------------------------------------
# LOW-01 — FRONTEND_BASE_URL scheme validation
# ---------------------------------------------------------------------------


class TestFrontendBaseUrlValidation:
    """
    The FRONTEND_BASE_URL env var must be validated at startup.
    Non-http(s) schemes such as javascript:, data:, ftp: must be rejected
    to prevent open-redirect or XSS via crafted share URLs.
    """

    def test_javascript_scheme_raises_at_settings_init(self, monkeypatch):
        """
        LOW-01 — RED.

        Setting ``FRONTEND_BASE_URL=javascript://evil.com`` must raise
        ``ValueError`` either during ``Settings.__init__`` or when the
        ``shared_trips`` module reads the value.

        Currently FAILS because neither ``Settings`` nor ``shared_trips.py``
        validates the scheme — the value is accepted silently via ``os.getenv``.
        """
        from backend.app.core.config import get_settings

        monkeypatch.setenv("FRONTEND_BASE_URL", "javascript://evil.com")
        get_settings.cache_clear()

        with pytest.raises(ValueError, match=r"javascript|scheme|FRONTEND_BASE_URL"):
            get_settings()

    def test_data_uri_scheme_raises(self, monkeypatch):
        """``data:text/html,...`` scheme must also be rejected."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("FRONTEND_BASE_URL", "data:text/html,<script>alert(1)</script>")
        get_settings.cache_clear()

        with pytest.raises(ValueError):
            get_settings()

    def test_ftp_scheme_raises(self, monkeypatch):
        """Non-web schemes like ``ftp://`` must be rejected."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("FRONTEND_BASE_URL", "ftp://files.example.com")
        get_settings.cache_clear()

        with pytest.raises(ValueError):
            get_settings()

    def test_https_scheme_is_accepted(self, monkeypatch):
        """A valid ``https://`` URL must be accepted without error."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("FRONTEND_BASE_URL", "https://shtabtravel.vercel.app")
        get_settings.cache_clear()

        # Must not raise
        settings = get_settings()
        assert hasattr(settings, "frontend_base_url"), (
            "Settings should expose frontend_base_url once validation is added"
        )

    def test_http_localhost_is_accepted(self, monkeypatch):
        """``http://localhost:3000`` (local dev) must be accepted."""
        from backend.app.core.config import get_settings

        monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:3000")
        get_settings.cache_clear()

        # Must not raise
        get_settings()

    def test_no_frontend_base_url_uses_default(self, monkeypatch):
        """Absent ``FRONTEND_BASE_URL`` must fall back to a safe default."""
        from backend.app.core.config import get_settings

        monkeypatch.delenv("FRONTEND_BASE_URL", raising=False)
        get_settings.cache_clear()

        # Must not raise
        settings = get_settings()
        # Default should be an https URL
        if hasattr(settings, "frontend_base_url"):
            assert settings.frontend_base_url.startswith("https://"), (
                "Default frontend_base_url must use https scheme"
            )
