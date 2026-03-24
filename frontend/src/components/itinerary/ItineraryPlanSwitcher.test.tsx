/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItineraryPlanSwitcher } from "./ItineraryPlanSwitcher";

const day = {
  id: "day-1",
  date: "2026-06-01",
  sort_order: 0,
  created_at: null,
  options: [
    {
      id: "opt-1",
      option_index: 1,
      starting_city: null,
      ending_city: null,
      created_by: null,
      created_at: null,
      locations: [],
      routes: [],
    },
    {
      id: "opt-2",
      option_index: 2,
      starting_city: null,
      ending_city: null,
      created_by: "Rainy plan",
      created_at: null,
      locations: [],
      routes: [],
    },
  ],
};

function renderSwitcher(
  overrides: Partial<React.ComponentProps<typeof ItineraryPlanSwitcher>> = {}
) {
  const props = {
    day,
    currentOption: day.options[0],
    createOptionLoading: false,
    onSelectOption: vi.fn(),
    onCreateAlternative: vi.fn(),
    onDeleteOption: vi.fn(),
    onSaveOptionDetails: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<ItineraryPlanSwitcher {...props} />),
    props,
  };
}

describe("ItineraryPlanSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects another plan from the dropdown", async () => {
    const { props } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: /switch day plan/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /rainy plan/i }));

    expect(props.onSelectOption).toHaveBeenCalledWith("day-1", "opt-2");
  });

  it("creates a new plan and saves its name once the new option appears", async () => {
    const onCreateAlternative = vi.fn();
    const onSaveOptionDetails = vi.fn();
    const onSelectOption = vi.fn();
    const { rerender } = render(
      <ItineraryPlanSwitcher
        day={day}
        currentOption={day.options[0]}
        createOptionLoading={false}
        onSelectOption={onSelectOption}
        onCreateAlternative={onCreateAlternative}
        onDeleteOption={vi.fn()}
        onSaveOptionDetails={onSaveOptionDetails}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /switch day plan/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/plan name/i),
      "Food plan"
    );
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onCreateAlternative).toHaveBeenCalledWith("day-1");

    rerender(
      <ItineraryPlanSwitcher
        day={{
          ...day,
          options: [
            ...day.options,
            {
              id: "opt-3",
              option_index: 3,
              starting_city: null,
              ending_city: null,
              created_by: null,
              created_at: null,
              locations: [],
              routes: [],
            },
          ],
        }}
        currentOption={day.options[0]}
        createOptionLoading={false}
        onSelectOption={onSelectOption}
        onCreateAlternative={onCreateAlternative}
        onDeleteOption={vi.fn()}
        onSaveOptionDetails={onSaveOptionDetails}
      />
    );

    await waitFor(() => {
      expect(onSaveOptionDetails).toHaveBeenCalledWith("day-1", "opt-3", {
        created_by: "Food plan",
      });
    });
    expect(onSelectOption).toHaveBeenCalledWith("day-1", "opt-3");
  });

  it("renames an existing plan on blur", async () => {
    const { props } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: /switch day plan/i })
    );
    await userEvent.click(screen.getAllByTitle(/rename/i)[1]);
    const input = screen.getByDisplayValue("Rainy plan");
    await userEvent.clear(input);
    await userEvent.type(input, "Transit backup");
    await userEvent.tab();

    expect(props.onSaveOptionDetails).toHaveBeenCalledWith("day-1", "opt-2", {
      created_by: "Transit backup",
    });
  });

  it("deletes a non-main plan after confirmation", async () => {
    const { props } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: /switch day plan/i })
    );
    await userEvent.click(screen.getByTitle(/delete plan/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(props.onDeleteOption).toHaveBeenCalledWith("day-1", "opt-2");
    });
  });
});
