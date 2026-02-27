/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripsPage from "./page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockListTrips = vi.fn();
const mockCreateTrip = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    trips: {
      list: (...args: unknown[]) => mockListTrips(...args),
      create: (...args: unknown[]) => mockCreateTrip(...args),
    },
  },
}));

describe("TripsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockListTrips.mockReturnValue(new Promise(() => {}));
    render(<TripsPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders trips list when API returns trips", async () => {
    mockListTrips.mockResolvedValue([
      {
        id: "1",
        name: "Paris",
        start_date: "2026-06-01",
        end_date: "2026-06-15",
      },
      { id: "2", name: "Rome", start_date: null, end_date: null },
    ]);
    render(<TripsPage />);

    expect(await screen.findByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    expect(screen.getByText("2026-06-01 — 2026-06-15")).toBeInTheDocument();
  });

  it("shows 'New trip' button when trips exist", async () => {
    mockListTrips.mockResolvedValue([
      { id: "1", name: "Paris", start_date: null, end_date: null },
    ]);
    render(<TripsPage />);
    await screen.findByText("Paris");
    expect(
      screen.getByRole("button", { name: /new trip/i })
    ).toBeInTheDocument();
  });

  it("shows empty state with create CTA when no trips", async () => {
    mockListTrips.mockResolvedValue([]);
    render(<TripsPage />);

    expect(
      await screen.findByText(/haven't created any trips/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create your first trip/i })
    ).toBeInTheDocument();
  });

  it("shows error banner on API failure with retry", async () => {
    mockListTrips.mockRejectedValueOnce(new Error("Network error"));
    render(<TripsPage />);

    expect(await screen.findByText("Network error")).toBeInTheDocument();

    mockListTrips.mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(mockListTrips).toHaveBeenCalledTimes(2);
    });
  });

  it("navigates to trip detail when card is clicked", async () => {
    mockListTrips.mockResolvedValue([
      { id: "trip-42", name: "Tokyo", start_date: null, end_date: null },
    ]);
    render(<TripsPage />);

    await screen.findByText("Tokyo");
    await userEvent.click(screen.getByRole("button", { name: /tokyo/i }));

    expect(mockPush).toHaveBeenCalledWith("/trips/trip-42");
  });

  it("adds new trip to list after creation via dialog", async () => {
    mockListTrips.mockResolvedValue([]);
    mockCreateTrip.mockResolvedValue({
      id: "new-1",
      name: "Berlin",
      start_date: null,
      end_date: null,
    });
    render(<TripsPage />);

    await screen.findByText(/haven't created any trips/i);
    await userEvent.click(
      screen.getByRole("button", { name: /create your first trip/i })
    );

    await userEvent.type(screen.getByLabelText(/trip name/i), "Berlin");
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText("Berlin")).toBeInTheDocument();
  });
});
