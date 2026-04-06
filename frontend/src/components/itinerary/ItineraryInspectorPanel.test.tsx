import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItineraryInspectorPanel } from "@/components/itinerary/ItineraryInspectorPanel";

describe("ItineraryInspectorPanel", () => {
  it("renders day stats with place and route counts", () => {
    render(
      <ItineraryInspectorPanel
        day={{
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
                  id: "ol-1",
                  location_id: "loc-1",
                  sort_order: 0,
                  time_period: "morning",
                  location: {
                    id: "loc-1",
                    name: "Louvre Museum",
                    city: "Paris",
                    address: null,
                    google_link: null,
                    category: null,
                    note: null,
                    working_hours: null,
                    requires_booking: null,
                    image_url: null,
                    user_image_url: null,
                    attribution_name: null,
                    attribution_uri: null,
                  },
                },
              ],
              routes: [
                {
                  route_id: "route-1",
                  transport_mode: "DRIVE",
                  label: null,
                  duration_seconds: 600,
                  distance_meters: 5000,
                  sort_order: 0,
                  option_location_ids: ["loc-1"],
                },
              ],
            },
          ],
        }}
        currentOption={{
          id: "opt-1",
          option_index: 1,
          starting_city: null,
          ending_city: null,
          created_by: null,
          locations: [
            {
              id: "ol-1",
              location_id: "loc-1",
              sort_order: 0,
              time_period: "morning",
              location: {
                id: "loc-1",
                name: "Louvre Museum",
                city: "Paris",
                address: null,
                google_link: null,
                category: null,
                note: null,
                working_hours: null,
                requires_booking: null,
                image_url: null,
                user_image_url: null,
                attribution_name: null,
                attribution_uri: null,
              },
            },
          ],
          routes: [
            {
              route_id: "route-1",
              transport_mode: "DRIVE",
              label: null,
              duration_seconds: 600,
              distance_meters: 5000,
              sort_order: 0,
              option_location_ids: ["loc-1"],
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Sitrep")).toBeInTheDocument();
    expect(screen.getByText("place")).toBeInTheDocument();
    expect(screen.getByText("route")).toBeInTheDocument();
    expect(screen.getByText(/10 min/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0 km/)).toBeInTheDocument();
  });

  it("renders empty guidance when no day is selected", () => {
    render(<ItineraryInspectorPanel day={null} />);

    expect(
      screen.getByText(/Select a day to see its summary/i)
    ).toBeInTheDocument();
  });

  it("shows plans count when day has multiple options", () => {
    const option = {
      id: "opt-1",
      option_index: 1,
      starting_city: null,
      ending_city: null,
      created_by: null,
      locations: [],
      routes: [],
    };
    render(
      <ItineraryInspectorPanel
        day={{
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [option, { ...option, id: "opt-2", option_index: 2 }],
        }}
        currentOption={option}
      />
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("plans")).toBeInTheDocument();
  });
});
