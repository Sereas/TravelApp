/// <reference types="vitest/globals" />
/**
 * Tests for the refactored /shared/[token] route — RED phase.
 *
 * After the implementation the page becomes a thin wrapper around <TripView
 * readOnly={true} canShare={false} />.  These tests encode the contract that:
 *   - The page fetches data via api.sharing.getSharedTrip ONLY (no auth calls)
 *   - Loading, error (404 & generic), and success states all work
 *   - In success state, read-only TripView affordances apply
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that pull in the SUT
// ---------------------------------------------------------------------------

// PlacesSidebarMapTrigger — mock the wrapper, not SidebarLocationMap
// directly. Phase 3 introduces a dual-render wrapper with a mobile
// Sheet that forceMounts the map, which would double-render the testid
// if we mocked the inner component.
vi.mock("@/features/trip-view/PlacesSidebarMapTrigger", () => ({
  PlacesSidebarMapTrigger: () => (
    <div data-testid="sidebar-location-map-mock" />
  ),
}));

// ItineraryTab — stub so render is fast and tab-click tests work.
vi.mock("@/components/itinerary/ItineraryTab", () => ({
  ItineraryTab: () => <div data-testid="itinerary-tab-mock">ItineraryTab</div>,
}));

// TripView — if the implementation file doesn't exist yet this mock provides a
// working substitute so that *page-level* tests (loading / error / success)
// can run against the page wrapper.  When TripView exists, the mock is
// replaced by the real import in integration.
//
// NOTE: We do NOT mock TripView for all tests — the page is responsible for
// the loading/error shell; TripView is responsible for the content.  We keep
// TripView un-mocked here so these tests verify the integration seam.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ token: "share-tok-123" }),
}));

// ---------------------------------------------------------------------------
// api mock — only sharing.getSharedTrip should be called; auth endpoints must
// remain un-called (asserted via spy counts).
// ---------------------------------------------------------------------------

const mockGetSharedTrip = vi.fn();
const mockGetTrip = vi.fn();
const mockListLocations = vi.fn();
const mockGetItinerary = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    sharing: {
      getSharedTrip: (...args: unknown[]) => mockGetSharedTrip(...args),
    },
    // These MUST NOT be called from the shared page — spied on for assertion.
    trips: {
      get: (...args: unknown[]) => mockGetTrip(...args),
    },
    locations: {
      list: (...args: unknown[]) => mockListLocations(...args),
    },
    itinerary: {
      get: (...args: unknown[]) => mockGetItinerary(...args),
    },
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

// ---------------------------------------------------------------------------
// Sample data — mirrors the SharedTripData shape from api.ts
// ---------------------------------------------------------------------------

const sharedTripData = {
  trip: {
    name: "Tokyo Adventure",
    start_date: "2026-09-01",
    end_date: "2026-09-14",
  },
  locations: [
    {
      id: "loc-1",
      name: "Senso-ji Temple",
      address: "2-3-1 Asakusa",
      google_link: null,
      note: null,
      city: "Tokyo",
      working_hours: "6:00-17:00",
      requires_booking: "no",
      category: "Temple",
      latitude: 35.7148,
      longitude: 139.7967,
      image_url: null,
      user_image_url: null,
      attribution_name: null,
      attribution_uri: null,
    },
    {
      id: "loc-2",
      name: "Shibuya Crossing",
      address: null,
      google_link: null,
      note: null,
      city: "Tokyo",
      working_hours: null,
      requires_booking: null,
      category: "Viewpoint",
      latitude: 35.659,
      longitude: 139.7006,
      image_url: null,
      user_image_url: null,
      attribution_name: null,
      attribution_uri: null,
    },
  ],
  itinerary: {
    days: [
      {
        id: "day-1",
        date: "2026-09-01",
        sort_order: 0,
        options: [
          {
            id: "opt-1",
            option_index: 1,
            starting_city: "Tokyo",
            ending_city: "Tokyo",
            created_by: null,
            locations: [],
            routes: [],
          },
        ],
      },
    ],
  },
};

const sharedTripDataEmptyLocations = {
  ...sharedTripData,
  locations: [],
};

// ---------------------------------------------------------------------------
// Import the SUT after all mocks are declared
// ---------------------------------------------------------------------------
import SharedTripPage from "./page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SharedTripPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it("mounts a loading spinner while fetch is in flight", () => {
    mockGetSharedTrip.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SharedTripPage />);
    // LoadingSpinner renders with role="status" by convention in this codebase.
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error states
  // -------------------------------------------------------------------------

  it('shows "This shared link is no longer valid." for a 404 error', async () => {
    const { ApiError } = await import("@/lib/api");
    mockGetSharedTrip.mockRejectedValueOnce(new ApiError("Not found", 404));
    render(<SharedTripPage />);
    expect(
      await screen.findByText(/this shared link is no longer valid/i)
    ).toBeInTheDocument();
  });

  it('shows "Failed to load shared trip." for a generic error', async () => {
    mockGetSharedTrip.mockRejectedValueOnce(new Error("Network error"));
    render(<SharedTripPage />);
    expect(
      await screen.findByText(/failed to load shared trip/i)
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Success state — content
  // -------------------------------------------------------------------------

  it("renders the trip name on success", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    expect(await screen.findByText("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders the locations count in schedule tab on success", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    // The "All" schedule tab shows the total location count.
    const allTab = screen.getByRole("radio", { name: /all/i });
    expect(allTab).toHaveTextContent("2");
  });

  it("renders the Itinerary tab without crashing when clicked", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    expect(screen.getByTestId("itinerary-tab-mock")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Success state — read-only contract
  // -------------------------------------------------------------------------

  it("does NOT render the Share button", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(
      screen.queryByRole("button", { name: /share/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT render SmartLocationInput", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(
      screen.queryByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
    ).not.toBeInTheDocument();
  });

  it("does NOT render the three-card empty state even when locations is empty — shows fallback text", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripDataEmptyLocations);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");

    // Owner-only CTAs must not appear.
    expect(screen.queryByText(/paste a link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import a list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add manually/i)).not.toBeInTheDocument();

    // Friendly fallback is shown instead.
    expect(
      screen.getByText(/no locations added to this trip yet/i)
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // No authenticated API calls
  // -------------------------------------------------------------------------

  it("does not call api.trips.get", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(mockGetTrip).not.toHaveBeenCalled();
  });

  it("does not call api.locations.list", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(mockListLocations).not.toHaveBeenCalled();
  });

  it("does not call api.itinerary.get", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(mockGetItinerary).not.toHaveBeenCalled();
  });

  it("calls api.sharing.getSharedTrip with the token from the route params", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    await screen.findByText("Tokyo Adventure");
    expect(mockGetSharedTrip).toHaveBeenCalledWith("share-tok-123");
  });

  // -------------------------------------------------------------------------
  // ReadOnlyProvider — verified indirectly via LocationCard behaviour.
  // LocationCard hides its edit/delete menu when useReadOnly() returns true.
  // -------------------------------------------------------------------------

  it("LocationCards render without edit/delete menus (ReadOnlyProvider wraps content)", async () => {
    mockGetSharedTrip.mockResolvedValueOnce(sharedTripData);
    render(<SharedTripPage />);
    // Use heading role to find the location name on the front face of the flip card,
    // avoiding the duplicate span that the back-face InlineEditableField renders.
    await screen.findByRole("heading", { name: "Senso-ji Temple" });

    // In read-only mode LocationCard does not render an edit or delete button.
    expect(
      screen.queryByRole("button", { name: /edit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i })
    ).not.toBeInTheDocument();
  });
});
