import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? "";
const tripId = process.env.E2E_TRIP_ID ?? "";

test.describe("Itinerary plan dropdown", () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password || !tripId,
      "Set E2E_EMAIL, E2E_PASSWORD, and E2E_TRIP_ID to run this spec"
    );
  });

  test("created plan shows custom name in the dropdown trigger", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/trips/, { timeout: 30_000 });

    await page.goto(`/trips/${tripId}`);
    await page.getByRole("tab", { name: /itinerary/i }).click();

    const label = `E2E Plan ${Date.now()}`;
    await page.getByRole("button", { name: /^main plan$/i }).click();
    await page.getByRole("button", { name: /^add plan$/i }).click();
    await page.getByPlaceholder("New plan name").fill(label);
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(
      page.getByRole("button", { name: label, exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });
});
