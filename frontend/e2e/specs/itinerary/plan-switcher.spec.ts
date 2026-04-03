/**
 * Spec 11 — Itinerary: plan switcher.
 *
 * Verifies that:
 *   - An alternative plan can be created via the plan-switcher popover.
 *   - Switching between plans updates the displayed plan label.
 *
 * The plan-switcher trigger is a <Button aria-haspopup="listbox"> whose
 * visible text defaults to "Main plan" for option_index === 1.
 * After creating an alternative plan, the new option becomes active and
 * the label changes to the created name (or "Plan 1" as default).
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("plan switcher", () => {
  test("create alternative plan changes the active plan label", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E PlanSwitch ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // The plan-switcher trigger should show "Main plan" initially
    const initialLabel = await itinerary.getPlanLabel();
    expect(initialLabel).toMatch(/Main plan/i);

    // Open the plan switcher popover
    await itinerary.clickPlanSwitcher();

    // Create a named alternative plan
    await itinerary.createAlternativePlan("Backup Plan");

    // After creation the new plan becomes selected — label changes
    await expect(
      page.locator('button[aria-haspopup="listbox"]').first()
    ).not.toHaveText(/Main plan/i, { timeout: 8_000 });

    const newLabel = await itinerary.getPlanLabel();
    // Created by name "Backup Plan" — the optionLabel() function returns
    // created_by when set, otherwise "Plan N"
    expect(newLabel.trim()).toMatch(/Backup Plan|Plan 1/i);

    await apiClient.deleteTrip(trip.id);
  });

  test("switch between plans shows different plan label", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E PlanSwitch2 ${Date.now()}`,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    await itinerary.generateDays();

    // Confirm "Main plan" is the starting label
    const initialLabel = await itinerary.getPlanLabel();
    expect(initialLabel).toMatch(/Main plan/i);

    // Open switcher and create an alternative plan
    await itinerary.clickPlanSwitcher();
    await itinerary.createAlternativePlan("Alt Route");

    // Now the new plan should be active — switch back to "Main plan"
    await itinerary.clickPlanSwitcher();
    await itinerary.selectPlanByLabel("Main plan");

    // After selecting, the trigger should show "Main plan" again
    await expect(
      page.locator('button[aria-haspopup="listbox"]').first()
    ).toHaveText(/Main plan/i, { timeout: 8_000 });

    // Switch to the alternative plan
    await itinerary.clickPlanSwitcher();
    await itinerary.selectPlanByLabel("Alt Route");

    await expect(
      page.locator('button[aria-haspopup="listbox"]').first()
    ).toHaveText(/Alt Route/i, { timeout: 8_000 });

    await apiClient.deleteTrip(trip.id);
  });
});
