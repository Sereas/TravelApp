/**
 * Edit and delete location E2E tests.
 *
 * Selectors:
 *   - Three-dot menu: aria-label="Location actions" (LocationCard.tsx line 252)
 *   - "Edit" menu item: text "Edit" (LocationCard.tsx line 264)
 *   - "Delete" menu item: text "Delete" (LocationCard.tsx line 278 / page.tsx line 393)
 *   - Edit name field: id="edit-location-name" (EditLocationRow.tsx line 110)
 *   - Save button: text "Save Changes" (EditLocationRow.tsx line 265)
 *   - Confirm delete: ConfirmDialog confirm button "Delete" (page.tsx line 398)
 *
 * The three-dot button uses `opacity-0 group-hover:opacity-100` so we must
 * hover the card before clicking the menu button.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("Edit location", () => {
  test("edit location name — card updates with new name", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    // Add a location via API
    const loc = await apiClient.addLocation(testTrip.id, {
      name: "E2E Edit Me",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // The location card should be visible
    await expect(detail.locationCard(loc.name)).toBeVisible({
      timeout: 15_000,
    });

    // Hover the card so the three-dot menu becomes visible, then click it
    const card = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: loc.name }) })
      .first();
    await card.hover();
    await card.getByRole("button", { name: "Location actions" }).click();

    // Click "Edit" in the popover menu (LocationCard.tsx line 264).
    // The menu is a Popover, not a dialog — find the Edit button directly.
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    // The EditLocationRow appears inline. Clear and retype the name.
    // id="edit-location-name" (EditLocationRow.tsx line 110)
    const newName = `Renamed Location ${Date.now()}`;
    await page.locator("#edit-location-name").fill(newName);

    // Click "Save Changes" (EditLocationRow.tsx line 265)
    await page.getByRole("button", { name: "Save Changes" }).click();

    // The dialog closes; the card should now show the new name
    await expect(detail.locationCard(newName)).toBeVisible({ timeout: 10_000 });
    // Old name should be gone
    await expect(detail.locationCard(loc.name)).not.toBeVisible();
  });
});

test.describe("Delete location", () => {
  test("delete location — card removed, other location remains", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    // Add two locations via API
    const loc1 = await apiClient.addLocation(testTrip.id, {
      name: "E2E Location To Delete",
    });
    const loc2 = await apiClient.addLocation(testTrip.id, {
      name: "E2E Location To Keep",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // Both cards should be visible
    await expect(detail.locationCard(loc1.name)).toBeVisible({
      timeout: 15_000,
    });
    await expect(detail.locationCard(loc2.name)).toBeVisible();

    // Hover the first card to reveal the three-dot menu
    const card1 = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: loc1.name }) })
      .first();
    await card1.hover();
    await card1.getByRole("button", { name: "Location actions" }).click();

    // The delete trigger inside the menu is a ConfirmDialog.
    // The menu item is a <button> containing "Delete" text.
    // Clicking it opens the ConfirmDialog (page.tsx lines 388-404).
    await page.getByRole("button", { name: "Delete" }).first().click();

    // ConfirmDialog renders a dialog with a confirm button labelled "Delete"
    const confirmDialog = page.getByRole("dialog");
    await confirmDialog.waitFor({ state: "visible", timeout: 8_000 });
    // Click the destructive "Delete" confirm button inside the dialog
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    // The first location card should disappear
    await expect(detail.locationCard(loc1.name)).not.toBeVisible({
      timeout: 10_000,
    });

    // The second location card should still be visible
    await expect(detail.locationCard(loc2.name)).toBeVisible();
  });
});
