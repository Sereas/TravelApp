/**
 * Membership E2E tests — invite link generation, Share dialog layout,
 * and invite landing page rendering.
 *
 * Uses a freshly created trip (no locations/maps) to avoid WebGL issues
 * in headless Chromium.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

test.describe("membership — Share dialog", () => {
  test("Share dialog shows members, invite, and public sections", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Membership ${Date.now()}`,
    });

    try {
      const detail = new TripDetailPage(page);
      await detail.goto(trip.id);

      // Open Share dialog
      await page.getByRole("button", { name: "Share" }).click();

      // Verify Members section exists with owner
      await expect(page.getByText("Members")).toBeVisible();
      await expect(page.getByText("Owner", { exact: false })).toBeVisible();

      // Verify Invite people section exists (owner can see this)
      await expect(page.getByText("Invite people")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create invite link" })
      ).toBeVisible();

      // Verify Public view section exists
      await expect(page.getByText("Public view")).toBeVisible();

      await test.info().attach("share-dialog-members.png", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    } finally {
      await apiClient.deleteTrip(trip.id);
    }
  });

  test("owner can create an invite link", async ({ page, apiClient }) => {
    const trip = await apiClient.createTrip({
      name: `E2E Invite ${Date.now()}`,
    });

    try {
      const detail = new TripDetailPage(page);
      await detail.goto(trip.id);

      // Open Share dialog
      await page.getByRole("button", { name: "Share" }).click();
      await expect(page.getByText("Invite people")).toBeVisible();

      // Create invite link
      await page.getByRole("button", { name: "Create invite link" }).click();

      // Wait for the link to appear (contains /invite/)
      await expect(page.getByText("/invite/")).toBeVisible({ timeout: 5_000 });

      // Verify the info text is shown
      await expect(
        page.getByText("Anyone with the link can join. Expires in 7 days.")
      ).toBeVisible();

      await test.info().attach("invite-link-created.png", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    } finally {
      await apiClient.deleteTrip(trip.id);
    }
  });
});

test.describe("membership — invite landing page", () => {
  test("invalid invite token shows not-found state", async ({ noAuthPage }) => {
    await noAuthPage.goto("/invite/invalid-token-that-does-not-exist");

    // Should show the not-found state
    await expect(noAuthPage.getByText("Invite not found")).toBeVisible({
      timeout: 10_000,
    });

    await test.info().attach("invite-not-found.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });
});

test.describe("membership — trip list", () => {
  test("owned trips do not show 'Shared with you' indicator", async ({
    page,
  }) => {
    await page.goto("/trips");
    await expect(
      page.getByRole("heading", { name: "My Trips" })
    ).toBeVisible({ timeout: 10_000 });

    // Owner's trips should NOT show "Shared with you"
    await expect(page.getByText("Shared with you")).not.toBeVisible();

    await test.info().attach("trips-list-owner.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
