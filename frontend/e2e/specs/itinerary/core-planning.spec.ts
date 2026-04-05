/**
 * Core Planning Features — Priority 1 E2E tests.
 *
 * Verifies fundamental itinerary planning operations:
 *   - Time period assignment and persistence
 *   - Removing a location from a day (returns to unscheduled panel)
 *   - Location reorder persistence after reload
 *
 * All tests use API setup via `setupTripWithScheduledLocations` for speed,
 * then verify behavior through the UI.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("core planning features", () => {
  test("time period assignment — change and verify persistence", async ({
    page,
    apiClient,
  }) => {
    const locationName = "E2E TimePeriod Spot";

    const { trip, locations, dayId, optionId } =
      await apiClient.setupTripWithScheduledLocations({
        name: `E2E TimePeriod ${Date.now()}`,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        locations: [{ name: locationName }],
        timePeriod: "morning",
      });

    const detail = new TripDetailPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify the location is visible and shows "Morning" initially
    await expect(page.getByText(locationName).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Time: Morning" })
    ).toBeVisible({ timeout: 5_000 });

    // Change the time period via API to "afternoon"
    await apiClient.updateOptionLocation(
      trip.id,
      dayId,
      optionId,
      locations[0].id,
      { time_period: "afternoon" }
    );

    // Reload to verify persistence
    await page.reload();
    await detail.waitForLoaded();
    await detail.switchToItineraryTab();

    await expect(page.getByText(locationName).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Time: Afternoon" })
    ).toBeVisible({ timeout: 8_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("remove location from day — returns to unscheduled panel", async ({
    page,
    apiClient,
  }) => {
    const loc1Name = "E2E Remove Alpha";
    const loc2Name = "E2E Remove Beta";

    const { trip } = await apiClient.setupTripWithScheduledLocations({
      name: `E2E RemoveLoc ${Date.now()}`,
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      locations: [{ name: loc1Name }, { name: loc2Name }],
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify both locations are visible in the timeline
    await expect(page.getByText(loc1Name).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(loc2Name).first()).toBeVisible({
      timeout: 5_000,
    });

    // Remove location 1 from the day
    await itinerary.removeLocationFromDay(loc1Name);

    // Verify location 1 disappears from the timeline area
    // Wait for the removal to process
    await expect(
      page.getByRole("button", { name: `Remove ${loc1Name}` })
    ).toBeHidden({ timeout: 8_000 });

    // Verify location 1 appears in the unscheduled panel
    const panel = itinerary.getUnscheduledPanel();
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel.getByText(loc1Name)).toBeVisible({
      timeout: 5_000,
    });

    // Verify location 2 is still in the timeline
    await expect(page.getByText(loc2Name).first()).toBeVisible({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("location reorder — drag handle reorder persists after reload", async ({
    page,
    apiClient,
  }) => {
    const { trip, locations, dayId, optionId } =
      await apiClient.setupTripWithScheduledLocations({
        name: `E2E Reorder ${Date.now()}`,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        locations: [
          { name: "Alpha Stop" },
          { name: "Beta Stop" },
          { name: "Gamma Stop" },
        ],
      });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify initial order: all three locations visible
    await expect(page.getByText("Alpha Stop").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Beta Stop").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Gamma Stop").first()).toBeVisible({
      timeout: 5_000,
    });

    // Use API to reorder: Gamma, Alpha, Beta
    const [gamma, alpha, beta] = [locations[2], locations[0], locations[1]];
    await apiClient.reorderOptionLocations(trip.id, dayId, optionId, [
      gamma.id,
      alpha.id,
      beta.id,
    ]);

    // Reload page to see the new order
    await page.reload();
    await detail.waitForLoaded();
    await detail.switchToItineraryTab();

    // After reorder, check that Gamma appears before Alpha in the page
    // by finding the text of the first "Reorder" button (drag handle)
    const reorderButtons = page.getByRole("button", { name: /Reorder/ });
    await expect(reorderButtons.first()).toHaveAccessibleName(/Gamma/, {
      timeout: 10_000,
    });

    await apiClient.deleteTrip(trip.id);
  });
});
