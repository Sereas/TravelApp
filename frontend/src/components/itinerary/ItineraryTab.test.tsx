/// <reference types="vitest/globals" />
/**
 * ItineraryTab tests — props-split contract (Phase 1) + Phase 4 mobile layout.
 *
 * Phase 1 contracts:
 *   - The component must NOT crash when itineraryMutations is undefined.
 *   - Mutation affordances ("Add day", "Generate days") must NOT appear when
 *     itineraryMutations is undefined — even if readOnly context is false.
 *   - When itineraryMutations IS provided AND readOnly=false, mutation buttons
 *     ARE rendered.
 *
 * Phase 4 contracts (mobile itinerary layout):
 *   - Grid breakpoint is `lg:` not `xl:` for the sidebar column.
 *   - ItineraryInspectorPanel and UnscheduledLocationsPanel render BOTH in a
 *     `lg:hidden` mobile inline wrapper AND in a `hidden lg:flex` desktop
 *     sidebar wrapper (dual-render pattern).
 *   - A mobile Map pill button with `lg:hidden` class opens a Sheet (dialog)
 *     containing the day map.
 *   - The mobile Map button is absent when the itinerary has no days.
 *   - The mobile Map button is visible in both edit and read-only modes.
 *   - UnscheduledLocationsPanel respects the `!readOnly && itineraryMutations`
 *     gate in BOTH mobile and desktop render trees.
 *   - The desktop SidebarMap expand Dialog remains functional (not broken).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@/components/itinerary/UnscheduledLocationsPanel", () => ({
  UnscheduledLocationsPanel: () => <div data-testid="unscheduled-mock" />,
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

// ===========================================================================
// Phase 4 — Mobile itinerary layout (lg: breakpoint, dual-render, Map sheet)
// ===========================================================================

describe("ItineraryTab — Phase 4 mobile layout contracts", () => {
  // -------------------------------------------------------------------------
  // Grid breakpoint regression guards
  // -------------------------------------------------------------------------

  it("itinerary grid uses lg: breakpoint (NOT xl:) for the sidebar column", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // The outer grid wrapper must carry an lg: breakpoint class for the
    // two-column layout, not the old xl: class.
    const lgGridEl = container.querySelector('[class*="lg:grid-cols"]');
    expect(lgGridEl).toBeInTheDocument();
  });

  it("itinerary grid does NOT use xl:grid-cols- class (xl: regression guard)", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // xl:grid-cols-* was the old breakpoint — must not appear after Phase 4.
    const xlGridEl = container.querySelector('[class*="xl:grid-cols"]');
    expect(xlGridEl).not.toBeInTheDocument();
  });

  it("itinerary right column sticky wrapper does NOT have xl:sticky class (regression guard)", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // Pre-Phase-4 the sticky wrapper used xl:sticky xl:top-[6.75rem] xl:self-start.
    // After Phase 4 these must be lg: prefixed. Assert xl:sticky is gone.
    const allElements = container.querySelectorAll("*");
    const hasXlSticky = Array.from(allElements).some((el) =>
      el.className.toString().includes("xl:sticky")
    );
    expect(hasXlSticky).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Mobile inline layout — ItineraryInspectorPanel
  // -------------------------------------------------------------------------

  it("renders ItineraryInspectorPanel inside an lg:hidden wrapper (mobile inline)", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // Find all inspector mocks in the DOM.
    const allInspectors = screen.getAllByTestId("inspector-mock");
    // At least one must be inside a wrapper that has lg:hidden in its classList.
    const hasMobileInspector = allInspectors.some((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== container) {
        if (node.className.toString().includes("lg:hidden")) return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(hasMobileInspector).toBe(true);
  });

  it("renders ItineraryInspectorPanel inside a hidden lg:block/flex wrapper (desktop sticky)", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    const allInspectors = screen.getAllByTestId("inspector-mock");
    // At least one must be inside a wrapper that contains both "hidden" and "lg:"
    // (i.e. hidden lg:block or hidden lg:flex).
    const hasDesktopInspector = allInspectors.some((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== container) {
        const cls = node.className.toString();
        if (cls.includes("hidden") && /lg:(block|flex|grid)/.test(cls))
          return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(hasDesktopInspector).toBe(true);
  });

  it("both mobile and desktop ItineraryInspectorPanel instances are in the DOM simultaneously (dual-render)", () => {
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // Dual-render means both a mobile (lg:hidden) copy and a desktop (hidden lg:*)
    // copy exist at the same time. There must be at least 2 inspector-mock nodes.
    const inspectors = screen.getAllByTestId("inspector-mock");
    expect(inspectors.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Mobile inline layout — UnscheduledLocationsPanel gate
  // -------------------------------------------------------------------------

  it("renders UnscheduledLocationsPanel inside an lg:hidden wrapper in edit mode (mobile inline)", () => {
    const mutations = makeItineraryMutations();
    const { container } = renderItineraryTab(
      {
        itineraryState: makeReadOnlyItineraryState(sampleItinerary),
        itineraryMutations: mutations,
      },
      { readOnly: false }
    );
    const allUnscheduled = screen.getAllByTestId("unscheduled-mock");
    const hasMobileUnscheduled = allUnscheduled.some((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== container) {
        if (node.className.toString().includes("lg:hidden")) return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(hasMobileUnscheduled).toBe(true);
  });

  it("mobile UnscheduledLocationsPanel is NOT rendered in read-only mode", () => {
    renderItineraryTab(
      {
        itineraryState: makeReadOnlyItineraryState(sampleItinerary),
        itineraryMutations: undefined,
      },
      { readOnly: true }
    );
    expect(screen.queryByTestId("unscheduled-mock")).not.toBeInTheDocument();
  });

  it("renders UnscheduledLocationsPanel inside a hidden lg:block/flex wrapper in edit mode (desktop sticky)", () => {
    const mutations = makeItineraryMutations();
    const { container } = renderItineraryTab(
      {
        itineraryState: makeReadOnlyItineraryState(sampleItinerary),
        itineraryMutations: mutations,
      },
      { readOnly: false }
    );
    const allUnscheduled = screen.getAllByTestId("unscheduled-mock");
    const hasDesktopUnscheduled = allUnscheduled.some((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== container) {
        const cls = node.className.toString();
        if (cls.includes("hidden") && /lg:(block|flex|grid)/.test(cls))
          return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(hasDesktopUnscheduled).toBe(true);
  });

  it("desktop UnscheduledLocationsPanel is NOT rendered in read-only mode", () => {
    renderItineraryTab(
      {
        itineraryState: makeReadOnlyItineraryState(sampleItinerary),
        itineraryMutations: undefined,
      },
      { readOnly: true }
    );
    expect(screen.queryByTestId("unscheduled-mock")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Mobile Map pill button
  // -------------------------------------------------------------------------

  it("renders a mobile-only Map pill button with lg:hidden class when itinerary has days", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // The mobile Map pill button uses name "Map" (exact). The existing SidebarMap
    // expand button uses aria-label="Expand map" — the regex /^map$/i won't match
    // that, so we correctly isolate the mobile pill.
    const mapBtn = screen.getByRole("button", { name: /^map$/i });
    expect(mapBtn).toBeInTheDocument();

    // Verify it lives inside or is itself an lg:hidden element.
    let node: HTMLElement | null = mapBtn;
    let hasLgHidden = false;
    while (node && node !== container) {
      if (node.className.toString().includes("lg:hidden")) {
        hasLgHidden = true;
        break;
      }
      node = node.parentElement;
    }
    expect(hasLgHidden).toBe(true);
  });

  it("clicking the mobile Map button opens a role=dialog", async () => {
    const user = userEvent.setup();
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // Target the mobile Map pill specifically (not the SidebarMap "Expand map" button).
    const mapBtn = screen.getByRole("button", { name: /^map$/i });
    await user.click(mapBtn);
    // A Sheet (Radix Dialog) should open.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Map button is NOT rendered when itinerary has no days", () => {
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(emptyItinerary) },
      { readOnly: true }
    );
    // No days → the mobile Map pill must not exist (nothing to map).
    // Use /^map$/i to avoid matching "Expand map" if SidebarMap somehow rendered.
    expect(
      screen.queryByRole("button", { name: /^map$/i })
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Edit mode / readOnly regression for the Map button
  // -------------------------------------------------------------------------

  it("mobile Map button is visible in read-only mode (map is reference-only)", () => {
    renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // The mobile Map pill must appear regardless of readOnly mode.
    expect(screen.getByRole("button", { name: /^map$/i })).toBeInTheDocument();
  });

  it("mobile Map button is visible in edit mode", () => {
    const mutations = makeItineraryMutations();
    renderItineraryTab(
      {
        itineraryState: makeReadOnlyItineraryState(sampleItinerary),
        itineraryMutations: mutations,
      },
      { readOnly: false }
    );
    expect(screen.getByRole("button", { name: /^map$/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Desktop SidebarMap regression — expand Dialog must still work
  // -------------------------------------------------------------------------

  it("desktop SidebarMap compact preview (day-map-mock) renders inside the hidden lg:* sidebar wrapper", () => {
    const { container } = renderItineraryTab(
      { itineraryState: makeReadOnlyItineraryState(sampleItinerary) },
      { readOnly: true }
    );
    // ItineraryDayMap is mocked to data-testid="day-map-mock". The SidebarMap
    // compact preview renders one inside the desktop sticky column (hidden lg:*).
    // There may be multiple day-map-mock nodes (compact + expanded dialog + mobile).
    // We need at least one inside the desktop hidden lg:* wrapper.
    const allMaps = screen.getAllByTestId("day-map-mock");
    const hasDesktopMap = allMaps.some((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== container) {
        const cls = node.className.toString();
        if (cls.includes("hidden") && /lg:(block|flex|grid)/.test(cls))
          return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(hasDesktopMap).toBe(true);
  });
});
