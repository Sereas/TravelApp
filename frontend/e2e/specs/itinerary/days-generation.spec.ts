/**
 * Spec 9 — Itinerary: day generation.
 *
 * Verifies that:
 *   - Generating days from a date-range trip creates the correct number of
 *     day cards in the day rail.
 *   - Adding a day manually increments the day count by one.
 *   - All generated day labels are visible in the day rail.
 *
 * Uses the `testTrip` fixture so cleanup is automatic.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("itinerary days generation", () => {
  test("generate days creates day cards matching date range", async ({
    page,
    apiClient,
  }) => {
    // Create a 3-day trip (Jul 1-3 inclusive)
    const trip = await apiClient.createTrip({
      name: `E2E DayGen ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-03",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // Expect the day rail to contain 3 day entries (Jul 1, 2, 3)
    // Day rail buttons include the month + day in their text
    const jul1 = page.locator("button").filter({ hasText: "Jul 1" });
    const jul2 = page.locator("button").filter({ hasText: "Jul 2" });
    const jul3 = page.locator("button").filter({ hasText: "Jul 3" });

    await expect(jul1.first()).toBeVisible({ timeout: 10_000 });
    await expect(jul2.first()).toBeVisible({ timeout: 5_000 });
    await expect(jul3.first()).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("add day manually increases day count", async ({ page, apiClient }) => {
    // Trip WITHOUT dates — the empty state shows "Add day" button
    const trip = await apiClient.createTrip({
      name: `E2E AddDay ${Date.now()}`,
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await page.waitForTimeout(2_000);

    // Empty state: "Add day" button visible (no dates = no generate)
    await page
      .getByRole("button", { name: /Add day/i })
      .first()
      .click({ timeout: 15_000 });
    await page.waitForTimeout(3_000);

    // Day 1 should appear in the rail
    await expect(page.getByRole("button", { name: /Day 1/i })).toBeVisible({
      timeout: 10_000,
    });

    // "Add day" should still be available — click again
    await page
      .getByRole("button", { name: /Add day/i })
      .first()
      .click({ timeout: 10_000 });
    await page.waitForTimeout(3_000);

    // Day 2 should appear
    await expect(page.getByRole("button", { name: /Day 2/i })).toBeVisible({
      timeout: 10_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("day rail shows all days after generation", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E DayRail ${Date.now()}`,
      start_date: "2026-09-10",
      end_date: "2026-09-12",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // All three dates should be discoverable in the rail
    for (const dayText of ["Sep 10", "Sep 11", "Sep 12"]) {
      await expect(
        page.locator("button").filter({ hasText: dayText }).first()
      ).toBeVisible({ timeout: 10_000 });
    }

    await apiClient.deleteTrip(trip.id);
  });
});
