/// <reference types="vitest/globals" />
/**
 * LocationsFilterToolbar — schedule tabs + map button + filter pills.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleLocations } from "./__fixtures__/trip-view.fixtures";
import type { Location } from "@/lib/api";
import { LocationsFilterToolbar } from "./LocationsFilterToolbar";

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof LocationsFilterToolbar>> = {}
) {
  const defaults: React.ComponentProps<typeof LocationsFilterToolbar> = {
    locations: sampleLocations,
    isReadOnly: false,
    categoryFilter: null,
    cityFilter: null,
    personFilter: null,
    groupBy: null,
    scheduleFilter: "all",
    onCategoryChange: vi.fn(),
    onCityChange: vi.fn(),
    onPersonChange: vi.fn(),
    onGroupByChange: vi.fn(),
    onScheduleFilterChange: vi.fn(),
    onMapOpen: vi.fn(),
    categoryOptions: [
      ["Temple", 1],
      ["Viewpoint", 1],
      ["Market", 1],
    ],
    totalFiltered: 3,
    scheduledCount: 1,
  };
  return render(<LocationsFilterToolbar {...defaults} {...overrides} />);
}

describe("LocationsFilterToolbar — schedule filter", () => {
  it("renders All, Scheduled, Unscheduled radio buttons", () => {
    renderToolbar();
    expect(screen.getByRole("radio", { name: /all/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /^scheduled/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /^unscheduled/i })
    ).toBeInTheDocument();
  });

  it("shows correct counts: All=3, Scheduled=1, Unscheduled=2", () => {
    renderToolbar({ totalFiltered: 3, scheduledCount: 1 });
    expect(screen.getByRole("radio", { name: /all/i })).toHaveTextContent("3");
    expect(
      screen.getByRole("radio", { name: /^scheduled/i })
    ).toHaveTextContent("1");
    expect(
      screen.getByRole("radio", { name: /unscheduled/i })
    ).toHaveTextContent("2");
  });

  it("clicking a schedule option calls onScheduleFilterChange", async () => {
    const onScheduleFilterChange = vi.fn();
    renderToolbar({ onScheduleFilterChange });
    await userEvent.click(screen.getByRole("radio", { name: /^scheduled/i }));
    expect(onScheduleFilterChange).toHaveBeenCalledWith("scheduled");
  });

  it("active option has aria-checked=true", () => {
    renderToolbar({ scheduleFilter: "unscheduled" });
    expect(screen.getByRole("radio", { name: /unscheduled/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /all/i })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("schedule radio buttons have touch-target class", () => {
    renderToolbar();
    const allBtn = screen.getByRole("radio", { name: /all/i });
    expect(allBtn.className).toContain("touch-target");
  });
});

describe("LocationsFilterToolbar — map button", () => {
  it("renders a Map button with lg:hidden class", () => {
    renderToolbar();
    const mapBtns = screen
      .getAllByRole("button", { name: /map/i })
      .filter((btn) => btn.className.includes("lg:hidden"));
    expect(mapBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking Map button calls onMapOpen", async () => {
    const onMapOpen = vi.fn();
    renderToolbar({ onMapOpen });
    const mapBtn = screen
      .getAllByRole("button", { name: /map/i })
      .find((btn) => btn.className.includes("lg:hidden"));
    await userEvent.click(mapBtn!);
    expect(onMapOpen).toHaveBeenCalled();
  });
});

describe("LocationsFilterToolbar — city filter", () => {
  it("renders City pill when locations have >= 2 distinct cities", () => {
    // sampleLocations has Tokyo + Kyoto = 2 cities
    renderToolbar();
    expect(screen.getByRole("button", { name: /city/i })).toBeInTheDocument();
  });

  it("does NOT render City pill when locations have < 2 distinct cities", () => {
    const singleCity: Location[] = sampleLocations.map((l) => ({
      ...l,
      city: "Tokyo",
    }));
    renderToolbar({ locations: singleCity });
    expect(
      screen.queryByRole("button", { name: /^city$/i })
    ).not.toBeInTheDocument();
  });

  it("City pill has touch-target class", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: /city/i }).className).toContain(
      "touch-target"
    );
  });
});

describe("LocationsFilterToolbar — category filter", () => {
  it("renders Category pill when categoryOptions has >= 2 entries", () => {
    renderToolbar();
    expect(
      screen.getByRole("button", { name: /category/i })
    ).toBeInTheDocument();
  });

  it("does NOT render Category pill when categoryOptions has < 2 entries", () => {
    renderToolbar({ categoryOptions: [["Temple", 1]] });
    expect(
      screen.queryByRole("button", { name: /^category$/i })
    ).not.toBeInTheDocument();
  });

  it("Category pill has touch-target class", () => {
    renderToolbar();
    expect(
      screen.getByRole("button", { name: /category/i }).className
    ).toContain("touch-target");
  });
});

describe("LocationsFilterToolbar — added-by filter", () => {
  it("renders Added-by pill in edit mode when >= 2 distinct emails", () => {
    // sampleLocations: alice + bob = 2 emails
    renderToolbar({ isReadOnly: false });
    expect(
      screen.getByRole("button", { name: /added by/i })
    ).toBeInTheDocument();
  });

  it("does NOT render Added-by pill in read-only mode", () => {
    renderToolbar({ isReadOnly: true });
    expect(
      screen.queryByRole("button", { name: /added by/i })
    ).not.toBeInTheDocument();
  });

  it("Added-by pill has touch-target class (edit mode)", () => {
    renderToolbar({ isReadOnly: false });
    expect(
      screen.getByRole("button", { name: /added by/i }).className
    ).toContain("touch-target");
  });
});

describe("LocationsFilterToolbar — read-only does NOT render group-by", () => {
  it("read-only: no group-by controls visible without opening popover", () => {
    renderToolbar({ isReadOnly: true });
    expect(
      screen.queryByRole("button", { name: /group by/i })
    ).not.toBeInTheDocument();
  });

  it("edit mode: group-by controls appear inside the City popover", async () => {
    renderToolbar({ isReadOnly: false });
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
    expect(
      screen.getByRole("button", { name: /group by city/i })
    ).toBeInTheDocument();
  });
});
