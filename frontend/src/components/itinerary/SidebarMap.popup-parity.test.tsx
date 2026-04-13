/// <reference types="vitest/globals" />
/**
 * Regression guard: the itinerary tab's *expanded* dialog map threads
 * mutation callbacks through to ItineraryDayMap → LocationPopupCard.
 *
 * The compact sidebar preview uses `disablePopups` (no popup cards), so
 * callback threading is only verified on the expanded dialog variant.
 *
 * How it works:
 *   - Render ItineraryTab, click "Expand map" to open the dialog.
 *   - Mock `createRoot` to capture the ReactElement passed to `root.render()`.
 *   - Inspect the captured PopupCard elements for callback props.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadOnlyProvider } from "@/lib/read-only-context";

// ---------------------------------------------------------------------------
// Mocks (same pattern as SidebarMap.test.tsx)
// ---------------------------------------------------------------------------

vi.mock("maplibre-gl", () => {
  const Popup = vi.fn().mockImplementation(() => ({
    setDOMContent: vi.fn().mockReturnThis(),
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    isOpen: vi.fn().mockReturnValue(false),
    on: vi.fn(),
  }));
  const Marker = vi.fn().mockImplementation((opts?: { element?: unknown }) => {
    const element = (opts?.element as HTMLElement | undefined) ?? {
      style: {} as { zIndex?: string },
    };
    return {
      setLngLat: vi.fn().mockReturnThis(),
      setPopup: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getElement: vi.fn(() => element),
    };
  });
  const Map = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn().mockReturnValue(12),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    remove: vi.fn(),
    resize: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    getContainer: vi.fn().mockReturnValue({ clientHeight: 600 }),
    unproject: vi.fn().mockReturnValue([0, 0]),
  }));
  const LngLatBounds = vi.fn().mockImplementation(() => ({
    extend: vi.fn(),
    isEmpty: vi.fn().mockReturnValue(false),
  }));
  const NavigationControl = vi.fn();
  return {
    default: { Map, Marker, Popup, LngLatBounds, NavigationControl },
    Map,
    Marker,
    Popup,
    LngLatBounds,
    NavigationControl,
  };
});

// Track roots so we can inspect what PopupCard props were passed.
const capturedRoots: Array<{
  render: ReturnType<typeof vi.fn>;
  unmount: ReturnType<typeof vi.fn>;
  lastElement: unknown;
}> = [];

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => {
    const root = {
      lastElement: null as unknown,
      render: vi.fn((el: unknown) => {
        root.lastElement = el;
      }),
      unmount: vi.fn(),
    };
    capturedRoots.push(root);
    return root;
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { ItineraryTab } from "./ItineraryTab";
import { LocationPopupCard } from "./day-map/LocationPopupCard";
import type { ItineraryDay, ItineraryOption, Location } from "@/lib/api";

// ---------------------------------------------------------------------------
// Fixtures — minimal data to get a non-empty SidebarMap
// ---------------------------------------------------------------------------

const tripLocations: Location[] = [
  {
    id: "loc-1",
    name: "Eiffel Tower",
    address: "Champ de Mars, Paris",
    google_link: null,
    note: null,
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Paris",
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    category: "Viewpoint",
    google_place_id: null,
    latitude: 48.8584,
    longitude: 2.2945,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
];

const sampleOption: ItineraryOption = {
  id: "opt-1",
  option_index: 1,
  starting_city: "Paris",
  ending_city: "Paris",
  created_by: null,
  locations: [
    {
      id: "ol-1",
      location_id: "loc-1",
      sort_order: 0,
      time_period: "morning",
      location: {
        id: "loc-1",
        name: "Eiffel Tower",
        city: "Paris",
        address: "Champ de Mars, Paris",
        google_link: null,
        category: "Viewpoint",
        note: null,
        working_hours: null,
        useful_link: null,
        requires_booking: null,
        latitude: 48.8584,
        longitude: 2.2945,
        image_url: null,
        user_image_url: null,
        attribution_name: null,
        attribution_uri: null,
      },
    },
  ],
  routes: [],
};

const sampleDay: ItineraryDay = {
  id: "day-1",
  date: "2026-06-01",
  sort_order: 0,
  options: [sampleOption],
};

const sampleTrip = {
  id: "trip-1",
  name: "Paris Summer",
  start_date: "2026-06-01",
  end_date: "2026-06-01",
};

function buildItineraryMutations() {
  return {
    handleAddDay: vi.fn(),
    handleGenerateDays: vi.fn(),
    handleUpdateDayDate: vi.fn(),
    handleCreateAlternative: vi.fn(),
    handleDeleteOption: vi.fn(),
    handleSaveOptionDetails: vi.fn(),
    handleAddLocationsToOption: vi.fn(),
    handleRemoveLocationFromOption: vi.fn(),
    handleUpdateLocationTimePeriod: vi.fn(),
    handleReorderOptionLocations: vi.fn(),
    handleRouteCreated: vi.fn(),
    handleRetryRouteMetrics: vi.fn(),
    handleScheduleLocationToDay: vi.fn(),
    handleLocationNoteSave: vi.fn().mockResolvedValue(undefined),
    handleLocationDelete: vi.fn().mockResolvedValue(undefined),
  };
}

function buildItineraryState() {
  return {
    itinerary: { days: [sampleDay] },
    itineraryLoading: false,
    itineraryError: null,
    itineraryActionError: null,
    addDayLoading: false,
    generateDaysLoading: false,
    createOptionLoading: null,
    calculatingRouteId: null,
    routeMetricsError: {},
    itineraryLocationMap: new Map(),
    availableDays: [],
    fetchItinerary: vi.fn(),
    clearItineraryActionError: vi.fn(),
    selectOption: vi.fn(),
    getSelectedOption: (_day: ItineraryDay) => sampleOption,
    getOrphanedDays: vi.fn().mockReturnValue([]),
    syncLocationSummary: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarMap — callback parity with ItineraryDayMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRoots.length = 0;
  });

  it("test_itinerary_sidebar_map_threads_callbacks_to_day_map", async () => {
    const mutations = buildItineraryMutations();
    const itineraryState = buildItineraryState();

    render(
      <ReadOnlyProvider value={false}>
        <ItineraryTab
          trip={sampleTrip as Parameters<typeof ItineraryTab>[0]["trip"]}
          tripId="trip-1"
          locations={tripLocations}
          itineraryState={
            itineraryState as Parameters<
              typeof ItineraryTab
            >[0]["itineraryState"]
          }
          itineraryMutations={
            mutations as Parameters<
              typeof ItineraryTab
            >[0]["itineraryMutations"]
          }
        />
      </ReadOnlyProvider>
    );

    // Compact sidebar has disablePopups — no popup roots yet.
    // Open the expanded dialog to get popup roots.
    await userEvent.click(screen.getByLabelText("Expand map"));

    const popupRoot = capturedRoots.find(
      (r) =>
        r.lastElement !== null &&
        typeof r.lastElement === "object" &&
        "type" in r.lastElement &&
        (r.lastElement as { type: unknown }).type === LocationPopupCard
    );

    expect(popupRoot).toBeDefined();

    const props = (
      popupRoot!.lastElement as {
        props: {
          onSaveNote?: unknown;
          onDelete?: unknown;
        };
      }
    ).props;

    expect(typeof props.onSaveNote).toBe("function");
    expect(typeof props.onDelete).toBe("function");
  });

  it("test_itinerary_sidebar_map_read_only_omits_callbacks", async () => {
    const mutations = buildItineraryMutations();
    const itineraryState = buildItineraryState();

    render(
      <ReadOnlyProvider value={true}>
        <ItineraryTab
          trip={sampleTrip as Parameters<typeof ItineraryTab>[0]["trip"]}
          tripId="trip-1"
          locations={tripLocations}
          itineraryState={
            itineraryState as Parameters<
              typeof ItineraryTab
            >[0]["itineraryState"]
          }
          itineraryMutations={undefined}
        />
      </ReadOnlyProvider>
    );

    await userEvent.click(screen.getByLabelText("Expand map"));

    const popupRoot = capturedRoots.find(
      (r) =>
        r.lastElement !== null &&
        typeof r.lastElement === "object" &&
        "type" in r.lastElement &&
        (r.lastElement as { type: unknown }).type === LocationPopupCard
    );

    expect(popupRoot).toBeDefined();

    const props = (
      popupRoot!.lastElement as {
        props: {
          onSaveNote?: unknown;
          onDelete?: unknown;
        };
      }
    ).props;

    expect(props.onSaveNote).toBeUndefined();
    expect(props.onDelete).toBeUndefined();
  });
});
