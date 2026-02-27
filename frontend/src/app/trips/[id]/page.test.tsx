/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";
import { ApiError } from "@/lib/api";

const mockPush = vi.fn();
const mockParams = { id: "trip-1" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

const mockGetTrip = vi.fn();
const mockListLocations = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    trips: {
      get: (...args: unknown[]) => mockGetTrip(...args),
    },
    locations: {
      list: (...args: unknown[]) => mockListLocations(...args),
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
    address: null,
    google_link: null,
    note: "Must visit at sunset",
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: null,
    google_link: null,
    note: null,
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
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();

    mockGetTrip.mockResolvedValue(sampleTrip);
    mockListLocations.mockResolvedValue(sampleLocations);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Paris Summer")).toBeInTheDocument();
  });

  it("shows 'Trip not found' for 404 errors", async () => {
    const error = new ApiError("Not found", 404);
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
});
