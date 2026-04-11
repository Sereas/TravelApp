/**
 * Focused tests for `useItineraryState` — specifically the server-persisted
 * active-option flow (feature added in the `active_option_id_per_day`
 * migration).
 *
 * We don't exhaustively test every mutation here — most are covered by
 * component-level Vitest specs and E2E Playwright. This file is about the
 * subtle pieces of the selection logic that component tests can't easily
 * exercise: optimistic patch, server persistence, and rollback on failure.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useItineraryState } from "./useItineraryState";
import type { ItineraryDay, ItineraryResponse, Location } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock the `api` module. Each test seeds the mock's return values.
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockUpdateDay = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      itinerary: {
        ...actual.api.itinerary,
        get: (...args: unknown[]) => mockGet(...args),
        updateDay: (...args: unknown[]) => mockUpdateDay(...args),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildItinerary(
  activeOptionId: string | null = null
): ItineraryResponse {
  const day: ItineraryDay = {
    id: "day-1",
    date: "2026-09-01",
    sort_order: 0,
    active_option_id: activeOptionId,
    options: [
      {
        id: "opt-main",
        option_index: 1,
        starting_city: "Tokyo",
        ending_city: "Tokyo",
        created_by: null,
        locations: [],
        routes: [],
      },
      {
        id: "opt-alt",
        option_index: 2,
        starting_city: "Kyoto",
        ending_city: "Kyoto",
        created_by: "Alt",
        locations: [],
        routes: [],
      },
    ],
  };
  return { days: [day] };
}

const emptyLocations: Location[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useItineraryState — active_option_id flow", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdateDay.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("getSelectedOption prefers day.active_option_id over Main fallback", async () => {
    mockGet.mockResolvedValue(buildItinerary("opt-alt"));
    const { result } = renderHook(() =>
      useItineraryState({
        tripId: "trip-1",
        enabled: true,
        locations: emptyLocations,
      })
    );

    await waitFor(() => expect(result.current.itinerary).not.toBeNull());
    const day = result.current.itinerary!.days[0];
    expect(result.current.getSelectedOption(day)?.id).toBe("opt-alt");
  });

  it("getSelectedOption falls back to option_index === 1 when active_option_id is null", async () => {
    mockGet.mockResolvedValue(buildItinerary(null));
    const { result } = renderHook(() =>
      useItineraryState({
        tripId: "trip-1",
        enabled: true,
        locations: emptyLocations,
      })
    );

    await waitFor(() => expect(result.current.itinerary).not.toBeNull());
    const day = result.current.itinerary!.days[0];
    expect(result.current.getSelectedOption(day)?.id).toBe("opt-main");
  });

  it("getSelectedOption falls back to Main when active_option_id points at a deleted option", async () => {
    mockGet.mockResolvedValue(buildItinerary("opt-deleted"));
    const { result } = renderHook(() =>
      useItineraryState({
        tripId: "trip-1",
        enabled: true,
        locations: emptyLocations,
      })
    );

    await waitFor(() => expect(result.current.itinerary).not.toBeNull());
    const day = result.current.itinerary!.days[0];
    // Stale pointer → fallback to option_index === 1
    expect(result.current.getSelectedOption(day)?.id).toBe("opt-main");
  });

  it("selectOption optimistically patches day.active_option_id and calls the server", async () => {
    mockGet.mockResolvedValue(buildItinerary(null));
    mockUpdateDay.mockResolvedValue({
      id: "day-1",
      trip_id: "trip-1",
      date: "2026-09-01",
      sort_order: 0,
      created_at: null,
      active_option_id: "opt-alt",
    });

    const { result } = renderHook(() =>
      useItineraryState({
        tripId: "trip-1",
        enabled: true,
        locations: emptyLocations,
      })
    );
    await waitFor(() => expect(result.current.itinerary).not.toBeNull());

    act(() => {
      result.current.selectOption("day-1", "opt-alt");
    });

    // Optimistic patch applied synchronously — no need to await.
    expect(result.current.itinerary!.days[0].active_option_id).toBe("opt-alt");

    // Server call fired with matching args.
    await waitFor(() => expect(mockUpdateDay).toHaveBeenCalledTimes(1));
    expect(mockUpdateDay).toHaveBeenCalledWith("trip-1", "day-1", {
      active_option_id: "opt-alt",
    });
  });

  it("selectOption rolls back the optimistic patch if the server call fails", async () => {
    mockGet.mockResolvedValue(buildItinerary(null));
    mockUpdateDay.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() =>
      useItineraryState({
        tripId: "trip-1",
        enabled: true,
        locations: emptyLocations,
      })
    );
    await waitFor(() => expect(result.current.itinerary).not.toBeNull());

    act(() => {
      result.current.selectOption("day-1", "opt-alt");
    });

    // Optimistic first
    expect(result.current.itinerary!.days[0].active_option_id).toBe("opt-alt");

    // Then the failure resolves, rollback fires and the error surfaces
    await waitFor(() =>
      expect(result.current.itinerary!.days[0].active_option_id).toBeNull()
    );
    expect(result.current.itineraryActionError).toContain("network down");
  });
});
