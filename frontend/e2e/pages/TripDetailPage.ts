/**
 * Page Object Model for the trip detail page (`/trips/[id]`).
 *
 * Selectors derived from `frontend/src/app/trips/[id]/page.tsx`.
 */

import type { Page, Locator } from "@playwright/test";

export class TripDetailPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(tripId: string): Promise<void> {
    await this.page.goto(`/trips/${tripId}`);
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    // The trip name is rendered as a <button aria-label="Trip name"> (inline-editable)
    // since the UI was updated from a plain <h1>. Wait for the tab nav to appear —
    // it's rendered after data loads and is a reliable "page ready" indicator.
    await this.page
      .getByRole("tablist", { name: "Trip sections" })
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  async getTripName(): Promise<string> {
    // The trip name renders as an inline-editable <button> — the aria-label equals the trip name.
    // We can get the visible text from the first button in the "Trip name" area.
    // Fallback: find the button in the tablist container's sibling heading area.
    return this.page.locator('[aria-label="Trip name"]').inputValue();
  }

  async switchToLocationsTab(): Promise<void> {
    // The tab label changed from "Locations" to "Places" in the UI enhancement.
    // Try "Places" first, fall back to "Locations" for backwards compatibility.
    const placesTab = this.page.getByRole("tab", { name: /Places/i });
    const locationsTab = this.page.getByRole("tab", { name: /Locations/i });
    if (await placesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await placesTab.click();
    } else {
      await locationsTab.click();
    }
    await this.page.waitForTimeout(500);
  }

  async switchToItineraryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "Itinerary" }).click();
    await this.page.waitForTimeout(500);
  }

  locationCard(name: string): Locator {
    return this.page.locator("h3", { hasText: name });
  }

  async getLocationCount(): Promise<number> {
    return this.page.locator("h3.font-medium").count();
  }

  getEditTripButton(): Locator {
    return this.page.getByRole("button", { name: "Edit trip" });
  }

  /**
   * Opens the inline AddLocationForm.
   *
   * When locations exist: clicks "Add Location" dropdown then "Paste Link".
   * When empty: clicks the "Add a location" button directly.
   * The form is inline (not a dialog) — waits for the name input.
   */
  async clickAddLocation(): Promise<void> {
    const dropdown = this.page.getByRole("button", { name: /Add Location/i });
    if (await dropdown.isVisible().catch(() => false)) {
      await dropdown.click();
      await this.page.getByText("Paste Link").click();
    } else {
      await this.page.getByRole("button", { name: /Add a location/i }).click();
    }
    await this.page
      .locator("#add-location-name")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Opens the Import Google Maps List dialog.
   */
  async clickImportGoogleList(): Promise<void> {
    const dropdown = this.page.getByRole("button", { name: /Add Location/i });
    if (await dropdown.isVisible().catch(() => false)) {
      await dropdown.click();
      await this.page.getByText("Import Google List").first().click();
    } else {
      await this.page
        .getByRole("button", { name: /Import Google List/i })
        .click();
    }
    await this.page
      .getByText("Import from Google Maps List")
      .waitFor({ state: "visible", timeout: 10_000 });
  }
}
