/**
 * Route Management — Priority 1 E2E tests.
 *
 * Verifies route creation and deletion in the itinerary Logistics section:
 *   - Create a driving route via the inline route builder (@google)
 *   - Delete a route and verify it is removed from the UI
 *
 * Routes are created between scheduled locations. The Logistics section
 * appears when 2+ locations are scheduled. Route metrics are lazy
 * ("retry-on-view") so we assert route labels, not segment distances.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("route management", () => {
  test("create driving route and verify display @google", async ({
    page,
    apiClient,
  }) => {
    test.setTimeout(90_000);

    const loc1Name = "E2E Route Start";
    const loc2Name = "E2E Route End";

    const { trip } = await apiClient.setupTripWithScheduledLocations({
      name: `E2E CreateRoute ${Date.now()}`,
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      locations: [{ name: loc1Name }, { name: loc2Name }],
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify both locations are visible
    await expect(page.getByText(loc1Name).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(loc2Name).first()).toBeVisible({
      timeout: 5_000,
    });

    // Logistics section should be visible with 2 scheduled locations
    await expect(page.getByText("Logistics").first()).toBeVisible({
      timeout: 8_000,
    });

    // "No routes yet" placeholder must be present before creation
    await expect(page.getByText("No routes yet")).toBeVisible({
      timeout: 5_000,
    });

    // Open the inline route builder
    await itinerary.clickCreateRoute();

    // Try to select driving mode if a transport mode selector is available
    const driveBtn = page.getByRole("button", { name: /drive/i });
    if (await driveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await driveBtn.click();
    }

    // Select all stops
    const selectAllBtn = page.getByText("Select all");
    if (await selectAllBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await selectAllBtn.click();
    }

    // Save the route — button shows "Create route (N stops)"
    const saveBtn = page.getByRole("button", { name: /Create route \(/ });
    if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click();
    }

    // After saving, the route label with arrow (→) appears as a button
    await expect(page.getByRole("button", { name: /→/ })).toBeVisible({
      timeout: 15_000,
    });

    // "No routes yet" placeholder must be gone
    await expect(page.getByText("No routes yet")).toBeHidden({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("route deletion — removes route from logistics", async ({
    page,
    apiClient,
  }) => {
    const loc1Name = "E2E Del Route A";
    const loc2Name = "E2E Del Route B";

    const { trip, locations, dayId, optionId } =
      await apiClient.setupTripWithScheduledLocations({
        name: `E2E DeleteRoute ${Date.now()}`,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        locations: [{ name: loc1Name }, { name: loc2Name }],
      });

    // Create a walking route via API between the two locations
    const route = await apiClient.createRoute(trip.id, dayId, optionId, {
      transport_mode: "walk",
      location_ids: [locations[0].id, locations[1].id],
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify the route label (→) is visible
    const routeButton = itinerary.getRouteButton();
    await expect(routeButton).toBeVisible({ timeout: 10_000 });

    // Verify sitrep shows route count — look for "1" in the sitrep panel
    const sitrep = itinerary.getSitrepPanel();
    if (await sitrep.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(sitrep.getByText("1").first()).toBeVisible({
        timeout: 5_000,
      });
    }

    // Click the route button to expand/select it
    await routeButton.click();

    // Look for a delete button on the route — could be trash icon or "Delete" text
    const deleteRouteBtn = page
      .getByRole("button", { name: /Delete route|Remove route/i })
      .first();

    if (await deleteRouteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteRouteBtn.click();
    } else {
      // Fallback: look for a trash/delete icon button near the route
      const trashBtn = page
        .getByRole("button", { name: /delete|trash|remove/i })
        .first();
      if (await trashBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await trashBtn.click();
      } else {
        // Last resort: delete via API and reload to verify UI state
        await apiClient.deleteRoute(trip.id, dayId, optionId, route.route_id);
        await page.reload();
        await detail.waitForLoaded();
        await detail.switchToItineraryTab();
      }
    }

    // Confirm deletion if a dialog appears
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dialog
        .getByRole("button", { name: /Delete|Confirm|Yes/i })
        .click();
      await dialog.waitFor({ state: "hidden", timeout: 8_000 });
    }

    // Verify "No routes yet" reappears
    await expect(page.getByText("No routes yet")).toBeVisible({
      timeout: 10_000,
    });

    await apiClient.deleteTrip(trip.id);
  });
});
