import { request } from "./transport";
import type {
  ItineraryResponse,
  DayResponse,
  OptionResponse,
  OptionLocationResponse,
  RouteResponse,
  RouteWithSegmentsResponse,
} from "./types";

export const get = (tripId: string, includeEmptyOptions = true) =>
  request<ItineraryResponse>(
    `/api/v1/trips/${tripId}/itinerary?include_empty_options=${includeEmptyOptions}`
  );

/** Create one day (append). Backend assigns sort_order. */
export const createDay = (
  tripId: string,
  body: { date?: string | null } = {}
) =>
  request<DayResponse>(`/api/v1/trips/${tripId}/days`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/**
 * Update a day.
 *
 * Fields:
 *  - `date` / `sort_order`: standard metadata.
 *  - `active_option_id`: persists the user's current option selection for
 *    this day. Pass `null` to clear (fall back to Main). The backend
 *    rejects 422 if the referenced option doesn't belong to this day.
 */
export const updateDay = (
  tripId: string,
  dayId: string,
  body: {
    date?: string | null;
    sort_order?: number;
    active_option_id?: string | null;
  }
) =>
  request<DayResponse>(`/api/v1/trips/${tripId}/days/${dayId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/** Move the selected option to the day that owns newDate (creating one if needed). */
export const reassignDayDate = (
  tripId: string,
  dayId: string,
  newDate: string,
  optionId: string
) =>
  request<void>(`/api/v1/trips/${tripId}/days/${dayId}/reassign-date`, {
    method: "POST",
    body: JSON.stringify({ new_date: newDate, option_id: optionId }),
  });

/** Generate days from trip start_date/end_date. Idempotent: only adds missing dates. */
export const generateDays = (tripId: string) =>
  request<DayResponse[]>(`/api/v1/trips/${tripId}/days/generate`, {
    method: "POST",
  });

/** Reconcile days when trip dates change (shift, clear dates, or delete). */
export const reconcileDays = (
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
  });

/** Create a new option for a day. Backend assigns option_index. */
export const createOption = (
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
  });

/** Update an option (starting/ending city, created_by, option_index). */
export const updateOption = (
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
  );

/** Delete an option. */
export const deleteOption = (tripId: string, dayId: string, optionId: string) =>
  request<void>(`/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}`, {
    method: "DELETE",
  });

/** Add a location to an option. */
export const addLocationToOption = (
  tripId: string,
  dayId: string,
  optionId: string,
  body: { location_id: string; sort_order: number; time_period: string }
) =>
  request<OptionLocationResponse>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations`,
    { method: "POST", body: JSON.stringify(body) }
  );

/** Batch-add locations to an option. */
export const batchAddLocationsToOption = (
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
  );

/** Update a single option-location link (sort_order and/or time_period). */
export const updateOptionLocation = (
  tripId: string,
  dayId: string,
  optionId: string,
  olId: string,
  body: {
    sort_order?: number;
    time_period?: string;
  }
) =>
  request<OptionLocationResponse>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${olId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

/** Remove a location from an option. */
export const removeLocationFromOption = (
  tripId: string,
  dayId: string,
  optionId: string,
  olId: string
) =>
  request<void>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/${olId}`,
    { method: "DELETE" }
  );

/** Reorder locations within an option (one call for full new order). */
export const reorderOptionLocations = (
  tripId: string,
  dayId: string,
  optionId: string,
  body: { ol_ids: string[] }
) =>
  request<OptionLocationResponse[]>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/locations/reorder`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

/** List routes for an option. */
export const listRoutes = (tripId: string, dayId: string, optionId: string) =>
  request<RouteResponse[]>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`
  );

/** Create a route with stops. */
export const createRoute = (
  tripId: string,
  dayId: string,
  optionId: string,
  body: {
    transport_mode: string;
    label?: string | null;
    option_location_ids: string[];
  }
) =>
  request<RouteResponse>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes`,
    { method: "POST", body: JSON.stringify(body) }
  );

/** Update a route's stops, transport mode, and/or label. */
export const updateRoute = (
  tripId: string,
  dayId: string,
  optionId: string,
  routeId: string,
  body: {
    transport_mode?: string;
    label?: string | null;
    option_location_ids?: string[];
  }
) =>
  request<RouteResponse>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

/** Get one route with segment details and trigger calculation if needed (retry-on-view). */
export const getRouteWithSegments = (
  tripId: string,
  dayId: string,
  optionId: string,
  routeId: string
) =>
  request<RouteWithSegmentsResponse>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}?include_segments=true`
  );

/** Recalculate route segments (force refresh optional). */
export const recalculateRoute = (
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
  );

/** Delete a route. */
export const deleteRoute = (
  tripId: string,
  dayId: string,
  optionId: string,
  routeId: string
) =>
  request<void>(
    `/api/v1/trips/${tripId}/days/${dayId}/options/${optionId}/routes/${routeId}`,
    { method: "DELETE" }
  );
