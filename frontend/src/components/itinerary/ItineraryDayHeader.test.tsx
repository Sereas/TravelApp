import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItineraryDayHeader } from "./ItineraryDayHeader";

describe("ItineraryDayHeader", () => {
  it("shows the formatted date and opens date editing", async () => {
    render(
      <ItineraryDayHeader
        day={{
          id: "day-1",
          date: "2026-06-01",
          sort_order: 0,
          options: [],
        }}
        currentOption={undefined}
        createOptionLoading={false}
        tripStartDate="2026-06-01"
        tripEndDate="2026-06-10"
        onUpdateDayDate={vi.fn()}
        onSelectOption={vi.fn()}
        onCreateAlternative={vi.fn()}
        onDeleteOption={vi.fn()}
        onSaveOptionDetails={vi.fn()}
      />
    );

    expect(screen.getByText("Mon, Jun 1")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /edit day date/i })
    );
    expect(screen.getByDisplayValue("2026-06-01")).toBeInTheDocument();
  });

  it("saves starting city changes on blur", async () => {
    const onSaveOptionDetails = vi.fn();

    render(
      <ItineraryDayHeader
        day={{
          id: "day-1",
          date: null,
          sort_order: 0,
          options: [],
        }}
        currentOption={{
          id: "opt-1",
          option_index: 1,
          starting_city: "Paris",
          ending_city: "Lyon",
          created_by: null,
          locations: [],
          routes: [],
        }}
        createOptionLoading={false}
        tripStartDate={null}
        tripEndDate={null}
        onUpdateDayDate={vi.fn()}
        onSelectOption={vi.fn()}
        onCreateAlternative={vi.fn()}
        onDeleteOption={vi.fn()}
        onSaveOptionDetails={onSaveOptionDetails}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /edit cities/i }));
    const input = screen.getByDisplayValue("Paris");
    await userEvent.clear(input);
    await userEvent.type(input, "Marseille");
    await userEvent.tab();

    expect(onSaveOptionDetails).toHaveBeenCalledWith("day-1", "opt-1", {
      starting_city: "Marseille",
    });
  });
});
