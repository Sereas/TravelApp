/**
 * useFetchAndPatchRouteMetrics — hook for background route-segment fetching.
 *
 * Owns the full lifecycle of a single background route-metrics fetch:
 *   1. Call the getRouteWithSegments API endpoint.
 *   2. On success: patch the route's metrics + segments into local itinerary state.
 *   3. On failure: surface an error keyed by routeId in routeMetricsError.
 *   4. In finally: clear calculatingRouteId (regardless of outcome).
 *   5. Throughout: guard all state updates with isMountedRef so unmounted
 *      components never call setState.
 *
 * The parent hook calls `setCalculatingRouteId(routeId)` before invoking
 * `fetchAndPatch(...)` — this hook only clears it (sets to null) in finally.
 */

import { type MutableRefObject, useCallback } from "react";
import {
  api,
  type ItineraryResponse,
  type RouteWithSegmentsResponse,
} from "@/lib/api";

/** Patch a single route's metrics + segments into the itinerary tree. */
function patchRouteInItinerary(
  prev: ItineraryResponse,
  dayId: string,
  optionId: string,
  routeId: string,
  data: RouteWithSegmentsResponse
): ItineraryResponse {
  return {
    ...prev,
    days: prev.days.map((day) => {
      if (day.id !== dayId) return day;
      return {
        ...day,
        options: day.options.map((option) => {
          if (option.id !== optionId) return option;
          return {
            ...option,
            routes: option.routes.map((route) =>
              route.route_id === routeId
                ? {
                    ...route,
                    duration_seconds: data.duration_seconds,
                    distance_meters: data.distance_meters,
                    route_status: data.route_status,
                    segments: data.segments.map((segment) => ({
                      segment_order: segment.segment_order,
                      duration_seconds: segment.duration_seconds,
                      distance_meters: segment.distance_meters,
                      encoded_polyline: segment.encoded_polyline,
                    })),
                  }
                : route
            ),
          };
        }),
      };
    }),
  };
}

export interface FetchAndPatchRouteMetricsHook {
  fetchAndPatch: (
    tripId: string,
    dayId: string,
    optionId: string,
    routeId: string
  ) => void;
}

export function useFetchAndPatchRouteMetrics(
  setItinerary: (
    updater: (prev: ItineraryResponse | null) => ItineraryResponse | null
  ) => void,
  setCalculatingRouteId: (id: string | null) => void,
  setRouteMetricsError: (
    updater: (prev: Record<string, string>) => Record<string, string>
  ) => void,
  isMountedRef: MutableRefObject<boolean>
): FetchAndPatchRouteMetricsHook {
  const fetchAndPatch = useCallback(
    (tripId: string, dayId: string, optionId: string, routeId: string) => {
      void (async () => {
        try {
          const withSegments = await api.itinerary.getRouteWithSegments(
            tripId,
            dayId,
            optionId,
            routeId
          );
          if (!isMountedRef.current) return;
          setItinerary((prev) =>
            prev
              ? patchRouteInItinerary(
                  prev,
                  dayId,
                  optionId,
                  routeId,
                  withSegments
                )
              : prev
          );
        } catch (err) {
          if (!isMountedRef.current) return;
          setRouteMetricsError((prev) => ({
            ...prev,
            [routeId]:
              err instanceof Error
                ? err.message
                : "Could not calculate distance and duration",
          }));
        } finally {
          if (isMountedRef.current) {
            setCalculatingRouteId(null);
          }
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMountedRef, setCalculatingRouteId, setItinerary, setRouteMetricsError]
  );

  return { fetchAndPatch };
}
