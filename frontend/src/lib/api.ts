import { createBrowserClient } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail ?? `Request failed with status ${res.status}`,
      res.status,
      body.detail
    );
  }

  return res.json();
}

async function requestUpload<T>(path: string, file: File): Promise<T> {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail ?? `Request failed with status ${res.status}`,
      res.status,
      body.detail
    );
  }

  return res.json();
}

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
  requires_booking: string | null; // no | yes | yes_done
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  user_image_url: string | null;
  attribution_name: string | null;
  attribution_uri: string | null;
}

/** Minimal location info embedded in itinerary tree. */
export interface LocationSummary {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  google_link: string | null;
  category: string | null;
  note: string | null;
  working_hours: string | null;
  requires_booking: string | null;
  image_url: string | null;
  user_image_url: string | null;
  attribution_name: string | null;
  attribution_uri: string | null;
}

export interface ItineraryOptionLocation {
  location_id: string;
  sort_order: number;
  time_period: string;
  location: LocationSummary;
}

/** Route status for UI: pending = metrics not yet calculated; ok = success; error = one or more segments failed. */
export type RouteStatus = "pending" | "ok" | "error";

/** Per-segment metrics in itinerary tree (one per leg between consecutive stops). segment_order i = leg from stop i to stop i+1. */
export interface RouteSegmentSummary {
  segment_order: number;
  duration_seconds: number | null;
  distance_meters: number | null;
  encoded_polyline: string | null;
}

export interface ItineraryOptionRoute {
  route_id: string;
  label: string | null;
  transport_mode: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  sort_order: number;
  location_ids: string[];
  route_status?: RouteStatus;
  /** Per-leg metrics in order; use segments[idx] for pill between stop idx and idx+1. */
  segments?: RouteSegmentSummary[];
}

export interface ItineraryOption {
  id: string;
  option_index: number;
  starting_city: string | null;
  ending_city: string | null;
  created_by: string | null;
  locations: ItineraryOptionLocation[];
  routes: ItineraryOptionRoute[];
}

export interface ItineraryDay {
  id: string;
  date: string | null;
  sort_order: number;
  options: ItineraryOption[];
}

/** Flat day from days API (create/generate/list); no options. */
export interface DayResponse {
  id: string;
  trip_id: string;
  date: string | null;
  sort_order: number;
  created_at: string | null;
}

/** Flat option from options API (create/update); no locations. */
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
  location: LocationSummary | null;
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
  route_status?: RouteStatus;
}

export interface RouteSegmentResponse {
  segment_order: number;
  from_location_id: string;
  to_location_id: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  encoded_polyline: string | null;
  status: string;
  error_type: string | null;
  error_message: string | null;
  provider_http_status: number | null;
  next_retry_at: string | null;
}

export interface RouteWithSegmentsResponse extends RouteResponse {
  segments: RouteSegmentResponse[];
  route_status: RouteStatus;
}

export interface ItineraryResponse {
  days: ItineraryDay[];
}

export const api = {
  trips: {
    list: () => request<Trip[]>("/api/v1/trips"),

    get: (tripId: string) => request<Trip>(`/api/v1/trips/${tripId}`),

    create: (body: {
      name: string;
      start_date?: string | null;
      end_date?: string | null;
    }) =>
      request<Trip>("/api/v1/trips", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
      tripId: string,
      body: {
        name?: string;
        start_date?: string | null;
        end_date?: string | null;
      }
    ) =>
      request<Trip>(`/api/v1/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    delete: (tripId: string) =>
      request<void>(`/api/v1/trips/${tripId}`, { method: "DELETE" }),
  },

  locations: {
    list: (tripId: string) =>
      request<Location[]>(`/api/v1/trips/${tripId}/locations`),

    add: (
      tripId: string,
      body: {
        name: string;
        address?: string | null;
        google_link?: string | null;
        google_place_id?: string | null;
        google_source_type?: string | null;
        google_raw?: Record<string, unknown> | null;
        note?: string | null;
        city?: string | null;
        working_hours?: string | null;
        requires_booking?: string | null;
        category?: string | null;
      }
    ) =>
      request<Location>(`/api/v1/trips/${tripId}/locations`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    batchAdd: (
      tripId: string,
      body: Array<{
        name: string;
        address?: string | null;
        google_link?: string | null;
        google_place_id?: string | null;
        google_source_type?: string | null;
        google_raw?: Record<string, unknown> | null;
        note?: string | null;
        city?: string | null;
        working_hours?: string | null;
        requires_booking?: string | null;
        category?: string | null;
      }>
    ) =>
      request<Location[]>(`/api/v1/trips/${tripId}/locations/batch`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
      tripId: string,
      locationId: string,
      body: {
        name?: string;
        address?: string | null;
        google_link?: string | null;
        google_place_id?: string | null;
        google_source_type?: string | null;
        google_raw?: Record<string, unknown> | null;
        note?: string | null;
        city?: string | null;
        working_hours?: string | null;
        requires_booking?: string | null;
        category?: string | null;
      }
    ) =>
      request<Location>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    delete: (tripId: string, locationId: string) =>
      request<void>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
        method: "DELETE",
      }),

    uploadPhoto: (tripId: string, locationId: string, file: File) =>
      requestUpload<Location>(
        `/api/v1/trips/${tripId}/locations/${locationId}/photo`,
        file
      ),

    deletePhoto: (tripId: string, locationId: string) =>
      request<void>(`/api/v1/trips/${tripId}/locations/${locationId}/photo`, {
        method: "DELETE",
      }),
  },

  google: {
    previewLocationFromLink: (body: { google_link: string }) =>
      request<{
        name: string;
        address: string | null;
        city?: string | null;
        latitude: number | null;
        longitude: number | null;
        google_place_id: string;
        suggested_category: string | null;
        working_hours: string[];
        website: string | null;
        phone: string | null;
        google_raw: Record<string, unknown>;
      }>("/api/v1/locations/google/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  itinerary: {
    get: (tripId: string, includeEmptyOptions = true) =>
      request<ItineraryResponse>(
        `/api/v1/trips/${tripId}/itinerary?include_empty_options=${includeEmptyOptions}`
      ),

    /** Create one day (append). Backend assigns sort_order. */
    createDay: (tripId: string, body: { date?: string | null } = {}) =>
      request<DayResponse>(`/api/v1/trips/${tripId}/days`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    /** Update a day (date, sort_order). */
    updateDay: (
      tripId: string,
      dayId: string,
      body: { date?: string | null; sort_order?: number }
    ) =>
      request<DayResponse>(`/api/v1/trips/${tripId}/days/${dayId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    /** Move the selected option to the day that owns newDate (creating one if needed). */
    reassignDayDate: (
      tripId: string,
      dayId: string,
      newDate: string,
      optionId: string
    ) =>
      request<void>(`/api/v1/trips/${tripId}/days/${dayId}/reassign-date`, {
        method: "POST",
        body: JSON.stringify({ new_date: newDate, option_id: optionId }),
      }),

    /** Generate days from trip start_date/end_date. Idempotent: only adds missing dates. */
    generateDays: (tripId: string) =>
      request<DayResponse[]>(`/api/v1/trips/${tripId}/days/generate`, {
        method: "POST",
      }),

    /** Reconcile days when trip dates change (shift, clear dates, or delete). */
    reconcileDays: (
      tripId: string,
      body: {
        action: "shift" | "clear_dates" | "delete";
        offset_days?: number;
        day_ids?: string[];
      }
    ) =>
      request<void>(`/api/v1/trips/${tripId}/days/reconcile`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    /** Create a new option for a day. Backend assigns option_index. */
    createOption: (
      tripId: string,
      dayId: string,
      body: {
        starting_city?: string | null;
        ending_city?: string | null;
        created_by?: string | null;
      } = {}
    ) =>
      request<OptionResponse>(`/api/v1/trips/${tripId}/days/${dayId}/options`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    /** Update an option (starting/ending city, created_by, option_index). */
    updateOption: (
      tripId: string,
      dayId: string,
      optionId: string,
      body: {
        option_index?: number;
        starting_city?: string | null;
        ending_city?: string | null;
        created_by?: string | null;
      }
    ) =>
      request<OptionResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    /** Delete an option. */
    deleteOption: (tripId: string, dayId: string, optionId: string) =>
      request<void>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}`,
        { method: "DELETE" }
      ),

    /** Add a location to an option. */
    addLocationToOption: (
      tripId: string,
      dayId: string,
      optionId: string,
      body: { location_id: string; sort_order: number; time_period: string }
    ) =>
      request<OptionLocationResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    /** Batch-add locations to an option. */
    batchAddLocationsToOption: (
      tripId: string,
      dayId: string,
      optionId: string,
      body: Array<{
        location_id: string;
        sort_order: number;
        time_period: string;
      }>
    ) =>
      request<OptionLocationResponse[]>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/batch`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    /** Update a single option-location link (sort_order and/or time_period). */
    updateOptionLocation: (
      tripId: string,
      dayId: string,
      optionId: string,
      locationId: string,
      body: {
        sort_order?: number;
        time_period?: string;
      }
    ) =>
      request<OptionLocationResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${locationId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    /** Remove a location from an option. */
    removeLocationFromOption: (
      tripId: string,
      dayId: string,
      optionId: string,
      locationId: string
    ) =>
      request<void>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${locationId}`,
        { method: "DELETE" }
      ),

    /** Reorder locations within an option (one call for full new order). */
    reorderOptionLocations: (
      tripId: string,
      dayId: string,
      optionId: string,
      body: { location_ids: string[] }
    ) =>
      request<OptionLocationResponse[]>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/reorder`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    /** List routes for an option. */
    listRoutes: (tripId: string, dayId: string, optionId: string) =>
      request<RouteResponse[]>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`
      ),

    /** Create a route with stops. */
    createRoute: (
      tripId: string,
      dayId: string,
      optionId: string,
      body: {
        transport_mode: string;
        label?: string | null;
        location_ids: string[];
      }
    ) =>
      request<RouteResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    /** Update a route's stops, transport mode, and/or label. */
    updateRoute: (
      tripId: string,
      dayId: string,
      optionId: string,
      routeId: string,
      body: {
        transport_mode?: string;
        label?: string | null;
        location_ids?: string[];
      }
    ) =>
      request<RouteResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    /** Get one route with segment details and trigger calculation if needed (retry-on-view). */
    getRouteWithSegments: (
      tripId: string,
      dayId: string,
      optionId: string,
      routeId: string
    ) =>
      request<RouteWithSegmentsResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}?include_segments=true`
      ),

    /** Recalculate route segments (force refresh optional). */
    recalculateRoute: (
      tripId: string,
      dayId: string,
      optionId: string,
      routeId: string,
      body?: { transport_mode?: string; force_refresh?: boolean }
    ) =>
      request<RouteWithSegmentsResponse>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}/recalculate`,
        {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        }
      ),

    /** Delete a route. */
    deleteRoute: (
      tripId: string,
      dayId: string,
      optionId: string,
      routeId: string
    ) =>
      request<void>(
        `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}`,
        { method: "DELETE" }
      ),
  },
};
