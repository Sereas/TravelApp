/**
 * Edit and delete location E2E tests.
 *
 * LocationCard uses a flip-card pattern:
 *   - Front: name, city, note, schedule status, "More info" button
 *   - Back: inline-editable fields (name, city, category, booking, note)
 *
 * Editing: click "More info" → flip to back → click field → inline edit → blur/Enter saves
 * Deleting: click "Delete location" button on card image area (top-right)
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("Edit location", () => {
  test("edit location name — card updates with new name", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    const loc = await apiClient.addLocation(testTrip.id, {
      name: "E2E Edit Me",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    await expect(detail.locationCard(loc.name)).toBeVisible({
      timeout: 15_000,
    });

    // Flip card to back face via "More info" button
    const card = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: loc.name }) })
      .first();
    await card.getByRole("button", { name: "Show location details" }).click();
    await page.waitForTimeout(500); // flip animation

    // Click the name text on the back face to start inline edit
    const nameButton = card.getByRole("button", { name: loc.name });
    await nameButton.click();

    // The inline edit input should appear with aria-label="Edit Name"
    const nameInput = card.getByRole("textbox", { name: "Edit Name" });
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    const newName = `Renamed Location ${Date.now()}`;
    await nameInput.fill(newName);
    await nameInput.press("Enter");

    // Wait for save
    await page.waitForTimeout(1_000);

    // Flip back to front to verify the name updated
    await card
      .getByRole("button", { name: "Back to front" })
      .click()
      .catch(() => {
        // Card may auto-flip back after save
      });

    // The card should now show the new name
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
    const loc1 = await apiClient.addLocation(testTrip.id, {
      name: "E2E Location To Delete",
    });
    const loc2 = await apiClient.addLocation(testTrip.id, {
      name: "E2E Location To Keep",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    await expect(detail.locationCard(loc1.name)).toBeVisible({
      timeout: 15_000,
    });
    await expect(detail.locationCard(loc2.name)).toBeVisible();

    // Hover the card to reveal the delete button, then click it
    const card1 = page
      .locator("div.group")
      .filter({ has: page.locator("h3", { hasText: loc1.name }) })
      .first();
    await card1.hover();
    await card1.getByRole("button", { name: "Delete location" }).click();

    // ConfirmDialog should appear — click the destructive confirm button
    const confirmDialog = page.getByRole("dialog");
    await confirmDialog.waitFor({ state: "visible", timeout: 8_000 });
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    // First card should disappear, second remains
    await expect(detail.locationCard(loc1.name)).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(detail.locationCard(loc2.name)).toBeVisible();
  });
});
