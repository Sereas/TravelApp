/**
 * Create Trip E2E tests — all 4 date variations.
 *
 * Each test creates a trip via the UI dialog, verifies calendar interaction,
 * and checks the resulting date display on the trip detail page.
 * Uses `page` (authenticated) + `apiClient` (teardown) fixtures.
 */

import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the Create Trip dialog and fill in the trip name. */
async function openCreateDialog(
  page: import("@playwright/test").Page,
  tripName: string
): Promise<void> {
  const tripsPage = new TripsListPage(page);
  await tripsPage.goto();

  const newTripBtn = page.getByRole("button", { name: "New trip" });
  const firstTripBtn = page.getByRole("button", {
    name: "Create your first trip",
  });
  if (await newTripBtn.isVisible().catch(() => false)) {
    await newTripBtn.click();
  } else {
    await firstTripBtn.click();
  }

  await page
    .getByRole("dialog")
    .getByText("Create a new trip")
    .waitFor({ state: "visible" });
  await page.getByLabel("Trip name").fill(tripName);
}

/**
 * Navigate the DatePicker calendar to a target month and click a day.
 * The popover must already be open (call after clicking the trigger button).
 */
async function pickDayInOpenCalendar(
  page: import("@playwright/test").Page,
  month: string,
  day: string,
  year: string
): Promise<void> {
  const targetMonthYear = `${month} ${year}`;

  for (let i = 0; i < 24; i++) {
    const gridLabel = await page
      .getByRole("grid")
      .first()
      .getAttribute("aria-label")
      .catch(() => "");
    if (gridLabel && gridLabel.trim() === targetMonthYear) break;
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
    await page.waitForTimeout(200);
  }

  const dayRegex = new RegExp(`${month}\\s+${day}[a-z]*,?\\s+${year}`, "i");
  await page
    .getByRole("gridcell", { name: dayRegex })
    .getByRole("button")
    .click();
}

/** Open a DatePicker by its placeholder, navigate, and pick a day. */
async function pickDate(
  page: import("@playwright/test").Page,
  triggerLabel: string | RegExp,
  month: string,
  day: string,
  year: string
): Promise<void> {
  await page.getByRole("button", { name: triggerLabel }).click();
  await page
    .getByRole("grid")
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await pickDayInOpenCalendar(page, month, day, year);
}

/** Submit the create dialog and return the new trip ID. */
async function submitAndGetTripId(
  page: import("@playwright/test").Page
): Promise<string> {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create trip" })
    .click();
  await page.waitForURL(/\/trips\/[^/]+$/, { timeout: 15_000 });
  return page.url().split("/trips/")[1];
}

/** Wait for the trip detail page to finish loading. */
async function waitForDetailPage(
  page: import("@playwright/test").Page
): Promise<void> {
  await page
    .getByRole("tablist", { name: "Trip sections" })
    .waitFor({ state: "visible", timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Create trip", () => {
  test("no dates — Set dates placeholder on detail", async ({
    page,
    apiClient,
  }) => {
    const tripName = `E2E No Dates ${Date.now()}`;
    await openCreateDialog(page, tripName);

    await test.info().attach("01-create-dialog-no-dates.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const tripId = await submitAndGetTripId(page);
    apiClient.registerForTeardown(tripId);

    await waitForDetailPage(page);
    await expect(
      page.getByRole("button", { name: /date range/i })
    ).toContainText("Set dates");

    await test.info().attach("02-detail-no-dates.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(tripId);
  });

  test("start date only — single date on detail", async ({
    page,
    apiClient,
  }) => {
    const tripName = `E2E Start Only ${Date.now()}`;
    await openCreateDialog(page, tripName);

    // Open start date calendar and navigate to June 2026
    await page.getByRole("button", { name: "Start date" }).click();
    await page
      .getByRole("grid")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    const targetMonth = "June 2026";
    for (let i = 0; i < 24; i++) {
      const gridLabel = await page
        .getByRole("grid")
        .first()
        .getAttribute("aria-label")
        .catch(() => "");
      if (gridLabel && gridLabel.trim() === targetMonth) break;
      await page.getByRole("button", { name: "Go to the Next Month" }).click();
      await page.waitForTimeout(200);
    }

    await test.info().attach("03-calendar-start-date.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Pick June 15
    await page
      .getByRole("gridcell", { name: /June\s+15[a-z]*,?\s+2026/i })
      .getByRole("button")
      .click();

    await test.info().attach("04-dialog-start-only.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const tripId = await submitAndGetTripId(page);
    apiClient.registerForTeardown(tripId);

    await waitForDetailPage(page);
    const dateBtn = page.getByRole("button", { name: /date range/i });
    await expect(dateBtn).toContainText("Jun 15, 2026");
    await expect(dateBtn).not.toContainText("\u2014");

    await test.info().attach("05-detail-start-only.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(tripId);
  });

  test("end date only — single date on detail", async ({
    page,
    apiClient,
  }) => {
    const tripName = `E2E End Only ${Date.now()}`;
    await openCreateDialog(page, tripName);

    // Open end date calendar and navigate to July 2026
    await page.getByRole("button", { name: "End date" }).click();
    await page
      .getByRole("grid")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    const targetMonth = "July 2026";
    for (let i = 0; i < 24; i++) {
      const gridLabel = await page
        .getByRole("grid")
        .first()
        .getAttribute("aria-label")
        .catch(() => "");
      if (gridLabel && gridLabel.trim() === targetMonth) break;
      await page.getByRole("button", { name: "Go to the Next Month" }).click();
      await page.waitForTimeout(200);
    }

    await test.info().attach("06-calendar-end-date.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Pick July 20
    await page
      .getByRole("gridcell", { name: /July\s+20[a-z]*,?\s+2026/i })
      .getByRole("button")
      .click();

    await test.info().attach("07-dialog-end-only.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const tripId = await submitAndGetTripId(page);
    apiClient.registerForTeardown(tripId);

    await waitForDetailPage(page);
    const dateBtn = page.getByRole("button", { name: /date range/i });
    await expect(dateBtn).toContainText("Jul 20, 2026");
    await expect(dateBtn).not.toContainText("\u2014");

    await test.info().attach("08-detail-end-only.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(tripId);
  });

  test("both dates — duration badge and date range", async ({
    page,
    apiClient,
  }) => {
    const tripName = `E2E Both Dates ${Date.now()}`;
    await openCreateDialog(page, tripName);

    // Pick start date: June 10, 2026
    await pickDate(page, "Start date", "June", "10", "2026");

    // Open end date calendar — constrained by fromDate (June 10)
    await page.getByRole("button", { name: "End date" }).click();
    await page
      .getByRole("grid")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    await test.info().attach("09-calendar-end-constrained.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    // Pick June 19 (10 days inclusive)
    await pickDayInOpenCalendar(page, "June", "19", "2026");

    // Duration badge should show "10 days"
    await expect(page.getByText("10 days")).toBeVisible();

    await test.info().attach("10-dialog-both-dates.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const tripId = await submitAndGetTripId(page);
    apiClient.registerForTeardown(tripId);

    await waitForDetailPage(page);
    const dateBtn = page.getByRole("button", { name: /date range/i });
    await expect(dateBtn).toContainText("Jun 10, 2026");
    await expect(dateBtn).toContainText("Jun 19, 2026");

    await test.info().attach("11-detail-both-dates.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await apiClient.deleteTrip(tripId);
  });
});
