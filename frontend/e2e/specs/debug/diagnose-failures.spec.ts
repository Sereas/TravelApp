/**
 * Diagnostic: investigate the persistent failures.
 */
import { test, expect } from "../../fixtures/index";
import { TripsListPage } from "../../pages/TripsListPage";

test.setTimeout(60_000);

test("diagnose: create trip dialog flow", async ({ page, apiClient }) => {
  const tripsPage = new TripsListPage(page);
  await tripsPage.goto();

  // Log what buttons are available
  const btns = await page.getByRole("button").allTextContents();
  console.log("Buttons:", btns.filter((b) => b.trim()).join(" | "));

  // Click New trip
  const newTripBtn = page.getByRole("button", { name: "New trip" });
  console.log(
    "New trip visible:",
    await newTripBtn.isVisible().catch(() => false)
  );
  await newTripBtn.click();
  await page.waitForTimeout(1000);

  // Check dialog
  const dialog = page.getByRole("dialog");
  console.log("Dialog visible:", await dialog.isVisible().catch(() => false));

  if (await dialog.isVisible().catch(() => false)) {
    const dialogText = await dialog.textContent().catch(() => "");
    console.log("Dialog text:", dialogText?.substring(0, 300));

    // Fill name
    await page.getByLabel("Trip name").fill("DiagTrip");
    console.log("Filled name");

    // Check what "Create trip" matches
    const createBtns = await page
      .getByRole("button", { name: /Create trip/i })
      .all();
    console.log("Create trip button count:", createBtns.length);
    for (const btn of createBtns) {
      const text = await btn.textContent();
      const visible = await btn.isVisible();
      console.log(`  Button: "${text}" visible=${visible}`);
    }

    // Click and wait
    await page
      .getByRole("button", { name: "Create trip", exact: true })
      .click();
    console.log("Clicked Create trip");

    try {
      await page.waitForURL(/\/trips\/[^/]+$/, { timeout: 10_000 });
      console.log("Navigated to:", page.url());
      const tripId = page.url().split("/trips/")[1];
      apiClient.registerForTeardown(tripId);
      await apiClient.deleteTrip(tripId);
    } catch {
      console.log("Navigation failed, current URL:", page.url());
      await page.screenshot({
        path: "e2e/test-results/diagnose-create-trip.png",
      });
    }
  } else {
    console.log("Dialog did NOT open!");
    await page.screenshot({ path: "e2e/test-results/diagnose-no-dialog.png" });
  }
});

test("diagnose: date picker grid aria-label", async ({ page, apiClient }) => {
  const tripsPage = new TripsListPage(page);
  await tripsPage.goto();

  await page.getByRole("button", { name: "New trip" }).click();
  await page.waitForTimeout(1000);

  await page.getByLabel("Trip name").fill("DiagDates");

  // Click start date
  await page.getByRole("button", { name: "Start date" }).click();
  await page.waitForTimeout(500);

  // Check what grids exist
  const grids = await page.getByRole("grid").all();
  console.log("Grid count:", grids.length);
  for (let i = 0; i < grids.length; i++) {
    const label = await grids[i].getAttribute("aria-label");
    const visible = await grids[i].isVisible();
    console.log(`  Grid ${i}: aria-label="${label}" visible=${visible}`);
  }

  // Check what day buttons exist in the calendar
  const dayBtns = await page.getByRole("gridcell").all();
  console.log("Gridcells:", dayBtns.length);
  if (dayBtns.length > 0) {
    const first = dayBtns[0];
    const label = await first.getAttribute("aria-label");
    const text = await first.textContent();
    console.log(`First gridcell: text="${text}" aria-label="${label}"`);

    // Check the button inside the gridcell
    const btn = first.getByRole("button");
    if ((await btn.count()) > 0) {
      const btnLabel = await btn.first().getAttribute("aria-label");
      const btnText = await btn.first().textContent();
      console.log(`Button inside: text="${btnText}" aria-label="${btnLabel}"`);
    }
  }

  // Navigate forward
  const navBtn = page.getByRole("button", { name: "Go to the Next Month" });
  console.log(
    "Nav button visible:",
    await navBtn.isVisible().catch(() => false)
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});
