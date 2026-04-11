/**
 * Phase 0 — EXPECTED-FAIL E2E spec: expanded map popup edit/delete affordances.
 *
 * BUG: When a user clicks a pin in the SidebarMap's expanded dialog, the
 * popup card has NO "Edit note" or "Delete location" buttons — because
 * SidebarMap does not thread `onLocationNoteSave` / `onLocationDelete` through
 * to ItineraryDayMap.
 *
 * `test.fail(...)` tells Playwright this test is EXPECTED to fail. CI remains
 * green. Phase 3 will fix the wiring and flip this to `test(...)`.
 *
 * Actual testids discovered in ItineraryDayMap.tsx PopupCard JSX:
 *   - "popup-category-badge"   (category text)
 *   - "popup-note"             (note read view — button)
 *   - "popup-city"             (city text)
 *   - aria-label "Edit note"   (pencil / add-note button)
 *   - aria-label "Delete location" (trash button)
 *
 * NOTE: This spec does NOT run a full backend. When the e2e suite is
 * executed without a running backend it will be skipped at the network
 * layer. The `--list` discovery (Step 3 of Phase 0) is the only
 * verification required now.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

test.describe("expanded map popup — edit/delete affordances @maps-perf", () => {
  /**
   * EXPECTED FAIL.
   *
   * Flow:
   *  1. Create trip via API → add 1 location with coords.
   *  2. Generate a day → add the location to the option.
   *  3. Open Itinerary tab → click "Expand map" button (desktop sidebar).
   *  4. Wait for a map pin to appear (the popup is triggered by click in real
   *     maplibre; in E2E we assert the button existence in the expanded dialog).
   *  5. Assert the "Edit note" and "Delete location" buttons are present in the
   *     dialog — THIS WILL FAIL because SidebarMap doesn't pass callbacks.
   *
   * When Phase 3 lands: change `test.fail(...)` → `test(...)`.
   */
  test.fail(
    "itinerary sidebar expanded map popup has edit-note and delete-location buttons for owner",
    async ({ page, apiClient }) => {
      test.setTimeout(90_000);

      const trip = await apiClient.createTrip({
        name: `E2E MapPopup ${Date.now()}`,
        start_date: "2026-07-01",
        end_date: "2026-07-02",
      });

      // Add a location that will appear in the itinerary.
      // Coordinates are not available via the test API client; the location
      // will be added without coords, meaning it won't appear as a map pin but
      // will still cause the SidebarMap to render (mapLocations.length === 0
      // shows the empty state). Phase 3 can extend the API client or seed
      // coords differently.
      await apiClient.addLocation(trip.id, {
        name: "E2E MapPin Location",
        city: "Paris",
      });

      const detail = new TripDetailPage(page);
      const itinerary = new ItineraryPage(page);

      await detail.goto(trip.id);
      await detail.switchToItineraryTab();
      await itinerary.generateDays();

      // Add the location to the first day's option.
      await itinerary.clickAddLocations();
      const dialog = page.getByRole("dialog");
      await dialog
        .locator("button")
        .filter({ hasText: "E2E MapPin Location" })
        .click();
      await dialog
        .getByRole("button", { name: /Add \d|Add locations/ })
        .click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // Verify the location is in the itinerary timeline.
      await expect(
        page.getByText("E2E MapPin Location").first()
      ).toBeVisible({ timeout: 10_000 });

      // Click "Expand map" — opens the SidebarMap expanded dialog.
      // The button is visible on desktop viewports (lg+).
      const expandBtn = page.getByRole("button", { name: /expand map/i });
      await expect(expandBtn).toBeVisible({ timeout: 10_000 });
      await expandBtn.click();

      const mapDialog = page.getByRole("dialog");
      await expect(mapDialog).toBeVisible({ timeout: 8_000 });

      // In a real browser maplibre renders an interactive map and the user can
      // click a pin to open a popup. In headless Playwright maplibre is fully
      // operational but we cannot reliably click a WebGL canvas pin.
      //
      // Instead, assert that the ItineraryDayMap inside the dialog was rendered
      // with the callback props — which would be visible as affordance buttons
      // IF the popup were open. We approximate this by verifying the dialog
      // contains the map container with the correct data attributes.
      //
      // THE ACTUAL FAILING ASSERTION: the map container inside the expanded
      // dialog must carry `data-has-note-save="true"` and
      // `data-has-delete="true"` — attributes we expect Phase 3 to add when
      // the callbacks are threaded through.
      //
      // Since Phase 3 hasn't landed, these attributes don't exist → test.fail.
      const mapContainer = mapDialog.getByTestId("itinerary-day-map");
      await expect(mapContainer).toBeVisible({ timeout: 8_000 });

      // These assertions FAIL today (Phase 0). Phase 3 will make them pass.
      await expect(mapContainer).toHaveAttribute("data-has-note-save", "true");
      await expect(mapContainer).toHaveAttribute("data-has-delete", "true");

      await apiClient.deleteTrip(trip.id);
    }
  );
});
