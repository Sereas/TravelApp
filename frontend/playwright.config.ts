import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.e2e before anything else so env vars are available during config
dotenv.config({ path: path.resolve(__dirname, ".env.e2e") });

const isCI = !!process.env.CI;

// Run dir: e2e/test-results/run-{YYYYMMDD-HHmmss}-{trigger}
// Playwright loads the config multiple times — pin the run dir via env to avoid duplicates.
const trigger = process.env.E2E_RUN_TRIGGER ?? "manual_run";
if (!process.env._E2E_RUN_DIR) {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  process.env._E2E_RUN_DIR = `./e2e/test-results/run-${ts}-${trigger}`;
}
const runDir = process.env._E2E_RUN_DIR;

export default defineConfig({
  testDir: "./e2e/specs",
  testIgnore: ["**/debug/**"],
  outputDir: runDir,

  // Timeouts
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Retry flaky tests in CI only
  retries: isCI ? 2 : 0,

  // Single worker for stability — avoids race conditions on shared test data
  workers: 1,

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  reporter: [
    ["list"],
    ["./e2e/run-summary-reporter.ts"],
    ...(isCI ? [["github" as const]] : []),
  ],

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
