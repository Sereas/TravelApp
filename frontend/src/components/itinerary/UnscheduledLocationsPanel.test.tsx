/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnscheduledLocationsPanel } from "./UnscheduledLocationsPanel";

const locations = [
  {
    id: "loc-1",
    name: "Eiffel Tower",
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Paris",
    working_hours: null,
    requires_booking: null,
    category: "Viewpoint",
    google_place_id: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: null,
    google_link: null,
    note: null,
    added_by_user_id: null,
    added_by_email: null,
    city: "Paris",
    working_hours: null,
    requires_booking: null,
    category: "Museum",
    google_place_id: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  },
];

const availableDays = [
  { id: "day-1", label: "Jun 1" },
  { id: "day-2", label: "Jun 2" },
];

describe("UnscheduledLocationsPanel", () => {
  it("shows only unscheduled locations and schedules one to a selected day", async () => {
    const onScheduleToDay = vi.fn();
    render(
      <UnscheduledLocationsPanel
        locations={locations}
        itineraryLocationMap={new Map([["loc-2", ["Jun 1"]]])}
        availableDays={availableDays}
        onScheduleToDay={onScheduleToDay}
      />
    );

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.queryByText("Louvre Museum")).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(/schedule eiffel tower to day/i),
      "day-2"
    );
    await userEvent.click(screen.getByRole("button", { name: /^schedule$/i }));

    expect(onScheduleToDay).toHaveBeenCalledWith("loc-1", "day-2");
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
        availableDays={availableDays}
        onScheduleToDay={vi.fn()}
      />
    );

    expect(
      screen.getByText(/everything in this trip is already scheduled/i)
    ).toBeInTheDocument();
  });
});
