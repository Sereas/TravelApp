/**
 * Page Object Model for itinerary interactions on the trip detail page.
 *
 * Selectors confirmed by diagnostic runs against the live UI.
 * All methods operate on the itinerary tab which must already be active.
 */

import type { Page, Locator } from "@playwright/test";

export class ItineraryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  async switchToItineraryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "Itinerary" }).click();
    await this.page.waitForTimeout(500);
  }

  // ── Day generation ────────────────────────────────────────────────────────

  /**
   * Click "Generate" and wait until the button disappears (generation complete),
   * then wait for day-rail buttons to appear.
   */
  async generateDays(): Promise<void> {
    await this.page.getByRole("button", { name: /Generate/i }).click();
    // Button text cycles to "Generating..." then disappears
    await this.page
      .getByRole("button", { name: /Generating/i })
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {
        // If the button never showed "Generating…" it may have already finished
      });
    // Also tolerate the original "Generate" button going hidden
    await this.page.waitForTimeout(3_000);
  }

  /**
   * Wait until at least one day-rail button is visible.
   * Day rail items are buttons whose text contains a day label.
   */
  async waitForDayCards(): Promise<void> {
    await this.page
      .locator('[data-testid="day-rail"], .day-rail, [aria-label="Day rail"]')
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(async () => {
        // Fallback: wait for any button matching the day pattern
        await this.page
          .locator("button")
          .filter({ hasText: /Mon|Tue|Wed|Thu|Fri|Sat|Sun/ })
          .first()
          .waitFor({ state: "visible", timeout: 10_000 });
      });
  }

  // ── Day rail ──────────────────────────────────────────────────────────────

  /**
   * Count the number of day items currently rendered in the day rail.
   * Day rail items are buttons that contain short weekday abbreviations or
   * the literal text pattern confirmed by diagnostic output.
   */
  async getDayCount(): Promise<number> {
    // Day rail buttons contain both a short weekday label and stop counts
    // e.g. "NowJul 1WedDestination TBDNo stops1 plan"
    // They are inside the scrollable day rail sidebar.
    // Use the data-testid if available; fall back to heuristic.
    const rail = this.page.locator(
      '[data-testid="day-rail"], [aria-label*="day"], .day-rail'
    );
    if ((await rail.count()) > 0) {
      return rail.locator("button").count();
    }
    // Fallback: buttons that contain a day-of-week abbreviation
    return this.page
      .locator("button")
      .filter({ hasText: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/ })
      .count();
  }

  /**
   * Click a day in the rail that contains the given text fragment
   * (e.g. "Jul 1" or "Wed").
   */
  async selectDay(dayText: string): Promise<void> {
    await this.page
      .locator("button")
      .filter({ hasText: dayText })
      .first()
      .click();
    await this.page.waitForTimeout(500);
  }

  // ── Add locations dialog ──────────────────────────────────────────────────

  /**
   * Click "Add locations" and wait for the dialog to open.
   */
  async clickAddLocations(): Promise<void> {
    await this.page.getByRole("button", { name: "Add locations" }).click();
    await this.page
      .getByRole("dialog")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Inside the open "Add locations to plan" dialog, click each location
   * by name (they are <button> elements, not checkboxes), then click
   * the submit "Add locations" button.
   */
  async addLocationsFromDialog(names: string[]): Promise<void> {
    const dialog = this.page.getByRole("dialog");

    for (const name of names) {
      // Location items are buttons inside the dialog list
      await dialog.locator("button").filter({ hasText: name }).first().click();
      await this.page.waitForTimeout(200);
    }

    // Submit button text changes based on count: "Add 1 location" / "Add 2 locations"
    await dialog
      .getByRole("button", { name: /^Add \d|^Add locations/ })
      .click();

    // Wait for dialog to close
    await this.page
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 10_000 });
    await this.page.waitForTimeout(1_000);
  }

  // ── Plan switcher ─────────────────────────────────────────────────────────

  /**
   * Return the text of the current plan label button
   * (e.g. "Main plan", "Plan 1", or a custom name).
   */
  async getPlanLabel(): Promise<string> {
    // The plan switcher trigger button has aria-haspopup="listbox"
    const btn = this.page.locator('button[aria-haspopup="listbox"]').first();
    return btn.innerText();
  }

  /**
   * Click the plan switcher trigger to open the plan popover.
   */
  async clickPlanSwitcher(): Promise<void> {
    await this.page.locator('button[aria-haspopup="listbox"]').first().click();
    // Wait for popover to open — it renders a listbox role
    await this.page
      .locator('[role="listbox"]')
      .waitFor({ state: "visible", timeout: 5_000 });
  }

  /**
   * Inside the open plan switcher popover, click "Add plan",
   * type the given name (or leave empty for default), then click "Create".
   */
  async createAlternativePlan(name?: string): Promise<void> {
    await this.page.locator("button").filter({ hasText: "Add plan" }).click();
    await this.page.waitForTimeout(200);

    if (name) {
      await this.page.locator('input[placeholder="New plan name"]').fill(name);
    }

    await this.page.getByRole("button", { name: "Create" }).click();
    await this.page.waitForTimeout(1_500);
  }

  /**
   * Inside the open plan switcher popover, click a plan option by label text.
   */
  async selectPlanByLabel(label: string): Promise<void> {
    await this.page
      .locator('[role="option"]')
      .filter({ hasText: label })
      .click();
    await this.page.waitForTimeout(500);
  }

  // ── Logistics / Routes ───────────────────────────────────────────────────

  /**
   * Click "Create route" in the Logistics section (visible only when
   * 2+ locations are scheduled to the current day).
   */
  async clickCreateRoute(): Promise<void> {
    // The button in the Logistics section says "Create route" (when builder is closed)
    await this.page
      .getByRole("button", { name: "Create route" })
      .first()
      .click();
    await this.page.waitForTimeout(1_000);
  }

  /**
   * In the route builder, click "Select all" to pick every stop in order.
   */
  async selectAllRouteStops(): Promise<void> {
    await this.page.getByRole("button", { name: "Select all" }).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * In the route builder, click the "Create route (N stops)" save button.
   */
  async saveRoute(): Promise<void> {
    await this.page.getByRole("button", { name: /Create route/ }).click();
    await this.page.waitForTimeout(2_000);
  }

  // ── Unscheduled panel ─────────────────────────────────────────────────────

  /**
   * Return the "Not yet planned" sidebar panel locator.
   */
  getUnscheduledPanel(): Locator {
    return this.page.locator("aside").filter({ hasText: /Not yet planned/i });
  }

  // ── Assertions helpers ────────────────────────────────────────────────────

  /**
   * Return the day card / timeline area that is currently active.
   * Looks for the card whose header contains the given day text.
   */
  getDayCardByText(dayText: string): Locator {
    return this.page.locator("article, section, div").filter({
      hasText: dayText,
    });
  }
}
