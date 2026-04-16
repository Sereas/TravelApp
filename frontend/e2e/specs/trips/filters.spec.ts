/**
 * Trip filter tab E2E tests.
 *
 * Each test creates a past + upcoming trip via API, then verifies that
 * the All / Upcoming / Past tabs filter correctly.
 *
 * Filter logic (trips/page.tsx):
 *   isUpcoming = no end_date OR end_date >= today
 *   "Past" = end_date exists AND end_date < today
 */

import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";

test.describe("Trip filters", () => {
  test("upcoming tab shows future and ongoing trips", async ({
    page,
    apiClient,
  }) => {
    const ts = Date.now();
    const pastTrip = await apiClient.createTrip({
      name: `E2E Past Trip ${ts}`,
      start_date: "2024-06-01",
      end_date: "2024-06-10",
    });
    const upcomingTrip = await apiClient.createTrip({
      name: `E2E Upcoming Trip ${ts}`,
      start_date: "2026-09-01",
      end_date: "2026-09-15",
    });

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // All tab (default) — both trips visible
    await expect(tripsPage.tripCard(pastTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(upcomingTrip.name)).toBeVisible();

    await test.info().attach("01-all-tab-both-trips.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Upcoming tab — only future trip
    await page.getByRole("tab", { name: "Upcoming" }).click();
    // Wait for the active pill style (text-white) to render after CSS transition
    await expect(page.getByRole("tab", { name: "Upcoming" })).toHaveCSS(
      "color",
      "rgb(255, 255, 255)"
    );

    await expect(tripsPage.tripCard(upcomingTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(pastTrip.name)).not.toBeVisible();

    await test.info().attach("02-upcoming-tab-filtered.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(pastTrip.id);
    await apiClient.deleteTrip(upcomingTrip.id);
  });

  test("past tab shows ended trips", async ({ page, apiClient }) => {
    const ts = Date.now();
    const pastTrip = await apiClient.createTrip({
      name: `E2E Past Trip ${ts}`,
      start_date: "2024-06-01",
      end_date: "2024-06-10",
    });
    const upcomingTrip = await apiClient.createTrip({
      name: `E2E Upcoming Trip ${ts}`,
      start_date: "2026-09-01",
      end_date: "2026-09-15",
    });

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // Past tab — only ended trip
    await page.getByRole("tab", { name: "Past" }).click();
    // Wait for the active pill style (text-white) to render after CSS transition
    await expect(page.getByRole("tab", { name: "Past" })).toHaveCSS(
      "color",
      "rgb(255, 255, 255)"
    );

    await expect(tripsPage.tripCard(pastTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(upcomingTrip.name)).not.toBeVisible();

    await test.info().attach("03-past-tab-filtered.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(pastTrip.id);
    await apiClient.deleteTrip(upcomingTrip.id);
  });
});
