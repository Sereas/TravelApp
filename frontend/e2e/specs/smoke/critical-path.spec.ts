/**
 * Smoke tests — critical path validation.
 *
 * Test 1 (fast): Verifies that the authenticated storageState saved by
 * global-setup works and the /trips page renders.
 *
 * Test 2 (@slow): Full end-to-end critical path covering every major
 * feature area in sequence, with proof screenshots at each step.
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
  // Wait for trip cards to load (seeded France trip should be visible)
  await expect(
    page.getByRole("heading", { level: 3, name: "France Summer '26" })
  ).toBeVisible({ timeout: 10_000 });

  await test.info().attach("01-trips-list.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

// ── Test 2: full critical path ───────────────────────────────────────────────

test("@slow full critical path — create → schedule → share → view → delete", async ({
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

  // ── 2. Navigate to trips list — verify new trip is visible ───────────────
  await page.goto("/trips");
  await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: tripName })
  ).toBeVisible({ timeout: 10_000 });
  // Wait for network to settle so card images/placeholders finish rendering
  await page.waitForLoadState("networkidle");

  await test.info().attach("01-trips-list-with-new-trip.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 3. Click on the trip — verify empty state ────────────────────────────
  await page.getByRole("heading", { level: 3, name: tripName }).click();
  const detail = new TripDetailPage(page);
  await detail.waitForLoaded();

  // Trip name renders as an inline-editable <button> in authenticated view
  await expect(page.getByRole("button", { name: tripName })).toBeVisible({
    timeout: 15_000,
  });
  // Empty state: "Ready to build your pool?" heading from EmptyLocationsCTA
  await expect(page.getByText("Ready to build your pool?")).toBeVisible({
    timeout: 10_000,
  });

  await test.info().attach("02-trip-empty-state.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 4. Add a location via API + reload ───────────────────────────────────
  await apiClient.addLocation(trip.id, {
    name: "E2E Critical Location",
    city: "TestCity",
  });
  await page.reload();
  await detail.waitForLoaded();

  await expect(detail.locationCard("E2E Critical Location")).toBeVisible({
    timeout: 15_000,
  });

  await test.info().attach("03-trip-with-location.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 5. Switch to Itinerary tab ────────────────────────────────────────────
  const itinerary = new ItineraryPage(page);
  await detail.switchToItineraryTab();

  await expect(page.getByRole("button", { name: /Generate/i })).toBeVisible({
    timeout: 10_000,
  });

  await test.info().attach("04-itinerary-generate-button.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 6. Generate days ─────────────────────────────────────────────────────
  await itinerary.generateDays();

  await expect(
    page.locator("button").filter({ hasText: "Jul 1" }).first()
  ).toBeVisible({ timeout: 10_000 });
  // Wait for generation to complete and UI to settle
  await page.waitForLoadState("networkidle");

  await test.info().attach("05-itinerary-days-generated.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 7. Schedule the location to the first day ─────────────────────────────
  await itinerary.clickAddLocations();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add locations to plan")).toBeVisible({
    timeout: 5_000,
  });

  await dialog
    .locator("button")
    .filter({ hasText: "E2E Critical Location" })
    .click();
  await page.waitForTimeout(300);

  await dialog.getByRole("button", { name: /Add \d|Add locations/ }).click();
  await expect(dialog).toBeHidden({ timeout: 8_000 });
  await page.waitForTimeout(1_500);

  await expect(page.getByText("E2E Critical Location").first()).toBeVisible({
    timeout: 8_000,
  });

  await test.info().attach("06-location-scheduled.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // ── 8. Enable trip sharing ────────────────────────────────────────────────
  await page.getByRole("button", { name: /Share/i }).first().click();

  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toBeVisible({ timeout: 8_000 });

  const enableBtn = shareDialog.getByRole("button", {
    name: /Enable public link/i,
  });
  await expect(enableBtn).toBeVisible({ timeout: 5_000 });
  await enableBtn.click();

  const urlSpan = shareDialog.locator("span").filter({
    hasText: /\/shared\//,
  });
  await expect(urlSpan.first()).toBeVisible({ timeout: 10_000 });

  await test.info().attach("07-share-dialog-enabled.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  const shareUrl = await urlSpan.first().textContent();
  expect(shareUrl).toContain("/shared/");

  await page.keyboard.press("Escape");

  // ── 9. View the shared link as an unauthenticated visitor ─────────────────
  await noAuthPage.goto(shareUrl!);

  await expect(noAuthPage.getByRole("heading", { name: tripName })).toBeVisible(
    { timeout: 20_000 }
  );

  await expect(
    noAuthPage.getByRole("button", { name: /Edit trip/i })
  ).toBeHidden();

  await test.info().attach("08-shared-view-readonly.png", {
    body: await noAuthPage.screenshot(),
    contentType: "image/png",
  });

  // ── 10. Delete the trip (cleanup) ─────────────────────────────────────────
  await apiClient.deleteTrip(trip.id);
});
