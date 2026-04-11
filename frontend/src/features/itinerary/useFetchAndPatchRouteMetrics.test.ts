/**
 * Tests for useFetchAndPatchRouteMetrics — the route-segments background fetch hook.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFetchAndPatchRouteMetrics } from "./useFetchAndPatchRouteMetrics";
import type { ItineraryResponse, RouteWithSegmentsResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock api module
// ---------------------------------------------------------------------------

const mockGetRouteWithSegments = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      itinerary: {
        ...actual.api.itinerary,
        getRouteWithSegments: (...args: unknown[]) =>
          mockGetRouteWithSegments(...args),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItinerary(): ItineraryResponse {
  return {
    days: [
      {
        id: "day-1",
        date: null,
        sort_order: 0,
        active_option_id: null,
        options: [
          {
            id: "opt-1",
            option_index: 1,
            starting_city: null,
            ending_city: null,
            created_by: null,
            locations: [],
            routes: [
              {
                route_id: "route-1",
                label: null,
                transport_mode: "driving",
                duration_seconds: null,
                distance_meters: null,
                sort_order: 0,
                option_location_ids: ["ol-1", "ol-2"],
                route_status: "pending",
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeRouteWithSegments(): RouteWithSegmentsResponse {
  return {
    route_id: "route-1",
    option_id: "opt-1",
    label: null,
    transport_mode: "driving",
    duration_seconds: 3600,
    distance_meters: 50000,
    sort_order: 0,
    option_location_ids: ["ol-1", "ol-2"],
    route_status: "ok",
    segments: [
      {
        segment_order: 0,
        from_location_id: "loc-1",
        to_location_id: "loc-2",
        distance_meters: 50000,
        duration_seconds: 3600,
        encoded_polyline: "abc123",
        status: "ok",
        error_type: null,
        error_message: null,
        provider_http_status: null,
        next_retry_at: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFetchAndPatchRouteMetrics", () => {
  beforeEach(() => {
    mockGetRouteWithSegments.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("patches itinerary with route segments on successful fetch", async () => {
    const routeData = makeRouteWithSegments();
    mockGetRouteWithSegments.mockResolvedValue(routeData);

    const setItinerary = vi.fn();
    const setCalculatingRouteId = vi.fn();
    const setRouteMetricsError = vi.fn();
    const isMountedRef = { current: true };

    const { result } = renderHook(() =>
      useFetchAndPatchRouteMetrics(
        setItinerary,
        setCalculatingRouteId,
        setRouteMetricsError,
        isMountedRef
      )
    );

    await act(async () => {
      result.current.fetchAndPatch("trip-1", "day-1", "opt-1", "route-1");
      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetRouteWithSegments).toHaveBeenCalledWith(
      "trip-1",
      "day-1",
      "opt-1",
      "route-1"
    );
    // setItinerary should have been called with an updater
    expect(setItinerary).toHaveBeenCalled();
    // setCalculatingRouteId should be called with null in finally
    expect(setCalculatingRouteId).toHaveBeenCalledWith(null);
  });

  it("sets route metrics error on fetch failure", async () => {
    mockGetRouteWithSegments.mockRejectedValue(new Error("network error"));

    const setItinerary = vi.fn();
    const setCalculatingRouteId = vi.fn();
    const setRouteMetricsError = vi.fn();
    const isMountedRef = { current: true };

    const { result } = renderHook(() =>
      useFetchAndPatchRouteMetrics(
        setItinerary,
        setCalculatingRouteId,
        setRouteMetricsError,
        isMountedRef
      )
    );

    await act(async () => {
      result.current.fetchAndPatch("trip-1", "day-1", "opt-1", "route-1");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setRouteMetricsError).toHaveBeenCalled();
    // The updater function should be passed to setRouteMetricsError
    const updaterCall = setRouteMetricsError.mock.calls[0][0];
    if (typeof updaterCall === "function") {
      const result2 = updaterCall({});
      expect(result2["route-1"]).toContain("network error");
    }
    // setItinerary should NOT be called on error
    expect(setItinerary).not.toHaveBeenCalled();
  });

  it("skips state updates when component is unmounted (isMountedRef.current is false)", async () => {
    const routeData = makeRouteWithSegments();
    mockGetRouteWithSegments.mockResolvedValue(routeData);

    const setItinerary = vi.fn();
    const setCalculatingRouteId = vi.fn();
    const setRouteMetricsError = vi.fn();
    // Simulate unmounted component
    const isMountedRef = { current: false };

    const { result } = renderHook(() =>
      useFetchAndPatchRouteMetrics(
        setItinerary,
        setCalculatingRouteId,
        setRouteMetricsError,
        isMountedRef
      )
    );

    await act(async () => {
      result.current.fetchAndPatch("trip-1", "day-1", "opt-1", "route-1");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // All state setters should be skipped when unmounted
    expect(setItinerary).not.toHaveBeenCalled();
    expect(setCalculatingRouteId).not.toHaveBeenCalled();
    expect(setRouteMetricsError).not.toHaveBeenCalled();
  });

  it("skips error state updates when unmounted and fetch fails", async () => {
    mockGetRouteWithSegments.mockRejectedValue(new Error("fail"));

    const setItinerary = vi.fn();
    const setCalculatingRouteId = vi.fn();
    const setRouteMetricsError = vi.fn();
    const isMountedRef = { current: false };

    const { result } = renderHook(() =>
      useFetchAndPatchRouteMetrics(
        setItinerary,
        setCalculatingRouteId,
        setRouteMetricsError,
        isMountedRef
      )
    );

    await act(async () => {
      result.current.fetchAndPatch("trip-1", "day-1", "opt-1", "route-1");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setRouteMetricsError).not.toHaveBeenCalled();
    expect(setCalculatingRouteId).not.toHaveBeenCalled();
  });

  it("patches itinerary using an updater function that applies patchRouteInItinerary logic", async () => {
    const routeData = makeRouteWithSegments();
    mockGetRouteWithSegments.mockResolvedValue(routeData);

    const itinerary = makeItinerary();
    let currentItinerary: ItineraryResponse | null = itinerary;

    const setItinerary = vi.fn((updater: (prev: ItineraryResponse | null) => ItineraryResponse | null) => {
      currentItinerary = updater(currentItinerary);
    });
    const setCalculatingRouteId = vi.fn();
    const setRouteMetricsError = vi.fn();
    const isMountedRef = { current: true };

    const { result } = renderHook(() =>
      useFetchAndPatchRouteMetrics(
        setItinerary,
        setCalculatingRouteId,
        setRouteMetricsError,
        isMountedRef
      )
    );

    await act(async () => {
      result.current.fetchAndPatch("trip-1", "day-1", "opt-1", "route-1");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The route in the itinerary should now have the patched metrics
    const route = currentItinerary?.days[0].options[0].routes[0];
    expect(route?.duration_seconds).toBe(3600);
    expect(route?.distance_meters).toBe(50000);
    expect(route?.route_status).toBe("ok");
    expect(route?.segments).toHaveLength(1);
    expect(route?.segments![0].encoded_polyline).toBe("abc123");
  });
});
