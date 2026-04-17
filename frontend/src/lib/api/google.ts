import { request } from "./transport";

export const previewLocationFromLink = (body: { google_link: string }) =>
  request<{
    name: string;
    address: string | null;
    city?: string | null;
    latitude: number | null;
    longitude: number | null;
    google_place_id: string;
    suggested_category: string | null;
    photo_resource_name: string | null;
  }>("/api/v1/locations/google/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });

/**
 * One place suggestion from the typeahead dropdown.
 *
 * Populated from the Places API (New) Autocomplete response; no paid data
 * fields. Rendering this requires zero extra API calls — the dropdown is
 * free to display `main_text` + `secondary_text` + `types` directly.
 */
export interface AutocompleteSuggestion {
  place_id: string;
  main_text: string;
  secondary_text: string | null;
  types: string[];
}

export interface AutocompleteResponsePayload {
  suggestions: AutocompleteSuggestion[];
}

/**
 * Optional geographic bias to narrow autocomplete ranking toward a region.
 * v1 frontend does not populate this; backend accepts the field for future
 * trip-starting-city biasing.
 */
export interface AutocompleteLocationBias {
  lat: number;
  lng: number;
  radius_m: number;
}

export interface AutocompleteRequestBody {
  input: string;
  session_token: string;
  language?: string;
  region?: string;
  location_bias?: AutocompleteLocationBias;
  /**
   * Optional `AbortSignal` plumbed through `request()` into `fetch`.
   * The hook uses it to cancel superseded requests on each keystroke.
   */
  signal?: AbortSignal;
}

/**
 * Fetch typeahead suggestions. SKU cost (Places API New):
 *   - FREE (Autocomplete Session Usage) when this call is part of a session
 *     that ends with a `resolvePlace()` call carrying the same
 *     `session_token`.
 *   - $2.83 per 1000 (Autocomplete Requests) if the session is abandoned
 *     (first 10k/month free).
 */
export const autocomplete = (body: AutocompleteRequestBody) => {
  const { signal, ...payload } = body;
  return request<AutocompleteResponsePayload>(
    "/api/v1/locations/google/autocomplete",
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }
  );
};

export interface ResolvePlaceBody {
  place_id: string;
  /**
   * Client-generated autocomplete session token. Forwarding the same token
   * used for `autocomplete()` is what makes the preceding autocomplete
   * requests FREE under Google's Session Usage SKU. Omit for internal /
   * non-typeahead callers.
   */
  session_token?: string;
}

/**
 * Resolve a Google `place_id` into a `LocationPreviewResponse`. This is the
 * single Place Details Pro call made when a user picks a typeahead
 * suggestion ($17 / 1000; first 5k/month free). Returns the exact same
 * shape as `previewLocationFromLink` so `AddLocationForm` prefill is
 * identical regardless of entry path.
 */
export const resolvePlace = (body: ResolvePlaceBody) =>
  request<{
    name: string;
    address: string | null;
    city?: string | null;
    latitude: number | null;
    longitude: number | null;
    google_place_id: string;
    suggested_category: string | null;
    photo_resource_name: string | null;
  }>("/api/v1/locations/google/resolve", {
    method: "POST",
    body: JSON.stringify(body),
  });
