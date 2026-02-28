/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLocationForm } from "./AddLocationForm";

const mockAdd = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    locations: {
      add: (...args: unknown[]) => mockAdd(...args),
    },
  },
}));

describe("AddLocationForm", () => {
  const onAdded = vi.fn();
  const onCancel = vi.fn();
  const tripId = "trip-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all fields", () => {
    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/working hours/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/requires booking/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });

  it("requires location name", () => {
    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    const nameInput = screen.getByLabelText(/location name/i);
    expect(nameInput).toBeRequired();
  });

  it("submits with all fields and calls onAdded", async () => {
    const newLocation = {
      id: "loc-new",
      name: "Louvre",
      address: "Rue de Rivoli",
      google_link: null,
      note: "Book ahead",
      city: "Paris",
      working_hours: "9-18",
      requires_booking: "yes",
      category: "Museum",
      added_by_user_id: null,
      added_by_email: null,
    };
    mockAdd.mockResolvedValue(newLocation);

    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );

    await userEvent.type(screen.getByLabelText(/location name/i), "Louvre");
    await userEvent.type(screen.getByLabelText(/address/i), "Rue de Rivoli");
    await userEvent.type(screen.getByLabelText(/city/i), "Paris");
    await userEvent.type(screen.getByLabelText(/working hours/i), "9-18");
    await userEvent.selectOptions(
      screen.getByLabelText(/requires booking/i),
      "yes"
    );
    await userEvent.selectOptions(screen.getByLabelText(/category/i), "Museum");
    await userEvent.type(screen.getByLabelText(/note/i), "Book ahead");

    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("trip-1", {
        name: "Louvre",
        address: "Rue de Rivoli",
        google_link: null,
        note: "Book ahead",
        city: "Paris",
        working_hours: "9-18",
        requires_booking: "yes",
        category: "Museum",
      });
    });
    expect(onAdded).toHaveBeenCalledWith(newLocation);
  });

  it("sends null for empty optional fields", async () => {
    mockAdd.mockResolvedValue({
      id: "loc-new",
      name: "Place",
      address: null,
      google_link: null,
      note: null,
      city: null,
      working_hours: null,
      requires_booking: null,
      category: null,
      added_by_user_id: null,
      added_by_email: null,
    });

    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    await userEvent.type(screen.getByLabelText(/location name/i), "Place");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("trip-1", {
        name: "Place",
        address: null,
        google_link: null,
        note: null,
        city: null,
        working_hours: null,
        requires_booking: null,
        category: null,
      });
    });
  });

  it("shows error banner on API failure", async () => {
    mockAdd.mockRejectedValue(new Error("Server error"));

    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    await userEvent.type(screen.getByLabelText(/location name/i), "Place");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel clicked", async () => {
    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows 'Adding…' while saving", async () => {
    mockAdd.mockReturnValue(new Promise(() => {}));

    render(
      <AddLocationForm tripId={tripId} onAdded={onAdded} onCancel={onCancel} />
    );
    await userEvent.type(screen.getByLabelText(/location name/i), "Place");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });
});
