/**
 * Page Object Model for itinerary interactions on the trip detail page.
 *
 * All methods operate on the itinerary tab which must already be active.
 * Condition-based waits are preferred over fixed timeouts.
 */

import type { Page, Locator } from "@playwright/test";

/** Matches day-rail button text: weekday abbreviations or month names. */
const DAY_RAIL_BUTTON_REGEX =
  /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

export class ItineraryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  async switchToItineraryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "Itinerary" }).click();
    await this.page
      .getByRole("tabpanel", { name: /Itinerary/i })
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  // ── Day generation ────────────────────────────────────────────────────────

  async generateDays(): Promise<void> {
    await this.page.getByRole("button", { name: /Generate/i }).click();
    // Wait for at least one day-rail button to appear (weekday or month name)
    await this.page
      .locator("button")
      .filter({
        hasText: DAY_RAIL_BUTTON_REGEX,
      })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  async waitForDayCards(): Promise<void> {
    // Day rail buttons contain weekday abbreviations (Mon/Tue/...) AND
    // month+day labels (Jan 1, Feb 10, ...). Match either pattern.
    await this.page
      .locator("button")
      .filter({
        hasText: DAY_RAIL_BUTTON_REGEX,
      })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  // ── Day rail ──────────────────────────────────────────────────────────────

  async getDayCount(): Promise<number> {
    return this.page
      .locator("button")
      .filter({
        hasText: DAY_RAIL_BUTTON_REGEX,
      })
      .count();
  }

  async selectDay(dayText: string): Promise<void> {
    const btn = this.page
      .locator("button")
      .filter({ hasText: dayText })
      .first();
    await btn.click();
    // Wait for the day heading to appear in the main area
    await this.page
      .locator("h3")
      .filter({ hasText: new RegExp(dayText.replace(/\s+/g, ".*"), "i") })
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .catch(() => {
        // Day heading format may differ — fallback
      });
  }

  // ── Day deletion ──────────────────────────────────────────────────────────

  /**
   * Click the "Edit day date" button (pencil icon) on the currently visible
   * day card, which opens the day date editor popover.
   */
  async clickEditDayDate(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Edit day date" })
      .first()
      .click();
  }

  /**
   * Delete the currently visible day by clicking its delete button.
   * The delete button is inside the day header area.
   */
  async deleteCurrentDay(): Promise<void> {
    // The day header has a delete button — look for it
    const deleteBtn = this.page
      .getByRole("button", { name: /Delete day/i })
      .first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
    } else {
      // May need to open the edit popover first
      await this.clickEditDayDate();
      await this.page
        .getByRole("button", { name: /Delete/i })
        .first()
        .click();
    }

    // Confirm if a confirmation dialog appears
    const dialog = this.page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dialog.getByRole("button", { name: /Delete/i }).click();
      await dialog.waitFor({ state: "hidden", timeout: 8_000 });
    }
  }

  // ── Add locations dialog ──────────────────────────────────────────────────

  async clickAddLocations(): Promise<void> {
    await this.page.getByRole("button", { name: "Add locations" }).click();
    await this.page
      .getByRole("dialog")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  async addLocationsFromDialog(names: string[]): Promise<void> {
    const dialog = this.page.getByRole("dialog");

    for (const name of names) {
      await dialog.locator("button").filter({ hasText: name }).first().click();
    }

    // Submit button text changes based on count
    await dialog
      .getByRole("button", { name: /^Add \d|^Add locations/ })
      .click();

    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  }

  // ── Time period ─────────────────────────────────────────────────────────

  /**
   * Get the time period button for a location by name.
   */
  getTimePeriodButton(locationName: string): Locator {
    const row = this.page
      .locator("button")
      .filter({ hasText: locationName })
      .first()
      .locator("..");
    return row.getByRole("button", { name: /Time:/ });
  }

  /**
   * Change the time period for a scheduled location.
   *
   * When multiple locations are scheduled, pass `nthButton` (0-based) to
   * target a specific location's time button. Defaults to the first one.
   *
   * @param period - "Morning" | "Afternoon" | "Evening" | "Night"
   * @param nthButton - 0-based index of which "Time:" button to click
   */
  async changeTimePeriod(period: string, nthButton = 0): Promise<void> {
    await this.page
      .getByRole("button", { name: /Time:/ })
      .nth(nthButton)
      .click();

    // Select the period from the listbox
    await this.page
      .getByRole("listbox", { name: /time of day/i })
      .waitFor({ state: "visible", timeout: 5_000 });
    await this.page.getByRole("option", { name: period }).click();
  }

  // ── Remove location from day ───────────────────────────────────────────

  /**
   * Remove a location from the current day by clicking its remove button.
   */
  async removeLocationFromDay(locationName: string): Promise<void> {
    await this.page
      .getByRole("button", { name: `Remove ${locationName}` })
      .click();
  }

  // ── Plan switcher ─────────────────────────────────────────────────────────

  async getPlanLabel(): Promise<string> {
    const btn = this.page.locator('button[aria-haspopup="listbox"]').first();
    return btn.innerText();
  }

  async clickPlanSwitcher(): Promise<void> {
    await this.page.locator('button[aria-haspopup="listbox"]').first().click();
    await this.page
      .locator('[role="listbox"]')
      .waitFor({ state: "visible", timeout: 5_000 });
  }

  async createAlternativePlan(name?: string): Promise<void> {
    await this.page.locator("button").filter({ hasText: "Add plan" }).click();

    const input = this.page.locator('input[placeholder="New plan name"]');
    await input.waitFor({ state: "visible", timeout: 3_000 });

    if (name) {
      await input.fill(name);
    }

    await this.page.getByRole("button", { name: "Create" }).click();

    // Wait for the plan label to update
    await this.page
      .locator('[role="listbox"]')
      .waitFor({ state: "hidden", timeout: 5_000 })
      .catch(() => {
        // Listbox may auto-close
      });
  }

  async selectPlanByLabel(label: string): Promise<void> {
    await this.page
      .locator('[role="option"]')
      .filter({ hasText: label })
      .click();
  }

  // ── Plan settings (rename / delete) ─────────────────────────────────────

  async openPlanSettings(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Plan settings/i })
      .first()
      .click();
    // Wait for the popover menu
    await this.page
      .getByRole("button", { name: "Rename" })
      .waitFor({ state: "visible", timeout: 5_000 });
  }

  async renamePlan(newName: string): Promise<void> {
    await this.openPlanSettings();
    await this.page.getByRole("button", { name: "Rename" }).click();

    // After clicking "Rename", an inline text input appears in the plan
    // switcher area. Scope to inputs near the plan settings popover.
    const input = this.page
      .locator(
        '[role="listbox"] input, [placeholder*="name"], [placeholder*="plan"]'
      )
      .or(this.page.locator('input[type="text"], input:not([type])'));
    await input.first().waitFor({ state: "visible", timeout: 5_000 });
    await input.first().clear();
    await input.first().fill(newName);
    await input.first().press("Enter");
  }

  async deletePlan(): Promise<void> {
    await this.openPlanSettings();
    await this.page.getByRole("button", { name: "Delete" }).click();

    // Confirm if a dialog appears
    const dialog = this.page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dialog.getByRole("button", { name: /Delete|Confirm/i }).click();
      await dialog.waitFor({ state: "hidden", timeout: 8_000 });
    }
  }

  // ── Departure / Arrival fields ──────────────────────────────────────────

  getDepartureField(): Locator {
    return this.page.getByRole("textbox", { name: "Departure" }).first();
  }

  getArrivalField(): Locator {
    return this.page.getByRole("textbox", { name: "Arrival" }).first();
  }

  // ── Logistics / Routes ───────────────────────────────────────────────────

  async clickCreateRoute(): Promise<void> {
    await this.page
      .getByRole("button", { name: "Create route" })
      .first()
      .click();
  }

  async selectAllRouteStops(): Promise<void> {
    await this.page.getByRole("button", { name: "Select all" }).click();
  }

  async saveRoute(): Promise<void> {
    const saveBtn = this.page.getByRole("button", { name: /Create route \(/ });
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // Wait for route label (arrow symbol) to appear
    await this.page
      .getByRole("button", { name: /→/ })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Get a route button by its label text (e.g. "Stop A → Stop B").
   */
  getRouteButton(labelPattern?: RegExp): Locator {
    return this.page.getByRole("button", { name: labelPattern ?? /→/ }).first();
  }

  // ── Unscheduled panel ─────────────────────────────────────────────────────

  getUnscheduledPanel(): Locator {
    return this.page.locator("aside").filter({ hasText: /Not yet planned/i });
  }

  /**
   * Click the quick-add "+" button next to a location in the unscheduled panel.
   */
  async addFromUnscheduledPanel(locationName: string): Promise<void> {
    await this.page
      .getByRole("button", { name: `Add ${locationName}` })
      .click();
  }

  // ── Progress bar ────────────────────────────────────────────────────────

  getProgressText(): Locator {
    return this.page.locator("text=Planning progress").locator("..");
  }

  // ── Sitrep panel ────────────────────────────────────────────────────────

  getSitrepPanel(): Locator {
    return this.page.locator("aside").filter({ hasText: /Sitrep/i });
  }

  // ── Location inspector (inline expansion) ──────────────────────────────

  /**
   * Click on a scheduled location to expand/collapse its inline details.
   */
  async clickScheduledLocation(locationName: string): Promise<void> {
    await this.page
      .getByRole("button", { name: new RegExp(locationName) })
      .first()
      .click();
  }

  // ── Assertions helpers ────────────────────────────────────────────────────

  getDayHeading(): Locator {
    return this.page.locator("h3").first();
  }

  getScheduledLocationNames(): Locator {
    // Location names in the timeline are inside buttons
    return this.page.locator('[role="region"] button[aria-expanded]');
  }
}
