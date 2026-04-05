/**
 * Priority 3 — Location Features E2E tests.
 *
 * Covers:
 *   1. Category filter — shows only matching locations
 *   2. Location search — filters by name
 *   3. Photo upload — opens upload dialog
 *   4. Schedule from locations tab — schedule button works
 *   5. Location inspector — expand scheduled location shows details
 *
 * Selectors derived from:
 *   - Category filter toolbar: aria-label="Filter locations by category" (page.tsx)
 *   - Search box: role="searchbox", name="Search by location name" (page.tsx)
 *   - Upload photo button: aria-label="Upload photo" (LocationCard.tsx)
 *   - PhotoUploadDialog title: "Location Photo" (PhotoUploadDialog.tsx)
 *   - Schedule button: aria-label="Schedule to a day" (LocationCard.tsx)
 *   - Scheduled status: text "Scheduled" (LocationCard.tsx)
 *   - Expanded location address: "Address:" label (ItineraryLocationRow.tsx)
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("Location features", () => {
  test("category filter — shows only matching locations", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Category Filter ${Date.now()}`,
    });

    await apiClient.addLocation(trip.id, {
      name: "E2E Cafe Spot",
      category: "Café",
    });
    await apiClient.addLocation(trip.id, {
      name: "E2E Museum Hall",
      category: "Museum",
    });
    await apiClient.addLocation(trip.id, {
      name: "E2E Park Garden",
      category: "Park",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // All 3 locations should be visible on the default locations tab
    await expect(detail.locationCard("E2E Cafe Spot")).toBeVisible({
      timeout: 15_000,
    });
    await expect(detail.locationCard("E2E Museum Hall")).toBeVisible();
    await expect(detail.locationCard("E2E Park Garden")).toBeVisible();

    // Click the "Café" filter button in the category toolbar
    // Use partial match /Caf/i to handle both "Cafe" and "Café"
    const toolbar = page.getByRole("toolbar", {
      name: /Filter locations by category/i,
    });
    await toolbar.getByRole("button", { name: /Caf/i }).click();

    // Only the cafe location should remain visible
    await expect(detail.locationCard("E2E Cafe Spot")).toBeVisible();
    await expect(detail.locationCard("E2E Museum Hall")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("E2E Park Garden")).not.toBeVisible();

    // Reset filter by clicking "All Locations"
    await toolbar.getByRole("button", { name: /All Locations/i }).click();

    // All 3 should be visible again
    await expect(detail.locationCard("E2E Cafe Spot")).toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("E2E Museum Hall")).toBeVisible();
    await expect(detail.locationCard("E2E Park Garden")).toBeVisible();

    // Now filter by Museum
    await toolbar.getByRole("button", { name: /Museum/i }).click();

    await expect(detail.locationCard("E2E Museum Hall")).toBeVisible();
    await expect(detail.locationCard("E2E Cafe Spot")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("E2E Park Garden")).not.toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("location search — filters by name", async ({ page, apiClient }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Search ${Date.now()}`,
    });

    await apiClient.addLocation(trip.id, { name: "Eiffel Tower E2E" });
    await apiClient.addLocation(trip.id, { name: "Louvre Museum E2E" });
    await apiClient.addLocation(trip.id, { name: "Notre Dame E2E" });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // All 3 locations visible initially
    await expect(detail.locationCard("Eiffel Tower E2E")).toBeVisible({
      timeout: 15_000,
    });
    await expect(detail.locationCard("Louvre Museum E2E")).toBeVisible();
    await expect(detail.locationCard("Notre Dame E2E")).toBeVisible();

    // Type into the search box
    const searchBox = page.getByRole("searchbox", {
      name: /Search by location name/i,
    });
    await searchBox.fill("Louvre");

    // Only the Louvre location should remain visible
    await expect(detail.locationCard("Louvre Museum E2E")).toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("Eiffel Tower E2E")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("Notre Dame E2E")).not.toBeVisible();

    // Clear search and verify all 3 reappear
    await searchBox.clear();

    await expect(detail.locationCard("Eiffel Tower E2E")).toBeVisible({
      timeout: 5_000,
    });
    await expect(detail.locationCard("Louvre Museum E2E")).toBeVisible();
    await expect(detail.locationCard("Notre Dame E2E")).toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("photo upload — opens upload dialog", async ({ page, apiClient }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Photo Upload ${Date.now()}`,
    });

    await apiClient.addLocation(trip.id, { name: "E2E Photo Test" });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    await expect(detail.locationCard("E2E Photo Test")).toBeVisible({
      timeout: 15_000,
    });

    // The "Upload photo" button has opacity-0 and appears on hover.
    // Hover the card first, then click the upload button.
    const card = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: "E2E Photo Test" }) })
      .first();
    await card.hover();

    await card.getByRole("button", { name: "Upload photo" }).click();

    // The PhotoUploadDialog should appear with title "Location Photo"
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Location Photo")).toBeVisible();

    // The drop zone should be present
    await expect(dialog.getByTestId("drop-zone")).toBeVisible();

    // Close the dialog with Escape
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("schedule from locations tab — schedule button works", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Schedule Card ${Date.now()}`,
      start_date: "2026-04-10",
      end_date: "2026-04-12",
    });

    await apiClient.addLocation(trip.id, { name: "E2E Schedule Target" });

    // Generate days via API so the location card can show scheduling options
    await apiClient.generateDays(trip.id);

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Locations tab is the default — wait for the card
    await expect(detail.locationCard("E2E Schedule Target")).toBeVisible({
      timeout: 15_000,
    });

    // The card should show "Schedule to day" since the location is unscheduled
    const scheduleButton = page.getByRole("button", {
      name: /Schedule to a day/i,
    });
    await expect(scheduleButton).toBeVisible({ timeout: 5_000 });
    await scheduleButton.click();

    // A popover should appear with "Schedule to" heading and day buttons
    const schedulePopover = page.getByText("Schedule to", { exact: true });
    await expect(schedulePopover).toBeVisible({ timeout: 5_000 });

    // Click the first day option in the popover
    const dayButtons = page
      .locator("button")
      .filter({ hasText: /Apr\s+10|April\s+10/ });
    await dayButtons.first().click();

    // The card should now show "Scheduled" status
    await expect(page.getByText(/Scheduled/)).toBeVisible({
      timeout: 8_000,
    });

    // The "Schedule to day" button should no longer be visible
    await expect(scheduleButton).not.toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });

  test("scheduled location — shows in itinerary with reorder and time controls", async ({
    page,
    apiClient,
  }) => {
    const { trip } = await apiClient.setupTripWithScheduledLocations({
      name: `E2E Inspector ${Date.now()}`,
      startDate: "2026-04-10",
      endDate: "2026-04-12",
      locations: [
        {
          name: "E2E Inspector Loc",
          address: "123 Test Street",
        },
      ],
    });

    const detail = new TripDetailPage(page);
    const itinerary = new ItineraryPage(page);

    await detail.goto(trip.id);
    await itinerary.switchToItineraryTab();
    await itinerary.waitForDayCards();

    // The location name should be visible in the timeline
    await expect(page.getByText("E2E Inspector Loc").first()).toBeVisible({
      timeout: 10_000,
    });

    // The reorder drag handle button should exist
    await expect(
      page.getByRole("button", { name: /Reorder E2E Inspector Loc/ })
    ).toBeVisible({ timeout: 5_000 });

    // The time period button should exist
    await expect(
      page.getByRole("button", { name: /Time:/ }).first()
    ).toBeVisible({ timeout: 5_000 });

    // The remove button should exist
    await expect(
      page.getByRole("button", { name: /Remove E2E Inspector Loc/ })
    ).toBeVisible({ timeout: 5_000 });

    await apiClient.deleteTrip(trip.id);
  });
});
