/**
 * Diagnostic spec — round 4: schedule, plan switcher, time periods, routes.
 */

import { test } from "../../fixtures/index";

test.setTimeout(120_000);

test("explore scheduling and interactions", async ({ page, apiClient }) => {
  const trip = await apiClient.createTrip({
    name: `E2E Explore4 ${Date.now()}`,
    start_date: "2026-07-01",
    end_date: "2026-07-03",
  });

  await apiClient.addLocation(trip.id, { name: "E2E Place Alpha" });
  await apiClient.addLocation(trip.id, { name: "E2E Place Beta" });

  await page.goto(`/trips/${trip.id}`);
  await page.locator("h1").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("tab", { name: "Itinerary" }).click();
  await page.waitForTimeout(2000);

  // Generate days
  await page.getByRole("button", { name: /Generate/i }).click();
  await page
    .getByRole("button", { name: /Generate|Generating/i })
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(3000);

  // === Schedule locations via "Add locations" button ===
  console.log("=== CLICK ADD LOCATIONS ===");
  const addLocsBtn = page.getByRole("button", { name: "Add locations" });
  await addLocsBtn.click();
  await page.waitForTimeout(2000);

  const dialog = page.getByRole("dialog");
  const dialogVisible = await dialog.isVisible().catch(() => false);
  console.log("Dialog visible:", dialogVisible);

  if (dialogVisible) {
    const dialogText = await dialog.textContent().catch(() => "");
    console.log("Dialog text (500):", dialogText?.substring(0, 500));

    const checkboxCount = await dialog.getByRole("checkbox").count();
    console.log("Checkboxes:", checkboxCount);

    const dialogBtns = await dialog.getByRole("button").allTextContents();
    console.log(
      "Dialog buttons:",
      dialogBtns.filter((b) => b.trim()).join(" | ")
    );

    await page.screenshot({
      path: "e2e/test-results/explore4-1-add-dialog.png",
    });

    // Select both locations and add them
    if (checkboxCount > 0) {
      for (let i = 0; i < checkboxCount; i++) {
        await dialog.getByRole("checkbox").nth(i).click();
        await page.waitForTimeout(200);
      }

      // Look for the submit button
      const submitBtns = await dialog.getByRole("button").allTextContents();
      console.log(
        "Buttons after selecting:",
        submitBtns.filter((b) => b.trim()).join(" | ")
      );

      const addBtn = dialog.getByRole("button", { name: /Add \d|Add loc/i });
      if (await addBtn.isVisible().catch(() => false)) {
        const btnText = await addBtn.textContent();
        console.log("Submit button text:", btnText);
        await addBtn.click();
        await page.waitForTimeout(3000);
      }
    } else {
      await page.keyboard.press("Escape");
    }
  }

  // === After scheduling, snapshot the page ===
  await page.screenshot({
    path: "e2e/test-results/explore4-2-after-schedule.png",
    fullPage: true,
  });
  console.log("\n=== AFTER SCHEDULING ===");
  const allBtns = await page.getByRole("button").allTextContents();
  console.log(allBtns.filter((b) => b.trim()).join("\n"));

  // Check if locations appear in the day
  console.log(
    "\nAlpha visible:",
    await page
      .getByText("E2E Place Alpha")
      .isVisible()
      .catch(() => false)
  );
  console.log(
    "Beta visible:",
    await page
      .getByText("E2E Place Beta")
      .isVisible()
      .catch(() => false)
  );

  // === Plan switcher ===
  console.log("\n=== PLAN SWITCHER ===");
  const planBtn = page.getByRole("button", { name: /Main plan/i });
  console.log(
    "Main plan button visible:",
    await planBtn.isVisible().catch(() => false)
  );
  if (await planBtn.isVisible().catch(() => false)) {
    await planBtn.click();
    await page.waitForTimeout(1000);

    const popoverBtns = await page.getByRole("button").allTextContents();
    console.log(
      "Popover buttons:",
      popoverBtns.filter((b) => b.trim()).join(" | ")
    );
    await page.screenshot({
      path: "e2e/test-results/explore4-3-plan-switcher.png",
    });

    // Look for "Add plan" or similar
    const addPlanBtn = page.getByRole("button", {
      name: /Add plan|New plan|Create plan/i,
    });
    console.log(
      "Add plan visible:",
      await addPlanBtn.isVisible().catch(() => false)
    );

    await page.keyboard.press("Escape");
  }

  // === Time period buttons ===
  console.log("\n=== TIME PERIODS ===");
  // Look for time period elements near the scheduled locations
  const mainContent = await page
    .locator("main")
    .innerHTML()
    .catch(() => "");
  const hasMorning =
    mainContent.includes("morning") || mainContent.includes("Morning");
  const hasAfternoon =
    mainContent.includes("afternoon") || mainContent.includes("Afternoon");
  console.log("Has morning:", hasMorning, "Has afternoon:", hasAfternoon);

  // Look for clickable time badges
  const allSpans = await page
    .locator("button, span")
    .filter({ hasText: /morning|afternoon|evening|night/i })
    .allTextContents();
  console.log("Time-related elements:", allSpans.join(" | "));

  // === Route buttons ===
  console.log("\n=== ROUTES ===");
  const routeBtns = await page
    .locator("button")
    .filter({
      hasText: /route|Route|New route|Create route|walk|Walk|drive|Drive/i,
    })
    .allTextContents();
  console.log("Route buttons:", routeBtns.join(" | "));

  // Also check the "Logistics" section
  const logistics = await page
    .getByText(/Logistics|Routes between/i)
    .isVisible()
    .catch(() => false);
  console.log("Logistics section visible:", logistics);

  // Look for "New route" or similar
  const newRouteBtn = page.getByRole("button", {
    name: /New route|Add route|Create route/i,
  });
  console.log(
    "New route button visible:",
    await newRouteBtn.isVisible().catch(() => false)
  );

  // === Share flow ===
  console.log("\n=== SHARE ===");
  await page.getByRole("button", { name: /Share/i }).first().click();
  await page.waitForTimeout(2000);

  const shareDialog = page.getByRole("dialog");
  if (await shareDialog.isVisible().catch(() => false)) {
    // Click "Enable Link Sharing"
    const enableBtn = shareDialog.getByRole("button", {
      name: /Enable Link Sharing/i,
    });
    if (await enableBtn.isVisible().catch(() => false)) {
      console.log("Found Enable Link Sharing, clicking...");
      await enableBtn.click();
      await page.waitForTimeout(3000);

      // After enabling, check for the share URL
      const shareText = await shareDialog.textContent().catch(() => "");
      console.log(
        "Share dialog after enable (500):",
        shareText?.substring(0, 500)
      );

      const inputs = await shareDialog.locator("input").count();
      console.log("Inputs:", inputs);
      if (inputs > 0) {
        const shareUrl = await shareDialog
          .locator("input")
          .first()
          .inputValue();
        console.log("Share URL:", shareUrl);
      }

      const shareBtns = await shareDialog.getByRole("button").allTextContents();
      console.log(
        "Share buttons:",
        shareBtns.filter((b) => b.trim()).join(" | ")
      );

      await page.screenshot({
        path: "e2e/test-results/explore4-4-share-enabled.png",
      });
    }
  }

  await apiClient.deleteTrip(trip.id);
});
