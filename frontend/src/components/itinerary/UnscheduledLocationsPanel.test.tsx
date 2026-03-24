/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnscheduledLocationsPanel } from "./UnscheduledLocationsPanel";

function makeLocation(id: string, name: string, city: string | null = null) {
  return {
    id,
    name,
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city,
    working_hours: null,
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
}

const locations = [
  makeLocation("loc-1", "Eiffel Tower", "Paris"),
  makeLocation("loc-2", "Louvre Museum", "Paris"),
];

describe("UnscheduledLocationsPanel", () => {
  it("shows only unscheduled locations and quick-adds to current day", async () => {
    const onScheduleToDay = vi.fn();
    render(
      <UnscheduledLocationsPanel
        locations={locations}
        itineraryLocationMap={new Map([["loc-2", ["Jun 1"]]])}
        currentDayId="day-1"
        onScheduleToDay={onScheduleToDay}
      />
    );

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.queryByText("Louvre Museum")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /add eiffel tower/i })
    );

    expect(onScheduleToDay).toHaveBeenCalledWith("loc-1", "day-1");
  });

  it("shows a complete state when everything is already scheduled", () => {
    render(
      <UnscheduledLocationsPanel
        locations={locations}
        itineraryLocationMap={
          new Map([
            ["loc-1", ["Jun 1"]],
            ["loc-2", ["Jun 2"]],
          ])
        }
        currentDayId="day-1"
        onScheduleToDay={vi.fn()}
      />
    );

    expect(screen.getByText(/all places planned/i)).toBeInTheDocument();
  });

  it("collapses long lists and expands on click", async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      makeLocation(`loc-${i}`, `Place ${i}`)
    );
    render(
      <UnscheduledLocationsPanel
        locations={many}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        onScheduleToDay={vi.fn()}
      />
    );

    // First 4 visible, rest hidden
    expect(screen.getByText("Place 0")).toBeInTheDocument();
    expect(screen.getByText("Place 3")).toBeInTheDocument();
    expect(screen.queryByText("Place 4")).not.toBeInTheDocument();

    // "Show 2 more" button
    const showMore = screen.getByRole("button", { name: /show 2 more/i });
    expect(showMore).toBeInTheDocument();

    await userEvent.click(showMore);

    expect(screen.getByText("Place 4")).toBeInTheDocument();
    expect(screen.getByText("Place 5")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show less/i })
    ).toBeInTheDocument();
  });

  it("shows search filter for 8+ items and filters results", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeLocation(`loc-${i}`, `Place ${i}`, i < 3 ? "Paris" : "London")
    );
    render(
      <UnscheduledLocationsPanel
        locations={many}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        onScheduleToDay={vi.fn()}
      />
    );

    const search = screen.getByPlaceholderText(/filter places/i);
    expect(search).toBeInTheDocument();

    await userEvent.type(search, "Paris");

    // Only Paris locations visible
    expect(screen.getByText("Place 0")).toBeInTheDocument();
    expect(screen.getByText("Place 1")).toBeInTheDocument();
    expect(screen.getByText("Place 2")).toBeInTheDocument();
    expect(screen.queryByText("Place 3")).not.toBeInTheDocument();
  });
});
