/**
 * Custom Playwright fixtures for the shtabtravel E2E suite.
 *
 * Import `test` and `expect` from this file instead of `@playwright/test`
 * to get all custom fixtures automatically.
 */

import { test as base, expect, type Page } from "@playwright/test";
import { ApiClient, type Trip } from "../helpers/api-client";

// ── Fixture types ──────────────────────────────────────────────────────────

interface CustomFixtures {
  /** Typed API client authenticated as the E2E test user. */
  apiClient: ApiClient;

  /**
   * A trip created via the API before the test and deleted after.
   * Use this instead of creating trips through the UI to keep tests fast
   * and truly independent.
   */
  testTrip: Pick<Trip, "id" | "name">;

  /**
   * A fresh browser page with NO stored authentication state.
   * Use this for login / auth redirect tests.
   */
  noAuthPage: Page;
}

// ── Extended test object ───────────────────────────────────────────────────

export const test = base.extend<CustomFixtures>({
  // ── apiClient ────────────────────────────────────────────────────────────
  apiClient: async ({}, use) => {
    const client = ApiClient.create();
    await use(client);
  },

  // ── testTrip ─────────────────────────────────────────────────────────────
  testTrip: async ({ apiClient }, use) => {
    const name = `E2E Trip ${Date.now()}`;
    const trip = await apiClient.createTrip({ name });

    await use({ id: trip.id, name: trip.name });

    // Clean up after the test (belt-and-suspenders: global-teardown also covers this)
    try {
      await apiClient.deleteTrip(trip.id);
    } catch {
      // Swallow — the trip may have been deleted by the test itself
    }
  },

  // ── noAuthPage ───────────────────────────────────────────────────────────
  noAuthPage: async ({ browser }, use) => {
    // Explicitly create a context WITHOUT the default storageState so the
    // page acts as an unauthenticated browser.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
