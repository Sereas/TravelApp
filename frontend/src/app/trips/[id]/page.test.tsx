/// <reference types="vitest/globals" />
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";

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
    expect(screen.getByText(/Jun 1, 2026 — Jun 15, 2026/)).toBeInTheDocument();

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Must visit at sunset")).toBeInTheDocument();
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
  });

  it("renders extended location fields via LocationCard", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    // "Viewpoint" appears both as badge on card and in filter toolbar
    expect(screen.getAllByText("Viewpoint").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Champ de Mars, Paris")).toBeInTheDocument();
    expect(screen.getByText("9:00-23:00")).toBeInTheDocument();
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
    expect(screen.getAllByText(/Added by/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/alice@example\.com/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Museum").length).toBeGreaterThanOrEqual(1);
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

    expect(await screen.findByText(/no locations added/i)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: /all trips/i }));
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("has back-to-trips navigation on success view", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /all trips/i }));
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

  // --- Slice 11: Edit trip ---

  it("shows Edit trip button and opens edit form", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));

    expect(screen.getByLabelText(/trip name/i)).toHaveValue("Paris Summer");
  });

  it("updates trip details on save", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockUpdateTrip.mockResolvedValue({
      ...sampleTrip,
      name: "Paris Winter",
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));

    const nameInput = screen.getByLabelText(/trip name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Paris Winter");
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i })
    );

    expect(await screen.findByText("Paris Winter")).toBeInTheDocument();
    expect(mockUpdateTrip).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Paris Winter" })
    );
  });

  it("cancels trip edit without saving", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Paris Summer")).toBeInTheDocument();
    expect(mockUpdateTrip).not.toHaveBeenCalled();
  });

  // --- Slice 11: Add location ---

  it("opens add-location form from empty state CTA", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText(/no locations added/i);
    await userEvent.click(
      screen.getByRole("button", { name: /add a location/i })
    );

    expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
  });

  it("adds a new location and shows it in the list", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockAddLocation.mockResolvedValue({
      id: "loc-new",
      name: "Arc de Triomphe",
      address: null,
      google_link: null,
      note: "Great views",
    });
    render(<TripDetailPage />);

    await screen.findByText(/no locations added/i);
    await userEvent.click(
      screen.getByRole("button", { name: /add a location/i })
    );

    await userEvent.type(
      screen.getByLabelText(/location name/i),
      "Arc de Triomphe"
    );
    await userEvent.type(screen.getByLabelText(/note/i), "Great views");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(await screen.findByText("Arc de Triomphe")).toBeInTheDocument();
    expect(screen.getByText("Great views")).toBeInTheDocument();
    expect(mockAddLocation).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Arc de Triomphe", note: "Great views" })
    );
  });

  it("shows 'Add Location' button when locations exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(
      screen.getByRole("button", { name: /add location/i })
    ).toBeInTheDocument();
  });

  // --- Slice 11: Edit location ---

  it("shows Edit button on each location row", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    expect(menuButtons).toHaveLength(2);
    await userEvent.click(menuButtons[0]);
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });

  it("edits a location inline and saves", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockUpdateLocation.mockResolvedValue({
      ...sampleLocations[0],
      name: "Eiffel Tower (top floor)",
    });
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    await userEvent.click(menuButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const nameInput = screen.getByDisplayValue("Eiffel Tower");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Eiffel Tower (top floor)");
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    expect(
      await screen.findByText("Eiffel Tower (top floor)")
    ).toBeInTheDocument();
    expect(mockUpdateLocation).toHaveBeenCalledWith(
      "trip-1",
      "loc-1",
      expect.objectContaining({ name: "Eiffel Tower (top floor)" })
    );
  });

  it("cancels location edit without saving", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    await userEvent.click(menuButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  // --- Location pool features ---

  it("shows location count in tab", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const locationsTab = screen.getByRole("tab", { name: /locations/i });
    expect(locationsTab).toHaveTextContent("(2)");
  });

  it("shows category filter chips when 2+ categories exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(screen.getByText("All Locations")).toBeInTheDocument();
    // Category pills no longer show counts — just category names
    const toolbar = screen.getByRole("toolbar", {
      name: /filter locations by category/i,
    });
    expect(within(toolbar).getByText("Museum")).toBeInTheDocument();
    expect(within(toolbar).getByText("Viewpoint")).toBeInTheDocument();
  });

  it("filters locations by category when chip is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const toolbar = screen.getByRole("toolbar", {
      name: /filter locations by category/i,
    });
    await userEvent.click(within(toolbar).getByText("Museum"));

    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
    expect(screen.queryByText("Eiffel Tower")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("All Locations"));
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
  });

  it("does not show filter chips with only 1 category", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([sampleLocations[0]]);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(screen.queryByText("All Locations")).not.toBeInTheDocument();
  });

  it("does not show group-by-city when all locations share a city", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(
      screen.queryByRole("button", { name: /group by/i })
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

    await screen.findByText("Eiffel Tower");
    const groupBtn = screen.getByRole("button", { name: /group by/i });
    expect(groupBtn).toBeInTheDocument();

    await userEvent.click(groupBtn);
    const headings = screen.getAllByRole("heading", { level: 3 });
    const cityNames = headings.map((h) => h.textContent);
    expect(cityNames.some((t) => t?.includes("Nice"))).toBe(true);
    expect(cityNames.some((t) => t?.includes("Paris"))).toBe(true);
    expect(screen.getByText("Promenade des Anglais")).toBeInTheDocument();
  });

  // --- Delete trip ---

  it("shows Delete trip inside Edit Trip dialog", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    // Delete trip is only visible inside the edit dialog
    expect(
      screen.queryByRole("button", { name: /delete trip/i })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    expect(
      screen.getByRole("button", { name: /delete trip/i })
    ).toBeInTheDocument();
  });

  it("opens confirmation dialog when Delete trip is clicked inside edit", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete trip/i }));

    expect(screen.getByText("Delete trip?")).toBeInTheDocument();
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
  });

  it("deletes trip and navigates to /trips on confirm", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockDeleteTrip.mockResolvedValue(undefined);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete trip/i }));
    // Confirm in the dialog — the confirm button also says "Delete trip"
    const dialogButtons = screen.getAllByRole("button", {
      name: /delete trip/i,
    });
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockDeleteTrip).toHaveBeenCalledWith("trip-1");
    });
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("does not delete trip when cancel is clicked in dialog", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockDeleteTrip).not.toHaveBeenCalled();
  });

  it("shows error when trip deletion fails", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    mockDeleteTrip.mockRejectedValue(new Error("Server error"));
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete trip/i }));
    const dialogButtons = screen.getAllByRole("button", {
      name: /delete trip/i,
    });
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockDeleteTrip).toHaveBeenCalled();
    });
    expect(await screen.findByText("Server error")).toBeInTheDocument();
  });

  // --- Delete location ---

  it("shows Delete button on each location card", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    expect(menuButtons).toHaveLength(2);
    await userEvent.click(menuButtons[0]);
    expect(
      screen.getByRole("button", { name: /^delete$/i })
    ).toBeInTheDocument();
  });

  it("deletes a location and removes it from the list", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockDeleteLocation.mockResolvedValue(undefined);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    await userEvent.click(menuButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

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
    await waitFor(() => {
      expect(screen.queryByText("Eiffel Tower")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
  });

  it("does not delete location when cancel is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    await userEvent.click(menuButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText("Delete location?")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockDeleteLocation).not.toHaveBeenCalled();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
  });

  it("shows error when location deletion fails", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    mockDeleteLocation.mockRejectedValue(new Error("Delete failed"));
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    const menuButtons = screen.getAllByRole("button", {
      name: /location actions/i,
    });
    await userEvent.click(menuButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

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

  it("shows Locations and Itinerary tabs", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    expect(screen.getByRole("tab", { name: /locations/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeInTheDocument();
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
    expect(screen.getByText(/morning/i)).toBeInTheDocument();
    expect(screen.getByText(/afternoon/i)).toBeInTheDocument();
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
      "loc-1",
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
    expect(screen.getByText(/no locations planned yet/i)).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /edit cities/i }));
    const startInput = screen.getByDisplayValue("Paris");
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

  it("shows plan dropdown trigger in card header", async () => {
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
      await screen.findByRole("button", { name: /switch day plan/i })
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
      created_by: null,
      created_at: null,
    });
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));

    // Open the plan dropdown
    await userEvent.click(
      await screen.findByRole("button", { name: /switch day plan/i })
    );
    // Click "Add plan" to reveal the name input
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    // Type a name and submit
    await userEvent.type(
      screen.getByPlaceholderText(/plan name/i),
      "Beach route"
    );
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(mockCreateOption).toHaveBeenCalledWith("trip-1", "day-1");
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

    // Open the plan dropdown
    await userEvent.click(
      screen.getByRole("button", { name: /switch day plan/i })
    );

    // Delete button appears for non-main plan (opt-2, option_index: 2)
    const deleteBtn = screen.getByRole("button", { name: /delete plan/i });
    expect(deleteBtn).toBeInTheDocument();

    await userEvent.click(deleteBtn);
    expect(screen.getByText("Delete this plan?")).toBeInTheDocument();

    const confirmBtns = screen.getAllByRole("button", { name: /delete/i });
    await userEvent.click(confirmBtns[confirmBtns.length - 1]);

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
});
