/**
 * Smoke test — critical path infrastructure validation.
 *
 * This single test confirms that:
 *   1. The authenticated storageState saved by global-setup works
 *   2. The /trips page renders for a logged-in user
 *
 * If this test fails, every other E2E test will fail too — fix this first.
 */

import { test, expect } from "../../fixtures/index";

test("authenticated user can see trips list", async ({ page }) => {
  await page.goto("/trips");

  // The heading "My Trips" is always rendered in trips/page.tsx line 65
  await expect(page.getByRole("heading", { name: "My Trips" })).toBeVisible();
});
