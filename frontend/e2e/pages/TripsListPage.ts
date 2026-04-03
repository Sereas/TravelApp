/**
 * Page Object Model for the trips list page (`/trips`).
 *
 * Selectors are derived from:
 *   - `frontend/src/app/trips/page.tsx` — heading "My Trips", button "New trip",
 *     empty state button "Create your first trip"
 *   - `frontend/src/components/trips/CreateTripDialog.tsx` — dialog title
 *     "Create a new trip", label "Trip name", button "Create trip"
 *   - `frontend/src/components/trips/TripCard.tsx` — trip name in <h3>
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class TripsListPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto("/trips");
    await this.waitForLoaded();
  }

  /** Wait until the page has finished its initial data fetch. */
  async waitForLoaded(): Promise<void> {
    // The heading "My Trips" is always present (trips/page.tsx line 65)
    await this.page
      .getByRole("heading", { name: "My Trips" })
      .waitFor({ state: "visible" });

    // Wait for the loading spinner to disappear
    const spinner = this.page.locator('[data-testid="loading-spinner"]');
    if (await spinner.isVisible().catch(() => false)) {
      await spinner.waitFor({ state: "hidden" });
    }
  }

  /** Total number of trip cards currently displayed. */
  async getTripCount(): Promise<number> {
    // TripCard renders the trip name in an <h3> inside either a <Link> or <div>
    return this.page.getByRole("heading", { level: 3 }).count();
  }

  /**
   * Return a locator that targets the trip card containing the given name.
   * TripCard renders `name` inside an <h3> (line 80-82 of TripCard.tsx).
   */
  tripCard(name: string): Locator {
    // Match the <h3> heading inside the trip card — stable and specific
    return this.page.getByRole("heading", { level: 3, name });
  }

  /** Click a trip card by name to navigate to the detail page. */
  async clickTrip(name: string): Promise<void> {
    await this.page.getByRole("heading", { level: 3, name }).click();
  }

  /**
   * Open the "Create trip" dialog, fill in the name (and optionally dates),
   * submit, then wait for navigation to the new trip's detail page.
   *
   * Handles both the empty-state CTA ("Create your first trip") and the
   * header button ("New trip") from trips/page.tsx.
   */
  async createTrip(
    name: string,
    _startDate?: string,
    _endDate?: string
  ): Promise<string> {
    // Determine which trigger button is visible
    const newTripButton = this.page.getByRole("button", { name: "New trip" });
    const firstTripButton = this.page.getByRole("button", {
      name: "Create your first trip",
    });

    if (await newTripButton.isVisible().catch(() => false)) {
      await newTripButton.click();
    } else {
      await firstTripButton.click();
    }

    // Dialog opens — wait for the dialog title (CreateTripDialog.tsx line 101)
    await this.page
      .getByRole("dialog")
      .getByText("Create a new trip")
      .waitFor({ state: "visible" });

    // Fill the trip name (Label "Trip name", htmlFor="trip-name" — line 111)
    await this.page.getByLabel("Trip name").fill(name);

    // Dates are optional; skip date picker interaction for now to keep tests
    // fast and avoid flakiness from date-picker UI complexity.

    // Submit (button text "Create trip" — CreateTripDialog.tsx line 171)
    await this.page.getByRole("button", { name: "Create trip" }).click();

    // After creation the app calls router.push(`/trips/${trip.id}`)
    // Wait for navigation away from /trips
    await this.page.waitForURL(/\/trips\/[^/]+$/, { timeout: 15_000 });

    // Extract the trip ID from the URL
    const url = this.page.url();
    const tripId = url.split("/trips/")[1];
    expect(tripId).toBeTruthy();
    return tripId;
  }
}
