/**
 * Page Object Model for the login page.
 *
 * Selectors are derived from the EXACT label text and button text in
 * `frontend/src/app/login/LoginForm.tsx`.
 *
 * Labels:
 *   <Label htmlFor="email">Email</Label>
 *   <Label htmlFor="password">Password</Label>
 * Submit button text (login mode): "Sign in"
 * Error is rendered by <ErrorBanner> — find by role="alert" or by text.
 */

import type { Page, Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;

  // Locators — derived from LoginForm.tsx
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // getByLabel matches the <Label> element which is linked to the input via htmlFor/id
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    // The submit button text in login mode is "Sign in" (LoginForm.tsx line 233)
    this.signInButton = page.getByRole("button", { name: "Sign in" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/login");
    // Wait for the heading to confirm we are on the login page
    await this.page
      .getByRole("heading", { name: "Welcome back" })
      .waitFor({ state: "visible" });
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /**
   * Returns the visible error message after a failed login attempt.
   * ErrorBanner renders inside the form area; we locate it by its text role.
   */
  getErrorMessage(): Locator {
    // ErrorBanner renders a <div> with the error message; target by role or
    // by looking for the alert pattern. Fall back to any visible text that
    // indicates an error (Supabase returns "Invalid login credentials").
    return this.page.getByRole("alert");
  }
}
