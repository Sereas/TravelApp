/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
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
const mockAddLocation = vi.fn();
const mockUpdateLocation = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    trips: {
      get: (...args: unknown[]) => mockGetTrip(...args),
      update: (...args: unknown[]) => mockUpdateTrip(...args),
    },
    locations: {
      list: (...args: unknown[]) => mockListLocations(...args),
      add: (...args: unknown[]) => mockAddLocation(...args),
      update: (...args: unknown[]) => mockUpdateLocation(...args),
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
    expect(screen.getByText("Viewpoint")).toBeInTheDocument();
    expect(
      screen.getByText("Paris · Champ de Mars, Paris")
    ).toBeInTheDocument();
    expect(screen.getByText("9:00-23:00")).toBeInTheDocument();
    expect(screen.getByText("Booking needed")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Museum")).toBeInTheDocument();
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
    await userEvent.click(
      screen.getByRole("button", { name: /back to trips/i })
    );
    expect(mockPush).toHaveBeenCalledWith("/trips");
  });

  it("has back-to-trips navigation on success view", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([]);
    render(<TripDetailPage />);

    await screen.findByText("Paris Summer");
    await userEvent.click(
      screen.getByRole("button", { name: /back to trips/i })
    );
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

  it("shows 'Add location' button when locations exist", async () => {
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
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    expect(editButtons).toHaveLength(2);
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
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await userEvent.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue("Eiffel Tower");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Eiffel Tower (top floor)");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

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
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await userEvent.click(editButtons[0]);

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  // --- Location pool features ---

  it("shows location count in section header", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows category filter chips when 2+ categories exist", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(screen.getByText("All (2)")).toBeInTheDocument();
    expect(screen.getByText("Museum (1)")).toBeInTheDocument();
    expect(screen.getByText("Viewpoint (1)")).toBeInTheDocument();
  });

  it("filters locations by category when chip is clicked", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    await userEvent.click(screen.getByText("Museum (1)"));

    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
    expect(screen.queryByText("Eiffel Tower")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("All (2)"));
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
  });

  it("does not show filter chips with only 1 category", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue([sampleLocations[0]]);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(screen.queryByText("All (1)")).not.toBeInTheDocument();
  });

  it("does not show group-by-city when all locations share a city", async () => {
    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    render(<TripDetailPage />);

    await screen.findByText("Eiffel Tower");
    expect(
      screen.queryByRole("button", { name: /group by city/i })
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
    const groupBtn = screen.getByRole("button", { name: /group by city/i });
    expect(groupBtn).toBeInTheDocument();

    await userEvent.click(groupBtn);
    const headings = screen.getAllByRole("heading", { level: 3 });
    const cityNames = headings.map((h) => h.textContent);
    expect(cityNames.some((t) => t?.includes("Nice"))).toBe(true);
    expect(cityNames.some((t) => t?.includes("Paris"))).toBe(true);
    expect(screen.getByText("Promenade des Anglais")).toBeInTheDocument();
  });
});
