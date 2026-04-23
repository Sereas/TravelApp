/**
 * Shared fixtures for TripView tests.
 *
 * Kept minimal but realistic — enough to exercise all branch paths in both
 * edit and read-only mode without coupling tests to implementation details.
 */
import { vi } from "vitest";
import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryResponse,
  Location,
  Trip,
} from "@/lib/api";
import type {
  ItineraryMutations,
  ReadOnlyItineraryState,
} from "@/features/itinerary/itinerary-state-types";

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

export const sampleTrip: Trip = {
  id: "trip-abc",
  name: "Tokyo Adventure",
  start_date: "2026-09-01",
  end_date: "2026-09-14",
};

export const sampleTripNoDates: Trip = {
  id: "trip-nodates",
  name: "Untitled Trip",
  start_date: null,
  end_date: null,
};

// ---------------------------------------------------------------------------
// Locations — three entries with varied cities, categories, added-by emails
// ---------------------------------------------------------------------------

export const sampleLocations: Location[] = [
  {
    id: "loc-1",
    name: "Senso-ji Temple",
    address: "2-3-1 Asakusa, Taito City",
    google_link: "https://maps.google.com/?cid=1",
    google_place_id: null,
    note: "Best visited early morning",
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Tokyo",
    working_hours: "6:00-17:00",
    useful_link: null,
    requires_booking: "no",
    category: "Temple",
    latitude: 35.7148,
    longitude: 139.7967,
    image_url: null,
    user_image_url: null,
    user_image_crop: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
  {
    id: "loc-2",
    name: "Shibuya Crossing",
    address: "Shibuya, Tokyo",
    google_link: null,
    google_place_id: null,
    note: null,
    added_by_user_id: "user-2",
    added_by_email: "bob@example.com",
    city: "Tokyo",
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    category: "Viewpoint",
    latitude: 35.659,
    longitude: 139.7006,
    image_url: null,
    user_image_url: null,
    user_image_crop: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
  {
    id: "loc-3",
    name: "Nishiki Market",
    address: "Nishiki Market, Kyoto",
    google_link: null,
    google_place_id: null,
    note: "Great street food",
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Kyoto",
    working_hours: "9:00-18:00",
    useful_link: null,
    requires_booking: "yes",
    category: "Market",
    latitude: 35.0053,
    longitude: 135.7654,
    image_url: null,
    user_image_url: null,
    user_image_crop: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
];

/** Empty locations list — for testing empty-state branches. */
export const emptyLocations: Location[] = [];

// ---------------------------------------------------------------------------
// Itinerary — one day with two options
// ---------------------------------------------------------------------------

export const sampleItinerary: ItineraryResponse = {
  days: [
    {
      id: "day-1",
      date: "2026-09-01",
      sort_order: 0,
      active_option_id: null,
      options: [
        {
          id: "opt-1",
          option_index: 1,
          starting_city: "Tokyo",
          ending_city: "Tokyo",
          created_by: null,
          locations: [
            {
              id: "ol-1",
              location_id: "loc-1",
              sort_order: 0,
              time_period: "morning",
              location: {
                id: "loc-1",
                name: "Senso-ji Temple",
                city: "Tokyo",
                address: "2-3-1 Asakusa",
                google_link: null,
                category: "Temple",
                note: null,
                working_hours: null,
                useful_link: null,
                requires_booking: null,
                latitude: 35.7148,
                longitude: 139.7967,
                image_url: null,
                user_image_url: null,
                user_image_crop: null,
                attribution_name: null,
                attribution_uri: null,
              },
            },
          ],
          routes: [],
        },
        {
          id: "opt-2",
          option_index: 2,
          starting_city: "Kyoto",
          ending_city: "Kyoto",
          created_by: "bob@example.com",
          locations: [],
          routes: [],
        },
      ],
    },
  ],
};

export const emptyItinerary: ItineraryResponse = { days: [] };

// ---------------------------------------------------------------------------
// ReadOnlyItineraryState stub — satisfies ItineraryTab's current prop shape.
// When the implementation splits to ReadOnlyItineraryState + ItineraryMutations,
// this stub provides only the read half. Tests import this and layer mutations
// on top when needed.
// ---------------------------------------------------------------------------

const noop = () => {};
const noopAsync = async () => {};

/**
 * Build a `ReadOnlyItineraryState` stub from a sample itinerary.
 * Returns the narrow read-only interface — does NOT include any mutation
 * handlers. Shared trip tests pass this alone; edit-mode tests layer
 * `makeItineraryMutations()` on top.
 */
export function makeReadOnlyItineraryState(
  itinerary: ItineraryResponse = sampleItinerary
): ReadOnlyItineraryState {
  return {
    itinerary,
    itineraryLoading: false,
    itineraryError: null,
    itineraryActionError: null,
    addDayLoading: false,
    generateDaysLoading: false,
    createOptionLoading: null,
    calculatingRouteId: null,
    routeMetricsError: {},
    itineraryLocationMap: new Map<string, string[]>(),
    availableDays: itinerary.days.map((d, i) => ({
      id: d.id,
      label: d.date ?? `Day ${i + 1}`,
    })),
    fetchItinerary: noopAsync,
    clearItineraryActionError: noop,
    selectOption: noop,
    getSelectedOption: (day: ItineraryDay): ItineraryOption | undefined =>
      day.options[0],
  };
}

/** Full mutations stub — used to verify mutation affordances render in edit mode. */
export function makeItineraryMutations(): ItineraryMutations {
  return {
    handleAddDay: vi.fn().mockResolvedValue(undefined),
    handleGenerateDays: vi.fn().mockResolvedValue(undefined),
    handleUpdateDayDate: vi.fn(),
    handleCreateAlternative: vi.fn().mockResolvedValue(null),
    handleDeleteOption: vi.fn(),
    handleSaveOptionDetails: vi.fn(),
    handleAddLocationsToOption: vi.fn().mockResolvedValue(undefined),
    handleRemoveLocationFromOption: vi.fn(),
    handleUpdateLocationTimePeriod: vi.fn(),
    handleReorderOptionLocations: vi.fn(),
    handleRouteCreated: vi.fn().mockResolvedValue(undefined),
    handleRetryRouteMetrics: vi.fn(),
    handleScheduleLocationToDay: vi.fn().mockResolvedValue(undefined),
    handleLocationNoteSave: vi.fn().mockResolvedValue(undefined),
    handleLocationDelete: vi.fn().mockResolvedValue(undefined),
  };
}
