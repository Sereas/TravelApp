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
    expect(screen.getByLabelText(/full address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/opening hours/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/booking/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/personal notes/i)).toBeInTheDocument();
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
    await userEvent.type(
      screen.getByLabelText(/full address/i),
      "Rue de Rivoli"
    );
    await userEvent.type(screen.getByLabelText(/city/i), "Paris");
    await userEvent.type(screen.getByLabelText(/opening hours/i), "9-18");
    await userEvent.selectOptions(screen.getByLabelText(/booking/i), "yes");
    await userEvent.selectOptions(screen.getByLabelText(/category/i), "Museum");
    await userEvent.type(
      screen.getByLabelText(/personal notes/i),
      "Book ahead"
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^save location$/i })
    );

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("trip-1", {
        name: "Louvre",
        address: "Rue de Rivoli",
        google_link: null,
        google_place_id: null,
        google_source_type: null,
        latitude: null,
        longitude: null,
        photo_resource_name: null,
        note: "Book ahead",
        city: "Paris",
        working_hours: "9-18",
        requires_booking: "yes",
        category: "Museum",
      });
    });
    expect(onAdded).toHaveBeenCalledWith(newLocation, null);
  });

  it("sends defaults for booking and category when not changed", async () => {
    mockAdd.mockResolvedValue({
      id: "loc-new",
      name: "Place",
      address: null,
      google_link: null,
      note: null,
      city: null,
      working_hours: null,
      requires_booking: "no",
      category: "Other",
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
      screen.getByRole("button", { name: /^save location$/i })
    );

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("trip-1", {
        name: "Place",
        address: null,
        google_link: null,
        google_place_id: null,
        google_source_type: null,
        latitude: null,
        longitude: null,
        photo_resource_name: null,
        note: null,
        city: null,
        working_hours: null,
        requires_booking: "no",
        category: "Other",
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
      screen.getByRole("button", { name: /^save location$/i })
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
      screen.getByRole("button", { name: /^save location$/i })
    );

    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
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
      photo_resource_name: null,
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
        image_url: null,
        user_image_url: null,
        attribution_name: null,
        attribution_uri: null,
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

    const linkInput = screen.getByLabelText(/google maps url/i);
    await userEvent.type(linkInput, "https://maps.app.goo.gl/abc123");
    await userEvent.tab();

    await waitFor(() => {
      expect(
        screen.getByText(/already exists in this trip/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Louvre/)).toBeInTheDocument();
  });

  it("shows day picker when availableDays are provided", () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        availableDays={[
          { id: "day-1", label: "May 15" },
          { id: "day-2", label: "May 16" },
        ]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      screen.getByRole("button", { name: /schedule to day/i })
    ).toBeInTheDocument();
  });

  it("passes selected day ID to onAdded", async () => {
    const newLocation = {
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
      latitude: null,
      longitude: null,
    };
    mockAdd.mockResolvedValue(newLocation);

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        availableDays={[
          { id: "day-1", label: "May 15" },
          { id: "day-2", label: "May 16" },
        ]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    await userEvent.type(screen.getByLabelText(/location name/i), "Place");
    await userEvent.click(
      screen.getByRole("button", { name: /schedule to day/i })
    );
    await userEvent.click(screen.getByText("May 16"));
    await userEvent.click(
      screen.getByRole("button", { name: /^save location$/i })
    );

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith(newLocation, "day-2");
    });
  });

  it("does not show day picker when no days available", () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      screen.queryByRole("button", { name: /schedule to day/i })
    ).not.toBeInTheDocument();
  });

  it("shows subtitle description", () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      screen.getByText(/add a new destination to your curated journey/i)
    ).toBeInTheDocument();
  });

  // --- initialGoogleLink prop ---

  it("shows the google link as read-only text when initialGoogleLink is provided", () => {
    mockPreview.mockReturnValue(new Promise(() => {}));
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      screen.getByText("https://maps.app.goo.gl/HFaERRSAPvPePT1D6")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /google maps url/i })
    ).not.toBeInTheDocument();
  });

  it("shows loading state before fields when initialGoogleLink is provided", () => {
    mockPreview.mockReturnValue(new Promise(() => {}));
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      screen.getByText(/looking up location details/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/location name/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^save location$/i })
    ).not.toBeInTheDocument();
  });

  it("does not auto-focus the link field when initialGoogleLink is provided", () => {
    mockPreview.mockReturnValue(new Promise(() => {}));
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("auto-triggers preview on mount when initialGoogleLink is provided", async () => {
    mockPreview.mockResolvedValue({
      name: "Louvre Museum",
      address: "Rue de Rivoli, 75001 Paris, France",
      city: "Paris",
      latitude: 48.8606111,
      longitude: 2.337644,
      google_place_id: "ChIJCzYy5IS16lQRQrfeQ5K5Oxw",
      suggested_category: "Museum",
      working_hours: ["Tuesday: 9-18"],
      website: null,
      phone: null,
      photo_resource_name: "places/ChIJCzYy5IS/photos/AXCi2Q6abc",
    });

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith({
        google_link: "https://maps.app.goo.gl/HFaERRSAPvPePT1D6",
      });
    });

    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Louvre Museum");
  });

  it("reveals fields after preview completes for initialGoogleLink", async () => {
    mockPreview.mockResolvedValue({
      name: "Casino de Monte-Carlo",
      address: "Pl. du Casino, 98000 Monaco",
      city: "Monte Carlo",
      latitude: 43.74,
      longitude: 7.43,
      google_place_id: "ChIJABC",
      suggested_category: "Viewpoint",
      working_hours: ["Mon: 2:00 PM-4:00 AM"],
      website: null,
      phone: null,
      photo_resource_name: null,
    });

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/test123"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByLabelText(/location name/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Casino de Monte-Carlo");
    expect((screen.getByLabelText(/city/i) as HTMLInputElement).value).toBe(
      "Monte Carlo"
    );
    expect(
      (screen.getByLabelText(/full address/i) as HTMLInputElement).value
    ).toBe("Pl. du Casino, 98000 Monaco");
    expect(
      screen.getByRole("button", { name: /^save location$/i })
    ).toBeInTheDocument();
  });

  it("shows fields on error when initialGoogleLink preview fails", async () => {
    mockPreview.mockRejectedValue(new Error("Google API error"));

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialGoogleLink="https://maps.app.goo.gl/broken"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Google API error")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
  });

  it("does not auto-trigger preview when initialGoogleLink is absent", () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(mockPreview).not.toHaveBeenCalled();
  });

  // --- initialName prop ---

  it("seeds the name field when initialName is provided", () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialName="Arc de Triomphe"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Arc de Triomphe");
  });

  it("allows the user to continue editing the seeded name", async () => {
    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialName="Arc"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );
    const nameInput = screen.getByLabelText(/location name/i);
    await userEvent.type(nameInput, " de Triomphe");
    expect((nameInput as HTMLInputElement).value).toBe("Arc de Triomphe");
  });

  it("seeds both name and google link when both initial props are provided", async () => {
    mockPreview.mockResolvedValue({
      name: "Eiffel Tower",
      address: null,
      city: null,
      latitude: 48.86,
      longitude: 2.29,
      google_place_id: "ChIJXYZ",
      suggested_category: null,
      working_hours: [],
      website: null,
      phone: null,
      photo_resource_name: null,
    });

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        initialName="Eiffel Tower"
        initialGoogleLink="https://maps.app.goo.gl/abc123"
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    expect(
      screen.getByText("https://maps.app.goo.gl/abc123")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText(/location name/i)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Eiffel Tower");
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
      photo_resource_name: "places/ChIJCzYy5IS/photos/AXCi2Q6abc",
    });

    render(
      <AddLocationForm
        tripId={tripId}
        existingLocations={[]}
        onAdded={onAdded}
        onCancel={onCancel}
      />
    );

    const linkInput = screen.getByLabelText(/google maps url/i);
    await userEvent.type(
      linkInput,
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6"
    );
    await userEvent.tab();

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith({
        google_link: "https://maps.app.goo.gl/HFaERRSAPvPePT1D6",
      });
    });

    expect(
      (screen.getByLabelText(/location name/i) as HTMLInputElement).value
    ).toBe("Louvre Museum");
    expect(
      (screen.getByLabelText(/full address/i) as HTMLInputElement).value
    ).toContain("Rue de Rivoli");
  });
});
