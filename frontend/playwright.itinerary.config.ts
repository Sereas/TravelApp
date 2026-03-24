import { defineConfig, devices } from "@playwright/test";

/**
 * Itinerary UI checks against a running dev server (default http://localhost:3000).
 *
 * Run backend + `npm run dev`, then:
 *   E2E_EMAIL=... E2E_PASSWORD=... E2E_TRIP_ID=... npm run test:e2e:itinerary
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
