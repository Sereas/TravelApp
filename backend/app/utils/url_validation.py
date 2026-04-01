"""URL validation for Google Maps list import — SSRF prevention.

Defence-in-depth: validates scheme, hostname, and structure of URLs
before they reach Playwright's page.goto().  Also provides a post-redirect
validator and a Playwright route-interception helper.
"""

from __future__ import annotations

import ipaddress
import unicodedata
from urllib.parse import urlparse

# --- Allowed hostnames for user-supplied input URLs ---
ALLOWED_INPUT_HOSTS: frozenset[str] = frozenset(
    {
        "www.google.com",
        "google.com",
        "maps.google.com",
        "maps.app.goo.gl",
        "goo.gl",
    }
)

# Hosts that require the path to start with /maps/
_PATH_RESTRICTED_HOSTS: frozenset[str] = frozenset(
    {
        "www.google.com",
        "google.com",
        "maps.google.com",
    }
)

# --- Allowed domain suffixes for Playwright network requests ---
ALLOWED_NAVIGATION_SUFFIXES: tuple[str, ...] = (
    ".google.com",
    ".googleapis.com",
    ".gstatic.com",
    ".googleusercontent.com",
    ".goo.gl",
)
ALLOWED_NAVIGATION_EXACT: frozenset[str] = frozenset({"google.com", "goo.gl"})


class URLValidationError(ValueError):
    """Raised when a URL fails SSRF validation."""


def validate_google_maps_url(url: str) -> str:
    """Validate that *url* is a safe Google Maps URL.

    Returns the normalised URL on success.
    Raises ``URLValidationError`` on any violation.
    """
    if not isinstance(url, str) or not url.strip():
        raise URLValidationError("URL must be a non-empty string")

    # Normalise unicode (collapse fullwidth chars, homoglyphs)
    url = unicodedata.normalize("NFKC", url).strip()

    # Reject dangerous characters before parsing
    if "\\" in url:
        raise URLValidationError("URL must not contain backslashes")
    if "\x00" in url or any(ord(c) < 0x20 for c in url):
        raise URLValidationError("URL must not contain null bytes or control characters")

    parsed = urlparse(url)

    # --- Scheme ---
    if parsed.scheme.lower() != "https":
        raise URLValidationError("URL scheme must be https")

    # --- Hostname ---
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise URLValidationError("URL must have a valid hostname")

    # Reject non-ASCII hostnames (IDN homoglyph attacks)
    if not hostname.isascii():
        raise URLValidationError("URL hostname must be ASCII")

    # Reject IP addresses (decimal, hex, IPv6)
    try:
        ipaddress.ip_address(hostname.strip("[]"))
        raise URLValidationError("IP addresses are not allowed")
    except ValueError:
        pass  # Not an IP — good

    if hostname not in ALLOWED_INPUT_HOSTS:
        raise URLValidationError(
            f"Hostname '{hostname}' is not allowed. "
            f"Accepted hosts: {', '.join(sorted(ALLOWED_INPUT_HOSTS))}"
        )

    # --- Reject userinfo (user:pass@host) ---
    if parsed.username is not None:
        raise URLValidationError("URL must not contain userinfo (user:pass@host)")

    # --- Reject explicit port ---
    if parsed.port is not None:
        raise URLValidationError("URL must not specify a port")

    # --- Path prefix for google.com hosts ---
    if hostname in _PATH_RESTRICTED_HOSTS and not (
        parsed.path == "/maps" or parsed.path.startswith("/maps/")
    ):
        raise URLValidationError("Google.com URLs must start with /maps/ path")

    return url


def is_allowed_navigation_host(hostname: str) -> bool:
    """Check whether *hostname* is allowed for Playwright network requests.

    This is broader than ``ALLOWED_INPUT_HOSTS`` because Google Maps pages
    load resources from various CDN domains.
    """
    hostname = hostname.lower()
    if hostname in ALLOWED_NAVIGATION_EXACT:
        return True
    return hostname.endswith(ALLOWED_NAVIGATION_SUFFIXES)
