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
    // In read-only (shared) view, trip name is an <h1>.
    // In authenticated view, trip name is a <button> styled with text-2xl.
    const h1 = this.page.locator("h1");
    if (await h1.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return (await h1.textContent())?.trim() ?? "";
    }
    return (
      (await this.page
        .locator('button[class*="text-2xl"]')
        .first()
        .textContent()) ?? ""
    ).trim();
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
   * Empty trip: EmptyLocationsCTA shows "Paste Link" / "Add Manually" buttons.
   * Non-empty trip: SmartLocationInput is always visible — focus the input.
   */
  async clickAddLocation(): Promise<void> {
    // Empty state: EmptyLocationsCTA shows "Add Manually" / "Paste Link" buttons.
    // "Add Manually" opens AddLocationForm in form phase (name input visible).
    // "Paste Link" opens link phase (only link input visible — wrong for manual add).
    const addManually = this.page.getByRole("button", {
      name: "Add Manually",
    });
    const smartInput = this.page.locator(
      'input[placeholder*="Add a location"]'
    );

    if (await addManually.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addManually.click();
    } else if (
      await smartInput.isVisible({ timeout: 1_000 }).catch(() => false)
    ) {
      // Non-empty: SmartLocationInput is always visible — type directly
      await smartInput.click();
      return; // SmartInput is already visible, no need to wait
    }
    await this.page
      .locator("#add-location-name")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Opens the Import Google Maps List dialog.
   */
  async clickImportGoogleList(): Promise<void> {
    // Empty state: "Import List" button in EmptyLocationsCTA
    const emptyImport = this.page.getByRole("button", {
      name: "Import List",
    });
    // Non-empty: SmartLocationInput "Import Google List" button (aria-label)
    const smartImport = this.page.getByRole("button", {
      name: /Import Google List/i,
    });

    if (await emptyImport.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emptyImport.click();
    } else {
      await smartImport.click();
    }
    await this.page
      .getByText("Import from Google Maps List")
      .waitFor({ state: "visible", timeout: 10_000 });
  }
}
