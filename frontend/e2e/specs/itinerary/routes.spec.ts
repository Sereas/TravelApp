/**
 * Spec 12 — Itinerary: route creation.
 *
 * Verifies that two scheduled locations can be connected into a walking
 * route via the inline route builder in the Logistics section.
 *
 * After route creation the route label (stopA → stopB) should appear in
 * the Logistics card.  Metrics are lazy ("retry-on-view") so we only assert
 * the route name exists, not segment distances.
 *
 * Tagged @google because route calculation may hit the Google Routes API
 * when the route is first viewed. The creation itself is always available.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("route management @google", () => {
  test("create walking route between two scheduled locations", async ({
    page,
    apiClient,
  }) => {
    test.setTimeout(90_000);

    const trip = await apiClient.createTrip({
      name: `E2E Routes ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Stop One" });
    await apiClient.addLocation(trip.id, { name: "E2E Stop Two" });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // Schedule both locations to the first day
    await itinerary.clickAddLocations();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add locations to plan")).toBeVisible({
      timeout: 5_000,
    });

    // Click each location button inside the dialog
    await dialog.locator("button").filter({ hasText: "E2E Stop One" }).click();
    await page.waitForTimeout(200);
    await dialog.locator("button").filter({ hasText: "E2E Stop Two" }).click();
    await page.waitForTimeout(200);

    // Submit
    await dialog.getByRole("button", { name: /Add \d|Add locations/ }).click();
    await expect(dialog).toBeHidden({ timeout: 8_000 });
    await page.waitForTimeout(1_500);

    // Verify both locations are visible in the timeline
    await expect(page.getByText("E2E Stop One").first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("E2E Stop Two").first()).toBeVisible({
      timeout: 5_000,
    });

    // The Logistics section should be visible now (2+ locations scheduled)
    await expect(page.getByText("Logistics").first()).toBeVisible({
      timeout: 8_000,
    });

    // "No routes yet" placeholder must be present before creation
    await expect(page.getByText("No routes yet")).toBeVisible({
      timeout: 5_000,
    });

    // Open the inline route builder
    await itinerary.clickCreateRoute();
    await page.waitForTimeout(1_000);

    // Click "Select all" to pick all stops, then save
    const selectAllBtn = page.getByText("Select all");
    if (await selectAllBtn.isVisible().catch(() => false)) {
      await selectAllBtn.click();
      await page.waitForTimeout(500);
    }

    // Click the save button — it shows "Create route (N stops)"
    // It may need scrolling to be visible.
    const saveBtn = page.getByRole("button", { name: /Create route \(/ });
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click();
    }
    // else: the route might auto-save or was already saving

    // Wait for the saving to complete — "Saving…" disappears, route label appears
    await page.waitForTimeout(5_000);

    // After saving, the route label "E2E Stop One → E2E Stop Two" appears as a button
    await expect(page.getByRole("button", { name: /→/ })).toBeVisible({
      timeout: 15_000,
    });

    // "No routes yet" placeholder must be gone
    await expect(page.getByText("No routes yet")).toBeHidden({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });
});
