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
    expect(screen.queryByText("City pending")).not.toBeInTheDocument();
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

  it("marks empty days distinctly", () => {
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

    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Ready to plan")).toBeInTheDocument();
    expect(screen.getByText("Route details not set")).toBeInTheDocument();
  });
});
