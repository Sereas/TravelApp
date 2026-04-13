/**
 * Tests for itinerary-derived pure helpers:
 *   getSelectedOption, buildItineraryLocationMap, buildAvailableDays
 *
 * All fixtures are inline — no external test-utils dependency.
 * Semantics are verified against the inline implementations that previously
 * lived in useItineraryState.ts and shared/[token]/page.tsx.
 */

import { describe, it, expect } from "vitest";
import {
  getSelectedOption,
  buildItineraryLocationMap,
  buildAvailableDays,
} from "./itinerary-derived";
import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryResponse,
  LocationSummary,
} from "./api";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<ItineraryOption> = {}): ItineraryOption {
  return {
    id: "opt-default",
    option_index: 1,
    starting_city: null,
    ending_city: null,
    created_by: null,
    locations: [],
    routes: [],
    ...overrides,
  };
}

function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: "day-default",
    date: null,
    sort_order: 0,
    active_option_id: null,
    options: [],
    ...overrides,
  };
}

function makeItinerary(days: ItineraryDay[]): ItineraryResponse {
  return { days };
}

function makeLocationSummary(
  id: string,
  overrides: Partial<LocationSummary> = {}
): LocationSummary {
  return {
    id,
    name: id,
    city: null,
    address: null,
    google_link: null,
    category: null,
    note: null,
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getSelectedOption
// ---------------------------------------------------------------------------

describe("getSelectedOption", () => {
  it("uses active_option_id pointer when set and found", () => {
    const opt1 = makeOption({ id: "opt-1", option_index: 1 });
    const opt2 = makeOption({ id: "opt-2", option_index: 2 });
    const opt3 = makeOption({ id: "opt-3", option_index: 3 });
    const day = makeDay({
      active_option_id: "opt-3",
      options: [opt1, opt2, opt3],
    });

    expect(getSelectedOption(day)).toBe(opt3);
  });

  it("falls back to option_index === 1 when active_option_id is null", () => {
    const opt2 = makeOption({ id: "opt-2", option_index: 2 });
    const opt1 = makeOption({ id: "opt-1", option_index: 1 });
    const opt3 = makeOption({ id: "opt-3", option_index: 3 });
    const day = makeDay({
      active_option_id: null,
      options: [opt2, opt1, opt3],
    });

    expect(getSelectedOption(day)).toBe(opt1);
  });

  it("falls back to first option when active_option_id is null and no option_index 1", () => {
    const opt2 = makeOption({ id: "opt-2", option_index: 2 });
    const opt3 = makeOption({ id: "opt-3", option_index: 3 });
    const day = makeDay({
      active_option_id: null,
      options: [opt2, opt3],
    });

    // Should return first in array (opt2)
    expect(getSelectedOption(day)).toBe(opt2);
  });

  it("returns undefined for a day with no options", () => {
    const day = makeDay({ options: [] });
    expect(getSelectedOption(day)).toBeUndefined();
  });

  it("falls back gracefully when active_option_id points to a missing option", () => {
    // Stale pointer — option was deleted
    const opt1 = makeOption({ id: "opt-1", option_index: 1 });
    const day = makeDay({
      active_option_id: "opt-stale",
      options: [opt1],
    });

    // Should fall back to option_index === 1
    expect(getSelectedOption(day)).toBe(opt1);
  });
});

// ---------------------------------------------------------------------------
// buildItineraryLocationMap
// ---------------------------------------------------------------------------

describe("buildItineraryLocationMap", () => {
  it("groups location_ids by day label", () => {
    const itinerary = makeItinerary([
      makeDay({
        id: "day-1",
        sort_order: 0,
        date: null, // will use "Day 1"
        options: [
          makeOption({
            id: "opt-1",
            locations: [
              {
                id: "ol-1",
                location_id: "loc-A",
                sort_order: 0,
                time_period: "morning",
                location: makeLocationSummary("loc-A", {
                  name: "A",
                  category: "hotel",
                }),
              },
              {
                id: "ol-2",
                location_id: "loc-B",
                sort_order: 1,
                time_period: "afternoon",
                location: makeLocationSummary("loc-B", {
                  name: "B",
                  category: "restaurant",
                }),
              },
            ],
          }),
        ],
      }),
      makeDay({
        id: "day-2",
        sort_order: 1,
        date: null, // will use "Day 2"
        options: [
          makeOption({
            id: "opt-2",
            locations: [
              {
                id: "ol-3",
                location_id: "loc-C",
                sort_order: 0,
                time_period: "morning",
                location: makeLocationSummary("loc-C", {
                  name: "C",
                  category: "attraction",
                }),
              },
            ],
          }),
        ],
      }),
    ]);

    const map = buildItineraryLocationMap(itinerary);

    expect(map.get("loc-A")).toEqual(["Day 1"]);
    expect(map.get("loc-B")).toEqual(["Day 1"]);
    expect(map.get("loc-C")).toEqual(["Day 2"]);
  });

  it("deduplicates location_ids within a day across multiple options", () => {
    const sharedLocationEntry = {
      id: "ol-shared",
      location_id: "loc-shared",
      sort_order: 0,
      time_period: "morning",
      location: makeLocationSummary("loc-shared", {
        name: "Shared",
        category: "attraction",
      }),
    };

    const itinerary = makeItinerary([
      makeDay({
        id: "day-1",
        sort_order: 0,
        date: null,
        options: [
          makeOption({ id: "opt-A", locations: [sharedLocationEntry] }),
          makeOption({
            id: "opt-B",
            option_index: 2,
            locations: [{ ...sharedLocationEntry, id: "ol-shared-2" }],
          }),
        ],
      }),
    ]);

    const map = buildItineraryLocationMap(itinerary);

    // loc-shared appears in two options on the same day — should be deduplicated
    expect(map.get("loc-shared")).toEqual(["Day 1"]);
    expect(map.get("loc-shared")!.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildAvailableDays
// ---------------------------------------------------------------------------

describe("buildAvailableDays", () => {
  it("returns day labels with indices — date string or Day N", () => {
    const itinerary = makeItinerary([
      makeDay({ id: "day-1", sort_order: 0, date: "2024-06-01" }),
      makeDay({ id: "day-2", sort_order: 1, date: null }),
      makeDay({ id: "day-3", sort_order: 2, date: "2024-06-03" }),
    ]);

    const days = buildAvailableDays(itinerary);

    expect(days).toHaveLength(3);
    expect(days[0].id).toBe("day-1");
    // Date-based label uses toLocaleDateString("en-US", { month: "short", day: "numeric" })
    expect(days[0].label).toMatch(/Jun/);
    expect(days[1].id).toBe("day-2");
    // No date → "Day N" where N is array index + 1
    expect(days[1].label).toBe("Day 2");
    expect(days[2].id).toBe("day-3");
    expect(days[2].label).toMatch(/Jun/);
  });
});
