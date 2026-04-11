/**
 * Phase 0 — Route-save performance baseline.
 *
 * Records the wall-clock time from clicking "Create route (N stops)" to the
 * route label appearing in the Logistics card. Does NOT fail on slow — Phase 4
 * will add `expect(elapsedMs).toBeLessThan(800)` once the optimisation lands.
 *
 * Today's observed baseline: ~3 000 – 7 000 ms (network round-trip + metrics
 * retry on first view).
 *
 * Baseline is written to the test annotation so it appears in the HTML report.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("route save — performance baseline @maps-perf", () => {
  test("measure wall-clock time from route-save click to route label appearing", async ({
    page,
    apiClient,
  }) => {
    test.setTimeout(120_000);

    const trip = await apiClient.createTrip({
      name: `E2E RoutePerfBaseline ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
    });

    await apiClient.addLocation(trip.id, { name: "Perf Stop Alpha" });
    await apiClient.addLocation(trip.id, { name: "Perf Stop Beta" });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await itinerary.generateDays();

    // Schedule both locations to the first day.
    await itinerary.clickAddLocations();
    const dialog = page.getByRole("dialog");
    await dialog.locator("button").filter({ hasText: "Perf Stop Alpha" }).click();
    await page.waitForTimeout(200);
    await dialog.locator("button").filter({ hasText: "Perf Stop Beta" }).click();
    await page.waitForTimeout(200);
    await dialog.getByRole("button", { name: /Add \d|Add locations/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Wait for the Logistics section.
    await expect(page.getByText("Logistics").first()).toBeVisible({
      timeout: 10_000,
    });

    // Open the route builder.
    await itinerary.clickCreateRoute();
    await page.waitForTimeout(500);

    // Select all stops.
    const selectAllBtn = page.getByText("Select all");
    if (await selectAllBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await selectAllBtn.click();
      await page.waitForTimeout(300);
    }

    // ── START TIMER ────────────────────────────────────────────────────────
    const t0 = Date.now();

    const saveBtn = page.getByRole("button", { name: /Create route \(/ });
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click();
    }

    // Wait for the route arrow label to appear — this is our "done" signal.
    await page.getByRole("button", { name: /→/ }).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });

    const elapsedMs = Date.now() - t0;
    // ── END TIMER ──────────────────────────────────────────────────────────

    // Record baseline in the HTML report.
    test.info().annotations.push({
      type: "perf-baseline",
      description: `route-save → route-visible: ${elapsedMs} ms`,
    });

    console.log(`[route-save-perf] elapsed=${elapsedMs}ms`);

    // Phase 0: no performance budget enforced yet.
    // Phase 4 will replace this with: expect(elapsedMs).toBeLessThan(800);
    expect(elapsedMs).toBeGreaterThan(0); // trivial sanity — always passes

    await apiClient.deleteTrip(trip.id);
  });
});
