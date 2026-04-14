/**
 * Spec 13 — Sharing: share-link flow.
 *
 * Verifies that:
 *   - Enabling link sharing via the Share dialog shows the share URL as text
 *     (NOT an input — confirmed by component inspection).
 *   - The share URL contains "/shared/".
 *   - A visitor opening the share URL in an unauthenticated browser sees the
 *     trip name and cannot find an "Edit trip" button.
 *
 * ShareTripDialog renders:
 *   Step 1: dialog with "Enable Link Sharing" button
 *   Step 2: after enable — share_url rendered as a <span> inside a flex row,
 *           "Link sharing is enabled" text, "Disable" button.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("trip sharing", () => {
  test("enable sharing shows share link in dialog", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Share ${Date.now()}`,
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Click the Share button in the trip hero bar
    await page.getByRole("button", { name: /Share/i }).first().click();

    const shareDialog = page.getByRole("dialog");
    await expect(shareDialog).toBeVisible({ timeout: 8_000 });

    // Step 1 — dialog shows "Enable Link Sharing" button
    const enableBtn = shareDialog.getByRole("button", {
      name: /Enable Link Sharing/i,
    });
    await expect(enableBtn).toBeVisible({ timeout: 5_000 });

    // Enable sharing
    await enableBtn.click();

    // Step 2 — share URL appears as text, "Link sharing is enabled" shown
    // The share URL is in a <span class="...truncate..."> inside the dialog
    await expect(
      shareDialog.getByText(/Link sharing is.*enabled/i)
    ).toBeVisible({ timeout: 10_000 });

    // The share URL text is rendered directly (not an input)
    // It contains "/shared/" in the URL
    const urlText = shareDialog.locator("span").filter({
      hasText: /\/shared\//,
    });
    await expect(urlText.first()).toBeVisible({ timeout: 5_000 });

    const shareUrl = await urlText.first().textContent();
    expect(shareUrl).toContain("/shared/");

    // "Disable" button should be visible to revoke sharing
    await expect(
      shareDialog.getByRole("button", { name: /Disable/i })
    ).toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("shared link shows trip in read-only mode for unauthenticated user", async ({
    page,
    noAuthPage,
    apiClient,
  }) => {
    const tripName = `E2E SharedView ${Date.now()}`;
    const trip = await apiClient.createTrip({ name: tripName });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Enable sharing
    await page.getByRole("button", { name: /Share/i }).first().click();
    const shareDialog = page.getByRole("dialog");
    await expect(shareDialog).toBeVisible({ timeout: 8_000 });

    const enableBtn = shareDialog.getByRole("button", {
      name: /Enable Link Sharing/i,
    });
    await expect(enableBtn).toBeVisible({ timeout: 5_000 });
    await enableBtn.click();

    // Wait for share URL to appear
    await expect(
      shareDialog.getByText(/Link sharing is.*enabled/i)
    ).toBeVisible({ timeout: 10_000 });

    // Extract the share URL from the span text
    const urlSpan = shareDialog.locator("span").filter({
      hasText: /\/shared\//,
    });
    await expect(urlSpan.first()).toBeVisible({ timeout: 5_000 });

    const shareUrl = await urlSpan.first().textContent();
    expect(shareUrl).toBeTruthy();
    expect(shareUrl).toContain("/shared/");

    // Close the dialog
    await page.keyboard.press("Escape");

    // Open the share URL in an unauthenticated page
    await noAuthPage.goto(shareUrl!);

    // The trip name should be visible (rendered in <h1>)
    await expect(
      noAuthPage.getByRole("heading", { name: tripName })
    ).toBeVisible({ timeout: 20_000 });

    // No "Edit trip" button should be present — the page is read-only
    await expect(
      noAuthPage.getByRole("button", { name: /Edit trip/i })
    ).toBeHidden();

    // No "Add Location" button either
    await expect(
      noAuthPage.getByRole("button", { name: /Add Location/i })
    ).toBeHidden();

    await apiClient.deleteTrip(trip.id);
  });
});
