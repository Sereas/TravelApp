/**
 * Smoke tests — critical path validation.
 *
 * Test 1 (fast): Verifies that the authenticated storageState saved by
 * global-setup works and the /trips page renders.
 *
 * Test 2 (@slow @google): Full end-to-end critical path covering every
 * major feature area in sequence:
 *   create trip → add location (manual) → switch to itinerary →
 *   generate days → schedule location to day → share trip →
 *   view shared link as unauthenticated user → delete trip.
 *
 * If test 1 fails, all other E2E tests will fail too — fix it first.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { ItineraryPage } from "../../pages/ItineraryPage";

// ── Test 1: infrastructure smoke ─────────────────────────────────────────────

test("authenticated user can see trips list", async ({ page }) => {
  await page.goto("/trips");
  await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible();
});

// ── Test 2: full critical path ───────────────────────────────────────────────

test("@slow @google full critical path — create → schedule → share → view → delete", async ({
  page,
  noAuthPage,
  apiClient,
}) => {
  test.setTimeout(180_000);

  // ── 1. Create trip via API ───────────────────────────────────────────────
  const tripName = `E2E CriticalPath ${Date.now()}`;
  const trip = await apiClient.createTrip({
    name: tripName,
    start_date: "2026-07-01",
    end_date: "2026-07-03",
  });

  // ── 2. Add a location via API (fast, no Google API needed) ───────────────
  await apiClient.addLocation(trip.id, {
    name: "E2E Critical Location",
    city: "TestCity",
  });

  // ── 3. Navigate to trip detail and verify trip name renders ──────────────
  const detail = new TripDetailPage(page);
  const itinerary = new ItineraryPage(page);

  await detail.goto(trip.id);
  await expect(page.getByRole("heading", { name: tripName })).toBeVisible({
    timeout: 15_000,
  });

  // ── 4. Switch to Itinerary tab ────────────────────────────────────────────
  await detail.switchToItineraryTab();

  // ── 5. Generate days ─────────────────────────────────────────────────────
  await itinerary.generateDays();

  // Day rail should now show Jul 1-3
  await expect(
    page.locator("button").filter({ hasText: "Jul 1" }).first()
  ).toBeVisible({ timeout: 10_000 });

  // ── 6. Schedule the location to the first day ─────────────────────────────
  await itinerary.clickAddLocations();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add locations to plan")).toBeVisible({
    timeout: 5_000,
  });

  // Click the location button in the dialog (not a checkbox)
  await dialog
    .locator("button")
    .filter({ hasText: "E2E Critical Location" })
    .click();
  await page.waitForTimeout(300);

  // Submit
  await dialog.getByRole("button", { name: /Add \d|Add locations/ }).click();
  await expect(dialog).toBeHidden({ timeout: 8_000 });
  await page.waitForTimeout(1_500);

  // Location should now appear in the day timeline
  await expect(page.getByText("E2E Critical Location").first()).toBeVisible({
    timeout: 8_000,
  });

  // ── 7. Enable trip sharing ────────────────────────────────────────────────
  await page.getByRole("button", { name: /Share/i }).first().click();

  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toBeVisible({ timeout: 8_000 });

  const enableBtn = shareDialog.getByRole("button", {
    name: /Enable Link Sharing/i,
  });
  await expect(enableBtn).toBeVisible({ timeout: 5_000 });
  await enableBtn.click();

  await expect(shareDialog.getByText(/Link sharing is.*enabled/i)).toBeVisible({
    timeout: 10_000,
  });

  // Extract share URL (rendered as text in a <span>, not an <input>)
  const urlSpan = shareDialog.locator("span").filter({
    hasText: /\/shared\//,
  });
  await expect(urlSpan.first()).toBeVisible({ timeout: 5_000 });

  const shareUrl = await urlSpan.first().textContent();
  expect(shareUrl).toContain("/shared/");

  await page.keyboard.press("Escape");

  // ── 8. View the shared link as an unauthenticated visitor ─────────────────
  await noAuthPage.goto(shareUrl!);

  await expect(noAuthPage.getByRole("heading", { name: tripName })).toBeVisible(
    { timeout: 20_000 }
  );

  // Read-only: no edit controls
  await expect(
    noAuthPage.getByRole("button", { name: /Edit trip/i })
  ).toBeHidden();

  // Shared trip badge visible
  await expect(noAuthPage.getByText("Shared trip")).toBeVisible({
    timeout: 5_000,
  });

  // ── 9. Delete the trip (cleanup) ──────────────────────────────────────────
  await apiClient.deleteTrip(trip.id);
});
