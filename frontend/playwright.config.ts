import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function loadPerfEnv() {
  const envPath = path.resolve(__dirname, "..", "tests", "perf", ".env.perf.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=");
    }
  }
}

loadPerfEnv();

export default defineConfig({
  testDir: "../tests/perf/frontend",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../tests/perf/artifacts/machine/playwright",
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev -p 3001",
    url: "http://localhost:3001/login",
    reuseExistingServer: true,
    cwd: ".",
    timeout: 120_000,
  },
  globalSetup: "../tests/perf/frontend/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
