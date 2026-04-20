/// <reference types="vitest/globals" />
/**
 * SidebarMap — route card selection behavior (RED phase)
 *
 * SidebarMap is an internal component of ItineraryTab and is not exported
 * directly. We test it by rendering ItineraryTab with a controlled itinerary
 * state and then opening the expanded map dialog.
 *
 * These tests cover:
 *  1. Route cards are rendered inside the expanded dialog.
 *  2. Clicking a route card selects it (card receives a selected visual state).
 *  3. Clicking the same card again deselects it (toggle behaviour).
 *  4. Clicking a different card moves selection to the new card.
 *  5. The selected card passes selectedRouteId down to ItineraryDayMap.
 *  6. No card is selected on initial dialog open.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadOnlyProvider } from "@/lib/read-only-context";

// ---------------------------------------------------------------------------
// Mock maplibre-gl — WebGL not available in jsdom
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

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER mocks
// ---------------------------------------------------------------------------
import { ItineraryTab } from "./ItineraryTab";
import type { ItineraryDay, ItineraryOption, Location } from "@/lib/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two locations with valid coordinates so the map renders */
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
    created_at: null,
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: "Rue de Rivoli, Paris",
    google_link: null,
    note: null,
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Paris",
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    category: "Museum",
    google_place_id: null,
    latitude: 48.8606,
    longitude: 2.3376,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
];

/** Option with two routes that have encoded polylines so MapRoutePolyline entries are created */
const optionWithRoutes: ItineraryOption = {
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
    {
      id: "ol-2",
      location_id: "loc-2",
      sort_order: 1,
      time_period: "afternoon",
      location: {
        id: "loc-2",
        name: "Louvre Museum",
        city: "Paris",
        address: "Rue de Rivoli, Paris",
        google_link: null,
        category: "Museum",
        note: null,
        working_hours: null,
        useful_link: null,
        requires_booking: null,
        latitude: 48.8606,
        longitude: 2.3376,
        image_url: null,
        user_image_url: null,
        attribution_name: null,
        attribution_uri: null,
      },
    },
  ],
  routes: [
    {
      route_id: "route-1",
      label: "Walk to Louvre",
      transport_mode: "walk",
      duration_seconds: 1500,
      distance_meters: 1900,
      sort_order: 0,
      option_location_ids: ["ol-1", "ol-2"],
      segments: [
        {
          segment_order: 0,
          duration_seconds: 1500,
          distance_meters: 1900,
          // Valid encoded polyline (_p~iF~ps|U_ulLnnqC = two points)
          encoded_polyline: "_p~iF~ps|U_ulLnnqC",
        },
      ],
    },
    {
      route_id: "route-2",
      label: "Drive back",
      transport_mode: "drive",
      duration_seconds: 480,
      distance_meters: 3200,
      sort_order: 1,
      option_location_ids: ["ol-2", "ol-1"],
      segments: [
        {
          segment_order: 0,
          duration_seconds: 480,
          distance_meters: 3200,
          encoded_polyline: "_p~iF~ps|U_ulLnnqC",
        },
      ],
    },
  ],
};

const dayWithRoutes: ItineraryDay = {
  id: "day-1",
  date: "2026-06-01",
  sort_order: 0,
  options: [optionWithRoutes],
};

const sampleTrip = {
  id: "trip-1",
  name: "Paris Summer",
  start_date: "2026-06-01",
  end_date: "2026-06-01",
};

/** Minimal itinerary state shape required by ItineraryTab */
function makeItineraryState(
  overrides: Partial<ReturnType<typeof buildState>> = {}
) {
  return buildState(overrides);
}

function buildState(overrides: Record<string, unknown> = {}) {
  return {
    itinerary: { days: [dayWithRoutes] },
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
    getSelectedOption: (_day: ItineraryDay) => optionWithRoutes,
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
    getOrphanedDays: vi.fn().mockReturnValue([]),
    syncLocationSummary: vi.fn(),
    ...overrides,
  };
}

function renderItineraryTab(stateOverrides: Record<string, unknown> = {}) {
  const itineraryState = makeItineraryState(stateOverrides);
  return {
    ...render(
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
        />
      </ReadOnlyProvider>
    ),
    itineraryState,
  };
}

/** Open the expanded map dialog by clicking the Expand button */
async function openExpandedDialog() {
  const expandBtn = screen.getByRole("button", { name: /expand map/i });
  await userEvent.click(expandBtn);
  return screen.getByRole("dialog");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidebarMap — route card click selection in expanded dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Route cards are rendered in the dialog ---

  it("shows route cards in the expanded dialog when routes exist", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    // Each route card must be a <button> with role="button" and accessible name containing "select route"
    // (This requires the implementation to render route cards as interactive buttons)
    const routeButtons = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    expect(routeButtons).toHaveLength(2);
  });

  it("shows route duration and distance in each route card", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    // route-1: 1500 s = 25 min, 1900 m = 1.9 km
    expect(within(dialog).getByText(/25 min/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1\.9 km/)).toBeInTheDocument();

    // route-2: 480 s = 8 min, 3200 m = 3.2 km
    expect(within(dialog).getByText(/8 min/)).toBeInTheDocument();
    expect(within(dialog).getByText(/3\.2 km/)).toBeInTheDocument();
  });

  // --- No card is selected on initial open ---

  it("renders no route card in selected state when dialog first opens", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    // Route card buttons must exist (implementation must render them as buttons)
    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    expect(cards.length).toBeGreaterThanOrEqual(1);

    // None should be in the selected state on first open
    cards.forEach((card) => {
      expect(card).toHaveAttribute("aria-pressed", "false");
    });
  });

  // --- Click to select ---

  it("marks a route card as selected when clicked", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    // Find the first route card by its test id and click it
    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    expect(cards.length).toBeGreaterThanOrEqual(1);

    await userEvent.click(cards[0]);

    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("passes selectedRouteId to ItineraryDayMap after a route card is clicked", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    await userEvent.click(cards[0]);

    // The map container inside the dialog must receive a data-selected-route-id attribute
    // that reflects the clicked route's id — this is how we verify the prop is wired
    const mapContainer = within(dialog).getByTestId("itinerary-day-map");
    expect(mapContainer).toHaveAttribute("data-selected-route-id", "route-1");
  });

  // --- Toggle: click same card again to deselect ---

  it("deselects a route card when clicking it a second time (toggle)", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });

    await userEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("clears selectedRouteId on ItineraryDayMap after deselecting", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    await userEvent.click(cards[0]);
    await userEvent.click(cards[0]);

    const mapContainer = within(dialog).getByTestId("itinerary-day-map");
    // After deselect the attribute should be absent or empty
    const attr = mapContainer.getAttribute("data-selected-route-id");
    expect(attr === null || attr === "").toBe(true);
  });

  // --- Clicking a different card moves selection ---

  it("moves selection to the newly clicked card and deselects the previous one", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    expect(cards.length).toBeGreaterThanOrEqual(2);

    await userEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
    expect(cards[1]).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(cards[1]);
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
    expect(cards[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("updates data-selected-route-id when selection moves to another card", async () => {
    renderItineraryTab();
    const dialog = await openExpandedDialog();

    const cards = within(dialog).getAllByRole("button", {
      name: /select route/i,
    });
    await userEvent.click(cards[0]);
    await userEvent.click(cards[1]);

    const mapContainer = within(dialog).getByTestId("itinerary-day-map");
    expect(mapContainer).toHaveAttribute("data-selected-route-id", "route-2");
  });
});
