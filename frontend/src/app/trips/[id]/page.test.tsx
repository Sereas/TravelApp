/// <reference types="vitest/globals" />
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";

// Mock SidebarLocationMap so we can drive the new onPinClick flow without
// pulling in the real MapLibre pipeline. The mock renders one test button
// per location only when `onPinClick` is provided — that corresponds to the
// compact (sidebar) variant; the real fullscreen dialog variant never
// receives the prop, and the mock mirrors that by rendering nothing. Other
// existing tests don't query for these nodes, so behaviour is unchanged.
// Mock the wrapper component rather than SidebarLocationMap directly.
// Phase 3 introduced `PlacesSidebarMapTrigger` which renders SidebarLocationMap
// in TWO wrappers (hidden lg:block desktop + lg:hidden mobile sheet with
// forceMount), so mocking SidebarLocationMap directly would put two copies
// of the testid in the DOM. Mocking the wrapper gives us exactly one.
vi.mock("@/features/trip-view/PlacesSidebarMapTrigger", () => ({
  PlacesSidebarMapTrigger: ({
    locations,
    onPinClick,
  }: {
    locations: Array<{ id: string; name: string }>;
    focusLocationId?: string | null;
    focusSeq?: number;
    onPinClick?: (id: string) => void;
  }) => {
    if (!onPinClick) return null;
    return (
      <div data-testid="sidebar-location-map-mock" aria-hidden="true">
        {locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            data-testid={`mock-sidebar-pin-${loc.id}`}
            onClick={() => onPinClick(loc.id)}
          />
        ))}
      </div>
    );
  },
}));

const mockPush = vi.fn();
const mockParams = { id: "trip-1" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

const mockGetTrip = vi.fn();
const mockListLocations = vi.fn();
const mockUpdateTrip = vi.fn();
const mockDeleteTrip = vi.fn();
const mockAddLocation = vi.fn();
const mockUpdateLocation = vi.fn();
const mockDeleteLocation = vi.fn();
const mockGetItinerary = vi.fn();
const mockCreateDay = vi.fn();
const mockGenerateDays = vi.fn();
const mockUpdateDay = vi.fn();
const mockCreateOption = vi.fn();
const mockUpdateOption = vi.fn();
const mockDeleteOption = vi.fn();
const mockBatchAddLocationsToOption = vi.fn();
const mockRemoveLocationFromOption = vi.fn();
const mockReorderOptionLocations = vi.fn();
const mockUpdateOptionLocation = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    trips: {
      get: (...args: unknown[]) => mockGetTrip(...args),
      update: (...args: unknown[]) => mockUpdateTrip(...args),
      delete: (...args: unknown[]) => mockDeleteTrip(...args),
    },
    locations: {
      list: (...args: unknown[]) => mockListLocations(...args),
      add: (...args: unknown[]) => mockAddLocation(...args),
      update: (...args: unknown[]) => mockUpdateLocation(...args),
      delete: (...args: unknown[]) => mockDeleteLocation(...args),
    },
    itinerary: {
      get: (...args: unknown[]) => mockGetItinerary(...args),
      createDay: (...args: unknown[]) => mockCreateDay(...args),
      generateDays: (...args: unknown[]) => mockGenerateDays(...args),
      updateDay: (...args: unknown[]) => mockUpdateDay(...args),
      createOption: (...args: unknown[]) => mockCreateOption(...args),
      updateOption: (...args: unknown[]) => mockUpdateOption(...args),
      deleteOption: (...args: unknown[]) => mockDeleteOption(...args),
      batchAddLocationsToOption: (...args: unknown[]) =>
        mockBatchAddLocationsToOption(...args),
      removeLocationFromOption: (...args: unknown[]) =>
        mockRemoveLocationFromOption(...args),
      reorderOptionLocations: (...args: unknown[]) =>
        mockReorderOptionLocations(...args),
      updateOptionLocation: (...args: unknown[]) =>
        mockUpdateOptionLocation(...args),
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

const sampleTrip = {
  id: "trip-1",
  name: "Paris Summer",
  start_date: "2026-06-01",
  end_date: "2026-06-15",
};

const sampleLocations = [
  {
    id: "loc-1",
    name: "Eiffel Tower",
    address: "Champ de Mars, Paris",
    google_link: null,
    note: "Must visit at sunset",
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Paris",
    working_hours: "9:00-23:00",
    requires_booking: "yes",
    category: "Viewpoint",
    google_place_id: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: null,
    google_link: "https://maps.google.com/?q=louvre",
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Paris",
    working_hours: null,
    requires_booking: null,
    category: "Museum",
    google_place_id: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
];

describe("TripDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams.id = "trip-1";
  });

  it("shows loading spinner initially", () => {
    mockGetTrip.mockReturnValue(new Promise(() => {}));
    mockListLocations.mockReturnValue(new Promise(() => {}));
    render(<TripDetailPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders trip details and locations", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    expect(await screen.findByText("Paris Summer")).toBeInTheDocument();
    // Date range picker shows both dates in one button
    const dateBtn = screen.getByRole("button", { name: /date range/i });
    expect(dateBtn).toHaveTextContent(/Jun 1/);
    expect(dateBtn).toHaveTextContent(/Jun 15/);

    // Location names appear in front-face <h3> headings; use heading role to
    // avoid ambiguity with the back-face InlineEditableField that also renders
    // the name as a span.
    expect(
      screen.getByRole("heading", { name: "Eiffel Tower" })
    ).toBeInTheDocument();
    expect(screen.getByText("Must visit at sunset")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Louvre Museum" })
    ).toBeInTheDocument();
  });

  it("renders extended location fields via LocationCard", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    // Wait for the location name heading on the front face of the card.
    await screen.findByRole("heading", { name: "Eiffel Tower" });
    // "Viewpoint" appears both as badge on card and in filter toolbar
    expect(screen.getAllByText("Viewpoint").length).toBeGreaterThanOrEqual(1);
    // Address and hours are on the back face (always in DOM, just not visually
    // shown until the card is flipped). getByText works for single occurrences.
    expect(screen.getByText("Champ de Mars, Paris")).toBeInTheDocument();
    expect(screen.getByText("9:00-23:00")).toBeInTheDocument();
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
    expect(screen.getAllByText(/Added by/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/alice@example\.com/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Museum").length).toBeGreaterThanOrEqual(1);
    // Google Maps link is on the back face.
    expect(
      screen.getByRole("link", { name: /open in google maps/i })
    ).toBeInTheDocument();
  });

  it("renders trip with no dates gracefully", async () => {
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: null,
      end_date: null,
    });
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    expect(await screen.findByText("Paris Summer")).toBeInTheDocument();
    expect(screen.queryByText(/Jun/)).not.toBeInTheDocument();
  });

  it("shows empty state when trip has no locations", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    expect(await screen.findByText(/ready to build your/i)).toBeInTheDocument();
  });

  it("shows error banner on API failure with retry", async () => {
    mockGetTrip.mockRejectedValueOnce(new Error("Network error"));
    mockListLocations.mockRejectedValueOnce(new Error("Network error"));
    render(<TripDetailPage />);

    expect(await screen.findByText("Network error")).toBeInTheDocument();

    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Paris Summer")).toBeInTheDocument();
  });

  it("shows 'Trip not found' for 404 errors", async () => {
    const error = Object.assign(new Error("Not found"), { status: 404 });
    mockGetTrip.mockRejectedValueOnce(error);
    mockListLocations.mockRejectedValueOnce(error);
    render(<TripDetailPage />);

    expect(await screen.findByText("Trip not found")).toBeInTheDocument();
  });

  it("has back-to-trips navigation on error", async () => {
    mockGetTrip.mockRejectedValueOnce(new Error("Fail"));
    mockListLocations.mockRejectedValueOnce(new Error("Fail"));
    render(<TripDetailPage />);

    await screen.findByText("Fail");
    await userEvent.click(screen.getByRole("button", { name: /trips/i }));
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("has back-to-trips navigation on success view", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /trips/i }));
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("fetches with the correct trip ID from params", async () => {
    mockParams.id = "trip-42";
    mockGetTrip.mockResolvedValue({ ...sampleTrip, id: "trip-42" });
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    expect(mockGetTrip).toHaveBeenCalledWith("trip-42");
    expect(mockListLocations).toHaveBeenCalledWith("trip-42");
  });

  // --- Slice 11: Add location (SmartLocationInput) ---

  it("renders SmartLocationInput always-visible input bar above filter toolbar", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    expect(
      screen.getByPlaceholderText(/search a place.*paste a google maps link/i)
    ).toBeInTheDocument();
  });

  it("hides SmartLocationInput when there are no locations", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText(/ready to build your/i);
    expect(
      screen.queryByPlaceholderText(/search a place.*paste a google maps link/i)
    ).not.toBeInTheDocument();
  });

  it("does NOT render the old 'Add Location' dropdown button", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    // The old dropdown had a chevron-down icon next to "Add Location"
    // It should no longer be present — SmartLocationInput replaces it
    expect(
      screen.queryByRole("button", { name: /^add location$/i })
    ).not.toBeInTheDocument();
  });

  it("typing a plain name in SmartLocationInput and pressing Enter opens AddLocationForm with name pre-filled", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const smartInput = screen.getByPlaceholderText(
      /search a place.*paste a google maps link/i
    );
    await userEvent.type(smartInput, "Arc de Triomphe{Enter}");

    // AddLocationForm dialog should now be visible with pre-filled name
    const nameInput = screen.getByDisplayValue("Arc de Triomphe");
    expect(nameInput).toBeInTheDocument();
  });

  it("pasting a Google Maps URL and pressing Enter opens AddLocationForm with google link pre-filled", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const smartInput = screen.getByPlaceholderText(
      /search a place.*paste a google maps link/i
    );
    await userEvent.type(
      smartInput,
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6{Enter}"
    );

    // AddLocationForm should be visible with the link shown as read-only text
    expect(
      screen.getByText("https://maps.app.goo.gl/HFaERRSAPvPePT1D6")
    ).toBeInTheDocument();
  });

  it("SmartLocationInput reappears empty after cancelling AddLocationForm", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const smartInput = screen.getByPlaceholderText(
      /search a place.*paste a google maps link/i
    );
    await userEvent.type(smartInput, "Louvre{Enter}");

    // Form is open, cancel it
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Smart input reappears empty
    const freshInput = screen.getByPlaceholderText(
      /search a place.*paste a google maps link/i
    ) as HTMLInputElement;
    expect(freshInput.value).toBe("");
  });

  it("adds a new location via SmartLocationInput name flow and shows it in list", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockAddLocation.mockResolvedValue({
      id: "loc-new",
      name: "Arc de Triomphe",
      address: null,
      google_link: null,
      note: "Great views",
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const smartInput = screen.getByPlaceholderText(
      /search a place.*paste a google maps link/i
    );
    await userEvent.type(smartInput, "Arc de Triomphe{Enter}");

    // Fill in note in the now-open form
    await userEvent.type(
      screen.getByLabelText(/personal notes/i),
      "Great views"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^save location$/i })
    );

    // Location name appears in front-face <h3> heading after save.
    expect(
      await screen.findByRole("heading", { name: "Arc de Triomphe" })
    ).toBeInTheDocument();
    expect(screen.getByText("Great views")).toBeInTheDocument();
    expect(mockAddLocation).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Arc de Triomphe", note: "Great views" })
    );
  });

  it("shows action cards in empty state", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText(/ready to build your/i);
    expect(
      screen.getByRole("button", { name: "Paste Link" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import List" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Manually" })
    ).toBeInTheDocument();
  });

  // --- Slice 11: Edit location ---

  it("shows Delete button on each location card", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete location/i,
    });
    expect(deleteButtons).toHaveLength(2);
  });

  // --- Location pool features ---

  it("shows location count in tab", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const locationsTab = screen.getByRole("tab", { name: /places/i });
    expect(locationsTab).toHaveTextContent("2");
  });

  it("shows category filter dropdown when 2+ categories exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const categoryBtn = screen.getByRole("button", { name: /category/i });
    expect(categoryBtn).toBeInTheDocument();

    // Open the category dropdown and check options appear.
    // Use /^museum/i to match the "Museum" filter option (which may include a count
    // like "Museum 1") without matching "Louvre Museum" InlineEditableField button.
    await userEvent.click(categoryBtn);
    expect(screen.getByText("All categories")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^museum/i })
    ).toBeInTheDocument();
  });

  it("filters locations by category when dropdown option is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    // Open category dropdown and select Museum.
    // Use /^museum/i to match the "Museum" filter option button (which may include a
    // count) without matching "Louvre Museum" InlineEditableField button.
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.click(screen.getByRole("button", { name: /^museum/i }));

    expect(
      screen.getByRole("heading", { name: "Louvre Museum" })
    ).toBeInTheDocument();
    // When card is filtered out, neither the heading nor back-face span remain.
    expect(
      screen.queryByRole("heading", { name: "Eiffel Tower" })
    ).not.toBeInTheDocument();

    // Clear filter via dropdown — trigger button now shows "Museum" (the active filter).
    await userEvent.click(screen.getByRole("button", { name: /^museum/i }));
    await userEvent.click(screen.getByText("All categories"));
    expect(
      screen.getByRole("heading", { name: "Eiffel Tower" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Louvre Museum" })
    ).toBeInTheDocument();
  });

  it("does not show category filter with only 1 category", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([sampleLocations[0]]);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    expect(
      screen.queryByRole("button", { name: /category/i })
    ).not.toBeInTheDocument();
  });

  it("does not show group-by-city when all locations share a city", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    // City dropdown only appears when 2+ cities exist
    expect(
      screen.queryByRole("button", { name: /city/i })
    ).not.toBeInTheDocument();
  });

  it("shows group-by-city toggle when locations span 2+ cities", async () => {
    const multiCityLocations = [
      ...sampleLocations,
      {
        id: "loc-3",
        name: "Promenade des Anglais",
        address: null,
        google_link: null,
        note: null,
        added_by_user_id: null,
        added_by_email: null,
        city: "Nice",
        working_hours: null,
        requires_booking: null,
        category: "Walking around",
      },
    ];
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(multiCityLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    // Open the city popover — use exact "City" to avoid ambiguity.
    const cityBtn = screen.getByRole("button", { name: "City" });
    expect(cityBtn).toBeInTheDocument();

    await userEvent.click(cityBtn);
    // Click "Group by city" inside the popover
    const groupOption = screen.getByRole("button", { name: /group by city/i });
    await userEvent.click(groupOption);

    const headings = screen.getAllByRole("heading", { level: 3 });
    const cityNames = headings.map((h) => h.textContent);
    expect(cityNames.some((t) => t?.includes("Nice"))).toBe(true);
    expect(cityNames.some((t) => t?.includes("Paris"))).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Promenade des Anglais" })
    ).toBeInTheDocument();
  });

  // --- Delete location ---

  it("deletes a location and removes it from the list", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockDeleteLocation.mockResolvedValue(undefined);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete location/i,
    });
    await userEvent.click(deleteButtons[0]);

    // Confirm in the dialog
    await waitFor(() => {
      expect(screen.getByText("Delete location?")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/permanently removed from this trip/)
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => {
      expect(mockDeleteLocation).toHaveBeenCalledWith("trip-1", "loc-1");
    });
    // When the card is deleted, both the front heading and back span are gone.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Eiffel Tower" })
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Louvre Museum" })
    ).toBeInTheDocument();
  });

  it("does not delete location when cancel is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete location/i,
    });
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete location?")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockDeleteLocation).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Eiffel Tower" })
    ).toBeInTheDocument();
  });

  it("shows error when location deletion fails", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockDeleteLocation.mockRejectedValue(new Error("Delete failed"));
    render(<TripDetailPage />);

    await screen.findByRole("heading", { name: "Eiffel Tower" });
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete location/i,
    });
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete location?")).toBeInTheDocument();
    });
    const confirmDeleteBtn = screen.getByRole("button", {
      name: /^delete$/i,
    });
    await userEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(mockDeleteLocation).toHaveBeenCalled();
    });
    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
  });

  // --- Slice 13: Itinerary tab (read-only) ---

  it("shows all four tabs", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    expect(screen.getByRole("tab", { name: /places/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /budget/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();
  });

  it("shows Budget tab as disabled", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const budgetTab = screen.getByRole("tab", { name: /budget/i });
    expect(budgetTab).toHaveAttribute("aria-disabled", "true");
  });

  it("shows Documents tab as disabled", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    const documentsTab = screen.getByRole("tab", { name: /documents/i });
    expect(documentsTab).toHaveAttribute("aria-disabled", "true");
  });

  it("does NOT show Trip Summary card on the Locations tab", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    expect(screen.queryByText("Trip Summary")).not.toBeInTheDocument();
  });

  it("still renders SidebarLocationMap when locations exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    expect(screen.getByTestId("sidebar-location-map-mock")).toBeInTheDocument();
  });

  it("fetches itinerary when Itinerary tab is selected", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    await waitFor(() => {
      expect(mockGetItinerary).toHaveBeenCalledWith("trip-1");
    });
  });

  it("shows empty state when itinerary has no days", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(await screen.findByText(/no days yet/i)).toBeInTheDocument();
  });

  it("renders days and locations in itinerary tab", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
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
                    address: null,
                    google_link: null,
                    category: null,
                    note: null,
                    working_hours: null,
                    requires_booking: null,
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
                    address: null,
                    google_link: null,
                    category: null,
                    note: null,
                    working_hours: null,
                    requires_booking: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(await screen.findByText("Mon, Jun 1")).toBeInTheDocument();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
    expect(screen.getAllByText(/morning/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/afternoon/i).length).toBeGreaterThan(0);
  });

  it("calls updateOptionLocation when time period is changed in itinerary", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
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
                    address: null,
                    google_link: null,
                    category: null,
                    note: null,
                    working_hours: null,
                    requires_booking: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    mockUpdateOptionLocation.mockResolvedValue({
      option_id: "opt-1",
      location_id: "loc-1",
      sort_order: 0,
      time_period: "evening",
      location: {
        id: "loc-1",
        name: "Eiffel Tower",
        city: "Paris",
        address: null,
        google_link: null,
        category: null,
        note: null,
        working_hours: null,
        requires_booking: null,
      },
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await screen.findByText("Eiffel Tower");

    const morningButton = screen.getByRole("button", {
      name: /time: morning/i,
    });
    await userEvent.click(morningButton);

    const eveningOption = await screen.findByRole("option", {
      name: /evening/i,
    });
    await userEvent.click(eveningOption);

    expect(mockUpdateOptionLocation).toHaveBeenCalledWith(
      "trip-1",
      "day-1",
      "opt-1",
      "ol-1",
      { time_period: "evening" }
    );
  });

  it("shows No locations for a day with empty option", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(await screen.findByText("Mon, Jun 1")).toBeInTheDocument();
    expect(screen.getByText(/no stops planned yet/i)).toBeInTheDocument();
  });

  // --- Slice 14: Add day and generate days ---

  it("shows only Generate days from dates when itinerary is empty and trip has dates", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(
      await screen.findByRole("button", { name: /generate days from dates/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add day/i })
    ).not.toBeInTheDocument();
  });

  it("does not show Generate days from dates when trip has no dates", async () => {
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: null,
      end_date: null,
    });
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(
      await screen.findByRole("button", { name: /add day/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate days from dates/i })
    ).not.toBeInTheDocument();
  });

  it("calls createDay and refetches itinerary when Add day is clicked", async () => {
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: null,
      end_date: null,
    });
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValueOnce({ days: [] }).mockResolvedValueOnce({
      days: [
        {
          id: "day-new",
          date: null,
          sort_order: 0,
          options: [
            {
              id: "opt-new",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    mockCreateDay.mockResolvedValue({
      id: "day-new",
      trip_id: "trip-1",
      date: null,
      sort_order: 0,
      created_at: null,
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await screen.findByRole("button", { name: /add day/i });
    await userEvent.click(screen.getByRole("button", { name: /add day/i }));

    await waitFor(() => {
      expect(mockCreateDay).toHaveBeenCalledWith("trip-1");
    });
    // Refetches itinerary to get full day with main option
    await waitFor(() => {
      expect(mockGetItinerary).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Day 1")).toBeInTheDocument();
  });

  it("calls generateDays and refetches when Generate days from dates is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    const generatedDays = [
      {
        id: "day-1",
        trip_id: "trip-1",
        date: "2026-06-01",
        sort_order: 0,
        created_at: null,
      },
      {
        id: "day-2",
        trip_id: "trip-1",
        date: "2026-06-02",
        sort_order: 1,
        created_at: null,
      },
    ];
    mockGetItinerary.mockResolvedValueOnce({ days: [] }).mockResolvedValueOnce({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
        {
          id: "day-2",
          date: "2026-06-02",
          sort_order: 1,
          options: [
            {
              id: "opt-2",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    mockGenerateDays.mockResolvedValue(generatedDays);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /generate days from dates/i })
    );

    await waitFor(() => {
      expect(mockGenerateDays).toHaveBeenCalledWith("trip-1");
    });
    expect(await screen.findByText("Mon, Jun 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /jun 2/i }));
    expect(await screen.findByText("Tue, Jun 2")).toBeInTheDocument();
  });

  it("shows error message when generate days returns 409", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    const err409 = Object.assign(
      new Error("Trip already has days; cannot generate"),
      { status: 409 }
    );
    mockGenerateDays.mockRejectedValue(err409);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /generate days from dates/i })
    );

    expect(
      await screen.findByText(/trip already has days. cannot generate/i)
    ).toBeInTheDocument();
  });

  it("shows error message when add day fails", async () => {
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: null,
      end_date: null,
    });
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({ days: [] });
    mockCreateDay.mockRejectedValue(new Error("Network error"));
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await userEvent.click(screen.getByRole("button", { name: /add day/i }));

    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("shows Generate missing days button when trip has dates and not all dates covered", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(await screen.findByText("Mon, Jun 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add day/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate missing days/i })
    ).toBeInTheDocument();
  });

  it("hides Generate missing days button when all dates are covered", async () => {
    // Trip has Jun 1–Jun 2, itinerary has days for both dates
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: "2026-06-01",
      end_date: "2026-06-02",
    });
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
        {
          id: "day-2",
          date: "2026-06-02",
          sort_order: 1,
          options: [
            {
              id: "opt-2",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    await screen.findByText("Mon, Jun 1");
    expect(
      screen.queryByRole("button", { name: /generate missing days/i })
    ).not.toBeInTheDocument();
  });

  it("shows Add day button when itinerary has days and trip has no dates", async () => {
    mockGetTrip.mockResolvedValue({
      ...sampleTrip,
      start_date: null,
      end_date: null,
    });
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: null,
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(await screen.findByText("Day 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add day/i })
    ).toBeInTheDocument();
  });

  it("shows Start City and End City inputs on each day card and saves changes", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: "Paris",
              ending_city: "Lyon",
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    mockUpdateOption.mockResolvedValue({
      id: "opt-1",
      day_id: "day-1",
      option_index: 1,
      starting_city: "Paris",
      ending_city: "Nice",
      created_by: null,
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    await screen.findByText("Mon, Jun 1");

    // City inputs are always visible — no toggle needed
    const startInput = await screen.findByDisplayValue("Paris");
    const endInput = screen.getByDisplayValue("Lyon");

    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();

    await userEvent.clear(endInput);
    await userEvent.type(endInput, "Nice");
    // Move focus away to trigger blur-based autosave
    await userEvent.tab();

    await waitFor(() => {
      expect(mockUpdateOption).toHaveBeenCalledWith(
        "trip-1",
        "day-1",
        "opt-1",
        {
          ending_city: "Nice",
        }
      );
    });
  });

  // --- Alternative plan management ---

  it("shows plan dropdown in card header", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(
      await screen.findByRole("button", { name: /^main plan$/i })
    ).toBeInTheDocument();
  });

  it("calls createOption and updates itinerary optimistically when 'Add plan' is used", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValueOnce({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    mockCreateOption.mockResolvedValue({
      id: "opt-2",
      day_id: "day-1",
      option_index: 2,
      starting_city: null,
      ending_city: null,
      created_by: "Beach route",
      created_at: null,
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    await userEvent.click(
      await screen.findByRole("button", { name: /^main plan$/i })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /add plan/i })
    );
    // Type a name and submit
    await userEvent.type(
      screen.getByPlaceholderText(/new plan name/i),
      "Beach route"
    );
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockCreateOption).toHaveBeenCalledWith("trip-1", "day-1", {
        created_by: "Beach route",
      });
    });
    // Optimistic update — no second fetchItinerary call on success.
    expect(mockGetItinerary).toHaveBeenCalledTimes(1);
  });

  it("shows delete button only when multiple options exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await screen.findByText("Mon, Jun 1");

    expect(
      screen.queryByRole("button", { name: /delete this alternative/i })
    ).not.toBeInTheDocument();
  });

  it("shows delete button in dropdown for non-main plans and calls deleteOption on confirm", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockGetItinerary
      .mockResolvedValueOnce({
        days: [
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [
              {
                id: "opt-1",
                option_index: 1,
                starting_city: null,
                ending_city: null,
                created_by: null,
                locations: [],
              },
              {
                id: "opt-2",
                option_index: 2,
                starting_city: null,
                ending_city: null,
                created_by: null,
                locations: [],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        days: [
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [
              {
                id: "opt-1",
                option_index: 1,
                starting_city: null,
                ending_city: null,
                created_by: null,
                locations: [],
              },
            ],
          },
        ],
      });
    mockDeleteOption.mockResolvedValue(undefined);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    await screen.findByText("Mon, Jun 1");

    await userEvent.click(screen.getByText("Main plan"));
    await userEvent.click(screen.getByRole("option", { name: /plan 1/i }));

    // Re-open the dropdown to access rename/delete actions
    await userEvent.click(screen.getByText("Plan 1"));

    const deleteBtn = screen.getByRole("button", { name: /delete plan/i });
    expect(deleteBtn).toBeInTheDocument();

    await userEvent.click(deleteBtn);
    expect(screen.getByText("Delete this plan?")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => {
      expect(mockDeleteOption).toHaveBeenCalledWith("trip-1", "day-1", "opt-2");
    });
  });

  it("shows '+ Add locations' button on each option", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockGetItinerary.mockResolvedValue({
      days: [
        {
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [
            {
              id: "opt-1",
              option_index: 1,
              starting_city: null,
              ending_city: null,
              created_by: null,
              locations: [],
            },
          ],
        },
      ],
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    expect(
      await screen.findByRole("button", { name: /add locations/i })
    ).toBeInTheDocument();
  });

  // --- Inline trip name editing ---

  describe("Inline trip name editing", () => {
    it("displays the trip name as a clickable element", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      // The trip name should be a button or have role="button" so it's clickable
      const tripNameEl = screen.getByRole("button", {
        name: /paris summer/i,
      });
      expect(tripNameEl).toBeInTheDocument();
    });

    it("shows an input pre-filled with the trip name when the name is clicked", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /paris summer/i })
      );

      const input = screen.getByRole("textbox", { name: /trip name/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("Paris Summer");
    });

    it("calls the update API and shows new name when Enter is pressed", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      mockUpdateTrip.mockResolvedValue({ ...sampleTrip, name: "Paris Winter" });
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /paris summer/i })
      );

      const input = screen.getByRole("textbox", { name: /trip name/i });
      await userEvent.clear(input);
      await userEvent.type(input, "Paris Winter");
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockUpdateTrip).toHaveBeenCalledWith(
          "trip-1",
          expect.objectContaining({ name: "Paris Winter" })
        );
      });
      expect(await screen.findByText("Paris Winter")).toBeInTheDocument();
    });

    it("calls the update API when the name input loses focus (blur)", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      mockUpdateTrip.mockResolvedValue({
        ...sampleTrip,
        name: "Nice & Cannes",
      });
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /paris summer/i })
      );

      const input = screen.getByRole("textbox", { name: /trip name/i });
      await userEvent.clear(input);
      await userEvent.type(input, "Nice & Cannes");
      await userEvent.tab(); // moves focus away, triggers blur

      await waitFor(() => {
        expect(mockUpdateTrip).toHaveBeenCalledWith(
          "trip-1",
          expect.objectContaining({ name: "Nice & Cannes" })
        );
      });
    });

    it("reverts to the original name and hides the input when Escape is pressed", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /paris summer/i })
      );

      const input = screen.getByRole("textbox", { name: /trip name/i });
      await userEvent.clear(input);
      await userEvent.type(input, "Something Else");
      await userEvent.keyboard("{Escape}");

      expect(
        screen.queryByRole("textbox", { name: /trip name/i })
      ).not.toBeInTheDocument();
      expect(screen.getByText("Paris Summer")).toBeInTheDocument();
      expect(mockUpdateTrip).not.toHaveBeenCalled();
    });

    it("does not call the update API when the name is unchanged on blur", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /paris summer/i })
      );

      // Tab away without changing anything
      await userEvent.tab();

      expect(mockUpdateTrip).not.toHaveBeenCalled();
    });
  });

  // --- Date range picker ---

  describe("Date range picker", () => {
    it("displays a date range button with both dates", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      const dateBtn = screen.getByRole("button", { name: /date range/i });
      expect(dateBtn).toHaveTextContent(/Jun 1/);
      expect(dateBtn).toHaveTextContent(/Jun 15/);
    });

    it("opens a calendar popover when the date range button is clicked", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /date range/i })
      );

      // Calendar grid should appear
      expect(screen.getAllByRole("grid").length).toBeGreaterThanOrEqual(1);
    });

    it("calls the update API after selecting a new date range", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue([]);
      mockGetItinerary.mockResolvedValue({ days: [] });
      mockUpdateTrip.mockResolvedValue({
        ...sampleTrip,
        start_date: "2026-06-10",
        end_date: "2026-06-20",
      });
      render(<TripDetailPage />);

      await screen.findByText("Paris Summer");
      await userEvent.click(
        screen.getByRole("button", { name: /date range/i })
      );

      // Select a new range: click start day, then end day
      const june10 = screen.getByRole("button", { name: /june 10\w*, 2026/i });
      const june20 = screen.getByRole("button", { name: /june 20\w*, 2026/i });
      await userEvent.click(june10);
      await userEvent.click(june20);

      await waitFor(() => {
        expect(mockUpdateTrip).toHaveBeenCalledWith(
          "trip-1",
          expect.objectContaining({
            start_date: "2026-06-10",
            end_date: "2026-06-20",
          })
        );
      });
    });
  });

  // ---------------------------------------------------------------------
  // Sidebar pin click → scroll to card + highlight flash
  // ---------------------------------------------------------------------
  describe("Sidebar pin click scroll-to-card + highlight", () => {
    let scrollSpy: ReturnType<typeof vi.fn>;
    let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

    beforeEach(() => {
      // jsdom does not implement scrollIntoView, so assign a stub directly.
      originalScrollIntoView = Element.prototype.scrollIntoView;
      scrollSpy = vi.fn();
      Element.prototype.scrollIntoView =
        scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
      // requestAnimationFrame fires synchronously in this path so the
      // scrollIntoView assertion doesn't need a flush.
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("clicking a sidebar pin calls scrollIntoView on the element with matching data-location-id", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      await screen.findByRole("heading", { name: "Eiffel Tower" });

      // Card must have the data-location-id hook
      const card = document.querySelector('[data-location-id="loc-1"]');
      expect(card).not.toBeNull();

      const pinBtn = await screen.findByTestId("mock-sidebar-pin-loc-1");
      fireEvent.click(pinBtn);

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
      // The element the spy was invoked on is the target card
      expect(scrollSpy.mock.instances[0]).toBe(card);
    });

    it("applies the highlight class after the scroll-settle delay (fake timers)", async () => {
      vi.useFakeTimers();
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      // Use getAllByRole to avoid "multiple elements" error from the front+back faces.
      await vi.waitFor(() => {
        expect(
          screen.queryAllByRole("heading", { name: "Eiffel Tower" }).length
        ).toBeGreaterThan(0);
      });

      const pinBtn = screen.getByTestId("mock-sidebar-pin-loc-2");
      act(() => {
        fireEvent.click(pinBtn);
      });

      // data-location-id is on the card-flip-container (root); the
      // animate-location-highlight class is on the card-flip-inner (first child).
      const cardRoot = document.querySelector(
        '[data-location-id="loc-2"]'
      ) as HTMLElement;
      const card = cardRoot.firstChild as HTMLElement;
      // Not yet — waiting for the scroll-settle delay.
      expect(card.className).not.toContain("animate-location-highlight");

      // Advance past the 350ms start delay.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(card.className).toContain("animate-location-highlight");

      // Other card is never highlighted.
      const otherCardRoot = document.querySelector(
        '[data-location-id="loc-1"]'
      ) as HTMLElement;
      const otherCard = otherCardRoot.firstChild as HTMLElement;
      expect(otherCard.className).not.toContain("animate-location-highlight");
    });

    it("removes the highlight class after the animation completes", async () => {
      vi.useFakeTimers();
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      await vi.waitFor(() => {
        expect(
          screen.queryAllByRole("heading", { name: "Eiffel Tower" }).length
        ).toBeGreaterThan(0);
      });

      const pinBtn = screen.getByTestId("mock-sidebar-pin-loc-1");
      act(() => {
        fireEvent.click(pinBtn);
      });

      // animate-location-highlight is on the card-flip-inner (first child of the
      // card-flip-container which carries data-location-id).
      const cardRoot = document.querySelector(
        '[data-location-id="loc-1"]'
      ) as HTMLElement;
      const card = cardRoot.firstChild as HTMLElement;

      // Advance past the start delay so the class lands.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(card.className).toContain("animate-location-highlight");

      // Advance past the full animation duration and the class clears.
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(card.className).not.toContain("animate-location-highlight");
    });

    it("rapidly clicking a second pin cancels the first highlight and marks the second card", async () => {
      vi.useFakeTimers();
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      await vi.waitFor(() => {
        expect(
          screen.queryAllByRole("heading", { name: "Eiffel Tower" }).length
        ).toBeGreaterThan(0);
      });

      // Click pin 1 and let the highlight actually land.
      act(() => {
        fireEvent.click(screen.getByTestId("mock-sidebar-pin-loc-1"));
      });
      act(() => {
        vi.advanceTimersByTime(400); // past start delay
      });

      // animate-location-highlight is on the card-flip-inner (first child).
      const card1 = (
        document.querySelector('[data-location-id="loc-1"]') as HTMLElement
      ).firstChild as HTMLElement;
      const card2 = (
        document.querySelector('[data-location-id="loc-2"]') as HTMLElement
      ).firstChild as HTMLElement;
      expect(card1.className).toContain("animate-location-highlight");

      // Click pin 2 while pin 1's highlight is still visible. loc-1 should
      // clear instantly; loc-2 should land after its own start delay.
      act(() => {
        fireEvent.click(screen.getByTestId("mock-sidebar-pin-loc-2"));
      });
      expect(card1.className).not.toContain("animate-location-highlight");
      // loc-2 not yet — still waiting on its scroll-settle delay.
      expect(card2.className).not.toContain("animate-location-highlight");

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(card2.className).toContain("animate-location-highlight");

      // After the full animation duration, loc-2 clears.
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(card2.className).not.toContain("animate-location-highlight");
    });

    it("clicking a LocationCard body (card → map direction) does NOT call scrollIntoView (regression)", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      await screen.findByRole("heading", { name: "Eiffel Tower" });

      const card = document.querySelector(
        '[data-location-id="loc-1"]'
      ) as HTMLElement;
      fireEvent.click(card);

      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it("every rendered LocationCard exposes a data-location-id attribute", async () => {
      mockGetTrip.mockResolvedValue(sampleTrip);
      mockListLocations.mockResolvedValue(sampleLocations);
      render(<TripDetailPage />);
      await screen.findByRole("heading", { name: "Eiffel Tower" });

      expect(
        document.querySelector('[data-location-id="loc-1"]')
      ).not.toBeNull();
      expect(
        document.querySelector('[data-location-id="loc-2"]')
      ).not.toBeNull();
    });
  });
});
