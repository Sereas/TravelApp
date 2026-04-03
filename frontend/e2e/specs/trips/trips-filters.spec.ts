/**
 * Trip filter tab E2E tests.
 *
 * Selectors derived from `frontend/src/app/trips/page.tsx`:
 *   - Filter tabs: role="tab" with labels "All", "Upcoming", "Past"
 *     (page.tsx lines 131-143; role="tablist" aria-label="Trip filters")
 *   - Empty filter message: "No {filter} trips yet." (page.tsx line 162)
 *   - Trip cards: <h3> with the trip name (via TripsListPage.tripCard)
 *
 * isUpcoming logic (page.tsx lines 20-24):
 *   - A trip without end_date is always upcoming
 *   - A trip with end_date in the past is "past"
 */

import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";

test.describe("Trip list filters", () => {
  test("filter tabs show correct trips", async ({ page, apiClient }) => {
    const ts = Date.now();

    // Create a trip ending in the past
    const pastTrip = await apiClient.createTrip({
      name: `E2E Past Trip ${ts}`,
      end_date: "2020-01-01",
    });

    // Create a trip ending in the future (no end_date is always upcoming)
    const upcomingTrip = await apiClient.createTrip({
      name: `E2E Upcoming Trip ${ts}`,
      end_date: "2099-12-31",
    });

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // ── "All" tab (default) ────────────────────────────────────────────────
    await page.getByRole("tab", { name: "All" }).click();
    await expect(tripsPage.tripCard(pastTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(upcomingTrip.name)).toBeVisible();

    // ── "Upcoming" tab ─────────────────────────────────────────────────────
    await page.getByRole("tab", { name: "Upcoming" }).click();
    await expect(tripsPage.tripCard(upcomingTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(pastTrip.name)).not.toBeVisible();

    // ── "Past" tab ─────────────────────────────────────────────────────────
    await page.getByRole("tab", { name: "Past" }).click();
    await expect(tripsPage.tripCard(pastTrip.name)).toBeVisible();
    await expect(tripsPage.tripCard(upcomingTrip.name)).not.toBeVisible();

    // Cleanup
    await apiClient.deleteTrip(pastTrip.id);
    await apiClient.deleteTrip(upcomingTrip.id);
  });

  test("empty 'Past' filter shows 'No past trips yet.' message", async ({
    page,
    apiClient,
  }) => {
    const ts = Date.now();

    // Create only an upcoming trip so the "Past" filter is empty
    const upcomingTrip = await apiClient.createTrip({
      name: `E2E OnlyUpcoming ${ts}`,
      end_date: "2099-12-31",
    });

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // Switch to "Past" tab — should show empty message
    await page.getByRole("tab", { name: "Past" }).click();

    // page.tsx line 162: "No {filter} trips yet." where filter = "past"
    await expect(page.getByText("No past trips yet.")).toBeVisible();

    // The upcoming trip card should not be visible under "Past"
    await expect(tripsPage.tripCard(upcomingTrip.name)).not.toBeVisible();

    // Cleanup
    await apiClient.deleteTrip(upcomingTrip.id);
  });
});
