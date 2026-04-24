/// <reference types="vitest/globals" />
/**
 * ItineraryDayCard tests — new cases for the optional-handler refactor (RED phase).
 *
 * After the refactor all handler props on ItineraryDayCard become OPTIONAL
 * (i.e. `onUpdateDayDate?: ...`).  When a handler is undefined the component
 * must simply not render the affordance that would call it — no crash, no
 * TypeError.
 *
 * These tests encode the "optional props cascade" contract required before the
 * implementation splits ItineraryDayCard's required handlers into optional ones.
 */
import { render, screen } from "@testing-library/react";
import { ItineraryDayCard } from "./ItineraryDayCard";
import { ReadOnlyProvider } from "@/lib/read-only-context";
import type { ItineraryDayCardProps } from "./ItineraryDayCard";

// ---------------------------------------------------------------------------
// Stubs for heavy children
// ---------------------------------------------------------------------------

vi.mock("@/components/itinerary/ItineraryDayMap", () => ({
  ItineraryDayMap: () => <div data-testid="day-map-mock" />,
}));

vi.mock("@/components/itinerary/ItineraryRouteManager", () => ({
  ItineraryRouteManager: () => <div data-testid="route-manager-mock" />,
  RouteBuilderToolbar: () => null,
}));

// Render just the trigger so "Add locations" button assertions can see it.
vi.mock("@/components/itinerary/AddLocationsToOptionDialog", () => ({
  AddLocationsToOptionDialog: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="add-locs-dialog-mock">{trigger}</div>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    itinerary: {
      createRoute: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const sampleDay = {
  id: "day-1",
  date: "2026-09-01",
  sort_order: 0,
  options: [
    {
      id: "opt-1",
      option_index: 1,
      starting_city: "Tokyo",
      ending_city: "Tokyo",
      created_by: null,
      locations: [],
      routes: [],
    },
  ],
};

const sampleOption = sampleDay.options[0];

/** Build props with all optional handlers explicitly undefined. */
function makeMinimalProps(
  overrides: Partial<ItineraryDayCardProps> = {}
): ItineraryDayCardProps {
  return {
    day: sampleDay,
    tripId: "trip-abc",
    currentOption: sampleOption,
    tripLocations: [],
    createOptionLoading: false,
    tripStartDate: null,
    tripEndDate: null,
    // All handler props undefined — this is the contract being tested.
    onUpdateDayDate:
      undefined as unknown as ItineraryDayCardProps["onUpdateDayDate"],
    onSelectOption:
      undefined as unknown as ItineraryDayCardProps["onSelectOption"],
    onCreateAlternative:
      undefined as unknown as ItineraryDayCardProps["onCreateAlternative"],
    onDeleteOption:
      undefined as unknown as ItineraryDayCardProps["onDeleteOption"],
    onSaveOptionDetails:
      undefined as unknown as ItineraryDayCardProps["onSaveOptionDetails"],
    onAddLocations:
      undefined as unknown as ItineraryDayCardProps["onAddLocations"],
    onRemoveLocation:
      undefined as unknown as ItineraryDayCardProps["onRemoveLocation"],
    onUpdateTimePeriod:
      undefined as unknown as ItineraryDayCardProps["onUpdateTimePeriod"],
    onReorderLocations:
      undefined as unknown as ItineraryDayCardProps["onReorderLocations"],
    onDeleteRoute:
      undefined as unknown as ItineraryDayCardProps["onDeleteRoute"],
    onRouteCreated:
      undefined as unknown as ItineraryDayCardProps["onRouteCreated"],
    onRetryRouteMetrics:
      undefined as unknown as ItineraryDayCardProps["onRetryRouteMetrics"],
    onInspectLocation:
      undefined as unknown as ItineraryDayCardProps["onInspectLocation"],
    calculatingRouteId: null,
    routeMetricsError: {},
    ...overrides,
  };
}

function renderCard(props: ItineraryDayCardProps, { readOnly = false } = {}) {
  return render(
    <ReadOnlyProvider value={readOnly}>
      <ItineraryDayCard {...props} />
    </ReadOnlyProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ItineraryDayCard — optional handler props contract", () => {
  it("renders without crashing when ALL handler props are undefined (read-only context)", () => {
    expect(() =>
      renderCard(makeMinimalProps(), { readOnly: true })
    ).not.toThrow();
  });

  it("renders without crashing when ALL handler props are undefined (edit context)", () => {
    // Even in edit context, undefined handlers must not cause a crash.
    // The component should simply omit the affordances.
    expect(() =>
      renderCard(makeMinimalProps(), { readOnly: false })
    ).not.toThrow();
  });

  it("renders the day date when all handlers are undefined", () => {
    renderCard(makeMinimalProps(), { readOnly: true });
    // The header should still show the day label / date.
    expect(screen.getByText(/sep|day/i)).toBeInTheDocument();
  });

  it("does NOT render the plan switcher trigger when onCreateAlternative is undefined", () => {
    renderCard(
      makeMinimalProps({
        onCreateAlternative:
          undefined as unknown as ItineraryDayCardProps["onCreateAlternative"],
      }),
      {
        readOnly: false,
      }
    );
    // The plan switcher is only rendered when a create-alternative handler
    // exists; without it, the "Choose plan" trigger button is absent.
    expect(screen.queryByTitle(/choose plan/i)).not.toBeInTheDocument();
  });

  it("does NOT render 'Add locations' button when onAddLocations is undefined", () => {
    renderCard(
      makeMinimalProps({
        onAddLocations:
          undefined as unknown as ItineraryDayCardProps["onAddLocations"],
      }),
      {
        readOnly: false,
      }
    );
    expect(
      screen.queryByRole("button", { name: /add location/i })
    ).not.toBeInTheDocument();
  });

  it("renders 'Add locations' button when onAddLocations IS provided and not readOnly", () => {
    renderCard(makeMinimalProps({ onAddLocations: vi.fn() }), {
      readOnly: false,
    });
    // In edit mode with a handler, the button should appear.
    expect(
      screen.getByRole("button", { name: /add location/i })
    ).toBeInTheDocument();
  });

  it("renders the plan switcher trigger when onCreateAlternative IS provided and not readOnly", () => {
    renderCard(makeMinimalProps({ onCreateAlternative: vi.fn() }), {
      readOnly: false,
    });
    expect(screen.getByTitle(/choose plan/i)).toBeInTheDocument();
  });

  it("does NOT render edit affordances in read-only mode even with handlers provided", () => {
    // This is the belt-and-suspenders test: useReadOnly() already gates these,
    // so readOnly=true must suppress them even if handlers are present.
    renderCard(
      makeMinimalProps({
        onCreateAlternative: vi.fn(),
        onAddLocations: vi.fn(),
        onDeleteOption: vi.fn(),
      }),
      { readOnly: true }
    );
    expect(screen.queryByTitle(/choose plan/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add location/i })
    ).not.toBeInTheDocument();
  });
});
