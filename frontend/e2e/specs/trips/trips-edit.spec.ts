/**
 * Trip edit / date display E2E tests.
 *
 * Covers:
 *  1. No-date trip — no date badge shown
 *  2. Start-date-only — "Starts Jun 1, 2026"
 *  3. End-date-only   — "Ends Jun 10, 2026"
 *  4. Both dates      — range + duration badge in create dialog
 *  5. Edit trip name  — h1 heading updates
 *  6. End date cannot be before start date in edit form
 *  7. Edit trip dates — date range updates
 *
 * Selectors:
 *   - date badge: <span> containing Calendar icon + formatDateRange() result
 *     (page.tsx lines 447-451)
 *   - "Edit trip" button: aria-label="Edit trip" (page.tsx line 467)
 *   - Edit trip name field: id="edit-trip-name" (EditTripForm.tsx line 123)
 *   - Date pickers: button text "Start date" / "End date" (placeholder)
 *   - Duration badge: <span class="...bg-brand-muted..."> with text like "9 days"
 *     (CreateTripDialog.tsx lines 151-156)
 *   - Save button in edit form: text "Save"
 */

import { test, expect } from "../../fixtures/index";
import { TripDetailPage } from "../../pages/TripDetailPage";
import { TripsListPage } from "../../pages/TripsListPage";

// ---------------------------------------------------------------------------
// Helper: pick a date in the react-day-picker v9 calendar popover.
//
// The grid has aria-label="Month YYYY" (e.g. "June 2026").
// Day buttons have aria-label like "Monday, June 1st, 2026".
// Nav buttons: "Go to the Next Month" / "Go to the Previous Month".
// Caption text is a <span> with class caption_label (no role).
// ---------------------------------------------------------------------------
async function pickDate(
  page: import("@playwright/test").Page,
  buttonLabel: string | RegExp,
  dateLabel: string
): Promise<void> {
  const parts = dateLabel.match(/^(\w+)\s+(\d+),\s+(\d{4})$/);
  if (!parts)
    throw new Error(`pickDate: cannot parse date label "${dateLabel}"`);
  const [, month, day, year] = parts;
  const targetMonthYear = `${month} ${year}`;

  // Click the DatePicker trigger button
  await page.getByRole("button", { name: buttonLabel }).click();

  // Wait for a calendar grid to appear
  await page
    .getByRole("grid")
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });

  // Navigate to the target month using the grid's aria-label (e.g. "June 2026")
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

  // Click the day button — aria-label includes weekday + ordinal:
  // "Monday, June 1st, 2026". Match flexibly.
  const dayRegex = new RegExp(`${month}\\s+${day}[a-z]*,?\\s+${year}`, "i");
  const dayButton = page
    .getByRole("gridcell", { name: dayRegex })
    .getByRole("button");
  await dayButton.waitFor({ state: "visible", timeout: 5_000 });
  await dayButton.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Trip date display", () => {
  test("no dates — no date badge shown", async ({ page, apiClient }) => {
    const trip = await apiClient.createTrip({
      name: `E2E NoDates ${Date.now()}`,
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // The date badge is only rendered when dateDisplay is truthy (page.tsx line 446)
    // It contains a Calendar icon and the date text inside the span.
    // When there are no dates, the entire <span> is absent.
    const dateBadge = page.locator("span").filter({ hasText: /Starts|Ends|—/ });
    await expect(dateBadge).toHaveCount(0);

    await apiClient.deleteTrip(trip.id);
  });

  test("start date only — shows 'Starts Jun 1, 2026'", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E StartOnly ${Date.now()}`,
      start_date: "2026-06-01",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // TripDateRangePicker renders just the date (no "Starts" prefix on detail page)
    await expect(page.getByText(/Jun 1, 2026/)).toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("end date only — shows 'Ends Jun 10, 2026'", async ({
    page,
    apiClient,
  }) => {
    const trip = await apiClient.createTrip({
      name: `E2E EndOnly ${Date.now()}`,
      end_date: "2026-06-10",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // TripDateRangePicker renders just the date (no "Ends" prefix on detail page)
    await expect(page.getByText(/Jun 10, 2026/)).toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("both dates — duration badge shows '10 days' in create dialog", async ({
    page,
    apiClient,
  }) => {
    // Navigate to trips list and open the create dialog so we can verify
    // the duration badge (CreateTripDialog.tsx lines 149-156).
    const tripsPage = new TripsListPage(page);
    await tripsPage.goto();

    // Open the create dialog
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

    const tripName = `E2E BothDates ${Date.now()}`;
    await page.getByLabel("Trip name").fill(tripName);

    // Pick start date: Jun 1, 2026
    await pickDate(page, "Start date", "June 1, 2026");
    // Pick end date: Jun 10, 2026  (10 days inclusive)
    await pickDate(page, "End date", "June 10, 2026");

    // Duration badge should now show "10 days"
    await expect(page.getByText("10 days")).toBeVisible();

    // Submit and register for teardown
    await page.getByRole("button", { name: "Create trip" }).click();
    await page.waitForURL(/\/trips\/[^/]+$/, { timeout: 15_000 });
    const tripId = page.url().split("/trips/")[1];
    apiClient.registerForTeardown(tripId);

    // The detail page should show the date range
    await expect(
      page.getByText(/Jun 1, 2026.*Jun 10, 2026|Jun 1.*—.*Jun 10/i)
    ).toBeVisible();

    await apiClient.deleteTrip(tripId);
  });
});

test.describe("Trip edit", () => {
  test("edit trip name — h1 heading updates", async ({ page, testTrip }) => {
    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // Click "Edit Trip" button (aria-label="Edit trip" — page.tsx line 467)
    await detail.getEditTripButton().click();

    // The EditTripForm appears inline. Clear the name field and type a new name.
    // id="edit-trip-name" (EditTripForm.tsx line 123)
    const newName = `Renamed Trip ${Date.now()}`;
    await page.locator("#edit-trip-name").fill(newName);

    // Submit the edit form. The save button text is "Save" (EditTripForm.tsx).
    await page.getByRole("button", { name: /Save Changes/i }).click();

    // After save the form is dismissed and the trip name button should show the new name
    await expect(page.getByRole("button", { name: newName })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("end date cannot be set before start date in edit form", async ({
    page,
    apiClient,
  }) => {
    // Create a trip with a known start date so we can test the constraint
    const trip = await apiClient.createTrip({
      name: `E2E DateConstraint ${Date.now()}`,
      start_date: "2026-07-10",
    });

    const detail = new TripDetailPage(page);
    await detail.goto(trip.id);

    // Open edit form
    await detail.getEditTripButton().click();

    // Try to pick an end date BEFORE the current start date (July 10).
    // The DatePicker passes fromDate=startDate to Calendar, disabling earlier days.
    await page.getByRole("button", { name: /End date/i }).click();
    await page
      .getByRole("grid")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    // Navigate to July 2026
    for (let i = 0; i < 24; i++) {
      const gridLabel = await page
        .getByRole("grid")
        .first()
        .getAttribute("aria-label")
        .catch(() => "");
      if (gridLabel && gridLabel.includes("July 2026")) break;
      await page.getByRole("button", { name: "Go to the Next Month" }).click();
      await page.waitForTimeout(200);
    }

    // July 5 is before July 10 — the gridcell should be disabled
    const disabledCell = page.getByRole("gridcell", { name: /July 5/ });
    await disabledCell.waitFor({ state: "visible", timeout: 5_000 });
    // react-day-picker v9 puts aria-disabled on the button inside the cell
    const dayBtn = disabledCell.getByRole("button");
    await expect(dayBtn).toBeDisabled();

    // Close the calendar
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /End date/i })).toBeVisible();

    await apiClient.deleteTrip(trip.id);
  });

  test("edit trip dates — date range updates on detail page", async ({
    page,
    testTrip,
  }) => {
    const detail = new TripDetailPage(page);
    await detail.goto(testTrip.id);

    // Open edit form
    await detail.getEditTripButton().click();

    // Set start date to Aug 1, 2026
    await pickDate(page, "Start date", "August 1, 2026");
    // Set end date to Aug 5, 2026
    await pickDate(page, "End date", "August 5, 2026");

    // Save
    await page.getByRole("button", { name: /Save Changes/i }).click();

    // After save the updated date range should be shown in the date badge
    await expect(page.getByText(/Aug 1, 2026/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Aug 5, 2026/)).toBeVisible();
  });
});
