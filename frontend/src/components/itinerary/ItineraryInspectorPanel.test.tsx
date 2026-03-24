import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ItineraryInspectorPanel } from "@/components/itinerary/ItineraryInspectorPanel";
import { vi } from "vitest";

describe("ItineraryInspectorPanel", () => {
  it("renders selected day and focused scheduled location details", () => {
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
                  location_id: "loc-1",
                  sort_order: 0,
                  time_period: "morning",
                  location: {
                    id: "loc-1",
                    name: "Louvre Museum",
                    city: "Paris",
                    address: "Rue de Rivoli",
                    google_link: "https://maps.example/louvre",
                    category: "museum",
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
              routes: [],
            },
          ],
        }}
        currentOption={{
          id: "opt-1",
          option_index: 1,
          starting_city: null,
          ending_city: null,
          created_by: null,
          locations: [],
          routes: [],
        }}
        selectedLocation={{
          dayId: "day-1",
          optionId: "opt-1",
          locationId: "loc-1",
          location: {
            id: "loc-1",
            name: "Louvre Museum",
            address: "Rue de Rivoli",
            google_link: "https://maps.example/louvre",
            google_place_id: null,
            note: "Book in advance",
            added_by_user_id: null,
            added_by_email: null,
            city: "Paris",
            working_hours: null,
            requires_booking: "yes",
            category: "museum",
            latitude: null,
            longitude: null,
            image_url: null,
            user_image_url: null,
            attribution_name: null,
            attribution_uri: null,
          },
          dayLabel: "Mon, Jun 1",
          optionIndex: 1,
          timePeriod: "morning",
          scheduled: true,
        }}
        unscheduledCount={2}
        onUpdateTimePeriod={vi.fn()}
      />
    );

    expect(screen.getByText("Selected day")).toBeInTheDocument();
    expect(screen.getByText("Day snapshot · Mon, Jun 1")).toBeInTheDocument();
    expect(screen.getByText("Focused place")).toBeInTheDocument();
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
    expect(screen.getByText(/Plan 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Morning" })).toBeInTheDocument();
    expect(screen.getByText(/2 saved places are still outside the schedule/)).toBeInTheDocument();
  });

  it("renders empty guidance when nothing is selected", () => {
    render(
      <ItineraryInspectorPanel
        day={null}
        currentOption={undefined}
        selectedLocation={null}
        unscheduledCount={0}
        onUpdateTimePeriod={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Select a day to inspect how many plans/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Expand a stop or pick an unscheduled place/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/All saved places are assigned to a day/i)).toBeInTheDocument();
  });

  it("updates time of day from the inspector for scheduled stops", async () => {
    const onUpdateTimePeriod = vi.fn();

    render(
      <ItineraryInspectorPanel
        day={null}
        currentOption={undefined}
        selectedLocation={{
          dayId: "day-1",
          optionId: "opt-1",
          locationId: "loc-1",
          location: {
            id: "loc-1",
            name: "Louvre Museum",
            address: null,
            google_link: null,
            google_place_id: null,
            note: null,
            added_by_user_id: null,
            added_by_email: null,
            city: "Paris",
            working_hours: null,
            requires_booking: null,
            category: "museum",
            latitude: null,
            longitude: null,
            image_url: null,
            user_image_url: null,
            attribution_name: null,
            attribution_uri: null,
          },
          dayLabel: "Mon, Jun 1",
          optionIndex: 1,
          timePeriod: "morning",
          scheduled: true,
        }}
        unscheduledCount={1}
        onUpdateTimePeriod={onUpdateTimePeriod}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /evening/i }));

    expect(onUpdateTimePeriod).toHaveBeenCalledWith(
      "day-1",
      "opt-1",
      "loc-1",
      "evening"
    );
  });
});
