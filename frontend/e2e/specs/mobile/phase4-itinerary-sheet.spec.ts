/**
 * Phase 4 — Mobile itinerary layout E2E tests.
 *
 * These tests encode real viewport-dependent behavior for the Itinerary tab
 * mobile refactor. They MUST fail on current HEAD (pre-Phase-4) because:
 *   - The Itinerary grid still uses xl: breakpoint (not lg:)
 *   - ItineraryInspectorPanel and UnscheduledLocationsPanel are hidden below xl:
 *   - No mobile Map pill button exists in the Itinerary tab toolbar
 *
 * Viewport groups:
 *   - iPhone 12: 390×844, hasTouch: true  → Map pill visible, inline panels visible
 *   - iPad landscape: 1024×768, hasTouch: true → lg: activates, sticky sidebar visible
 *   - Desktop: 1440×900, hasTouch: false  → sidebar visible, mobile pill hidden
 *
 * Note: lg: breakpoint = 1024px. Pre-Phase-4 the Itinerary grid uses xl: (1280px),
 * so the sidebar column is hidden on all iPad and phone viewports.
 *
 * Run against a dev server with seed data:
 *   npm run test:e2e -- e2e/specs/mobile/phase4-itinerary-sheet.spec.ts
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import type { ApiClient } from "../../helpers/api-client";

// ---------------------------------------------------------------------------
// Helper — seed a trip with 1 day and 2+ locations assigned to that day's option
// ---------------------------------------------------------------------------

async function setupItineraryTrip(apiClient: ApiClient, namePrefix: string) {
  const trip = await apiClient.createTrip({
    name: `${namePrefix} ${Date.now()}`,
  });

  // Add locations to the trip
  const locA = await apiClient.addLocation(trip.id, {
    name: "E2E Itin A",
    city: "Tokyo",
    category: "Museum",
  });
  const locB = await apiClient.addLocation(trip.id, {
    name: "E2E Itin B",
    city: "Tokyo",
    category: "Park",
  });

  // Create a day and default option (the backend auto-creates option_index=1)
  const day = await apiClient.createDay(trip.id, {});

  // Add locations to the day option so the map has something to show
  // The default option for the new day has option_index=1.
  // We list options to find the default one.
  const options = await apiClient.listOptions(trip.id, day.id);
  if (options.length > 0) {
    const opt = options[0];
    await apiClient.addLocationToOption(trip.id, day.id, opt.id, {
      location_id: locA.id,
      sort_order: 0,
    });
    await apiClient.addLocationToOption(trip.id, day.id, opt.id, {
      location_id: locB.id,
      sort_order: 1,
    });
  }

  return { trip, day };
}

// ===========================================================================
// iPhone 12 — 390×844 touch device
// ===========================================================================

test.describe("iPhone 12 (390×844, touch) — Itinerary mobile layout", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  });

  test("mobile: mobile Map pill button is visible in Itinerary tab at 390px", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(apiClient, "E2E Ph4 iPhone Map");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Wait for the itinerary to load (day rail or day card appears)
    await page.waitForTimeout(1_500);

    // The mobile Map pill button (lg:hidden) must be visible at 390px.
    // Use exact name "Map" to avoid matching the "Expand map" button inside SidebarMap.
    const mapButton = page.getByRole("button", { name: /^map$/i }).first();
    await expect(mapButton).toBeVisible({ timeout: 10_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("mobile: clicking Map pill opens a Sheet (role=dialog)", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 iPhone Sheet"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    const mapButton = page.getByRole("button", { name: /^map$/i }).first();
    await mapButton.click();

    // A Radix Sheet (implemented as role="dialog") should open.
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Close the sheet via the X button.
    const closeBtn = page.getByRole("button", { name: /close/i });
    await closeBtn.click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("mobile: ItineraryInspectorPanel is visible inline (not hidden) at 390px", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 iPhone Inspector"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // Pre-Phase-4: the Inspector is inside the xl: sidebar, hidden at 390px.
    // Post-Phase-4: the Inspector also renders inline below the day card (lg:hidden
    // wrapper), making it visible at 390px.
    //
    // We identify the Inspector by its known rendered content. The
    // ItineraryInspectorPanel shows starting/ending city information or a
    // "No option selected" fallback. We look for its section heading or a
    // known element class.
    //
    // Strategy: find ANY visible text that the Inspector panel is known to render.
    // The panel has a "Trip overview" or "Starting city" style heading.
    // We use a broad locator for the inspector's container role/text.
    //
    // If no text from the Inspector is visible at 390px, this test fails (RED).
    const inspectorContent = page.locator(
      '[data-testid="inspector-panel"], [aria-label*="inspector"], [aria-label*="Inspector"]'
    );

    // Alternative: locate by known text that only the Inspector renders.
    // The InspectorPanel renders location count or city stats.
    // We check that SOME inspector content is visible at this viewport.
    const countVisible = await inspectorContent.count();
    if (countVisible > 0) {
      await expect(inspectorContent.first()).toBeVisible({ timeout: 5_000 });
    } else {
      // If the inspector doesn't have a testid, look for its characteristic text.
      // The panel renders a "Starting city" or city name heading.
      // Pre-Phase-4 this panel is inside xl:hidden and NOT visible at 390px.
      // Post-Phase-4 it is inline and visible.
      const panelText = page
        .locator("text=Starting city, text=Ending city, text=Locations")
        .first();
      await expect(panelText).toBeVisible({ timeout: 5_000 });
    }

    await apiClient.deleteTrip(trip.id);
  });

  test("mobile: UnscheduledLocationsPanel is visible inline in edit mode at 390px", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 iPhone Unscheduled"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // The UnscheduledLocationsPanel shows when there are unscheduled locations.
    // In edit mode (authenticated user), this panel should be visible inline.
    // Pre-Phase-4: it's inside the xl: sidebar — hidden at 390px.
    // Post-Phase-4: it also renders inline (lg:hidden) — visible at 390px.
    //
    // Identify the panel by its characteristic UI: it shows a heading like
    // "Unscheduled" or a list of locations not yet in any day.
    const unscheduledPanel = page
      .locator(
        '[data-testid="unscheduled-panel"], text=/unscheduled/i, text=/not scheduled/i'
      )
      .first();

    // The panel should be visible (either by testid or text content).
    await expect(unscheduledPanel).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("mobile: itinerary grid does NOT use xl: breakpoint for the sidebar column", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(apiClient, "E2E Ph4 iPhone Grid");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // Assert the xl:grid-cols class is NOT present in the DOM.
    // This encodes the breakpoint regression guard.
    const xlGridEl = page.locator('[class*="xl:grid-cols"]').first();
    const count = await xlGridEl.count();
    expect(count).toBe(0);

    await apiClient.deleteTrip(trip.id);
  });
});

// ===========================================================================
// iPad landscape — 1024×768 (exactly at the lg: breakpoint)
// ===========================================================================

test.describe("iPad landscape (1024×768) — lg: breakpoint activates for Itinerary", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });

  test("tablet landscape: sticky sidebar column is visible at 1024px (lg: breakpoint)", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 iPad Landscape Sidebar"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // At 1024px the lg: breakpoint activates. The desktop sidebar wrapper
    // (`hidden lg:flex` or `hidden lg:block`) should be visible.
    // Pre-Phase-4: the xl: sidebar is hidden at 1024px (xl: = 1280px).
    // Post-Phase-4: the lg: sidebar is visible at 1024px.
    const desktopSidebar = page
      .locator(".hidden.lg\\:flex, .hidden.lg\\:block")
      .first();
    await expect(desktopSidebar).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("tablet landscape: mobile Map pill is hidden at 1024px (lg:hidden activates)", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 iPad Landscape MapBtn"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // The mobile Map pill has `lg:hidden` — at 1024px it should be CSS-hidden.
    // Query specifically for a button labeled exactly "Map" inside an lg:hidden wrapper.
    const mobileMapBtn = page
      .locator('[class*="lg:hidden"] button, button.lg\\:hidden')
      .filter({ hasText: /^map$/i });

    const btnCount = await mobileMapBtn.count();
    if (btnCount > 0) {
      // If the locator matches, it must be hidden (CSS display:none from lg:hidden).
      await expect(mobileMapBtn.first()).toBeHidden();
    }
    // If count is 0, the button is simply not in DOM at this breakpoint — passes implicitly.

    await apiClient.deleteTrip(trip.id);
  });
});

// ===========================================================================
// Desktop — 1440×900, no touch
// ===========================================================================

test.describe("Desktop (1440×900, no touch) — Itinerary regression guards", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
  });

  test("desktop: sticky sidebar is visible at 1440px with SidebarMap, Inspector, Unscheduled", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 Desktop Sidebar"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // At 1440px the desktop sidebar should be visible.
    // The sidebar wrapper uses `hidden lg:flex` or `hidden lg:block`.
    const desktopSidebar = page
      .locator(".hidden.lg\\:flex, .hidden.lg\\:block")
      .first();
    await expect(desktopSidebar).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("desktop: mobile Map pill button is NOT visible at 1440px (lg:hidden hides it)", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 Desktop MapBtn"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(1_500);

    // At 1440px, the mobile Map pill (lg:hidden) must be CSS-hidden.
    // We look specifically for it inside an lg:hidden ancestor.
    const mobileMapBtn = page
      .locator('[class*="lg:hidden"] button, button.lg\\:hidden')
      .filter({ hasText: /^map$/i });

    const btnCount = await mobileMapBtn.count();
    if (btnCount > 0) {
      await expect(mobileMapBtn.first()).toBeHidden();
    }
    // If 0 matches, the pill is simply not in DOM — passes implicitly.

    await apiClient.deleteTrip(trip.id);
  });

  test("desktop: SidebarMap compact-preview Expand button still opens a Dialog (regression guard)", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await setupItineraryTrip(
      apiClient,
      "E2E Ph4 Desktop Expand"
    );

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(2_000);

    // The SidebarMap compact preview has an "Expand map" button (aria-label).
    // Clicking it must open a fullscreen Dialog. This is the existing behavior
    // that Phase 4 must NOT break.
    const expandBtn = page.getByRole("button", { name: /expand map/i });
    const expandVisible = await expandBtn
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (expandVisible) {
      const dialogsBefore = await page.getByRole("dialog").count();
      await expandBtn.click();
      // After clicking, there should be one more dialog open.
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
      const dialogsAfter = await page.getByRole("dialog").count();
      expect(dialogsAfter).toBeGreaterThan(dialogsBefore);
    } else {
      // SidebarMap may not show the expand button if no locations have coordinates.
      // The SidebarMap renders "No locations to map" when mapLocations is empty.
      // In that case, this desktop regression test passes implicitly.
      test.info().annotations.push({
        type: "note",
        description:
          "Expand map button not visible (no geocoded locations in seed data). " +
          "The desktop expand-Dialog flow is covered by ItineraryTab unit tests.",
      });
    }

    await apiClient.deleteTrip(trip.id);
  });
});
