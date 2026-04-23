export type ImportSSEEvent =
  | { event: "scraping"; message: string }
  | { event: "scraping_done"; total: number; message: string }
  | {
      event: "enriching";
      current: number;
      total: number;
      name: string;
      status: "imported" | "existing" | "failed";
    }
  | { event: "saving"; message: string }
  | {
      event: "complete";
      imported_count: number;
      existing_count: number;
      failed_count: number;
      imported: Array<{ name: string; status: string; detail: string | null }>;
      existing: Array<{ name: string; status: string; detail: string | null }>;
      failed: Array<{ name: string; status: string; detail: string | null }>;
    }
  | { event: "error"; message: string };

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
  useful_link: string | null;
  requires_booking: string | null; // no | yes | yes_done
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  user_image_url: string | null;
  user_image_crop: ImageCropData | null;
  attribution_name: string | null;
  attribution_uri: string | null;
  created_at: string | null;
}

/** Crop region as percentages (0-100) of the full image dimensions. */
export interface ImageCropData {
  x: number;
  y: number;
  width: number;
  height: number;
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
  useful_link: string | null;
  requires_booking: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  user_image_url: string | null;
  user_image_crop: ImageCropData | null;
  attribution_name: string | null;
  attribution_uri: string | null;
}

export interface ItineraryOptionLocation {
  id: string;
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
  option_location_ids: string[];
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
  /**
   * Server-persisted pointer to the currently-active option for this day.
   * When null/undefined (or pointing at an option that no longer exists on
   * this day), the frontend falls back to `option_index === 1` ("Main").
   * Backed by `trip_days.active_option_id`; survives logout/login; shared
   * viewers see the owner's current value.
   *
   * Optional at the type level so test fixtures can omit it — the backend
   * always returns the field (even as null), so runtime code can rely on
   * truthy checks without worrying about the `undefined` branch.
   */
  active_option_id?: string | null;
  options: ItineraryOption[];
}

/** Flat day from days API (create/generate/list); no options. */
export interface DayResponse {
  id: string;
  trip_id: string;
  date: string | null;
  sort_order: number;
  created_at: string | null;
  active_option_id?: string | null;
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
  id: string;
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
  option_location_ids: string[];
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

export interface ShareResponse {
  share_token: string;
  share_url: string;
  created_at: string;
  expires_at: string | null;
}

export interface SharedTripInfo {
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface SharedLocationSummary {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  google_link: string | null;
  category: string | null;
  note: string | null;
  working_hours: string | null;
  useful_link: string | null;
  requires_booking: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  user_image_url: string | null;
  user_image_crop: ImageCropData | null;
  attribution_name: string | null;
  attribution_uri: string | null;
}

export interface SharedTripData {
  trip: SharedTripInfo;
  locations: SharedLocationSummary[];
  itinerary: ItineraryResponse;
}

/**
 * Body type for creating or batch-creating a location.
 * Used in api.locations.add and api.locations.batchAdd.
 */
export interface LocationWriteBody {
  name: string;
  address?: string | null;
  google_link?: string | null;
  google_place_id?: string | null;
  google_source_type?: string | null;
  note?: string | null;
  city?: string | null;
  working_hours?: string | null;
  useful_link?: string | null;
  requires_booking?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_resource_name?: string | null;
}

/**
 * Body type for partially updating a location.
 * Used in api.locations.update.
 */
export type UpdateLocationBody = Partial<LocationWriteBody> & {
  name?: string;
};
