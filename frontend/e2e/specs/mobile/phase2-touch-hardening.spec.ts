/**
 * Phase 2 touch-hardening E2E tests.
 *
 * These tests encode real viewport-dependent behavior that JSDOM unit tests
 * cannot verify:
 *   - Menu buttons visible without hover on touch devices
 *   - Filter popovers stay inside viewport on small screens
 *   - LocationCard grid column count at various viewports
 *   - Desktop regression: menu button still hidden-until-hover
 *
 * All scenarios MUST fail on current HEAD (pre-Phase-2 implementation).
 * Run them with a dev server + seed data to confirm RED state.
 *
 * Viewport groups:
 *   - iPhone 12: 390×844, hasTouch: true
 *   - iPad portrait: 768×1024, hasTouch: true
 *   - Desktop: 1440×900, hasTouch: false
 */

import { test, expect } from "../../fixtures/index";
import { devices } from "@playwright/test";
import { TripDetailPage } from "../../pages/TripDetailPage";
import type { ApiClient } from "../../helpers/api-client";

// ---------------------------------------------------------------------------
// Helper — create a trip with 3+ locations so the grid and filter pills render
// ---------------------------------------------------------------------------

async function setupTripWithLocations(
  apiClient: ApiClient,
  namePrefix: string
) {
  const trip = await apiClient.createTrip({
    name: `${namePrefix} ${Date.now()}`,
  });

  await apiClient.addLocation(trip.id, {
    name: "E2E Touch A",
    city: "Paris",
    category: "Museum",
  });
  await apiClient.addLocation(trip.id, {
    name: "E2E Touch B",
    city: "Lyon",
    category: "Café",
  });
  await apiClient.addLocation(trip.id, {
    name: "E2E Touch C",
    city: "Marseille",
    category: "Park",
  });

  return trip;
}

// ===========================================================================
// iPhone 12 — 390×844 touch device
// ===========================================================================

test.describe("iPhone 12 (390×844, touch)", () => {
  test.use({
    // iPhone 12 — no defaultBrowserType so this works inside describe.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  });

  test("LocationCard action buttons visible without hover on touch device", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Touch iPhone");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });

    // On touch devices, the delete button (hover-none:opacity-100) must be
    // visible immediately — no hover needed.
    const deleteButton = page
      .getByRole("button", { name: "Delete location" })
      .first();
    await expect(deleteButton).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("schedule popover fits inside viewport on iPhone 12", async ({
    page,
    apiClient,
  }) => {
    // Create trip with dates so schedule popover has day options
    const trip = await apiClient.createTrip({
      name: `E2E Popover iPhone ${Date.now()}`,
      start_date: "2026-08-01",
      end_date: "2026-08-03",
    });
    await apiClient.addLocation(trip.id, { name: "E2E Touch A" });
    await apiClient.generateDays(trip.id);

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });

    // Click the "Schedule to a day" button on the location card
    const scheduleBtn = page.getByRole("button", {
      name: /Schedule to a day/i,
    });
    await scheduleBtn.click();
    await page.waitForTimeout(400);

    // The schedule popover should fit inside the 390px viewport
    const popoverContent = page
      .locator('[data-radix-popper-content-wrapper]')
      .first();
    const box = await popoverContent.boundingBox();

    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 - 4);
    }

    await apiClient.deleteTrip(trip.id);
  });

  test("LocationCard grid shows 2 columns on iPhone 12 landscape / small tablet", async ({
    page,
    apiClient,
  }) => {
    // At 390px (portrait iPhone 12), with sm:grid-cols-2 (640px breakpoint),
    // we are BELOW sm — so only 1 column is expected in portrait.
    // This test verifies the breakpoint isn't regressed to a larger value.
    // We'll test at 660×480 (landscape) where sm:grid-cols-2 should trigger.
    await page.setViewportSize({ width: 660, height: 480 });

    const trip = await setupTripWithLocations(apiClient, "E2E Grid iPhone");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });
    await expect(detail.locationCard("E2E Touch B")).toBeVisible();

    // Get bounding boxes of the first two location cards (h3 elements inside cards)
    const cards = page.locator("[data-location-id]");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const box0 = await cards.nth(0).boundingBox();
    const box1 = await cards.nth(1).boundingBox();

    if (box0 && box1) {
      // At 660px (sm breakpoint = 640px), sm:grid-cols-2 means cards A and B
      // should be on the SAME row (same y coordinate, approximately).
      // Allow ±2px tolerance for border/rounding.
      expect(Math.abs(box0.y - box1.y)).toBeLessThanOrEqual(2);
    }

    await apiClient.deleteTrip(trip.id);
  });
});

// ===========================================================================
// iPad portrait — 768×1024 touch device
// ===========================================================================

test.describe("iPad portrait (768×1024, touch)", () => {
  test.use({
    // Use only the safe subset of device descriptors (no defaultBrowserType
    // which forces a new worker and cannot be used inside describe groups).
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  });

  test("LocationCard action buttons visible without hover on iPad touch", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Touch iPad");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });

    // On touch devices, the delete button must be visible immediately
    const deleteButton = page
      .getByRole("button", { name: "Delete location" })
      .first();
    await expect(deleteButton).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("LocationCard grid shows 2 columns at 768px (sm:grid-cols-2 active)", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Grid iPad");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });
    await expect(detail.locationCard("E2E Touch B")).toBeVisible();

    const cards = page.locator("[data-location-id]");
    const box0 = await cards.nth(0).boundingBox();
    const box1 = await cards.nth(1).boundingBox();

    if (box0 && box1) {
      // 768px >= 640px (sm), so sm:grid-cols-2 should be active.
      // Cards A and B should be on the same row (same y coordinate).
      expect(Math.abs(box0.y - box1.y)).toBeLessThanOrEqual(2);
    }

    await apiClient.deleteTrip(trip.id);
  });
});

// ===========================================================================
// Desktop — 1440×900, no touch (regression guards)
// ===========================================================================

test.describe("Desktop (1440×900, no touch)", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
  });

  test("LocationCard delete button hidden before hover on desktop (regression guard)", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Hover Desktop");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });

    // On a hover-capable device the delete button uses hover-hover:opacity-0
    // — invisible until mouse hovers the card.
    const deleteButton = page
      .getByRole("button", { name: "Delete location" })
      .first();

    // Before hover: opacity-0 makes it invisible to Playwright
    await expect(deleteButton).not.toBeVisible({ timeout: 3_000 });

    // After hovering: hover-hover:group-hover:opacity-100 makes it visible
    const card = page.locator("[data-location-id]").first();
    await card.hover();
    await expect(deleteButton).toBeVisible({ timeout: 3_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("LocationCard grid shows 3 columns at 1440px (lg:grid-cols-3)", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Grid Desktop");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });
    await expect(detail.locationCard("E2E Touch B")).toBeVisible();
    await expect(detail.locationCard("E2E Touch C")).toBeVisible();

    const cards = page.locator("[data-location-id]");
    const box0 = await cards.nth(0).boundingBox();
    const box1 = await cards.nth(1).boundingBox();
    const box2 = await cards.nth(2).boundingBox();

    if (box0 && box1 && box2) {
      // At 1440px (lg = 1024px), lg:grid-cols-3 should be active.
      // All three cards should be on the same row.
      expect(Math.abs(box0.y - box1.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(box0.y - box2.y)).toBeLessThanOrEqual(2);
    }

    await apiClient.deleteTrip(trip.id);
  });

  test("filter popover opens at usable width on desktop (regression guard)", async ({
    page,
    apiClient,
  }) => {
    const trip = await setupTripWithLocations(apiClient, "E2E Popover Desktop");

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Touch A")).toBeVisible({
      timeout: 20_000,
    });

    // Open City popover
    await page.getByRole("button", { name: /city/i }).click();
    await page.waitForTimeout(400);

    // On desktop the popover should be at least 160px wide (reasonable content width)
    const popoverContent = page
      .locator("[data-radix-popper-content-wrapper]")
      .first();
    const box = await popoverContent.boundingBox();

    if (box) {
      // Should be a reasonable width — not collapsed to 0
      expect(box.width).toBeGreaterThan(160);
      // Should fit within viewport
      expect(box.x + box.width).toBeLessThanOrEqual(1440);
    }

    await apiClient.deleteTrip(trip.id);
  });
});
