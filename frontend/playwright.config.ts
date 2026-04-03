import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.e2e before anything else so env vars are available during config
dotenv.config({ path: path.resolve(__dirname, ".env.e2e") });

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/test-results",

  // Timeouts
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Retry flaky tests in CI only
  retries: isCI ? 2 : 0,

  // Single worker for stability — avoids race conditions on shared test data
  workers: 1,

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  reporter: isCI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",

    // Authenticated session saved by global-setup
    storageState: "./e2e/.auth/user.json",

    // Artifacts — only on failure to keep CI lean
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
