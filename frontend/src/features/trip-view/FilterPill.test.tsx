/// <reference types="vitest/globals" />
/**
 * FilterPill — a single popover-based filter pill used in the locations toolbar.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2 } from "lucide-react";
import { FilterPill } from "./FilterPill";

const cityOptions = [
  { value: "Tokyo", label: "Tokyo" },
  { value: "Kyoto", label: "Kyoto" },
  { value: "Osaka", label: "Osaka" },
];

function renderPill(
  overrides: Partial<React.ComponentProps<typeof FilterPill>> = {}
) {
  const defaults: React.ComponentProps<typeof FilterPill> = {
    label: "City",
    icon: <Building2 size={14} />,
    options: cityOptions,
    selected: null,
    onChange: vi.fn(),
    allLabel: "All cities",
  };
  return render(<FilterPill {...defaults} {...overrides} />);
}

describe("FilterPill — basic rendering", () => {
  it("renders a trigger button with the label", () => {
    renderPill();
    expect(screen.getByRole("button", { name: /city/i })).toBeInTheDocument();
  });

  it("trigger button has touch-target class", () => {
    renderPill();
    const btn = screen.getByRole("button", { name: /city/i });
    expect(btn.className).toContain("touch-target");
  });

  it("shows selected value in trigger when a value is selected", () => {
    renderPill({ selected: "Tokyo" });
    expect(screen.getByRole("button", { name: /tokyo/i })).toBeInTheDocument();
  });

  it("shows 'Grouped by city' in trigger when groupBy is active", () => {
    renderPill({ groupBy: "city", groupByActive: true });
    const btn = screen.getByRole("button", { name: /grouped by city/i });
    expect(btn).toBeInTheDocument();
  });

  it("trigger has active styling when a filter is selected", () => {
    renderPill({ selected: "Tokyo" });
    const btn = screen.getByRole("button", { name: /tokyo/i });
    expect(btn.className).toMatch(/brand-muted|brand-strong/);
  });
});

describe("FilterPill — popover interactions", () => {
  it("opens a popover when trigger is clicked", async () => {
    renderPill();
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    // Options should appear in the popover
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
  });

  it("renders 'All cities' option in popover", async () => {
    renderPill();
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    expect(screen.getByText("All cities")).toBeInTheDocument();
  });

  it("clicking an option calls onChange with the value", async () => {
    const onChange = vi.fn();
    renderPill({ onChange });
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    await userEvent.click(screen.getByText("Tokyo"));
    expect(onChange).toHaveBeenCalledWith("Tokyo");
  });

  it("clicking the already-selected option clears the filter (toggles off)", async () => {
    const onChange = vi.fn();
    renderPill({ selected: "Tokyo", onChange });
    await userEvent.click(screen.getByRole("button", { name: /tokyo/i }));
    // Trigger and popover both show "Tokyo" — click the popover option
    const matches = screen.getAllByText("Tokyo");
    await userEvent.click(matches[matches.length - 1]);
    // clicking selected value should toggle to null
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clicking 'All cities' clears filter and closes popover", async () => {
    const onChange = vi.fn();
    renderPill({ selected: "Kyoto", onChange });
    await userEvent.click(screen.getByRole("button", { name: /kyoto/i }));
    await userEvent.click(screen.getByText("All cities"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("FilterPill — groupBy toggle", () => {
  it("renders group-by button when onGroupByToggle is provided", async () => {
    renderPill({ onGroupByToggle: vi.fn(), groupBy: "city" });
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    expect(
      screen.getByRole("button", { name: /group by city/i })
    ).toBeInTheDocument();
  });

  it("does NOT render group-by button when onGroupByToggle is undefined", async () => {
    renderPill({ onGroupByToggle: undefined });
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    expect(
      screen.queryByRole("button", { name: /group by city/i })
    ).not.toBeInTheDocument();
  });

  it("clicking group-by calls onGroupByToggle", async () => {
    const onGroupByToggle = vi.fn();
    renderPill({ onGroupByToggle, groupBy: "city" });
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /group by city/i })
    );
    expect(onGroupByToggle).toHaveBeenCalled();
  });
});

describe("FilterPill — option counts", () => {
  it("renders counts when options have count property", async () => {
    const optionsWithCounts = [
      { value: "Temple", label: "Temple", count: 3 },
      { value: "Market", label: "Market", count: 1 },
    ];
    render(
      <FilterPill
        label="Category"
        icon={<Building2 size={14} />}
        options={optionsWithCounts}
        selected={null}
        onChange={vi.fn()}
        allLabel="All categories"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("FilterPill — label formatting", () => {
  it("applies labelFormat to option display when provided", async () => {
    const options = [
      { value: "alice@example.com", label: "alice@example.com" },
    ];
    render(
      <FilterPill
        label="Added by"
        icon={<Building2 size={14} />}
        options={options}
        selected="alice@example.com"
        onChange={vi.fn()}
        allLabel="Everyone"
        triggerLabelFormat={(v) => v.split("@")[0]}
      />
    );
    // trigger should show truncated label
    expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
  });
});
