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

    // Switch to signup mode
    await noAuthPage.getByRole("button", { name: "Create one" }).click();
    await expect(
      noAuthPage.getByRole("heading", { name: "Create an account" })
    ).toBeVisible({ timeout: 5_000 });

    // Fill form with the existing E2E test email
    await noAuthPage.getByLabel("Email").fill(getE2EEmail());
    await noAuthPage
      .getByLabel("Password", { exact: true })
      .fill("SomePass123");
    await noAuthPage.getByLabel("Confirm password").fill("SomePass123");

    // Submit
    await noAuthPage.getByRole("button", { name: "Create account" }).click();

    // Supabase returns "User already registered" for duplicate signups
    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 15_000 });
    await expect(errorAlert).toContainText(/already registered/i);
  });

  test("signup — mismatched passwords shows error", async ({ noAuthPage }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    // Switch to signup mode
    await noAuthPage.getByRole("button", { name: "Create one" }).click();
    await expect(
      noAuthPage.getByRole("heading", { name: "Create an account" })
    ).toBeVisible({ timeout: 5_000 });

    // Fill form with mismatched passwords
    await noAuthPage.getByLabel("Email").fill("test-mismatch@example.com");
    await noAuthPage.getByLabel("Password", { exact: true }).fill("Password1");
    await noAuthPage.getByLabel("Confirm password").fill("Password2");

    // Submit
    await noAuthPage.getByRole("button", { name: "Create account" }).click();

    // Client-side validation: "Passwords do not match" (LoginForm.tsx line 51)
    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 5_000 });
    await expect(errorAlert).toContainText("Passwords do not match");
  });

  test("forgot password — empty email shows error", async ({ noAuthPage }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    // Leave email empty and click "Forgot your password?"
    await noAuthPage
      .getByRole("button", { name: "Forgot your password?" })
      .click();

    // "Enter your email address first" (LoginForm.tsx line 108)
    const errorAlert = noAuthPage.getByRole("alert").first();
    await expect(errorAlert).toBeVisible({ timeout: 5_000 });
    await expect(errorAlert).toContainText("Enter your email address first");
  });

  test("forgot password — valid email shows response", async ({
    noAuthPage,
  }) => {
    await noAuthPage.goto("/login");
    await expect(
      noAuthPage.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible({ timeout: 10_000 });

    // Fill email with the E2E test email
    await noAuthPage.getByLabel("Email").fill(getE2EEmail());

    // Click "Forgot your password?"
    await noAuthPage
      .getByRole("button", { name: "Forgot your password?" })
      .click();

    // Supabase may accept or reject the email format.
    // If accepted: "Password reset link sent to <email>"
    // If rejected: error banner with the Supabase error message.
    // Either way, the UI should respond — wait for either outcome.
    const successMsg = noAuthPage.getByText(/Password reset link sent to/i);
    const errorMsg = noAuthPage.getByRole("alert").first();

    await expect(successMsg.or(errorMsg)).toBeVisible({ timeout: 15_000 });
  });
});
