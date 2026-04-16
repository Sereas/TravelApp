/**
 * Auth flow E2E tests.
 *
 * Tests 1-3 use `noAuthPage` — a fresh browser context with no stored
 * session — so they are fully isolated from authenticated test runs.
 * Test 4 (Google OAuth) also uses `noAuthPage` and validates the OAuth
 * redirect initiates correctly.
 */

import { test, expect } from "../../fixtures/index";
import { LoginPage } from "../../pages/LoginPage";
import { getE2EEmail, getE2EPassword } from "../../helpers/env";

test.describe("Authentication", () => {
  test("redirects unauthenticated user to /login", async ({ noAuthPage }) => {
    await noAuthPage.goto("/trips");

    await expect(noAuthPage).toHaveURL(/\/login/);
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();

    await test.info().attach("01-redirect-to-login.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("login with valid credentials redirects to /trips", async ({
    noAuthPage,
  }) => {
    const loginPage = new LoginPage(noAuthPage);
    await loginPage.goto();

    await loginPage.login(getE2EEmail(), getE2EPassword());

    await expect(noAuthPage).toHaveURL(/\/trips$/, { timeout: 20_000 });
    await expect(
      noAuthPage.getByRole("heading", { name: "My Trips" })
    ).toBeVisible();
    await noAuthPage.waitForLoadState("networkidle");

    await test.info().attach("02-login-success.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("login with invalid password shows error", async ({ noAuthPage }) => {
    const loginPage = new LoginPage(noAuthPage);
    await loginPage.goto();

    await loginPage.login(
      getE2EEmail(),
      "this-password-is-wrong-intentionally"
    );

    const errorAlert = loginPage.getErrorMessage().first();
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    await expect(errorAlert).toContainText(/Invalid login credentials/i);
    await expect(noAuthPage).toHaveURL(/\/login/);

    await test.info().attach("03-login-invalid-password.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("Google OAuth initiates and shows Google account selector", async ({
    noAuthPage,
  }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();

    const googleBtn = noAuthPage.getByRole("button", {
      name: /Continue with Google/i,
    });
    await expect(googleBtn).toBeVisible();

    await googleBtn.click();

    await noAuthPage.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });

    await test.info().attach("04-google-oauth-prompt.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });
});
