import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type PerfContext = {
  representative_trip_id: string;
  representative_trip_name: string;
  benchmarks: Record<string, { target_ms: number; max_ms: number }>;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in tests/perf/.env.perf.local`);
  }
  return value;
}

function readContext(): PerfContext {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const p = path.join(
    repoRoot,
    "tests",
    "perf",
    "artifacts",
    "machine",
    "ui_perf_context_latest.json"
  );
  return JSON.parse(fs.readFileSync(p, "utf8")) as PerfContext;
}

function statusFor(ms: number, targetMs: number, maxMs: number): "good" | "warning" | "fail" {
  if (ms <= targetMs) return "good";
  if (ms <= maxMs) return "warning";
  return "fail";
}

async function measurePageRender(page: Page, url: string, readySelector: string) {
  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(readySelector, { state: "visible", timeout: 60_000 });
  const readyMs = Date.now() - started;
  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    return {
      domContentLoadedMs: nav.domContentLoadedEventEnd,
      loadEventMs: nav.loadEventEnd,
      responseEndMs: nav.responseEnd,
    };
  });
  return { readyMs, navTiming };
}

test("ui pages render within perf thresholds", async ({ page, baseURL }) => {
  const context = readContext();
  const perfEmail = requireEnv("PERF_UI_EMAIL");
  const perfPassword = requireEnv("PERF_UI_PASSWORD");
  const results: Array<Record<string, unknown>> = [];

  const loginResult = await measurePageRender(page, `${baseURL}/login`, 'input[type="email"]');
  results.push({
    page: "login_page",
    ...loginResult,
    benchmark: context.benchmarks.login_page,
    benchmark_status: statusFor(
      loginResult.readyMs,
      context.benchmarks.login_page.target_ms,
      context.benchmarks.login_page.max_ms
    ),
  });

  await page.getByLabel("Email").fill(perfEmail);
  await page.getByLabel("Password").fill(perfPassword);

  const tripsStarted = Date.now();
  await Promise.all([
    page.waitForURL("**/trips", { timeout: 60_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.getByText(context.representative_trip_name).first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  const tripsReadyMs = Date.now() - tripsStarted;
  results.push({
    page: "trips_page",
    readyMs: tripsReadyMs,
    benchmark: context.benchmarks.trips_page,
    benchmark_status: statusFor(
      tripsReadyMs,
      context.benchmarks.trips_page.target_ms,
      context.benchmarks.trips_page.max_ms
    ),
  });

  const detailResult = await measurePageRender(
    page,
    `${baseURL}/trips/${context.representative_trip_id}`,
    `h1:has-text("${context.representative_trip_name}")`
  );
  results.push({
    page: "trip_detail_page",
    trip_name: context.representative_trip_name,
    ...detailResult,
    benchmark: context.benchmarks.trip_detail_page,
    benchmark_status: statusFor(
      detailResult.readyMs,
      context.benchmarks.trip_detail_page.target_ms,
      context.benchmarks.trip_detail_page.max_ms
    ),
  });

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const payload = {
    timestamp: new Date().toISOString(),
    benchmarks: context.benchmarks,
    representative_trip_id: context.representative_trip_id,
    representative_trip_name: context.representative_trip_name,
    results,
  };
  const markdown = [
    "# Frontend Performance Report",
    "",
    `- Timestamp: \`${payload.timestamp}\``,
    `- Representative trip: \`${context.representative_trip_name}\` (\`${context.representative_trip_id}\`)`,
    "",
    "| Page | Ready ms | Target | Max | Status |",
    "|---|---:|---:|---:|---|",
    ...results.map((result) => {
      const benchmark = result.benchmark as { target_ms: number; max_ms: number };
      return `| ${result.page} | ${result.readyMs} | ${benchmark.target_ms} | ${benchmark.max_ms} | ${result.benchmark_status} |`;
    }),
    "",
  ].join("\n");

  const humanDir = path.join(repoRoot, "tests", "perf", "artifacts", "human");
  const machineDir = path.join(repoRoot, "tests", "perf", "artifacts", "machine");
  fs.mkdirSync(humanDir, { recursive: true });
  fs.mkdirSync(machineDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const jsonPath = path.join(machineDir, `frontend_perf_${stamp}.json`);
  const mdPath = path.join(humanDir, `frontend_perf_${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n");
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(path.join(machineDir, "frontend_perf_latest.json"), JSON.stringify(payload, null, 2) + "\n");
  fs.writeFileSync(path.join(humanDir, "frontend_perf_latest.md"), markdown);

  for (const result of results) {
    expect(result.benchmark_status).not.toBe("fail");
  }
});
