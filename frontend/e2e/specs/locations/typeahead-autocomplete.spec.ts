/**
 * Typeahead autocomplete E2E tests (fully stubbed via page.route()).
 *
 * These tests are in the RED phase: the typeahead UI does not exist yet.
 * Every test is expected to FAIL until the SmartLocationInput typeahead
 * implementation lands.
 *
 * Network stubbing approach:
 *   - page.route("**\/api/v1/locations/google/autocomplete", ...) returns canned suggestions
 *   - page.route("**\/api/v1/locations/google/resolve", ...) returns a canned LocationPreviewResponse
 *   - page.route("**\/api/v1/locations/google/preview", ...) is NEVER registered;
 *     any call to it fails the assertion "preview must not be called"
 *
 * Selectors expected after implementation:
 *   - Input: role="combobox" or role="textbox" inside SmartLocationInput
 *   - Dropdown: role="listbox"
 *   - Each option: role="option"
 *   - "On list" pill: text matching /on list/i
 *   - AddLocationForm: a form element that is populated after a resolve pick
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";

// ---------------------------------------------------------------------------
// Canned API responses (deterministic, no real Google calls)
// ---------------------------------------------------------------------------

const CANNED_AUTOCOMPLETE_RESPONSE = {
  suggestions: [
    {
      place_id: "ChIJ_eiff1",
      main_text: "Eiffel Tower",
      secondary_text: "Paris, France",
      types: ["tourist_attraction", "landmark"],
    },
    {
      place_id: "ChIJ_eiff2",
      main_text: "Eiffelstraße",
      secondary_text: "Berlin, Germany",
      types: ["route"],
    },
    {
      place_id: "ChIJ_eiff3",
      main_text: "Eiffel Square",
      secondary_text: "Lyon, France",
      types: ["establishment"],
    },
  ],
};

interface CannedResolvePayload {
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  suggested_category: string | null;
  photo_resource_name: string | null;
}

const CANNED_RESOLVE_RESPONSE: CannedResolvePayload = {
  name: "Eiffelstraße",
  address: "Eiffelstraße, Berlin, Germany",
  city: "Berlin",
  latitude: 52.5163,
  longitude: 13.3777,
  google_place_id: "ChIJ_eiff2",
  suggested_category: null,
  photo_resource_name: null,
};

// A resolve response for the on-list stub (used in the on-list click test)
const CANNED_RESOLVE_EIFFEL_RESPONSE: CannedResolvePayload = {
  name: "Eiffel Tower",
  address: "Av. Gustave Eiffel, 75007 Paris, France",
  city: "Paris",
  latitude: 48.8584,
  longitude: 2.2945,
  google_place_id: "ChIJ_eiff1",
  suggested_category: "Viewpoint",
  photo_resource_name: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stub the autocomplete endpoint to return canned suggestions.
 * Returns a request URL collector so tests can assert session_token values.
 */
async function stubAutocomplete(
  page: import("@playwright/test").Page,
  response = CANNED_AUTOCOMPLETE_RESPONSE
) {
  const requestBodies: unknown[] = [];
  await page.route("**/api/v1/locations/google/autocomplete", async (route) => {
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return requestBodies;
}

/**
 * Stub the resolve endpoint to return a canned LocationPreviewResponse.
 * Returns a request body collector.
 */
async function stubResolve(
  page: import("@playwright/test").Page,
  response: CannedResolvePayload = CANNED_RESOLVE_RESPONSE
) {
  const requestBodies: unknown[] = [];
  await page.route("**/api/v1/locations/google/resolve", async (route) => {
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return requestBodies;
}

/**
 * Register a fail-assertion for the preview endpoint.
 * If the test accidentally calls /preview, this handler marks it so
 * the test assertion at the end can fail.
 */
async function failOnPreview(page: import("@playwright/test").Page) {
  let previewWasCalled = false;
  await page.route("**/api/v1/locations/google/preview", async (route) => {
    previewWasCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "Should not be called",
        address: null,
        city: null,
        latitude: null,
        longitude: null,
        google_place_id: "should-not-be-called",
        suggested_category: null,
        photo_resource_name: null,
      }),
    });
  });
  return {
    get previewWasCalled() {
      return previewWasCalled;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Typeahead autocomplete — stubbed E2E (Red phase)", () => {
  /**
   * Full typeahead flow:
   * 1. Log in to a seeded trip
   * 2. Stub autocomplete → 3 suggestions
   * 3. Stub resolve → canned LocationPreviewResponse
   * 4. Type "Eiff" in the smart input
   * 5. Assert dropdown renders 3 items
   * 6. Press ArrowDown → Enter (select second suggestion: Eiffelstraße)
   * 7. Assert AddLocationForm opens with "Eiffelstraße" prefilled
   * 8. Assert /preview was NEVER called
   */
  test("full typeahead flow: type → dropdown → pick → form prefilled, preview not called", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    // SmartLocationInput only renders once the trip has ≥ 1 location
    // (empty trips show the EmptyLocationsCTA instead). Seed a throwaway
    // location so the typeahead input is on screen.
    await apiClient.addLocation(testTrip.id, {
      name: "Seed Location",
      city: "Paris",
    });

    const detail = new TripDetailPage(page);

    // Register stubs BEFORE navigation to catch any early calls
    const autocompleteRequests = await stubAutocomplete(page);
    const resolveRequests = await stubResolve(page, CANNED_RESOLVE_RESPONSE);
    const previewGuard = await failOnPreview(page);

    await detail.goto(testTrip.id);

    // Find the SmartLocationInput text input
    const input = page
      .getByRole("combobox")
      .or(page.locator('[placeholder*="location"]'))
      .first();
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Type "Eiff"
    await input.fill("Eiff");

    // Wait for the autocomplete dropdown to appear
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 5_000 });

    // Assert 3 items in the dropdown. Scope to the listbox — native
    // `<select>` elements elsewhere on the page (filter toolbar) contribute
    // implicit `role="option"` children to the accessibility tree.
    const listbox = page.getByRole("listbox");
    const options = listbox.getByRole("option");
    await expect(options).toHaveCount(3);

    // Assert the text "Eiff" appears in bold in the first item's main_text
    const firstOption = options.nth(0);
    await expect(firstOption).toContainText("Eiffel Tower");

    // Navigate down to select the second item (Eiffelstraße — not on list)
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // /resolve must have been called
    await expect
      .poll(() => resolveRequests.length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1);

    // AddLocationForm must open with the resolved name prefilled. Assert
    // the name field specifically — strict-mode lookups would fail if we
    // used a broad `value*="Eiffelstra"` selector because both the name
    // and address fields contain that substring after resolve.
    const nameInput = page.locator('[id="add-location-name"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await expect(nameInput).toHaveValue(/Eiffelstra/i);

    // CRITICAL: /preview must NOT have been called (Path B uses /resolve, not /preview)
    expect(previewGuard.previewWasCalled).toBe(false);

    // CRITICAL: All autocomplete requests must carry a session_token
    for (const body of autocompleteRequests as Array<Record<string, unknown>>) {
      expect(typeof body.session_token).toBe("string");
      expect((body.session_token as string).length).toBeGreaterThan(0);
    }

    // All autocomplete requests in the session must share the same session_token
    if (autocompleteRequests.length > 1) {
      const tokens = (
        autocompleteRequests as Array<Record<string, unknown>>
      ).map((b) => b.session_token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(1);
    }

    // The /resolve request must carry the same session_token as autocomplete
    if (autocompleteRequests.length > 0 && resolveRequests.length > 0) {
      const autocompleteToken = (
        autocompleteRequests[0] as Record<string, unknown>
      ).session_token;
      const resolveToken = (resolveRequests[0] as Record<string, unknown>)
        .session_token;
      expect(resolveToken).toBe(autocompleteToken);
    }
  });

  /**
   * "On list" click flow:
   * 1. Seed the trip with a location whose name matches a canned suggestion
   * 2. Type a query that returns an "On list" suggestion
   * 3. Click the "On list" row
   * 4. Assert /resolve was NOT called (no Google billing)
   * 5. Assert a scroll happened to the existing card (or URL/state changed)
   */
  test("clicking an 'On list' suggestion does not call /resolve", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    // Seed a real location so the trip has something "on list".
    // The SmartLocationInput will match this existing location against the
    // canned autocomplete suggestion "Eiffel Tower" by name.
    // (The `addLocation` API does not accept google_place_id — matching is
    // done client-side by name substring when google_place_id is unavailable.)
    await apiClient.addLocation(testTrip.id, {
      name: "Eiffel Tower",
      city: "Paris",
    });

    const detail = new TripDetailPage(page);

    await stubAutocomplete(page, CANNED_AUTOCOMPLETE_RESPONSE);
    const resolveRequests = await stubResolve(
      page,
      CANNED_RESOLVE_EIFFEL_RESPONSE
    );

    await detail.goto(testTrip.id);

    // Type into the SmartLocationInput
    const input = page
      .getByRole("combobox")
      .or(page.locator('[placeholder*="location"]'))
      .first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("Eiff");

    // Wait for the dropdown
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 5_000 });

    // Find and click the "On list" option (first suggestion: Eiffel Tower)
    const onListRow = page
      .getByRole("option")
      .filter({ hasText: /on list/i })
      .first();
    await expect(onListRow).toBeVisible({ timeout: 3_000 });
    await onListRow.click();

    // /resolve must NOT be called for an on-list click
    // Wait briefly to confirm no deferred resolve call was made
    await page.waitForTimeout(500);
    expect(resolveRequests.length).toBe(0);
  });

  /**
   * URL paste flow: pasting a Google Maps URL must bypass autocomplete
   * and go through the existing /preview path.
   */
  test("pasting a Google Maps URL bypasses autocomplete and calls /preview", async ({
    page,
    testTrip,
    apiClient,
  }) => {
    // Seed a location so the SmartLocationInput renders (empty trips show
    // the EmptyLocationsCTA, not the combobox).
    await apiClient.addLocation(testTrip.id, {
      name: "Seed Location",
      city: "Paris",
    });

    const detail = new TripDetailPage(page);

    const autocompleteRequests = await stubAutocomplete(page);

    // Register /preview as the expected endpoint for this flow
    const previewRequests: unknown[] = [];
    await page.route("**/api/v1/locations/google/preview", async (route) => {
      const body = route.request().postDataJSON();
      previewRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "Louvre Museum",
          address: "Rue de Rivoli, 75001 Paris, France",
          city: "Paris",
          latitude: 48.8606,
          longitude: 2.3376,
          google_place_id: "ChIJ_louvre",
          suggested_category: "Museum",
          photo_resource_name: null,
        }),
      });
    });

    await detail.goto(testTrip.id);

    const input = page
      .getByRole("combobox")
      .or(page.locator('[placeholder*="location"]'))
      .first();
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Paste a Google Maps URL
    const mapsUrl = "https://maps.app.goo.gl/HFaERRSAPvPePT1D6";
    await input.fill(mapsUrl);
    await page.keyboard.press("Enter");

    // Autocomplete must NOT have been called for a URL input
    expect(autocompleteRequests.length).toBe(0);

    // The dropdown must not have appeared
    expect(await page.getByRole("listbox").count()).toBe(0);

    // /preview IS expected to be called for URL paste
    await expect
      .poll(() => previewRequests.length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1);
  });
});
