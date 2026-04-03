/**
 * Trips CRUD E2E tests.
 *
 * - `apiClient` fixture provides direct API access for setup/teardown.
 * - `testTrip` fixture creates a trip before the test and cleans it up after.
 * - Every test is fully independent — no shared state.
 */

import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("Trips CRUD", () => {
  test("create trip via dialog and see it on detail page", async ({
    page,
    apiClient,
  }) => {
    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    const tripName = `E2E Dialog Trip ${Date.now()}`;
    const tripId = await tripsPage.createTrip(tripName);

    // Register for teardown in case the test fails before manual cleanup
    apiClient.registerForTeardown(tripId);

    // We should now be on the trip detail page
    await expect(page).toHaveURL(`/trips/${tripId}`);

    const detailPage = new TripDetailPage(page);
    await detailPage.waitForLoaded();

    // The trip name should appear in the <h1>
    const heading = await detailPage.getTripName();
    expect(heading).toContain(tripName);

    // Cleanup
    await apiClient.deleteTrip(tripId);
  });

  test("created trip appears in trips list", async ({ page, testTrip }) => {
    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // The trip was created via API in the testTrip fixture
    // Its name should be visible as an h3 card heading
    await expect(
      page.getByRole("heading", { level: 3, name: testTrip.name })
    ).toBeVisible();
  });

  test("delete trip removes it from list", async ({ page, apiClient }) => {
    // Create a trip via API specifically for this deletion test
    const tripName = `E2E Delete Trip ${Date.now()}`;
    const trip = await apiClient.createTrip({ name: tripName });

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // Confirm it's visible before we delete
    await expect(
      page.getByRole("heading", { level: 3, name: tripName })
    ).toBeVisible();

    // Delete via API (simulates the deletion that would happen through the UI)
    await apiClient.deleteTrip(trip.id);

    // Reload the page to reflect the deletion
    await page.reload();
    await tripsPage.waitForLoaded();

    // The trip card should no longer be present
    await expect(
      page.getByRole("heading", { level: 3, name: tripName })
    ).not.toBeVisible();
  });
});
