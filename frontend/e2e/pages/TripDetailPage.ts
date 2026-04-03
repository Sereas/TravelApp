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

  /** Wait for the trip header to be visible (indicates data loaded). */
  async waitForLoaded(): Promise<void> {
    await this.page
      .locator("h1")
      .waitFor({ state: "visible", timeout: 20_000 });
  }

  /** The trip name text from the <h1> element. */
  async getTripName(): Promise<string> {
    return this.page.locator("h1").innerText();
  }

  /** Click the "Locations" tab. */
  async switchToLocationsTab(): Promise<void> {
    await this.page.getByRole("tab", { name: /Locations/i }).click();
    // Wait for location content to appear (grid or empty state)
    await this.page
      .locator('[class*="grid"], [class*="empty"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {
        // May not find grid if no locations — that's OK
      });
  }

  /** Click the "Itinerary" tab. */
  async switchToItineraryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "Itinerary" }).click();
    // The itinerary tab content renders inside a plain <div> (no tabpanel role).
    // Wait for any itinerary-specific content to appear.
    await this.page
      .locator("text=/Generate days|Add day|Day /i")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Returns a locator for a location card matching the given name.
   * Scoped to <h3> headings to avoid matching other page elements.
   */
  locationCard(name: string): Locator {
    return this.page.locator("h3", { hasText: name });
  }

  /** Count location cards by their <h3> headings within the locations section. */
  async getLocationCount(): Promise<number> {
    // Location names render as <h3> elements inside the location grid
    return this.page.locator("h3.font-medium").count();
  }
}
