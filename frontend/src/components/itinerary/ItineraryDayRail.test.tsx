import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItineraryDayRail } from "./ItineraryDayRail";

describe("ItineraryDayRail", () => {
  it("shows city flow labels instead of generic day numbers", () => {
    render(
      <ItineraryDayRail
        days={[
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [
              {
                id: "opt-1",
                option_index: 1,
                starting_city: "Paris",
                ending_city: "Lyon",
                created_by: null,
                locations: [],
                routes: [],
              },
            ],
          },
          {
            id: "day-2",
            date: "2026-06-02",
            sort_order: 1,
            options: [
              {
                id: "opt-2",
                option_index: 1,
                starting_city: "Nice",
                ending_city: "Nice",
                created_by: null,
                locations: [],
                routes: [],
              },
            ],
          },
        ]}
        selectedOptionsByDay={{
          "day-1": {
            id: "opt-1",
            option_index: 1,
            starting_city: "Paris",
            ending_city: "Lyon",
            created_by: null,
            locations: [],
            routes: [],
          },
          "day-2": {
            id: "opt-2",
            option_index: 1,
            starting_city: "Nice",
            ending_city: "Nice",
            created_by: null,
            locations: [],
            routes: [],
          },
        }}
      />
    );

    expect(screen.getByText("Jun 1")).toBeInTheDocument();
    expect(screen.getByText("Jun 2")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Lyon")).toBeInTheDocument();
    expect(screen.getByText("Nice")).toBeInTheDocument();
    expect(screen.queryByText(/Day 1/i)).not.toBeInTheDocument();
  });

  it("calls selection handler when a day chip is clicked", async () => {
    const onSelectDay = vi.fn();

    render(
      <ItineraryDayRail
        days={[
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [],
          },
        ]}
        selectedOptionsByDay={{ "day-1": undefined }}
        onSelectDay={onSelectDay}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /jun 1/i }));
    expect(onSelectDay).toHaveBeenCalledWith("day-1");
  });

  it("marks empty days with subtle styling instead of a badge", () => {
    render(
      <ItineraryDayRail
        days={[
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [],
          },
        ]}
        selectedOptionsByDay={{ "day-1": undefined }}
      />
    );

    expect(screen.getByText("Jun 1")).toBeInTheDocument();
    expect(screen.getByText("Destination TBD")).toBeInTheDocument();
    // No "Empty" pill or "Ready to plan" text
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready to plan")).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Phase 2 — Touch hardening contracts
  // ===========================================================================

  it("renders a right-edge fade gradient element for scroll affordance", () => {
    const { container } = render(
      <ItineraryDayRail
        days={[
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [],
          },
          {
            id: "day-2",
            date: "2026-06-02",
            sort_order: 1,
            options: [],
          },
          {
            id: "day-3",
            date: "2026-06-03",
            sort_order: 2,
            options: [],
          },
          {
            id: "day-4",
            date: "2026-06-04",
            sort_order: 3,
            options: [],
          },
        ]}
        selectedOptionsByDay={{
          "day-1": undefined,
          "day-2": undefined,
          "day-3": undefined,
          "day-4": undefined,
        }}
      />
    );

    // After Phase 2 there must be an overlay gradient element that signals
    // horizontal scrollability. It should have bg-gradient-to-l pointing left
    // (fading from card color to transparent at the right edge).
    const gradient = container.querySelector(".bg-gradient-to-l");
    expect(gradient).not.toBeNull();
  });

  it("right-edge fade gradient is pointer-events-none (regression guard)", () => {
    const { container } = render(
      <ItineraryDayRail
        days={[
          { id: "day-1", date: "2026-06-01", sort_order: 0, options: [] },
          { id: "day-2", date: "2026-06-02", sort_order: 1, options: [] },
          { id: "day-3", date: "2026-06-03", sort_order: 2, options: [] },
        ]}
        selectedOptionsByDay={{
          "day-1": undefined,
          "day-2": undefined,
          "day-3": undefined,
        }}
      />
    );

    const gradient = container.querySelector(".bg-gradient-to-l");
    expect(gradient).not.toBeNull();
    // The gradient overlay must not intercept touch/click events.
    expect(gradient!.className).toContain("pointer-events-none");
  });

  it("right-edge fade gradient sits at the right side of the rail (has right-0 class)", () => {
    const { container } = render(
      <ItineraryDayRail
        days={[
          { id: "day-1", date: "2026-06-01", sort_order: 0, options: [] },
          { id: "day-2", date: "2026-06-02", sort_order: 1, options: [] },
        ]}
        selectedOptionsByDay={{ "day-1": undefined, "day-2": undefined }}
      />
    );

    const gradient = container.querySelector(".bg-gradient-to-l");
    expect(gradient).not.toBeNull();
    expect(gradient!.className).toContain("right-0");
  });

  it("shows place count for planned days", () => {
    render(
      <ItineraryDayRail
        days={[
          {
            id: "day-1",
            date: "2026-06-01",
            sort_order: 0,
            options: [
              {
                id: "opt-1",
                option_index: 1,
                starting_city: "Paris",
                ending_city: "Paris",
                created_by: null,
                locations: [
                  {
                    id: "ol-1",
                    location_id: "loc-1",
                    sort_order: 0,
                    time_period: "morning",
                    location: {
                      id: "loc-1",
                      name: "A",
                      city: null,
                      address: null,
                      google_link: null,
                      category: null,
                      note: null,
                      working_hours: null,
                      requires_booking: null,
                      latitude: null,
                      longitude: null,
                      image_url: null,
                      user_image_url: null,
                      attribution_name: null,
                      attribution_uri: null,
                    },
                  },
                  {
                    id: "ol-2",
                    location_id: "loc-2",
                    sort_order: 1,
                    time_period: "afternoon",
                    location: {
                      id: "loc-2",
                      name: "B",
                      city: null,
                      address: null,
                      google_link: null,
                      category: null,
                      note: null,
                      working_hours: null,
                      requires_booking: null,
                      latitude: null,
                      longitude: null,
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
          },
        ]}
        selectedOptionsByDay={{
          "day-1": {
            id: "opt-1",
            option_index: 1,
            starting_city: "Paris",
            ending_city: "Paris",
            created_by: null,
            locations: [
              {
                id: "ol-1",
                location_id: "loc-1",
                sort_order: 0,
                time_period: "morning",
                location: {
                  id: "loc-1",
                  name: "A",
                  city: null,
                  address: null,
                  google_link: null,
                  category: null,
                  note: null,
                  working_hours: null,
                  requires_booking: null,
                  latitude: null,
                  longitude: null,
                  image_url: null,
                  user_image_url: null,
                  attribution_name: null,
                  attribution_uri: null,
                },
              },
              {
                id: "ol-2",
                location_id: "loc-2",
                sort_order: 1,
                time_period: "afternoon",
                location: {
                  id: "loc-2",
                  name: "B",
                  city: null,
                  address: null,
                  google_link: null,
                  category: null,
                  note: null,
                  working_hours: null,
                  requires_booking: null,
                  latitude: null,
                  longitude: null,
                  image_url: null,
                  user_image_url: null,
                  attribution_name: null,
                  attribution_uri: null,
                },
              },
            ],
            routes: [],
          },
        }}
      />
    );

    expect(screen.getByText("2 stops")).toBeInTheDocument();
  });
});
