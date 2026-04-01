"""Tests for URL validation (SSRF prevention) — BACK-002."""

import pytest
from pydantic import ValidationError

from backend.app.models.schemas import ImportGoogleListBody
from backend.app.utils.url_validation import (
    URLValidationError,
    is_allowed_navigation_host,
    validate_google_maps_url,
)

# ── Valid URLs ────────────────────────────────────────────────────────


class TestValidURLs:
    """URLs that should pass validation."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://maps.app.goo.gl/abc123",
            "https://goo.gl/maps/xyz789",
            "https://www.google.com/maps/placelists/list/abc",
            "https://www.google.com/maps/@48.86,2.34,15z",
            "https://google.com/maps/placelists/list/abc",
            "https://maps.google.com/maps?q=Paris",
        ],
    )
    def test_valid_google_maps_urls(self, url: str):
        result = validate_google_maps_url(url)
        assert result == url


# ── Scheme attacks ────────────────────────────────────────────────────


class TestSchemeValidation:
    """Reject non-https schemes."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://www.google.com/maps/placelists/list/abc",
            "file:///etc/passwd",
            "file:///proc/self/environ",
            "file:///app/.env",
            "ftp://www.google.com/maps",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "gopher://internal:70/",
            "chrome://settings",
        ],
    )
    def test_rejects_non_https_schemes(self, url: str):
        with pytest.raises(URLValidationError, match="scheme must be https"):
            validate_google_maps_url(url)


# ── Hostname attacks ─────────────────────────────────────────────────


class TestHostnameValidation:
    """Reject hostnames not in the allowlist."""

    @pytest.mark.parametrize(
        "url",
        [
            # Internal network / cloud metadata
            "https://169.254.169.254/latest/meta-data/",
            "https://metadata.google.internal/computeMetadata/v1/",
            "https://10.0.0.1/",
            "https://192.168.1.1/",
            "https://localhost/",
            "https://127.0.0.1/",
            # Arbitrary external hosts
            "https://evil.com/maps/placelists/list/abc",
            "https://attacker.example.com/",
            # Lookalike domains
            "https://maps.google.com.evil.com/maps/test",
            "https://www.google.com.attacker.com/maps/test",
        ],
    )
    def test_rejects_non_google_hosts(self, url: str):
        with pytest.raises(URLValidationError):
            validate_google_maps_url(url)


class TestIPAddressRejection:
    """Reject IP address literals in various formats."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://127.0.0.1/",
            "https://[::1]/",
            "https://[::ffff:127.0.0.1]/",
            "https://0.0.0.0/",
        ],
    )
    def test_rejects_ip_addresses(self, url: str):
        with pytest.raises(URLValidationError):
            validate_google_maps_url(url)


# ── URL structure attacks ────────────────────────────────────────────


class TestURLStructureAttacks:
    """Reject URLs with dangerous structural features."""

    def test_rejects_userinfo(self):
        with pytest.raises(URLValidationError, match="userinfo"):
            validate_google_maps_url("https://evil.com@www.google.com/maps/test")

    def test_rejects_explicit_port(self):
        with pytest.raises(URLValidationError, match="port"):
            validate_google_maps_url("https://www.google.com:8080/maps/test")

    def test_rejects_backslash(self):
        with pytest.raises(URLValidationError, match="backslash"):
            validate_google_maps_url("https://www.google.com\\@evil.com/maps")

    def test_rejects_null_bytes(self):
        with pytest.raises(URLValidationError, match="null bytes"):
            validate_google_maps_url("https://www.google.com/maps/test\x00evil")

    def test_rejects_control_characters(self):
        with pytest.raises(URLValidationError, match="control characters"):
            validate_google_maps_url("https://www.google.com/maps/\x0dtest\x0a/list")


# ── Path restriction ─────────────────────────────────────────────────


class TestPathRestriction:
    """google.com hosts must have /maps path prefix."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://www.google.com/search?q=test",
            "https://www.google.com/",
            "https://google.com/accounts/login",
            "https://maps.google.com/intl/en/help",
        ],
    )
    def test_rejects_non_maps_paths(self, url: str):
        with pytest.raises(URLValidationError, match="/maps"):
            validate_google_maps_url(url)

    def test_rejects_maps_prefix_without_slash(self):
        """Reject /mapsomething — only /maps or /maps/ prefix is valid."""
        with pytest.raises(URLValidationError, match="/maps"):
            validate_google_maps_url("https://www.google.com/mapsomething")

    def test_goo_gl_no_path_restriction(self):
        result = validate_google_maps_url("https://maps.app.goo.gl/anypath")
        assert result == "https://maps.app.goo.gl/anypath"


# ── Unicode / encoding attacks ───────────────────────────────────────


class TestUnicodeAttacks:
    """Reject unicode normalization and homoglyph attacks."""

    def test_rejects_non_ascii_hostname(self):
        with pytest.raises(URLValidationError):
            # Cyrillic letter instead of Latin 'a'
            validate_google_maps_url("https://www.google.com\u0430/maps/test")

    def test_normalises_fullwidth_characters(self):
        # Fullwidth characters get NFKC-normalised; result should still
        # be validated against the allowlist
        with pytest.raises(URLValidationError):
            validate_google_maps_url("https://\uff45\uff56\uff49\uff4c.com/maps")


# ── Edge cases ───────────────────────────────────────────────────────


class TestEdgeCases:
    def test_rejects_empty_string(self):
        with pytest.raises(URLValidationError):
            validate_google_maps_url("")

    def test_rejects_whitespace_only(self):
        with pytest.raises(URLValidationError):
            validate_google_maps_url("   ")

    def test_rejects_none(self):
        with pytest.raises(URLValidationError):
            validate_google_maps_url(None)  # type: ignore[arg-type]

    def test_strips_whitespace(self):
        result = validate_google_maps_url("  https://maps.app.goo.gl/abc  ")
        assert result == "https://maps.app.goo.gl/abc"


# ── Navigation host checker ─────────────────────────────────────────


class TestIsAllowedNavigationHost:
    @pytest.mark.parametrize(
        "hostname",
        [
            "www.google.com",
            "maps.googleapis.com",
            "fonts.gstatic.com",
            "lh3.googleusercontent.com",
            "maps.app.goo.gl",
            "google.com",
            "goo.gl",
        ],
    )
    def test_allows_google_domains(self, hostname: str):
        assert is_allowed_navigation_host(hostname) is True

    @pytest.mark.parametrize(
        "hostname",
        [
            "evil.com",
            "169.254.169.254",
            "localhost",
            "google.com.evil.com",
            "attacker.goo.gl.evil.com",
            "evilgoogle.com",
            "xgoogle.com",
        ],
    )
    def test_blocks_non_google_domains(self, hostname: str):
        assert is_allowed_navigation_host(hostname) is False


# ── Pydantic integration ────────────────────────────────────────────


class TestPydanticValidation:
    """Ensure the Pydantic model rejects bad URLs with 422."""

    def test_schema_rejects_bad_url(self):
        with pytest.raises(ValidationError) as exc_info:
            ImportGoogleListBody(google_list_url="http://evil.com/attack")
        assert "scheme must be https" in str(exc_info.value)

    def test_schema_accepts_good_url(self):
        body = ImportGoogleListBody(google_list_url="https://maps.app.goo.gl/abc123")
        assert body.google_list_url == "https://maps.app.goo.gl/abc123"

    def test_schema_rejects_internal_ip(self):
        with pytest.raises(ValidationError):
            ImportGoogleListBody(google_list_url="https://169.254.169.254/latest/meta-data/")
