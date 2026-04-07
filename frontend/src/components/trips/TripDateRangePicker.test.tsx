/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDateRangePicker } from "./TripDateRangePicker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(
  props?: Partial<React.ComponentProps<typeof TripDateRangePicker>>,
) {
  const onDateRangeChange = vi.fn();
  render(
    <TripDateRangePicker
      startDate={props?.startDate ?? null}
      endDate={props?.endDate ?? null}
      onDateRangeChange={props?.onDateRangeChange ?? onDateRangeChange}
    />,
  );
  return { onDateRangeChange };
}

/** Match a day button by rdp v9 aria-label: "<Weekday>, June 10th, 2026[, selected]" */
function getDayButton(monthName: string, day: number, year: number) {
  const pattern = new RegExp(`${monthName} ${day}\\w*, ${year}`, "i");
  return screen.getByRole("button", { name: pattern });
}

function expectCalendarOpen() {
  expect(screen.getAllByRole("grid").length).toBeGreaterThanOrEqual(1);
}

function expectCalendarClosed() {
  expect(screen.queryAllByRole("grid")).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// 1. Trigger button display
// ---------------------------------------------------------------------------

describe("TripDateRangePicker — trigger button", () => {
  it("renders a button with a calendar icon aria label", () => {
    setup();
    const btn = screen.getByRole("button", { name: /date range/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows 'Set dates' placeholder when both dates are null", () => {
    setup({ startDate: null, endDate: null });
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toHaveTextContent(/set dates/i);
  });

  it("shows formatted range when both dates are provided", () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    const btn = screen.getByRole("button", { name: /date range/i });
    expect(btn).toHaveTextContent(/Jun 1/);
    expect(btn).toHaveTextContent(/Jun 15/);
    expect(btn).toHaveTextContent(/2026/);
  });

  it("shows only the start date when end date is null", () => {
    setup({ startDate: "2026-08-10", endDate: null });
    const btn = screen.getByRole("button", { name: /date range/i });
    expect(btn).toHaveTextContent(/Aug 10/);
    expect(btn.textContent).not.toMatch(/—.+—/);
  });

  it("shows only the end date when start date is null", () => {
    setup({ startDate: null, endDate: "2026-09-20" });
    const btn = screen.getByRole("button", { name: /date range/i });
    expect(btn).toHaveTextContent(/Sep 20/);
  });
});

// ---------------------------------------------------------------------------
// 2. Popover open / close
// ---------------------------------------------------------------------------

describe("TripDateRangePicker — popover behaviour", () => {
  it("calendar is not visible before the trigger is clicked", () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    expectCalendarClosed();
  });

  it("opens the calendar popover when the trigger button is clicked", async () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));
    expectCalendarOpen();
  });

  it("shows two calendar months simultaneously", async () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));
    const grids = screen.getAllByRole("grid");
    expect(grids).toHaveLength(2);
  });

  it("closes the popover when Escape is pressed", async () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));
    expectCalendarOpen();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expectCalendarClosed());
  });

  it("does NOT call onDateRangeChange when Escape closes the popover", async () => {
    const { onDateRangeChange } = setup({
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));
    await userEvent.keyboard("{Escape}");

    expect(onDateRangeChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Range selection (anchor to June via startDate so month is deterministic)
// ---------------------------------------------------------------------------

describe("TripDateRangePicker — range selection", () => {
  it("calls onDateRangeChange with ISO strings after a complete range is selected", async () => {
    const { onDateRangeChange } = setup({
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    await userEvent.click(getDayButton("June", 10, 2026));
    await userEvent.click(getDayButton("June", 20, 2026));

    await waitFor(() => {
      expect(onDateRangeChange).toHaveBeenCalledWith("2026-06-10", "2026-06-20");
    });
  });

  it("does not call onDateRangeChange after selecting only the start date", async () => {
    const { onDateRangeChange } = setup({
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    await userEvent.click(getDayButton("June", 10, 2026));

    expectCalendarOpen();
    expect(onDateRangeChange).not.toHaveBeenCalled();
  });

  it("auto-closes the popover after a complete range is selected", async () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    await userEvent.click(getDayButton("June", 10, 2026));
    await userEvent.click(getDayButton("June", 20, 2026));

    await waitFor(() => expectCalendarClosed());
  });

  it("resets to a fresh range when clicking inside an existing complete range", async () => {
    // This tests the hadComplete && gotComplete guard in handleSelect:
    // rdp adjusts (not resets) when clicking inside a selected range.
    // The component must detect this and force a single-day reset.
    const { onDateRangeChange } = setup({
      startDate: "2026-06-01",
      endDate: "2026-06-15",
    });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    // First click inside the existing range — should NOT save
    await userEvent.click(getDayButton("June", 10, 2026));
    expect(onDateRangeChange).not.toHaveBeenCalled();
    expectCalendarOpen();

    // Second click completes the new range with the correct start (June 10, not June 1)
    await userEvent.click(getDayButton("June", 25, 2026));
    await waitFor(() => {
      expect(onDateRangeChange).toHaveBeenCalledWith("2026-06-10", "2026-06-25");
    });
  });

  it("swaps start/end if user selects end before start", async () => {
    const { onDateRangeChange } = setup({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    // Click later date first, then earlier
    await userEvent.click(getDayButton("June", 20, 2026));
    await userEvent.click(getDayButton("June", 10, 2026));

    await waitFor(() => {
      const [start, end] = onDateRangeChange.mock.calls[0] as [string, string];
      expect(start <= end).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Pre-selected range shown in calendar
// rdp v9: aria-selected is on <td> gridcell, button label appends ", selected"
// ---------------------------------------------------------------------------

describe("TripDateRangePicker — pre-selected state", () => {
  it("marks the current start date as selected when popover opens", async () => {
    setup({ startDate: "2026-06-05", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    // rdp v9 appends ", selected" to aria-label for selected days
    const june5 = screen.getByRole("button", {
      name: /june 5\w*, 2026, selected/i,
    });
    expect(june5).toBeInTheDocument();
  });

  it("marks the current end date as selected when popover opens", async () => {
    setup({ startDate: "2026-06-05", endDate: "2026-06-15" });
    await userEvent.click(screen.getByRole("button", { name: /date range/i }));

    const june15 = screen.getByRole("button", {
      name: /june 15\w*, 2026, selected/i,
    });
    expect(june15).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe("TripDateRangePicker — edge cases", () => {
  it("renders without throwing when both dates are null", () => {
    expect(() => setup({ startDate: null, endDate: null })).not.toThrow();
  });

  it("renders without throwing when dates are empty strings", () => {
    expect(() => setup({ startDate: "", endDate: "" })).not.toThrow();
  });

  it("clicking the trigger a second time closes the popover (toggle)", async () => {
    setup({ startDate: "2026-06-01", endDate: "2026-06-15" });
    const btn = screen.getByRole("button", { name: /date range/i });

    await userEvent.click(btn);
    expectCalendarOpen();

    await userEvent.click(btn);
    await waitFor(() => expectCalendarClosed());
  });

  it("formats dates using the project locale (en-US short month)", () => {
    setup({ startDate: "2026-01-01", endDate: "2026-12-31" });
    const btn = screen.getByRole("button", { name: /date range/i });
    expect(btn).toHaveTextContent(/Jan/);
    expect(btn).toHaveTextContent(/Dec/);
  });
});
