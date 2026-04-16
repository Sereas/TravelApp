/**
 * Trips list E2E tests — visibility & UI deletion.
 *
 * Test 1 uses `testTrip` (auto-created/cleaned fixture).
 * Test 2 creates via API, deletes through the UI confirm dialog.
 */

import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";

test.describe("Trips list", () => {
  test("created trip visible in list", async ({ page, testTrip }) => {
    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    await expect(
      page.getByRole("heading", { level: 3, name: testTrip.name })
    ).toBeVisible();

    await test.info().attach("01-trip-in-list.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("delete trip from UI removes from list", async ({
    page,
    apiClient,
  }) => {
    const tripName = `E2E Delete Test ${Date.now()}`;
    const trip = await apiClient.createTrip({ name: tripName });
    apiClient.registerForTeardown(trip.id);

    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // Verify trip card is visible
    const tripCard = page.getByRole("heading", { level: 3, name: tripName });
    await expect(tripCard).toBeVisible();

    await test.info().attach("02-trip-before-delete.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Hover card to reveal the delete button (opacity-0 → opacity-100)
    await tripCard.hover();

    // Click the trash button
    await page
      .getByRole("button", { name: `Delete ${tripName}` })
      .click();

    // Confirmation dialog should appear
    await expect(
      page.getByRole("heading", { name: "Delete trip?" })
    ).toBeVisible();
    await expect(page.getByText(/permanently delete/)).toBeVisible();

    await test.info().attach("03-delete-confirmation.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Confirm deletion
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete trip" })
      .click();

    // Trip card should disappear
    await expect(tripCard).not.toBeVisible({ timeout: 10_000 });

    await test.info().attach("04-trip-deleted.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
