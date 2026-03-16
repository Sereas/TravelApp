/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLocationForm } from "./AddLocationForm";

const mockAdd = vi.fn();
const mockPreview = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    locations: {
      add: (...args: unknown[]) => mockAdd(...args),
    },
    google: {
      previewLocationFromLink: (...args: unknown[]) => mockPreview(...args),
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
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
        google_place_id: null,
        google_source_type: null,
        google_raw: null,
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
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
        google_place_id: null,
        google_source_type: null,
        google_raw: null,
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
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
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows 'Adding…' while saving", async () => {
    mockAdd.mockReturnValue(new Promise(() => {}));

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    await userEvent.type(screen.getByLabelText(/location name/i), "Place");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("shows duplicate warning when google_place_id matches existing location", async () => {
    mockPreview.mockResolvedValue({
      name: "Louvre Museum",
      address: "Rue de Rivoli",
      latitude: 48.86,
      longitude: 2.34,
      google_place_id: "ChIJ123",
      suggested_category: null,
      working_hours: [],
      website: null,
      phone: null,
      google_raw: {},
    });

    const existingLocations = [
      {
        id: "loc-existing",
        name: "Louvre",
        address: null,
        google_link: null,
        google_place_id: "ChIJ123",
        note: null,
        added_by_user_id: null,
        added_by_email: null,
        city: null,
        working_hours: null,
        requires_booking: null,
        category: null,
        latitude: null,
        longitude: null,
      },
    ];

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={existingLocations}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    const linkInput = screen.getByLabelText(/google maps link/i);
    await userEvent.type(linkInput, "https://maps.app.goo.gl/abc123");
    await userEvent.tab();

    await waitFor(() => {
      expect(
        screen.getByText(/already exists in this trip/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Louvre/)).toBeInTheDocument();
  });

  it("calls Google preview on blur and prefills fields", async () => {
    mockPreview.mockResolvedValue({
      name: "Louvre Museum",
      address: "Rue de Rivoli, 75001 Paris, France",
      latitude: 48.8606111,
      longitude: 2.337644,
      google_place_id: "ChIJCzYy5IS16lQRQrfeQ5K5Oxw",
      suggested_category: "Museum",
      working_hours: ["Tuesday: 9-18"],
      website: "https://www.louvre.fr/en",
      phone: "+33 1 40 20 50 50",
      google_raw: { status: "OK" },
    });

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    const linkInput = screen.getByLabelText(/google maps link/i);
    await userEvent.type(
      linkInput,
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
    );
    await userEvent.tab(); // trigger blur

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith({
        google_link: "https://maps.app.goo.gl/HFaERRSAPvPePT1D6",
      });
    });

    // Name and address should be prefilled from preview
    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Louvre Museum");
    expect(
      (screen.getByLabelText(/address/i) as HTMLInputElement).value
    ).toContain("Rue de Rivoli");
  });
});
