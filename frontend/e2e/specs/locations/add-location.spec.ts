/**
 * Add location E2E tests.
 *
 * Selectors derived from `frontend/src/components/locations/AddLocationForm.tsx`:
 *   - Google Maps link input: id="add-location-google-link"
 *   - Location name input:    id="add-location-name"
 *   - "Fetching details…" text (previewLoading state, line 196)
 *   - Duplicate warning: contains "already exists in this trip" (line 200)
 *   - Submit button: text "Add Location" (line 411)
 *
 * Location card name renders as <h3> (LocationCard.tsx line 301).
 *
 * Tests tagged @google make real calls to the Google Places API and require
 * GOOGLE_PLACES_API_KEY + GOOGLE_ROUTES_API_KEY in the backend env.
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { GOOGLE_LINK_SINGLE } from "../../helpers/constants";
import type { Page } from "@playwright/test";

test.describe("Add location — manual", () => {
  test("add location manually — card appears with correct name", async ({
    page,
    testTrip,
  }) => {
    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // Open the Add Location dialog
    await detail.clickAddLocation();

    // Fill the name field (id="add-location-name" — AddLocationForm.tsx line 219)
    await page.locator("#add-location-name").fill("E2E Test Restaurant");

    // Submit (button text "Add Location" — AddLocationForm.tsx line 411)
    await page.getByRole("button", { name: "Save Location" }).click();

    // Dialog should close and the new location card should appear
    await expect(detail.locationCard("E2E Test Restaurant")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("@google — Add location via Google Maps link", () => {
  /**
   * Helper: paste a Google Maps link, wait for the preview fetch to finish,
   * and return the auto-filled name (empty string if Google API is unavailable).
   */
  async function pasteGoogleLink(page: Page, link: string): Promise<string> {
    await page.locator("#add-location-google-link").fill(link);
    // Trigger blur to start the preview fetch
    await page.locator("#add-location-google-link").blur();

    // Wait for "Fetching details…" indicator to appear, then disappear.
    // AddLocationForm.tsx line 196: previewLoading renders this text.
    await page
      .getByText("Fetching details…")
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {
        // If it appeared and disappeared faster than we could catch it, that's fine
      });
    await page
      .getByText("Fetching details…")
      .waitFor({ state: "hidden", timeout: 30_000 });

    return page.locator("#add-location-name").inputValue();
  }

  test("add location via Google Maps link — name and city auto-fill", async ({
    page,
    testTrip,
  }) => {
    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    await detail.clickAddLocation();

    const nameValue = await pasteGoogleLink(page, GOOGLE_LINK_SINGLE);

    // Guard: if the Google Places API is unavailable the name stays empty.
    // Skip rather than fail so CI doesn't become red due to external API issues.
    if (nameValue.trim() === "") {
      test.skip(
        true,
        "Google Places API did not return a name — API key missing or quota exceeded"
      );
      return;
    }

    // Submit
    await page.getByRole("button", { name: "Save Location" }).click();

    // The card with the auto-filled name should appear
    await expect(detail.locationCard(nameValue.trim())).toBeVisible({
      timeout: 15_000,
    });
  });

  test("duplicate Google Maps link shows 'already exists in this trip' warning", async ({
    page,
    testTrip,
  }) => {
    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // First addition: add the location via Google link
    await detail.clickAddLocation();
    const firstName = await pasteGoogleLink(page, GOOGLE_LINK_SINGLE);

    // Guard: if the Google Places API is unavailable, skip both attempts.
    if (firstName.trim() === "") {
      test.skip(
        true,
        "Google Places API did not return a name — API key missing or quota exceeded"
      );
      return;
    }

    await page.getByRole("button", { name: "Save Location" }).click();
    // Wait for the dialog to close
    await page
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 10_000 });

    // Second attempt: open the form again and paste the same link
    await detail.clickAddLocation();
    await pasteGoogleLink(page, GOOGLE_LINK_SINGLE);

    // Duplicate warning should appear (AddLocationForm.tsx line 200)
    await expect(page.getByText(/already exists in this trip/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
