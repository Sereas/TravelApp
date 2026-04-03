import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.e2e") });

const AUTH_DIR = path.resolve(__dirname, ".auth");
const TOKEN_JSON = path.join(AUTH_DIR, "token.json");
const MANIFEST_JSON = path.join(AUTH_DIR, "test-data.json");

interface TestDataManifest {
  tripIds: string[];
}

interface TokenFile {
  accessToken: string;
}

export default async function globalTeardown(): Promise<void> {
  // No-op if the manifest doesn't exist (no test data was created)
  if (!fs.existsSync(MANIFEST_JSON)) {
    console.log(
      "[global-teardown] No test-data manifest found. Nothing to clean up."
    );
    return;
  }

  let manifest: TestDataManifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(MANIFEST_JSON, "utf-8")
    ) as TestDataManifest;
  } catch {
    console.warn(
      "[global-teardown] Could not parse test-data manifest. Skipping cleanup."
    );
    fs.rmSync(MANIFEST_JSON, { force: true });
    return;
  }

  if (!manifest.tripIds || manifest.tripIds.length === 0) {
    fs.rmSync(MANIFEST_JSON, { force: true });
    return;
  }

  // Read the saved access token
  let accessToken: string;
  try {
    const tokenFile = JSON.parse(
      fs.readFileSync(TOKEN_JSON, "utf-8")
    ) as TokenFile;
    accessToken = tokenFile.accessToken;
  } catch {
    console.warn(
      "[global-teardown] Could not read token file. Test trips will NOT be deleted from the database."
    );
    fs.rmSync(MANIFEST_JSON, { force: true });
    return;
  }

  const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8000";

  console.log(
    `[global-teardown] Deleting ${manifest.tripIds.length} test trip(s)…`
  );

  for (const tripId of manifest.tripIds) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/trips/${tripId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok || res.status === 404) {
        console.log(`[global-teardown] Deleted trip ${tripId}`);
      } else {
        console.warn(
          `[global-teardown] Failed to delete trip ${tripId}: HTTP ${res.status}`
        );
      }
    } catch (err) {
      console.warn(
        `[global-teardown] Error deleting trip ${tripId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Clean up the manifest
  fs.rmSync(MANIFEST_JSON, { force: true });
  console.log("[global-teardown] Cleanup complete.");
}
