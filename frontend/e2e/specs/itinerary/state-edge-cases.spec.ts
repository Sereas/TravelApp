/**
 * Priority 5 — State & Edge Cases.
 *
 * Verifies boundary conditions, empty states, and state transitions:
 *   - Trip without dates shows "Add day", not "Generate"
 *   - Add-locations dialog search and multi-select
 *   - Planning progress bar updates as locations are scheduled
 *   - Last location deleted shows empty state on locations tab
 *   - Trip with partial dates (start only, no end)
 *   - Last day deleted causes "Generate days from dates" to reappear
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("state and edge cases", () => {
  test("trip without dates — shows add day button, no generate", async ({
    page,
    apiClient,
  }) => {
    // Create trip with NO dates
    const trip = await apiClient.createTrip({
      name: `E2E NoDates ${Date.now()}`,
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // "Generate days from dates" should NOT be visible (no dates on trip)
    await expect(
      page.getByRole("button", { name: /Generate days from dates/i })
    ).toBeHidden({ timeout: 5_000 });

    // "Add day" button should be visible
    const addDayBtn = page.getByRole("button", { name: /Add day/i }).first();
    await expect(addDayBtn).toBeVisible({ timeout: 10_000 });

    // Click "Add day" and verify Day 1 appears in the rail
    await addDayBtn.click();
    await expect(
      page.getByRole("button", { name: /Day 1/i })
    ).toBeVisible({ timeout: 10_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("add-locations-to-plan dialog — search and multi-select", async ({
    page,
    apiClient,
  }) => {
    // API setup: trip with dates, days generated, 3 locations
    const trip = await apiClient.createTrip({
      name: `E2E DialogSearch ${Date.now()}`,
      start_date: "2026-10-10",
      end_date: "2026-10-12",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Alpha Place" });
    await apiClient.addLocation(trip.id, { name: "E2E Beta Place" });
    await apiClient.addLocation(trip.id, { name: "E2E Gamma Place" });

    await apiClient.generateDays(trip.id);

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Open the "Add locations" dialog
    await itinerary.clickAddLocations();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add locations to plan")).toBeVisible({
      timeout: 5_000,
    });

    // All 3 locations should be listed
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Alpha Place" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Beta Place" })
    ).toBeVisible();
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Gamma Place" })
    ).toBeVisible();

    // Type "Beta" in the search box — only Beta should remain visible
    const searchInput = dialog.getByLabel("Search locations");
    await searchInput.fill("Beta");

    await expect(
      dialog.locator("button").filter({ hasText: "E2E Beta Place" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Alpha Place" })
    ).toBeHidden();
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Gamma Place" })
    ).toBeHidden();

    // Clear the search
    await searchInput.clear();

    // All 3 should be visible again
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Alpha Place" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      dialog.locator("button").filter({ hasText: "E2E Gamma Place" })
    ).toBeVisible();

    // Select Alpha and Gamma (click them)
    await dialog
      .locator("button")
      .filter({ hasText: "E2E Alpha Place" })
      .click();
    await dialog
      .locator("button")
      .filter({ hasText: "E2E Gamma Place" })
      .click();

    // Submit — button text should be "Add 2 locations"
    await dialog
      .getByRole("button", { name: /Add 2 locations/ })
      .click();

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Alpha and Gamma should appear in the timeline
    await expect(page.getByText("E2E Alpha Place").first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("E2E Gamma Place").first()).toBeVisible({
      timeout: 5_000,
    });

    // Beta should remain in the unscheduled panel
    const panel = itinerary.getUnscheduledPanel();
    await expect(panel).toBeVisible({ timeout: 8_000 });
    await expect(panel.getByText("E2E Beta Place")).toBeVisible({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("planning progress bar — updates as locations are scheduled", async ({
    page,
    apiClient,
  }) => {
    // 3-day trip with 2 locations
    const trip = await apiClient.createTrip({
      name: `E2E Progress ${Date.now()}`,
      start_date: "2026-10-01",
      end_date: "2026-10-03",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Progress Loc A" });
    await apiClient.addLocation(trip.id, { name: "E2E Progress Loc B" });

    await apiClient.generateDays(trip.id);

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // Progress should show 0/3 days and 0%
    await expect(page.getByText("0/3 days")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("0%")).toBeVisible({ timeout: 5_000 });

    // Schedule both locations to day 1 via the dialog
    await itinerary.clickAddLocations();

    const dialog = page.getByRole("dialog");
    await dialog
      .locator("button")
      .filter({ hasText: "E2E Progress Loc A" })
      .click();
    await dialog
      .locator("button")
      .filter({ hasText: "E2E Progress Loc B" })
      .click();

    await dialog
      .getByRole("button", { name: /Add 2 locations/ })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Progress should update to 1/3 days and 33%
    await expect(page.getByText("1/3 days")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("33%")).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("empty state transitions — last location deleted shows empty state", async ({
    page,
    apiClient,
  }) => {
    // Create trip with a single location
    const trip = await apiClient.createTrip({
      name: `E2E EmptyState ${Date.now()}`,
    });

    await apiClient.addLocation(trip.id, { name: "E2E Only Location" });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Location should be visible on the locations tab
    await expect(detail.locationCard("E2E Only Location")).toBeVisible({
      timeout: 15_000,
    });

    // Hover the card, open actions menu, click Delete, confirm
    const card = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: "E2E Only Location" }) })
      .first();
    await card.hover();
    await card.getByRole("button", { name: "Location actions" }).click();

    await page.getByRole("button", { name: "Delete" }).first().click();

    // Confirm dialog
    const confirmDialog = page.getByRole("dialog");
    await confirmDialog.waitFor({ state: "visible", timeout: 8_000 });
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    // Location card should disappear
    await expect(detail.locationCard("E2E Only Location")).not.toBeVisible({
      timeout: 10_000,
    });

    // Empty state message should appear
    await expect(
      page.getByText("No locations added to this trip yet.")
    ).toBeVisible({ timeout: 8_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("trip with partial dates — start date only", async ({
    page,
    apiClient,
  }) => {
    // Create trip with start_date but NO end_date
    const trip = await apiClient.createTrip({
      name: `E2E PartialDates ${Date.now()}`,
      start_date: "2026-11-01",
      end_date: null,
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // "Generate days from dates" should NOT appear (need both dates)
    await expect(
      page.getByRole("button", { name: /Generate days from dates/i })
    ).toBeHidden({ timeout: 5_000 });

    // "Add day" should be visible (fallback for no date range)
    const addDayBtn = page.getByRole("button", { name: /Add day/i }).first();
    await expect(addDayBtn).toBeVisible({ timeout: 10_000 });

    // Click "Add day" and verify a day card appears
    await addDayBtn.click();
    await expect(
      page.getByRole("button", { name: /Day 1/i })
    ).toBeVisible({ timeout: 10_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("last day deleted — generate button reappears", async ({
    page,
    apiClient,
  }) => {
    // 1-day trip
    const trip = await apiClient.createTrip({
      name: `E2E LastDay ${Date.now()}`,
      start_date: "2026-12-01",
      end_date: "2026-12-01",
    });

    // Generate days via API (creates 1 day)
    const days = await apiClient.generateDays(trip.id);
    expect(days.length).toBe(1);

    const detail = new TripDetailPage(page);

    await detail.goto(trip.id);
    await detail.switchToItineraryTab();

    // Verify 1 day visible (Dec 1) — wait for the day button directly
    await expect(
      page.locator("button").filter({ hasText: "Dec 1" }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Delete the day via API and reload (more reliable than UI day deletion)
    await apiClient.deleteDay(trip.id, days[0].id);
    await page.reload();
    await detail.waitForLoaded();
    await detail.switchToItineraryTab();

    // "Generate days from dates" button should reappear
    await expect(
      page.getByRole("button", { name: /Generate days from dates/i })
    ).toBeVisible({ timeout: 10_000 });

    await apiClient.deleteTrip(trip.id);
  });
});
