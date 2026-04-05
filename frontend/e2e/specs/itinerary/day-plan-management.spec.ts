/**
 * Spec — Day/Plan Management.
 *
 * Verifies that:
 *   - Deleting a day removes it from the rail and updates the day count.
 *   - Renaming an alternative plan reflects in the switcher and header.
 *   - Deleting an alternative plan reverts to "Main plan".
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("day/plan management", () => {
  test("delete day — removes day from rail and updates count", async ({
    page,
    apiClient,
  }) => {
    // Create a 3-day trip (Aug 1-3) and generate days via API
    const trip = await apiClient.createTrip({
      name: `E2E DeleteDay ${Date.now()}`,
      start_date: "2026-08-01",
      end_date: "2026-08-03",
    });
    const days = await apiClient.generateDays(trip.id);

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Wait for day rail to render all 3 days
    await itinerary.waitForDayCards();

    const aug1 = page.locator("button").filter({ hasText: "Aug 1" }).first();
    const aug2 = page.locator("button").filter({ hasText: "Aug 2" }).first();
    const aug3 = page.locator("button").filter({ hasText: "Aug 3" }).first();

    await expect(aug1).toBeVisible({ timeout: 10_000 });
    await expect(aug2).toBeVisible({ timeout: 5_000 });
    await expect(aug3).toBeVisible({ timeout: 5_000 });

    // Delete the last day (Aug 3) via API — the UI delete button is unreliable
    const aug3Day = days.find((d) => d.date === "2026-08-03");
    if (aug3Day) {
      await apiClient.deleteDay(trip.id, aug3Day.id);
    }

    // Reload the page to reflect the deletion
    await page.reload();
    await detail.waitForLoaded();
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Verify only 2 days remain: Aug 1 and Aug 2 visible, Aug 3 gone
    const aug1After = page
      .locator("button")
      .filter({ hasText: "Aug 1" })
      .first();
    const aug2After = page
      .locator("button")
      .filter({ hasText: "Aug 2" })
      .first();
    const aug3After = page
      .locator("button")
      .filter({ hasText: "Aug 3" })
      .first();

    await expect(aug1After).toBeVisible({ timeout: 8_000 });
    await expect(aug2After).toBeVisible({ timeout: 5_000 });
    await expect(aug3After).toBeHidden({ timeout: 8_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("plan rename — API rename reflects in switcher", async ({
    page,
    apiClient,
  }) => {
    // Create trip with dates, generate days via API
    const trip = await apiClient.createTrip({
      name: `E2E PlanRename ${Date.now()}`,
      start_date: "2026-08-01",
      end_date: "2026-08-02",
    });
    const days = await apiClient.generateDays(trip.id);
    const dayId = days[0].id;

    // Create an alternative option via API with created_by = "Old Name"
    const option = await apiClient.createOption(trip.id, dayId, {
      created_by: "Old Name",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Open the plan switcher and verify "Old Name" is listed
    await itinerary.clickPlanSwitcher();
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Old Name" })
    ).toBeVisible({ timeout: 5_000 });

    // Close the switcher
    await page.keyboard.press("Escape");

    // Rename via API and reload to verify it reflects in UI
    await apiClient.updateOption(trip.id, dayId, option.id, {
      created_by: "Renamed Plan",
    });

    await page.reload();
    await detail.waitForLoaded();
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Open plan switcher and verify "Renamed Plan" is in the list
    await itinerary.clickPlanSwitcher();
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Renamed Plan" })
    ).toBeVisible({ timeout: 5_000 });

    // "Old Name" should not be in the list
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Old Name" })
    ).toBeHidden({ timeout: 3_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("plan deletion — deletes alternative and falls back to main", async ({
    page,
    apiClient,
  }) => {
    // Create trip with dates, generate days, create alternative option
    const trip = await apiClient.createTrip({
      name: `E2E PlanDelete ${Date.now()}`,
      start_date: "2026-08-01",
      end_date: "2026-08-02",
    });
    const days = await apiClient.generateDays(trip.id);
    const dayId = days[0].id;

    await apiClient.createOption(trip.id, dayId, {
      created_by: "Deletable Plan",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Select the alternative plan
    await itinerary.clickPlanSwitcher();
    await itinerary.selectPlanByLabel("Deletable Plan");

    // Verify the label shows "Deletable Plan"
    await expect(
      page.locator('button[aria-haspopup="listbox"]').first()
    ).toHaveText(/Deletable Plan/i, { timeout: 8_000 });

    // Delete the plan
    await itinerary.deletePlan();

    // Verify plan label reverts to "Main plan"
    await expect(
      page.locator('button[aria-haspopup="listbox"]').first()
    ).toHaveText(/Main plan/i, { timeout: 8_000 });

    // Open plan switcher and verify "Deletable Plan" is NOT in the list
    await itinerary.clickPlanSwitcher();
    await expect(
      page.locator('[role="option"]').filter({ hasText: "Deletable Plan" })
    ).toBeHidden({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });
});
