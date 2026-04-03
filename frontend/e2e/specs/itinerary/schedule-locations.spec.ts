/**
 * Spec 10 — Itinerary: scheduling locations to days.
 *
 * Verifies that:
 *   - A location can be scheduled to a day via the "Add locations" dialog
 *     (items are buttons, not checkboxes).
 *   - Unscheduled locations appear in the "Not yet planned" sidebar panel.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("schedule locations to itinerary days", () => {
  test("schedule location from add-locations dialog", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Schedule ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-03",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Museum Alpha" });
    await apiClient.addLocation(trip.id, { name: "E2E Cafe Beta" });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // Open dialog and schedule first location
    await itinerary.clickAddLocations();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add locations to plan")).toBeVisible({
      timeout: 5_000,
    });

    // Items in the dialog are <button> elements — click the location by name
    await dialog
      .locator("button")
      .filter({ hasText: "E2E Museum Alpha" })
      .click();
    await page.waitForTimeout(300);

    // Submit — button text reads "Add 1 location"
    await dialog.getByRole("button", { name: /Add \d|Add locations/ }).click();

    // Wait for dialog to close
    await expect(dialog).toBeHidden({ timeout: 8_000 });
    await page.waitForTimeout(1_500);

    // Location name must now be visible in the day timeline
    await expect(page.getByText("E2E Museum Alpha").first()).toBeVisible({
      timeout: 8_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("unscheduled panel shows locations not in any day", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Unscheduled ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Park Gamma" });
    await apiClient.addLocation(trip.id, { name: "E2E Hotel Delta" });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // Before scheduling anything, both locations should appear in the
    // "Not yet planned" sidebar panel
    const panel = itinerary.getUnscheduledPanel();
    await expect(panel).toBeVisible({ timeout: 8_000 });

    await expect(panel.getByText("E2E Park Gamma")).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText("E2E Hotel Delta")).toBeVisible({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });
});
