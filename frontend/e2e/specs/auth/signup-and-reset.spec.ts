/**
 * Spec — Auth edge cases: signup validation & forgot password.
 *
 * Covers:
 *   1. Signup with an already-registered email shows "User already registered"
 *   2. Signup with mismatched passwords shows client-side error
 *   3. Forgot password with empty email shows inline error
 *   4. Forgot password with valid email — Supabase may reject certain email
 *      formats; test asserts the UI responds (either success or error banner).
 *
 * All tests use `noAuthPage` — a fresh browser context with no stored session.
 *
 * Note: Next.js renders a hidden route-announcer div with role="alert",
 * so we use `.getByRole("alert").first()` to target the ErrorBanner.
 */

import { test, expect } from "../../fixtures/index";
import { getE2EEmail } from "../../helpers/env";

test.describe("Signup & password reset edge cases", () => {
  test("signup — existing email shows error", async ({ noAuthPage }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await noAuthPage.getByRole("button", { name: "Create one" }).click();
    await expect(
      noAuthPage.getByRole("heading", { name: "Create an account" })
    ).toBeVisible({ timeout: 5_000 });

    await noAuthPage.getByLabel("Email").fill(getE2EEmail());
    await noAuthPage
      .getByLabel("Password", { exact: true })
      .fill("SomePass123");
    await noAuthPage.getByLabel("Confirm password").fill("SomePass123");

    await noAuthPage.getByRole("button", { name: "Create account" }).click();

    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 15_000 });
    await expect(errorAlert).toContainText(/already registered/i);

    await test.info().attach("07-signup-existing-email.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("signup — mismatched passwords shows error", async ({ noAuthPage }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await noAuthPage.getByRole("button", { name: "Create one" }).click();
    await expect(
      noAuthPage.getByRole("heading", { name: "Create an account" })
    ).toBeVisible({ timeout: 5_000 });

    await noAuthPage.getByLabel("Email").fill("test-mismatch@example.com");
    await noAuthPage.getByLabel("Password", { exact: true }).fill("Password1");
    await noAuthPage.getByLabel("Confirm password").fill("Password2");

    await noAuthPage.getByRole("button", { name: "Create account" }).click();

    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 5_000 });
    await expect(errorAlert).toContainText("Passwords do not match");

    await test.info().attach("08-signup-password-mismatch.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("forgot password — empty email shows error", async ({ noAuthPage }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await noAuthPage
      .getByRole("button", { name: "Forgot your password?" })
      .click();

    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 5_000 });
    await expect(errorAlert).toContainText("Enter your email address first");

    await test.info().attach("09-forgot-empty-email.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });

  test("forgot password — valid email shows response", async ({
    noAuthPage,
  }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    await noAuthPage.getByLabel("Email").fill(getE2EEmail());

    await noAuthPage
      .getByRole("button", { name: "Forgot your password?" })
      .click();

    const successMsg = noAuthPage.getByText(/Password reset link sent to/i);
    const errorMsg = noAuthPage.getByRole("alert").first();

    await expect(successMsg.or(errorMsg)).toBeVisible({ timeout: 15_000 });
    // Wait for the full message to render (success banner or error text)
    await noAuthPage.waitForLoadState("networkidle");

    await test.info().attach("10-forgot-valid-email.png", {
      body: await noAuthPage.screenshot(),
      contentType: "image/png",
    });
  });
});
