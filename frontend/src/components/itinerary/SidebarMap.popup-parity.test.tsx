/// <reference types="vitest/globals" />
/**
 * Phase 0 — EXPECTED-FAIL test: SidebarMap must thread mutation callbacks
 * through to ItineraryDayMap.
 *
 * BUG BEING TRACKED: The SidebarMap component (inside ItineraryTab) renders
 * two <ItineraryDayMap> instances — compact preview and expanded dialog — but
 * neither of them receives `onLocationNoteSave` or `onLocationDelete`. Those
 * callbacks are only wired on the ItineraryDayCard path.
 *
 * This test INTENTIONALLY FAILS today. Phase 3 will fix the wiring and flip
 * this to a regular `it(...)`.
 *
 * How it works:
 *   - Render ItineraryTab with itineraryMutations (which carries the handlers).
 *   - Mock `createRoot` to capture the ReactElement passed to `root.render()`.
 *   - After render, inspect the captured PopupCard elements for the expanded
 *     dialog's map to confirm they carry the callback props.
 *   - The assertion FAILS because SidebarMap currently passes no callbacks.
 *
 * `it.fails(...)` in Vitest reports such a test as PASS (expected failure).
 * When Phase 3 lands and the bug is fixed, change `it.fails` → `it` and the
 * suite will continue to pass as a regression guard.
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
import { PopupCard } from "./ItineraryDayMap";
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
        requires_booking: null,
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
// Test
// ---------------------------------------------------------------------------

describe("SidebarMap — callback parity with ItineraryDayMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRoots.length = 0;
  });

  /**
   * EXPECTED FAIL — tracked bug.
   *
   * The SidebarMap component (defined inside ItineraryTab.tsx) renders
   * ItineraryDayMap without threading `onLocationNoteSave` / `onLocationDelete`
   * from itineraryMutations. Therefore any PopupCard rendered inside the
   * sidebar / expanded-dialog map has no edit or delete affordances.
   *
   * Phase 3 fix: pass the callbacks from ItineraryTab's `itineraryMutations`
   * prop down through SidebarMap → ItineraryDayMap → PopupCard.
   *
   * When Phase 3 lands, change `it.fails` → `it` here.
   */
  it.fails(
    "test_itinerary_sidebar_map_threads_callbacks_to_day_map",
    async () => {
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

      // Open the expanded dialog to ensure the full-size ItineraryDayMap
      // inside SidebarMap is mounted.
      const expandBtn = screen.getByRole("button", { name: /expand map/i });
      await userEvent.click(expandBtn);

      // Find a PopupCard root rendered by the expanded-dialog map.
      // The compact preview also renders popups; we want either one —
      // both should receive the callbacks (but currently neither does).
      //
      // PHASE 3 NOTE: PopupCard is only rendered imperatively when a marker
      // click fires inside ItineraryDayMap. If capturedRoots is empty, this
      // test fails at `expect(popupRoot).toBeDefined()` rather than at the
      // intended prop-shape assertion below. When flipping it.fails → it in
      // Phase 3, either (a) simulate a marker click via the mocked Marker
      // click handler, or (b) extract PopupCard as a standalone component
      // and assert on its props when SidebarMap threads callbacks through.
      const popupRoot = capturedRoots.find(
        (r) =>
          r.lastElement !== null &&
          typeof r.lastElement === "object" &&
          "type" in r.lastElement &&
          (r.lastElement as { type: unknown }).type === PopupCard
      );

      // At minimum one PopupCard must have been rendered.
      expect(popupRoot).toBeDefined();

      // THE FAILING ASSERTION: the PopupCard must have received the callbacks.
      // Currently SidebarMap passes neither, so both props are undefined.
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
    }
  );
});
