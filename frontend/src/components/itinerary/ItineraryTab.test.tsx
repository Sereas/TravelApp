/// <reference types="vitest/globals" />
/**
 * ItineraryTab tests — new cases for the props-split refactor (RED phase).
 *
 * After the refactor ItineraryTab's prop shape changes from:
 *   itineraryState: ItineraryState   (monolithic)
 * to:
 *   itineraryState: ReadOnlyItineraryState
 *   itineraryMutations?: ItineraryMutations   (OPTIONAL)
 *
 * These tests encode the contract:
 *   - The component must NOT crash when itineraryMutations is undefined.
 *   - Mutation affordances ("Add day", "Generate days") must NOT appear when
 *     itineraryMutations is undefined — even if readOnly context is false.
 *   - When itineraryMutations IS provided AND readOnly=false, mutation buttons
 *     ARE rendered.
 *   - The component does NOT require 20 individual handler props; it accepts
 *     the split objects.
 */
import { render, screen } from "@testing-library/react";
import { ItineraryTab } from "./ItineraryTab";
import { ReadOnlyProvider } from "@/lib/read-only-context";
import {
  sampleTrip,
  sampleTripNoDates,
  sampleLocations,
  sampleItinerary,
  emptyItinerary,
  makeReadOnlyItineraryState,
  makeItineraryMutations,
} from "@/features/trip-view/__fixtures__/trip-view.fixtures";

// ---------------------------------------------------------------------------
// Heavy children that pull in MapLibre / canvas — stub them.
// ---------------------------------------------------------------------------

vi.mock("@/components/itinerary/ItineraryDayMap", () => ({
  ItineraryDayMap: () => <div data-testid="day-map-mock" />,
}));

vi.mock("@/components/itinerary/ItineraryInspectorPanel", () => ({
  ItineraryInspectorPanel: () => <div data-testid="inspector-mock" />,
}));

vi.mock("@/components/itinerary/ItineraryRouteManager", () => ({
  ItineraryRouteManager: () => <div data-testid="route-manager-mock" />,
}));

vi.mock("@/components/itinerary/AddLocationsToOptionDialog", () => ({
  AddLocationsToOptionDialog: () => <div data-testid="add-locs-dialog-mock" />,
}));

vi.mock("@/lib/api", () => ({
  api: {
    itinerary: {
      createRoute: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderItineraryTab(
  props: Partial<React.ComponentProps<typeof ItineraryTab>> = {},
  { readOnly = false } = {}
) {
  const defaults: React.ComponentProps<typeof ItineraryTab> = {
    trip: sampleTrip,
    tripId: sampleTrip.id,
    locations: sampleLocations,
    itineraryState: makeReadOnlyItineraryState(sampleItinerary),
    itineraryMutations: undefined,
    ...props,
  };
  return render(
    <ReadOnlyProvider value={readOnly}>
      <ItineraryTab {...defaults} />
    </ReadOnlyProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ItineraryTab — props-split contract", () => {
  it("renders without crashing when itineraryMutations is undefined", () => {
    expect(() =>
      renderItineraryTab({ itineraryMutations: undefined })
    ).not.toThrow();
  });

  it("does NOT render 'Add day' button when itineraryMutations is undefined, even in non-readOnly context", () => {
    // Even though the ReadOnlyContext says false, without mutation handlers
    // the component must not render any affordances that would call them.
    renderItineraryTab(
      {
        itineraryMutations: undefined,
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      },
      { readOnly: false }
    );
    expect(
      screen.queryByRole("button", { name: /add day/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT render 'Generate days' button when itineraryMutations is undefined", () => {
    renderItineraryTab(
      {
        itineraryMutations: undefined,
        trip: sampleTrip, // has start_date + end_date → would show "generate"
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      },
      { readOnly: false }
    );
    expect(
      screen.queryByRole("button", { name: /generate/i })
    ).not.toBeInTheDocument();
  });

  it("renders 'Add day' button when itineraryMutations is provided AND not readOnly (no dates trip)", () => {
    const mutations = makeItineraryMutations();
    renderItineraryTab(
      {
        trip: sampleTripNoDates, // no dates → "Add day" variant, not "Generate"
        itineraryMutations: mutations,
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      },
      { readOnly: false }
    );
    expect(
      screen.getByRole("button", { name: /add day/i })
    ).toBeInTheDocument();
  });

  it("renders 'Generate days from dates' button when itineraryMutations provided AND trip has dates", () => {
    const mutations = makeItineraryMutations();
    renderItineraryTab(
      {
        trip: sampleTrip, // has start_date + end_date
        itineraryMutations: mutations,
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      },
      { readOnly: false }
    );
    expect(
      screen.getByRole("button", { name: /generate days/i })
    ).toBeInTheDocument();
  });

  it("does NOT render mutation buttons in readOnly mode even when itineraryMutations is provided", () => {
    const mutations = makeItineraryMutations();
    renderItineraryTab(
      {
        itineraryMutations: mutations,
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      },
      { readOnly: true }
    );
    expect(
      screen.queryByRole("button", { name: /add day/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate/i })
    ).not.toBeInTheDocument();
  });

  it("accepts the split prop objects without TypeScript errors (runtime contract)", () => {
    // This test validates that the component's prop interface accepts the two
    // separate objects instead of the old monolithic itineraryState.
    // If ItineraryTab still requires the old monolithic shape, TypeScript will
    // catch it at build time — this test catches it at runtime.
    const mutations = makeItineraryMutations();
    const state = makeReadOnlyItineraryState(sampleItinerary);

    expect(() =>
      renderItineraryTab({
        itineraryState: state,
        itineraryMutations: mutations,
      })
    ).not.toThrow();
  });

  it("renders the empty-itinerary message from readOnly context when no days and readOnly=true", () => {
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(emptyItinerary) },
      { readOnly: true }
    );
    expect(
      screen.getByText(/no itinerary days planned yet/i)
    ).toBeInTheDocument();
  });

  it("renders the day list when itinerary has days", () => {
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // The day rail should be present. The ItineraryDayRail renders each day
    // using some accessible text derived from the date or sort order.
    // We assert the tabpanel is present (not loading or error).
    const panel = screen.getByRole("tabpanel", {
      name: /itinerary/i,
    });
    expect(panel).toBeInTheDocument();
  });
});
