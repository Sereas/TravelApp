/// <reference types="vitest/globals" />
import { render, screen, waitFor, within } from "@testing-library/react";
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
    onCreateAlternative: vi.fn().mockResolvedValue("opt-3"),
    onDeleteOption: vi.fn(),
    onSaveOptionDetails: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<ItineraryPlanSwitcher {...props} />),
    props,
  };
}

async function openPlanMenu() {
  const trigger = screen.getByRole("button", { name: /^main plan$/i });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(trigger);
  }
}

describe("ItineraryPlanSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows current plan on the dropdown trigger", () => {
    renderSwitcher();
    expect(
      screen.getByRole("button", { name: /^main plan$/i })
    ).toBeInTheDocument();
  });

  it("lists all plans in the open menu", async () => {
    renderSwitcher();
    await openPlanMenu();
    const list = screen.getByRole("listbox", { name: /plans for this day/i });
    expect(
      within(list).getByRole("option", { name: /main plan/i })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("option", { name: /rainy plan/i })
    ).toBeInTheDocument();
  });

  it("selects another plan from the menu", async () => {
    const { props } = renderSwitcher();
    await openPlanMenu();
    await userEvent.click(screen.getByRole("option", { name: /rainy plan/i }));
    expect(props.onSelectOption).toHaveBeenCalledWith("day-1", "opt-2");
  });

  it("creates a new plan with name and auto-selects it", async () => {
    const { props } = renderSwitcher();
    await openPlanMenu();
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/new plan name/i),
      "Food plan"
    );
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(props.onCreateAlternative).toHaveBeenCalledWith(
      "day-1",
      "Food plan"
    );

    await waitFor(() => {
      expect(props.onSelectOption).toHaveBeenCalledWith("day-1", "opt-3");
    });
  });

  it("creates a plan without a name when left empty", async () => {
    const { props } = renderSwitcher();
    await openPlanMenu();
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(props.onCreateAlternative).toHaveBeenCalledWith("day-1", undefined);
  });

  it("creates a new plan when pressing Enter in the name field", async () => {
    const { props } = renderSwitcher();
    await openPlanMenu();
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/new plan name/i),
      "Backup{enter}"
    );

    expect(props.onCreateAlternative).toHaveBeenCalledWith("day-1", "Backup");
    await waitFor(() => {
      expect(props.onSelectOption).toHaveBeenCalledWith("day-1", "opt-3");
    });
  });

  it("cancels adding a plan with escape or cancel button", async () => {
    const { props } = renderSwitcher();
    await openPlanMenu();
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    expect(screen.getByPlaceholderText(/new plan name/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByPlaceholderText(/new plan name/i)
    ).not.toBeInTheDocument();
    expect(props.onCreateAlternative).not.toHaveBeenCalled();

    await openPlanMenu();
    await userEvent.click(screen.getByRole("button", { name: /add plan/i }));
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByPlaceholderText(/new plan name/i)
    ).not.toBeInTheDocument();
  });

  it("opens plan settings for rename and delete", async () => {
    const singleDay = {
      ...day,
      options: [day.options[0]],
    };
    const { props } = renderSwitcher({ day: singleDay });

    await userEvent.click(
      screen.getByRole("button", { name: /plan settings: main plan/i })
    );

    expect(screen.getByRole("button", { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(props.onSelectOption).not.toHaveBeenCalled();
  });

  it("renames the current plan from settings", async () => {
    const { props } = renderSwitcher({
      currentOption: day.options[1],
    });

    await userEvent.click(
      screen.getByRole("button", { name: /plan settings: rainy plan/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByDisplayValue("Rainy plan");
    await userEvent.clear(input);
    await userEvent.type(input, "Transit backup");
    await userEvent.keyboard("{Enter}");

    expect(props.onSaveOptionDetails).toHaveBeenCalledWith("day-1", "opt-2", {
      created_by: "Transit backup",
    });
  });

  it("deletes a plan after confirmation", async () => {
    const { props } = renderSwitcher({
      currentOption: day.options[1],
    });

    await userEvent.click(
      screen.getByRole("button", { name: /plan settings: rainy plan/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i })
    );

    await waitFor(() => {
      expect(props.onDeleteOption).toHaveBeenCalledWith("day-1", "opt-2");
    });
  });
});
