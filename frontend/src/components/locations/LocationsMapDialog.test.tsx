import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationsMapDialog } from "./LocationsMapDialog";
import type { Location } from "@/lib/api";

vi.mock("@/components/itinerary/ItineraryDayMap", () => ({
  ItineraryDayMap: ({ locations }: { locations: unknown[] }) => (
    <div data-testid="mock-map">Map with {locations.length} pins</div>
  ),
}));

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    name: "Test",
    address: null,
    google_link: null,
    google_place_id: null,
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
    ...overrides,
  };
}

describe("LocationsMapDialog", () => {
  it("renders map with geolocated locations", () => {
    const locations = [
      makeLocation({ id: "1", latitude: 48.8, longitude: 2.3 }),
      makeLocation({ id: "2", latitude: null, longitude: null }),
    ];
    render(
      <LocationsMapDialog
        locations={locations}
        open={true}
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByText("All Locations")).toBeInTheDocument();
    expect(screen.getByText("Map with 1 pins")).toBeInTheDocument();
  });

  it("shows empty state when no locations have coordinates", () => {
    const locations = [makeLocation({ id: "1" })];
    render(
      <LocationsMapDialog
        locations={locations}
        open={true}
        onOpenChange={() => {}}
      />
    );
    expect(
      screen.getByText(/no locations have coordinates/i)
    ).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <LocationsMapDialog locations={[]} open={false} onOpenChange={() => {}} />
    );
    expect(screen.queryByText("All Locations")).not.toBeInTheDocument();
  });
});
