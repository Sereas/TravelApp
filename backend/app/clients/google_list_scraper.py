"""Playwright-based scraper for Google Maps shared lists.

Hybrid approach: renders the list page in headless Chromium to extract
clean place names from the DOM and reliable coordinates from Google's
internal ``getlist`` endpoint.
"""

from __future__ import annotations

import asyncio
import html as html_mod
import re
from dataclasses import dataclass

import structlog

from backend.app.clients.google_places import GoogleListParseError
from backend.app.utils.url_validation import (
    URLValidationError,
    validate_google_maps_url,
)

logger = structlog.get_logger("google_list_scraper")

# Selector for list item buttons in the rendered list sidebar.
_LIST_ITEM_SEL = "button.SMP2wb"
_HEADLINE_SEL = "div.fontHeadlineSmall"

# Scroll settings for lazy-loaded lists.
_MAX_SCROLL_ITERATIONS = 50
_SCROLL_PAUSE_S = 0.8
_NO_GROWTH_LIMIT = 3

# Google cookie consent button selectors.  The form-action selector is
# language-independent and matches in all locales; the text selectors are
# fallbacks for edge cases where the form structure changes.
_CONSENT_SELECTORS = [
    # Language-independent (covers all locales)
    'form[action*="consent"] button',
    'button[aria-label*="Accept"]',
    'button[aria-label*="accept"]',
    # English
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    # Dutch
    'button:has-text("Alles accepteren")',
    # French
    'button:has-text("Tout accepter")',
    # German
    'button:has-text("Alle akzeptieren")',
    # Spanish
    'button:has-text("Aceptar todo")',
    # Italian
    'button:has-text("Accetta tutto")',
    # Portuguese
    'button:has-text("Aceitar tudo")',
    # Polish
    'button:has-text("Zaakceptuj wszystko")',
    # Russian
    'button:has-text("Принять все")',
    # Turkish
    'button:has-text("Tümünü kabul et")',
    # Japanese
    'button:has-text("すべて同意")',
    # Korean
    'button:has-text("모두 동의")',
    # Arabic
    'button:has-text("قبول الكل")',
    # Hebrew
    'button:has-text("לאשר הכול")',
]

# Regex to find the preloaded getlist URL in rendered HTML.
_GETLIST_RE = re.compile(r'href="(/maps/preview/entitylist/getlist[^"]+)"')

# Regex to extract coordinates from getlist response.
_ADDR_COORD_RE = re.compile(
    r'\[null,\[null,null,"([^"]*)",null,"([^"]*)",'
    r"\[null,null,(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)\]"
)
_COORDS_RE = re.compile(r"\[null,null,(-?[0-9]+\.[0-9]+),(-?[0-9]+\.[0-9]+)\]")

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)


@dataclass
class ScrapedPlace:
    """A place extracted from a Google Maps shared list."""

    name: str
    latitude: float
    longitude: float
    note: str | None = None


class GoogleListScraper:
    """Extracts places from a Google Maps shared list using Playwright.

    Strategy:
    1. Render the list page in headless Chromium (handles short-URL redirects).
    2. Extract clean place names from the rendered DOM.
    3. Extract the ``getlist`` endpoint URL from the page HTML.
    4. Fetch the ``getlist`` response via the browser session (same cookies/context).
    5. Parse reliable lat/lng coordinates from the ``getlist`` response.
    6. Pair names with coordinates by order and return structured results.
    """

    async def extract_places(self, list_url: str) -> list[ScrapedPlace]:
        """Return scraped places with names and coordinates.

        Raises ``GoogleListParseError`` on CAPTCHA, empty results, or failure.
        """
        # Layer 2: pre-navigation URL validation (defense in depth)
        try:
            list_url = validate_google_maps_url(list_url)
        except URLValidationError as exc:
            raise GoogleListParseError(f"Invalid URL: {exc}") from exc

        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise GoogleListParseError(
                "Playwright is not installed. "
                "Install with: pip install playwright && playwright install chromium"
            ) from exc

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                try:
                    ctx = await browser.new_context(
                        user_agent=_USER_AGENT,
                        locale="en-US",
                        extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                    )
                    page = await ctx.new_page()

                    await page.goto(list_url, wait_until="domcontentloaded", timeout=30000)

                    # Short-URL redirects (goo.gl → google.com) happen via JS
                    # after domcontentloaded.  Wait for the URL to settle.
                    await self._wait_for_redirect(page)

                    # Handle Google cookie consent page if it appears
                    await self._handle_consent_if_present(page)

                    # Layer 2: post-redirect URL validation
                    try:
                        validate_google_maps_url(page.url)
                    except URLValidationError as exc:
                        raise GoogleListParseError(f"Redirect to disallowed URL: {exc}") from exc

                    if "/sorry/" in page.url:
                        raise GoogleListParseError(
                            "Google returned a CAPTCHA or rate-limit response. "
                            "Try again later or open the list in your browser first."
                        )

                    # Wait for list items to render
                    try:
                        await page.wait_for_selector(_LIST_ITEM_SEL, timeout=15000)
                    except Exception as exc:
                        raise GoogleListParseError(
                            "No list items found on the page. "
                            "The list may be empty, private, or the URL may be invalid."
                        ) from exc

                    await asyncio.sleep(2)

                    # Scroll to load all lazy-loaded items
                    await self._scroll_to_load_all(page)

                    # Step 1: Extract names and notes from DOM
                    dom_items = await self._extract_dom_items(page)
                    names = [item[0] for item in dom_items]
                    notes = [item[1] for item in dom_items]

                    # Step 2: Extract coordinates from getlist endpoint
                    coords = await self._fetch_getlist_coords(page)

                    # Step 3: Pair names, notes, and coordinates
                    places = _pair_names_coords_notes(names, coords, notes)

                    if not places:
                        raise GoogleListParseError(
                            "No places found in the Google Maps list. "
                            "The list may be empty, private, or the URL may be invalid."
                        )

                    logger.info(
                        "google_list_scraped",
                        count=len(places),
                        names_from_dom=len(names),
                        coords_from_getlist=len(coords),
                    )
                    return places
                finally:
                    await browser.close()

        except GoogleListParseError:
            raise
        except Exception as exc:
            raise GoogleListParseError(f"Failed to scrape Google Maps list: {exc}") from exc

    @staticmethod
    async def _wait_for_redirect(page, timeout_s: float = 8.0) -> None:
        """Wait for JS-driven redirects (goo.gl → consent or google.com/maps)."""
        initial_url = page.url
        elapsed = 0.0
        while elapsed < timeout_s:
            await asyncio.sleep(0.5)
            elapsed += 0.5
            if page.url != initial_url:
                # URL changed — wait a moment more for the target to load
                await asyncio.sleep(1)
                return
        # Timeout — URL didn't change, proceed anyway (may be a direct link)

    async def _handle_consent_if_present(self, page) -> None:
        """Click through Google's cookie consent page if it appears."""
        if "consent.google" not in page.url:
            return

        logger.info("google_consent_page_detected", url=page.url)

        for sel in _CONSENT_SELECTORS:
            try:
                btn = await page.wait_for_selector(sel, timeout=3000)
                if btn:
                    await btn.click()
                    await page.wait_for_load_state("domcontentloaded", timeout=15000)
                    logger.info("google_consent_accepted", final_url=page.url)
                    return
            except Exception:
                continue

        logger.warning("google_consent_button_not_found", url=page.url)

    async def _scroll_to_load_all(self, page) -> None:
        """Scroll the list panel to trigger lazy loading of all items."""
        no_growth_count = 0
        previous_count = 0
        for _ in range(_MAX_SCROLL_ITERATIONS):
            buttons = await page.query_selector_all(_LIST_ITEM_SEL)
            current_count = len(buttons)

            if current_count == previous_count:
                no_growth_count += 1
                if no_growth_count >= _NO_GROWTH_LIMIT:
                    break
            else:
                no_growth_count = 0

            previous_count = current_count

            if buttons:
                await buttons[-1].scroll_into_view_if_needed()
                await asyncio.sleep(_SCROLL_PAUSE_S)

    async def _extract_dom_items(self, page) -> list[tuple[str, str | None]]:
        """Extract place names and user notes from rendered list items.

        Returns a list of (name, note) tuples.  Notes are the free-text
        annotations users add to list items (shown below the place card).
        """
        items = await page.evaluate(
            """() => {
                const buttons = document.querySelectorAll('button.SMP2wb');
                const results = [];
                for (const btn of buttons) {
                    const headline = btn.querySelector('div.fontHeadlineSmall');
                    const name = headline ? headline.textContent.trim() : '';
                    if (!name) continue;

                    // User notes live in a div.dWzgKe container inside the
                    // same div.BsJqK wrapper that holds the button.  The
                    // note text is inside a div.u5DVOd element.
                    let note = null;
                    const itemContainer = btn.closest('div.BsJqK');
                    if (itemContainer) {
                        const noteEl = itemContainer.querySelector('div.dWzgKe div.u5DVOd');
                        if (noteEl) {
                            const text = noteEl.textContent.trim();
                            if (text) note = text;
                        }
                    }
                    results.push([name, note]);
                }
                return results;
            }"""
        )
        return [(r[0], r[1]) for r in items]

    async def _fetch_getlist_coords(self, page) -> list[tuple[float, float]]:
        """Extract the getlist URL from page HTML, fetch it, parse coordinates."""
        page_html = await page.content()
        m = _GETLIST_RE.search(page_html)
        if not m:
            logger.warning("getlist_url_not_found", error_category="external_api")
            return []

        path = html_mod.unescape(m.group(1))
        getlist_url = "https://www.google.com" + path
        # Force English locale for consistent parsing
        getlist_url = re.sub(r"hl=[a-z]{2}", "hl=en", getlist_url)

        try:
            resp_text = await page.evaluate(
                """async (url) => {
                    const resp = await fetch(url);
                    return await resp.text();
                }""",
                getlist_url,
            )
        except Exception as exc:
            logger.warning("getlist_fetch_failed", error=str(exc), error_category="external_api")
            return []

        return _parse_coords_from_getlist(resp_text)


def _parse_coords_from_getlist(text: str) -> list[tuple[float, float]]:
    """Parse unique (lat, lng) pairs from a getlist response."""
    seen: set[tuple[str, str]] = set()
    coords: list[tuple[float, float]] = []

    # Primary: address+coord blocks (more reliable ordering)
    for m in _ADDR_COORD_RE.finditer(text):
        lat_s, lng_s = m.group(3), m.group(4)
        key = (lat_s, lng_s)
        if key not in seen:
            seen.add(key)
            coords.append((float(lat_s), float(lng_s)))

    # Fallback: bare coord blocks not yet seen
    for m in _COORDS_RE.finditer(text):
        lat_s, lng_s = m.group(1), m.group(2)
        key = (lat_s, lng_s)
        if key not in seen:
            seen.add(key)
            coords.append((float(lat_s), float(lng_s)))

    return coords


def _pair_names_coords_notes(
    names: list[str],
    coords: list[tuple[float, float]],
    notes: list[str | None],
) -> list[ScrapedPlace]:
    """Pair DOM names/notes with getlist coordinates by order.

    If both sources have data, pairs them positionally (the list page and
    getlist endpoint return items in the same order). If only names or only
    coordinates are available, creates entries with the available data.
    """
    places: list[ScrapedPlace] = []

    if names and coords:
        count = min(len(names), len(coords))
        for i in range(count):
            places.append(
                ScrapedPlace(
                    name=names[i],
                    latitude=coords[i][0],
                    longitude=coords[i][1],
                    note=notes[i] if i < len(notes) else None,
                )
            )
        for i in range(count, len(coords)):
            places.append(ScrapedPlace(name="", latitude=coords[i][0], longitude=coords[i][1]))
    elif names:
        for i, name in enumerate(names):
            places.append(
                ScrapedPlace(
                    name=name,
                    latitude=0.0,
                    longitude=0.0,
                    note=notes[i] if i < len(notes) else None,
                )
            )
    elif coords:
        for lat, lng in coords:
            places.append(ScrapedPlace(name="", latitude=lat, longitude=lng))

    return places
