import { chromium, FullConfig } from "@playwright/test";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  getApiUrl,
  getBaseUrl,
  getE2EEmail,
  getE2EPassword,
} from "./helpers/env";

dotenv.config({ path: path.resolve(__dirname, "../.env.e2e") });

const AUTH_DIR = path.resolve(__dirname, ".auth");
const USER_JSON = path.join(AUTH_DIR, "user.json");
const TOKEN_JSON = path.join(AUTH_DIR, "token.json");

async function healthCheck(apiUrl: string): Promise<void> {
  const url = `${apiUrl}/health`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Backend health check returned HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `Backend is unreachable at ${url}. ` +
        `Start the FastAPI server before running E2E tests.\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Get an access token by calling Supabase GoTrue API directly.
 * This avoids localStorage/cookie extraction issues with @supabase/ssr.
 */
async function getSupabaseToken(
  email: string,
  password: string
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.e2e"
    );
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Supabase auth failed (HTTP ${res.status}): ${body}. ` +
        "Check E2E_USER_EMAIL and E2E_USER_PASSWORD in .env.e2e."
    );
  }

  const data = await res.json();
  return data.access_token;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const email = getE2EEmail();
  const password = getE2EPassword();
  const baseUrl = getBaseUrl();
  const apiUrl = getApiUrl();

  // 1. Backend health check
  await healthCheck(apiUrl);

  // 2. Ensure auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // 3. Get access token via Supabase GoTrue API (for API client)
  const accessToken = await getSupabaseToken(email, password);
  fs.writeFileSync(TOKEN_JSON, JSON.stringify({ accessToken }, null, 2));

  // 4. Launch browser and perform login (for storageState cookies)
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${baseUrl}/trips`, { timeout: 30_000 });

    // Save browser storage state (cookies) for Playwright tests
    await context.storageState({ path: USER_JSON });

    console.log("[global-setup] Login succeeded. Auth state saved.");
  } finally {
    await browser.close();
  }
}
