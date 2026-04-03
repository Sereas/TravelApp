/**
 * UserNav E2E test.
 *
 * Verifies the profile menu opens and shows the sign-out option.
 *
 * NOTE: We do NOT actually click "Sign out" because Supabase's signOut()
 * uses scope="global" by default, which invalidates ALL sessions for the
 * user — including the shared storageState session used by all other tests.
 * The redirect-to-login behavior is already covered by the auth/login tests
 * (unauthenticated users are redirected to /login).
 */

import { test, expect } from "../../fixtures/index";

test.describe("UserNav", () => {
  test("profile menu shows user email and sign-out option", async ({
    page,
  }) => {
    await page.goto("/trips");
    await page
      .getByRole("heading", { name: "My Trips" })
      .waitFor({ state: "visible", timeout: 20_000 });

    // Open profile menu
    await page.getByRole("button", { name: "Profile menu" }).click();

    // Verify user email is shown
    await expect(page.getByText("Signed in as")).toBeVisible();

    // Verify sign-out button exists
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
