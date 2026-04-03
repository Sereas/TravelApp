/**
 * Auth flow E2E tests.
 *
 * All tests use `noAuthPage` — a fresh browser context with no stored
 * session — so they are fully isolated from authenticated test runs.
 */

import { test, expect } from "../../fixtures/index";
import { LoginPage } from "../../pages/LoginPage";
import { getE2EEmail, getE2EPassword } from "../../helpers/env";

test.describe("Authentication", () => {
  test("redirects unauthenticated user to /login", async ({ noAuthPage }) => {
    // Visiting a protected route should redirect to /login
    await noAuthPage.goto("/trips");

    // After redirect the URL should contain /login
    await expect(noAuthPage).toHaveURL(/\/login/);

    // The "Welcome back" heading from LoginForm.tsx line 134 should be visible
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
  });

  test("login with valid credentials redirects to /trips", async ({
    noAuthPage,
  }) => {
    const loginPage = new LoginPage(noAuthPage);
    await loginPage.goto();

    await loginPage.login(getE2EEmail(), getE2EPassword());

    // After successful login the app calls router.push("/trips")
    await expect(noAuthPage).toHaveURL(/\/trips$/, { timeout: 20_000 });
    await expect(
      noAuthPage.getByRole("heading", { name: "My Trips" })
    ).toBeVisible();
  });

  test("login with invalid password shows error", async ({ noAuthPage }) => {
    const loginPage = new LoginPage(noAuthPage);
    await loginPage.goto();

    await loginPage.login(
      getE2EEmail(),
      "this-password-is-wrong-intentionally"
    );

    // Supabase returns "Invalid login credentials" on bad password.
    // ErrorBanner uses role="alert" (ErrorBanner.tsx line 12).
    await expect(loginPage.getErrorMessage()).toBeVisible({ timeout: 10_000 });

    // Should still be on /login — no redirect happened
    await expect(noAuthPage).toHaveURL(/\/login/);
  });
});
