/**
 * UserNav sign-out E2E test.
 *
 * Verifies the full sign-out flow: profile menu opens, shows email,
 * clicking "Sign out" triggers supabase.auth.signOut() and redirects
 * to /login.
 *
 * Safe for other tests: signOut() invalidates the refresh token server-side,
 * but the JWT access token in storageState stays valid until expiry (~1 hour).
 * Each subsequent test creates a fresh browser context from storageState.
 */

import { test, expect } from "../../fixtures/index";

test.describe("UserNav", () => {
  test("sign out redirects to login page", async ({ page }) => {
    await page.goto("/trips");
    await page
      .getByRole("heading", { name: "My Trips" })
      .waitFor({ state: "visible", timeout: 20_000 });

    // Open profile menu
    await page.getByRole("button", { name: "Profile menu" }).click();

    // Verify menu content
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    await test.info().attach("05-profile-menu-open.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Sign out
    await page.getByRole("button", { name: "Sign out" }).click();

    // Verify redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();

    await test.info().attach("06-signed-out.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
});
