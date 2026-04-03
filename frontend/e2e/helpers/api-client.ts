/**
 * Typed HTTP client for E2E test data setup and teardown.
 *
 * This is a plain class — NOT a Playwright fixture.  Use `ApiClient.create()`
 * to instantiate from the saved auth token and env vars.
 *
 * API paths match `frontend/src/lib/api.ts` exactly.
 */

import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.resolve(__dirname, "../.auth");
const TOKEN_JSON = path.join(AUTH_DIR, "token.json");
const MANIFEST_JSON = path.join(AUTH_DIR, "test-data.json");

// ── Response types (mirrors frontend/src/lib/api.ts) ──────────────────────

export interface Trip {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  google_link: string | null;
  google_place_id: string | null;
  note: string | null;
  added_by_user_id: string | null;
  added_by_email: string | null;
  city: string | null;
  working_hours: string | null;
  requires_booking: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  user_image_url: string | null;
  attribution_name: string | null;
  attribution_uri: string | null;
}

export interface DayResponse {
  id: string;
  trip_id: string;
  date: string | null;
  sort_order: number;
  created_at: string | null;
}

export interface ItineraryResponse {
  days: unknown[];
}

// ── Manifest helpers ───────────────────────────────────────────────────────

interface TestDataManifest {
  tripIds: string[];
}

function readManifest(): TestDataManifest {
  if (!fs.existsSync(MANIFEST_JSON)) {
    return { tripIds: [] };
  }
  try {
    return JSON.parse(
      fs.readFileSync(MANIFEST_JSON, "utf-8")
    ) as TestDataManifest;
  } catch {
    return { tripIds: [] };
  }
}

function writeManifest(manifest: TestDataManifest): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2));
}

function recordTripId(tripId: string): void {
  const manifest = readManifest();
  if (!manifest.tripIds.includes(tripId)) {
    manifest.tripIds.push(tripId);
    writeManifest(manifest);
  }
}

// ── ApiClient ─────────────────────────────────────────────────────────────

export class ApiClient {
  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor(apiUrl: string, accessToken: string) {
    this.apiUrl = apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.accessToken = accessToken;
  }

  /**
   * Factory: reads the saved token from global-setup and builds the client.
   * Call this inside fixtures or test hooks, not at module level.
   */
  static create(): ApiClient {
    const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8000";

    let accessToken: string;
    try {
      const file = JSON.parse(fs.readFileSync(TOKEN_JSON, "utf-8")) as {
        accessToken: string;
      };
      accessToken = file.accessToken;
    } catch {
      throw new Error(
        `Could not read E2E auth token from ${TOKEN_JSON}. ` +
          "Make sure global-setup ran successfully before using ApiClient."
      );
    }

    return new ApiClient(apiUrl, accessToken);
  }

  /**
   * Register a trip ID for cleanup in global-teardown.
   * Use this for trips created via the UI (not via `createTrip()`).
   */
  registerForTeardown(tripId: string): void {
    recordTripId(tripId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.headers as Record<string, string>),
      },
    });

    if (res.status === 204) {
      return undefined as T;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as { detail?: string }).detail;
      throw new Error(
        `API ${options.method ?? "GET"} ${path} failed with HTTP ${res.status}` +
          (detail ? `: ${detail}` : "")
      );
    }

    return res.json() as Promise<T>;
  }

  // ── Public API methods ───────────────────────────────────────────────────

  /**
   * Create a trip and register its ID in the teardown manifest so
   * global-teardown will clean it up automatically.
   */
  async createTrip(body: {
    name: string;
    start_date?: string | null;
    end_date?: string | null;
  }): Promise<Trip> {
    const trip = await this.request<Trip>("/api/v1/trips", {
      method: "POST",
      body: JSON.stringify(body),
    });
    // Register for automatic teardown
    recordTripId(trip.id);
    return trip;
  }

  /** Delete a trip immediately (also used for explicit in-test teardown). */
  async deleteTrip(tripId: string): Promise<void> {
    await this.request<void>(`/api/v1/trips/${tripId}`, { method: "DELETE" });
  }

  /** Add a single location to a trip. */
  async addLocation(
    tripId: string,
    body: {
      name: string;
      address?: string | null;
      note?: string | null;
      city?: string | null;
      category?: string | null;
    }
  ): Promise<Location> {
    return this.request<Location>(`/api/v1/trips/${tripId}/locations`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** List all locations for a trip. */
  async listLocations(tripId: string): Promise<Location[]> {
    return this.request<Location[]>(`/api/v1/trips/${tripId}/locations`);
  }

  /** Create an itinerary day for a trip. */
  async createDay(
    tripId: string,
    body: { date?: string | null } = {}
  ): Promise<DayResponse> {
    return this.request<DayResponse>(`/api/v1/trips/${tripId}/days`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Fetch the full itinerary tree for a trip. */
  async getItinerary(tripId: string): Promise<ItineraryResponse> {
    return this.request<ItineraryResponse>(
      `/api/v1/trips/${tripId}/itinerary?include_empty_options=true`
    );
  }
}
