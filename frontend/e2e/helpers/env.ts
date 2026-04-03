/**
 * Typed, validated access to E2E environment variables.
 *
 * Call these helpers rather than reading process.env directly so that
 * missing config fails loudly at the point of access.
 */

export function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://localhost:3000";
}

export function getApiUrl(): string {
  return process.env.E2E_API_URL ?? "http://localhost:8000";
}

export function getE2EEmail(): string {
  const value = process.env.E2E_USER_EMAIL;
  if (!value) {
    throw new Error(
      "E2E_USER_EMAIL is not set. Add it to .env.e2e (see .env.e2e.example)."
    );
  }
  return value;
}

export function getE2EPassword(): string {
  const value = process.env.E2E_USER_PASSWORD;
  if (!value) {
    throw new Error(
      "E2E_USER_PASSWORD is not set. Add it to .env.e2e (see .env.e2e.example)."
    );
  }
  return value;
}
