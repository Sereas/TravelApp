/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateTripDialog } from "./CreateTripDialog";

const mockCreateTrip = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    trips: {
      create: (...args: unknown[]) => mockCreateTrip(...args),
    },
  },
}));

describe("CreateTripDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens dialog when trigger is clicked", async () => {
    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(
      screen.getByRole("heading", { name: /create a new trip/i })
    ).toBeInTheDocument();
  });

  it("renders form fields: trip name, start date, end date", async () => {
    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    expect(screen.getByLabelText(/trip name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it("calls api.trips.create with form data and invokes onCreated", async () => {
    const newTrip = {
      id: "new-1",
      name: "Paris",
      start_date: "2026-06-01",
      end_date: "2026-06-15",
    };
    mockCreateTrip.mockResolvedValue(newTrip);
    const onCreated = vi.fn();

    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={onCreated} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    await userEvent.type(screen.getByLabelText(/trip name/i), "Paris");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-06-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-06-15");
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(mockCreateTrip).toHaveBeenCalledWith({
      name: "Paris",
      start_date: "2026-06-01",
      end_date: "2026-06-15",
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(newTrip);
    });
  });

  it("creates trip with only name (dates optional)", async () => {
    mockCreateTrip.mockResolvedValue({
      id: "new-2",
      name: "Rome",
      start_date: null,
      end_date: null,
    });
    const onCreated = vi.fn();

    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={onCreated} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    await userEvent.type(screen.getByLabelText(/trip name/i), "Rome");
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(mockCreateTrip).toHaveBeenCalledWith({
      name: "Rome",
      start_date: null,
      end_date: null,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it("shows error on API failure", async () => {
    mockCreateTrip.mockRejectedValue(new Error("Server error"));

    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    await userEvent.type(screen.getByLabelText(/trip name/i), "Fail trip");
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));

    expect(await screen.findByText("Server error")).toBeInTheDocument();
  });

  it("closes dialog on cancel", async () => {
    render(
      <CreateTripDialog trigger={<button>Open</button>} onCreated={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(
      screen.getByRole("heading", { name: /create a new trip/i })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /create a new trip/i })
      ).not.toBeInTheDocument();
    });
  });
});
