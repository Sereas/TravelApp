/// <reference types="vitest/globals" />
/**
 * LocationsGrid — filtered/grouped locations grid.
 */
import { render, screen } from "@testing-library/react";
import {
  sampleLocations,
  emptyLocations,
} from "./__fixtures__/trip-view.fixtures";
import type { Location } from "@/lib/api";
import { LocationsGrid } from "./LocationsGrid";

// Stub out LocationCard — it mounts a lot of UI we don't want to test here.
vi.mock("@/components/locations/LocationCard", () => ({
  LocationCard: ({ name }: { name: string }) => (
    <div data-testid="location-card">{name}</div>
  ),
}));

function renderGrid(
  overrides: Partial<React.ComponentProps<typeof LocationsGrid>> = {}
) {
  const defaults: React.ComponentProps<typeof LocationsGrid> = {
    filteredLocations: sampleLocations,
    groupBy: null,
    groupedLocations: null,
    locationNameSearch: "",
    categoryFilter: null,
    cityFilter: null,
    personFilter: null,
    renderLocationCard: (loc: Location) => (
      <div key={loc.id} data-testid="location-card">
        {loc.name}
      </div>
    ),
  };
  return render(<LocationsGrid {...defaults} {...overrides} />);
}

describe("LocationsGrid — ungrouped rendering", () => {
  it("renders all filtered locations as cards", () => {
    renderGrid();
    const cards = screen.getAllByTestId("location-card");
    expect(cards).toHaveLength(sampleLocations.length);
  });

  it("renders location names", () => {
    renderGrid();
    expect(screen.getByText("Senso-ji Temple")).toBeInTheDocument();
    expect(screen.getByText("Shibuya Crossing")).toBeInTheDocument();
    expect(screen.getByText("Nishiki Market")).toBeInTheDocument();
  });

  it("grid wrapper has sm:grid-cols-2 class", () => {
    const { container } = renderGrid();
    const grid = container.querySelector(".sm\\:grid-cols-2");
    expect(grid).not.toBeNull();
  });

  it("grid wrapper does NOT have md:grid-cols-2 class", () => {
    const { container } = renderGrid();
    const mdGrid = container.querySelector(".md\\:grid-cols-2");
    expect(mdGrid).toBeNull();
  });
});

describe("LocationsGrid — grouped rendering", () => {
  const grouped: [string, Location[]][] = [
    ["Tokyo", [sampleLocations[0], sampleLocations[1]]],
    ["Kyoto", [sampleLocations[2]]],
  ];

  it("renders group headers when groupedLocations is provided", () => {
    renderGrid({ groupBy: "city", groupedLocations: grouped });
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
  });

  it("renders location count per group", () => {
    renderGrid({ groupBy: "city", groupedLocations: grouped });
    expect(screen.getByText(/2 locations/i)).toBeInTheDocument();
    expect(screen.getByText(/1 location/i)).toBeInTheDocument();
  });

  it("renders all cards within grouped layout", () => {
    renderGrid({ groupBy: "city", groupedLocations: grouped });
    const cards = screen.getAllByTestId("location-card");
    expect(cards).toHaveLength(3);
  });
});

describe("LocationsGrid — empty/filter states", () => {
  it("renders 'no match' message when filteredLocations is empty due to active filter", () => {
    renderGrid({
      filteredLocations: [],
      categoryFilter: "Temple",
    });
    expect(
      screen.getByText(/no locations match the current filters/i)
    ).toBeInTheDocument();
  });

  it("renders 'no match' message when search produces empty results", () => {
    renderGrid({
      filteredLocations: [],
      locationNameSearch: "xyz",
    });
    expect(
      screen.getByText(/no locations match the current filters/i)
    ).toBeInTheDocument();
  });

  it("renders nothing special (no cards, no message) when filteredLocations is empty and no active filter", () => {
    const { container } = renderGrid({
      filteredLocations: [],
      categoryFilter: null,
      cityFilter: null,
      personFilter: null,
      locationNameSearch: "",
    });
    expect(screen.queryByTestId("location-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/no locations match/i)).not.toBeInTheDocument();
  });
});
