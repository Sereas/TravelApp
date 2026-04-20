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
    created_at: null,
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
        currentDayCities={new Set()}
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
        currentDayCities={new Set()}
        onScheduleToDay={vi.fn()}
      />
    );

    expect(screen.getByText(/every place has a spot/i)).toBeInTheDocument();
  });

  it("collapses long lists and expands on click when currentDayCities is empty", async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      makeLocation(`loc-${i}`, `Place ${i}`)
    );
    render(
      <UnscheduledLocationsPanel
        locations={many}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set()}
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

  it("shows search filter for 8+ items and filters results when currentDayCities is empty", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      makeLocation(`loc-${i}`, `Place ${i}`, i < 3 ? "Paris" : "London")
    );
    render(
      <UnscheduledLocationsPanel
        locations={many}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set()}
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

  // --- New behavior: city-focused filtering ---

  it("shows only same-city locations when currentDayCities is set", () => {
    const locs = [
      makeLocation("loc-a", "Big Ben", "London"),
      makeLocation("loc-b", "Eiffel Tower", "Paris"),
      makeLocation("loc-c", "Louvre", "Paris"),
      makeLocation("loc-d", "Colosseum", "Rome"),
    ];
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set(["paris"])}
        onScheduleToDay={vi.fn()}
      />
    );

    // Paris locations visible
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();

    // Non-Paris locations NOT visible
    expect(screen.queryByText("Big Ben")).not.toBeInTheDocument();
    expect(screen.queryByText("Colosseum")).not.toBeInTheDocument();
  });

  it("does not show 'Other cities' divider or expand button when currentDayCities is set", () => {
    const locs = [
      makeLocation("loc-a", "Big Ben", "London"),
      makeLocation("loc-b", "Eiffel Tower", "Paris"),
      makeLocation("loc-c", "Louvre", "Paris"),
    ];
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set(["paris"])}
        onScheduleToDay={vi.fn()}
      />
    );

    expect(screen.queryByText(/other cities/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /more from other cities/i })
    ).not.toBeInTheDocument();
  });

  it("shows all locations when currentDayCities is empty (fallback)", () => {
    const locs = [
      makeLocation("loc-a", "Big Ben", "London"),
      makeLocation("loc-b", "Eiffel Tower", "Paris"),
      makeLocation("loc-c", "Colosseum", "Rome"),
    ];
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set()}
        onScheduleToDay={vi.fn()}
      />
    );

    expect(screen.getByText("Big Ben")).toBeInTheDocument();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Colosseum")).toBeInTheDocument();
  });

  it("search filters within same-city locations only when currentDayCities is set", async () => {
    const locs = Array.from({ length: 9 }, (_, i) =>
      makeLocation(
        `loc-${i}`,
        i < 3 ? `Paris Place ${i}` : `London Place ${i}`,
        i < 3 ? "Paris" : "London"
      )
    );
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set(["paris"])}
        onScheduleToDay={vi.fn()}
      />
    );

    const search = screen.getByPlaceholderText(/filter places/i);
    await userEvent.type(search, "Paris");

    // Paris locations visible in search
    expect(screen.getByText("Paris Place 0")).toBeInTheDocument();
    expect(screen.getByText("Paris Place 1")).toBeInTheDocument();
    expect(screen.getByText("Paris Place 2")).toBeInTheDocument();

    // London locations NEVER visible, even while searching
    expect(screen.queryByText("London Place 3")).not.toBeInTheDocument();
    expect(screen.queryByText("London Place 4")).not.toBeInTheDocument();
  });

  it("shows empty state message when no same-city locations exist", () => {
    const locs = [
      makeLocation("loc-a", "Big Ben", "London"),
      makeLocation("loc-b", "Tower Bridge", "London"),
    ];
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set(["paris"])}
        onScheduleToDay={vi.fn()}
      />
    );

    expect(screen.getByText(/added all the spots/i)).toBeInTheDocument();
    expect(screen.queryByText("Big Ben")).not.toBeInTheDocument();
    expect(screen.queryByText("Tower Bridge")).not.toBeInTheDocument();
  });

  it("collapses long same-city lists and expands on click", async () => {
    const locs = Array.from({ length: 6 }, (_, i) =>
      makeLocation(`loc-${i}`, `Paris Place ${i}`, "Paris")
    );
    render(
      <UnscheduledLocationsPanel
        locations={locs}
        itineraryLocationMap={new Map()}
        currentDayId="day-1"
        currentDayCities={new Set(["paris"])}
        onScheduleToDay={vi.fn()}
      />
    );

    // First 4 visible
    expect(screen.getByText("Paris Place 0")).toBeInTheDocument();
    expect(screen.getByText("Paris Place 3")).toBeInTheDocument();
    expect(screen.queryByText("Paris Place 4")).not.toBeInTheDocument();

    // Expand shows rest of same-city locations (no other cities)
    const showMore = screen.getByRole("button", { name: /show 2 more/i });
    await userEvent.click(showMore);

    expect(screen.getByText("Paris Place 4")).toBeInTheDocument();
    expect(screen.getByText("Paris Place 5")).toBeInTheDocument();
  });
});
