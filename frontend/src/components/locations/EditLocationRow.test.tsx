/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditLocationRow } from "./EditLocationRow";

const mockUpdate = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    locations: {
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const sampleLocation = {
  id: "loc-1",
  name: "Louvre",
  address: "Rue de Rivoli",
  google_link: "https://maps.google.com/?q=louvre",
  note: "Book tickets",
  added_by_user_id: "user-1",
  added_by_email: "alice@example.com",
  city: "Paris",
  working_hours: "9-18",
  useful_link: null,
  requires_booking: "yes",
  category: "Museum" as string | null,
  google_place_id: null,
  latitude: null,
  longitude: null,
  image_url: null,
  user_image_url: null,
  attribution_name: null,
  attribution_uri: null,
};

describe("EditLocationRow", () => {
  const onUpdated = vi.fn();
  const onCancel = vi.fn();
  const tripId = "trip-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all fields pre-filled with location data", () => {
    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );
    expect(screen.getByDisplayValue("Louvre")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rue de Rivoli")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://maps.google.com/?q=louvre")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("9-18")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Book tickets")).toBeInTheDocument();
  });

  it("submits updated fields and calls onUpdated", async () => {
    const updatedLocation = {
      ...sampleLocation,
      name: "Louvre Museum",
      city: "Paris, France",
    };
    mockUpdate.mockResolvedValue(updatedLocation);

    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );

    const nameInput = screen.getByDisplayValue("Louvre");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Louvre Museum");

    const cityInput = screen.getByDisplayValue("Paris");
    await userEvent.clear(cityInput);
    await userEvent.type(cityInput, "Paris, France");

    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "trip-1",
        "loc-1",
        expect.objectContaining({
          name: "Louvre Museum",
          city: "Paris, France",
        })
      );
    });
    expect(onUpdated).toHaveBeenCalledWith(updatedLocation);
  });

  it("shows error banner on API failure", async () => {
    mockUpdate.mockRejectedValue(new Error("Update failed"));

    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    expect(await screen.findByText("Update failed")).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel clicked", async () => {
    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows 'Saving…' while submitting", async () => {
    mockUpdate.mockReturnValue(new Promise(() => {}));

    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("handles location with null fields gracefully", () => {
    const sparseLocation = {
      id: "loc-2",
      name: "Unknown Place",
      address: null,
      google_link: null,
      note: null,
      added_by_user_id: null,
      added_by_email: null,
      city: null,
      working_hours: null,
      useful_link: null,
      requires_booking: null,
      category: null,
      google_place_id: null,
      latitude: null,
      longitude: null,
      image_url: null,
      user_image_url: null,
      attribution_name: null,
      attribution_uri: null,
    };

    render(
      <EditLocationRow
        tripId={tripId}
        location={sparseLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );
    expect(screen.getByDisplayValue("Unknown Place")).toBeInTheDocument();
  });

  it("renders dialog with Edit Location title", () => {
    render(
      <EditLocationRow
        tripId={tripId}
        location={sampleLocation}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Edit Location")).toBeInTheDocument();
  });
});
