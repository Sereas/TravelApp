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

export interface OptionResponse {
  id: string;
  day_id: string;
  option_index: number;
  starting_city: string | null;
  ending_city: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface OptionLocationResponse {
  option_id: string;
  location_id: string;
  sort_order: number;
  time_period: string;
  location: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    category: string | null;
  };
}

export interface RouteResponse {
  route_id: string;
  option_id: string;
  label: string | null;
  transport_mode: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  sort_order: number;
  location_ids: string[];
  route_status: string;
}

export interface ShareResponse {
  share_token: string;
  share_url: string;
  created_at: string;
  expires_at: string | null;
}

export interface SharedTripResponse {
  trip: { name: string; start_date: string | null; end_date: string | null };
  locations: Location[];
  itinerary: ItineraryResponse;
}

export interface ItineraryDay {
  id: string;
  date: string | null;
  sort_order: number;
  options: ItineraryOption[];
}

export interface ItineraryOption {
  id: string;
  option_index: number;
  starting_city: string | null;
  ending_city: string | null;
  created_by: string | null;
  locations: OptionLocationResponse[];
  routes: RouteResponse[];
}

export interface ItineraryResponse {
  days: ItineraryDay[];
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

  /**
   * Fetch without auth — for public endpoints like /shared/{token}.
   */
  private async publicRequest<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      },
    });

    if (res.status === 204) {
      return { status: res.status, data: null };
    }

    if (!res.ok) {
      return { status: res.status, data: null };
    }

    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  // ── Trips ──────────────────────────────────────────────────────────────

  async createTrip(body: {
    name: string;
    start_date?: string | null;
    end_date?: string | null;
  }): Promise<Trip> {
    const trip = await this.request<Trip>("/api/v1/trips", {
      method: "POST",
      body: JSON.stringify(body),
    });
    recordTripId(trip.id);
    return trip;
  }

  async updateTrip(
    tripId: string,
    body: {
      name?: string;
      start_date?: string | null;
      end_date?: string | null;
    }
  ): Promise<Trip> {
    return this.request<Trip>(`/api/v1/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async deleteTrip(tripId: string): Promise<void> {
    await this.request<void>(`/api/v1/trips/${tripId}`, { method: "DELETE" });
  }

  // ── Locations ──────────────────────────────────────────────────────────

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

  async listLocations(tripId: string): Promise<Location[]> {
    return this.request<Location[]>(`/api/v1/trips/${tripId}/locations`);
  }

  // ── Days ───────────────────────────────────────────────────────────────

  async createDay(
    tripId: string,
    body: { date?: string | null } = {}
  ): Promise<DayResponse> {
    return this.request<DayResponse>(`/api/v1/trips/${tripId}/days`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async generateDays(tripId: string): Promise<DayResponse[]> {
    return this.request<DayResponse[]>(
      `/api/v1/trips/${tripId}/days/generate`,
      { method: "POST" }
    );
  }

  async deleteDay(tripId: string, dayId: string): Promise<void> {
    await this.request<void>(`/api/v1/trips/${tripId}/days/${dayId}`, {
      method: "DELETE",
    });
  }

  async listDays(tripId: string): Promise<DayResponse[]> {
    return this.request<DayResponse[]>(`/api/v1/trips/${tripId}/days`);
  }

  // ── Day Options ────────────────────────────────────────────────────────

  async createOption(
    tripId: string,
    dayId: string,
    body: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    } = {}
  ): Promise<OptionResponse> {
    return this.request<OptionResponse>(
      `/api/v1/trips/${tripId}/days/${dayId}/options`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  async listOptions(tripId: string, dayId: string): Promise<OptionResponse[]> {
    return this.request<OptionResponse[]>(
      `/api/v1/trips/${tripId}/days/${dayId}/options`
    );
  }

  async updateOption(
    tripId: string,
    dayId: string,
    optionId: string,
    body: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ): Promise<OptionResponse> {
    return this.request<OptionResponse>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
  }

  async deleteOption(
    tripId: string,
    dayId: string,
    optionId: string
  ): Promise<void> {
    await this.request<void>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}`,
      { method: "DELETE" }
    );
  }

  // ── Option Locations ───────────────────────────────────────────────────

  async addLocationToOption(
    tripId: string,
    dayId: string,
    optionId: string,
    body: {
      location_id: string;
      sort_order: number;
      time_period?: string;
    }
  ): Promise<OptionLocationResponse> {
    return this.request<OptionLocationResponse>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations`,
      {
        method: "POST",
        body: JSON.stringify({
          time_period: "morning",
          ...body,
        }),
      }
    );
  }

  async batchAddLocationsToOption(
    tripId: string,
    dayId: string,
    optionId: string,
    items: Array<{
      location_id: string;
      sort_order: number;
      time_period?: string;
    }>
  ): Promise<OptionLocationResponse[]> {
    return this.request<OptionLocationResponse[]>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/batch`,
      {
        method: "POST",
        body: JSON.stringify(
          items.map((i) => ({ time_period: "morning", ...i }))
        ),
      }
    );
  }

  async updateOptionLocation(
    tripId: string,
    dayId: string,
    optionId: string,
    locationId: string,
    body: { sort_order?: number; time_period?: string }
  ): Promise<OptionLocationResponse> {
    return this.request<OptionLocationResponse>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${locationId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
  }

  async removeLocationFromOption(
    tripId: string,
    dayId: string,
    optionId: string,
    locationId: string
  ): Promise<void> {
    await this.request<void>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${locationId}`,
      { method: "DELETE" }
    );
  }

  async reorderOptionLocations(
    tripId: string,
    dayId: string,
    optionId: string,
    locationIds: string[]
  ): Promise<OptionLocationResponse[]> {
    return this.request<OptionLocationResponse[]>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/reorder`,
      {
        method: "PATCH",
        body: JSON.stringify({ location_ids: locationIds }),
      }
    );
  }

  // ── Routes ─────────────────────────────────────────────────────────────

  async createRoute(
    tripId: string,
    dayId: string,
    optionId: string,
    body: {
      transport_mode: string;
      label?: string | null;
      location_ids: string[];
    }
  ): Promise<RouteResponse> {
    return this.request<RouteResponse>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  async deleteRoute(
    tripId: string,
    dayId: string,
    optionId: string,
    routeId: string
  ): Promise<void> {
    await this.request<void>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}`,
      { method: "DELETE" }
    );
  }

  async listRoutes(
    tripId: string,
    dayId: string,
    optionId: string
  ): Promise<RouteResponse[]> {
    return this.request<RouteResponse[]>(
      `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`
    );
  }

  // ── Sharing ────────────────────────────────────────────────────────────

  async createShare(tripId: string): Promise<ShareResponse> {
    return this.request<ShareResponse>(`/api/v1/trips/${tripId}/share`, {
      method: "POST",
    });
  }

  async revokeShare(tripId: string): Promise<void> {
    await this.request<void>(`/api/v1/trips/${tripId}/share`, {
      method: "DELETE",
    });
  }

  async getSharedTrip(
    shareToken: string
  ): Promise<{ status: number; data: SharedTripResponse | null }> {
    return this.publicRequest<SharedTripResponse>(
      `/api/v1/shared/${shareToken}`
    );
  }

  // ── Itinerary Tree ─────────────────────────────────────────────────────

  async getItinerary(tripId: string): Promise<ItineraryResponse> {
    return this.request<ItineraryResponse>(
      `/api/v1/trips/${tripId}/itinerary?include_empty_options=true`
    );
  }

  // ── Helpers for test setup ─────────────────────────────────────────────

  /**
   * Convenience: create a trip with days generated from dates,
   * add locations, and schedule them to the first day's main option.
   * Returns all IDs needed for further test setup.
   */
  async setupTripWithScheduledLocations(opts: {
    name: string;
    startDate: string;
    endDate: string;
    locations: Array<{
      name: string;
      city?: string;
      category?: string;
      address?: string;
    }>;
    timePeriod?: string;
  }): Promise<{
    trip: Trip;
    locations: Location[];
    days: DayResponse[];
    dayId: string;
    optionId: string;
  }> {
    const trip = await this.createTrip({
      name: opts.name,
      start_date: opts.startDate,
      end_date: opts.endDate,
    });

    const locations = await Promise.all(
      opts.locations.map((loc) => this.addLocation(trip.id, loc))
    );

    const days = await this.generateDays(trip.id);
    if (!days.length) {
      throw new Error(
        `generateDays returned no days for trip ${trip.id} ` +
          `(${opts.startDate} to ${opts.endDate})`
      );
    }
    const dayId = days[0].id;

    // Get the main option (option_index=1) for the first day
    const itinerary = await this.getItinerary(trip.id);
    const firstDay = itinerary.days[0];
    if (!firstDay?.options?.length) {
      throw new Error(`No options found for day 0 of trip ${trip.id}`);
    }
    const optionId = firstDay.options[0].id;

    // Schedule all locations to the first day
    await this.batchAddLocationsToOption(
      trip.id,
      dayId,
      optionId,
      locations.map((loc, i) => ({
        location_id: loc.id,
        sort_order: i,
        time_period: opts.timePeriod ?? "morning",
      }))
    );

    return { trip, locations, days, dayId, optionId };
  }
}
