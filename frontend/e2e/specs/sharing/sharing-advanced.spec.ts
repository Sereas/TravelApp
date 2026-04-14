/**
 * Spec — Advanced sharing & trip deletion edge cases.
 *
 * Covers:
 *   1. Disable sharing — revoked share link returns 404 via API and
 *      shows error in the browser for unauthenticated visitors.
 *   2. Shared trip parity — locations and itinerary in the shared view
 *      match the original trip data; read-only controls enforced.
 *   3. UI delete trip flow — Edit dialog → Delete trip → confirm →
 *      redirect to /trips.
 *
 * Selectors derived from:
 *   - ShareTripDialog: "Enable Link Sharing", "Disable", span with "/shared/"
 *   - Shared page (shared/[token]/page.tsx): error heading "This shared link
 *     is no longer valid.", "Shared trip" badge, tab buttons "Locations" /
 *     "Itinerary"
 *   - EditTripForm: "Edit trip" button, "Delete trip" button (aria-label),
 *     ConfirmDialog with "Delete trip" confirm button
 *   - TripsListPage: heading "My Trips"
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("Sharing advanced", () => {
  test("disable sharing — shared link returns 404", async ({
    noAuthPage,
    apiClient,
  }) => {
    // Create trip and enable sharing via API
    const trip = await apiClient.createTrip({
      name: `E2E Revoke ${Date.now()}`,
    });
    const share = await apiClient.createShare(trip.id);
    const shareToken = share.share_token;

    // Verify share works before revoking
    const before = await apiClient.getSharedTrip(shareToken);
    expect(before.status).toBe(200);
    expect(before.data).toBeTruthy();

    // Revoke sharing
    await apiClient.revokeShare(trip.id);

    // Verify share is dead via API
    const after = await apiClient.getSharedTrip(shareToken);
    expect(after.status).toBe(404);
    expect(after.data).toBeNull();

    // Verify via browser: unauthenticated visitor sees error
    await noAuthPage.goto(`/shared/${shareToken}`);

    // The shared page renders "This shared link is no longer valid."
    // when the API returns 404 (shared/[token]/page.tsx line 209)
    await expect(
      noAuthPage.getByText(/shared link is no longer valid/i)
    ).toBeVisible({ timeout: 20_000 });

    // Also verify the explanatory text is present
    await expect(noAuthPage.getByText(/expired or been revoked/i)).toBeVisible({
      timeout: 5_000,
    });

    await apiClient.deleteTrip(trip.id);
  });

  test("shared trip parity — locations and itinerary match original", async ({
    noAuthPage,
    apiClient,
  }) => {
    // Set up a trip with 2 scheduled locations (no route — requires Google API)
    const tripName = `E2E Parity ${Date.now()}`;
    const { trip } = await apiClient.setupTripWithScheduledLocations({
      name: tripName,
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      locations: [
        { name: "E2E Shared Loc A", city: "Paris" },
        { name: "E2E Shared Loc B", city: "Rome" },
      ],
    });

    // Enable sharing
    const share = await apiClient.createShare(trip.id);
    const shareUrl = `/shared/${share.share_token}`;

    // Open in unauthenticated browser
    await noAuthPage.goto(shareUrl);

    // Verify trip name is visible
    await expect(
      noAuthPage.getByRole("heading", { name: tripName })
    ).toBeVisible({ timeout: 20_000 });

    // Verify both locations visible in the default Locations tab
    await expect(noAuthPage.getByText("E2E Shared Loc A")).toBeVisible({
      timeout: 10_000,
    });
    await expect(noAuthPage.getByText("E2E Shared Loc B")).toBeVisible({
      timeout: 5_000,
    });

    // Switch to Itinerary tab
    await noAuthPage.getByRole("tab", { name: "Itinerary" }).click();

    // The first day might not auto-select on the shared page — click it
    const dayButton = noAuthPage
      .locator("button")
      .filter({ hasText: /Aug\s+1/ })
      .first();
    if (await dayButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dayButton.click();
    }

    // Verify scheduled locations appear in the itinerary view
    await expect(noAuthPage.getByText("E2E Shared Loc A")).toBeVisible({
      timeout: 10_000,
    });
    await expect(noAuthPage.getByText("E2E Shared Loc B")).toBeVisible({
      timeout: 5_000,
    });

    // Verify no edit controls are present — the page is read-only
    await expect(
      noAuthPage.getByRole("button", { name: /Edit trip/i })
    ).toBeHidden();
    await expect(
      noAuthPage.getByRole("button", { name: /Add Location/i })
    ).toBeHidden();

    await apiClient.deleteTrip(trip.id);
  });

  test("UI delete trip flow — edit dialog, delete, redirect", async ({
    page,
    apiClient,
  }) => {
    // Create a trip via API
    const tripName = `E2E Delete Flow ${Date.now()}`;
    const trip = await apiClient.createTrip({ name: tripName });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Verify we are on the trip detail page (trip name is a button in authenticated view)
    await expect(page.getByRole("button", { name: tripName })).toBeVisible({ timeout: 10_000 });

    // Click "Edit trip" to open the EditTripForm dialog
    await detail.getEditTripButton().click();

    // The EditTripForm renders as a Dialog with title "Edit Trip"
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible({ timeout: 8_000 });
    await expect(
      editDialog.getByRole("heading", { name: "Edit Trip" })
    ).toBeVisible();

    // Click "Delete trip" button inside the edit dialog
    // (EditTripForm.tsx: button with aria-label="Delete trip")
    await editDialog.getByRole("button", { name: "Delete trip" }).click();

    // ConfirmDialog opens asking "Delete trip?"
    // It has a "Delete trip" confirm button (confirmLabel from EditTripForm.tsx line 175)
    const confirmBtn = page.getByRole("button", { name: "Delete trip" });
    // There are now two "Delete trip" buttons — the trigger and the confirm.
    // The confirm one is in the nested dialog. Wait for the confirmation
    // description text to disambiguate.
    await expect(page.getByText(/permanently delete this trip/i)).toBeVisible({
      timeout: 5_000,
    });

    // Click the confirm button in the confirmation dialog
    // The confirm dialog's button is the last "Delete trip" button visible
    await confirmBtn.last().click();

    // After deletion the app should redirect to /trips
    await expect(page).toHaveURL(/\/trips$/, { timeout: 20_000 });

    // Verify the "My Trips" heading is visible (we landed on the trips list)
    await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible({
      timeout: 10_000,
    });

    // The deleted trip should no longer appear in the list
    await expect(
      page.getByRole("heading", { level: 3, name: tripName })
    ).not.toBeVisible();
  });
});
