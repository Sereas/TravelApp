/// <reference types="vitest/globals" />
/**
 * TripView tests — the shared component rendered by BOTH `/trips/[id]` and
 * `/shared/[token]`.
 *
 * Design contract encoded here:
 *   readOnly={false} + canShare={true}  → edit mode (authenticated owner)
 *   readOnly={true}  + canShare={false} → read-only mode (shared public view)
 *
 * The key non-negotiable: both modes MUST render from the same component so
 * that any future change to the owner view is automatically adopted by the
 * shared view — zero drift. The parity section at the bottom guards this.
 */
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  sampleTrip,
  sampleTripNoDates,
  sampleLocations,
  emptyLocations,
  sampleItinerary,
  emptyItinerary,
  makeReadOnlyItineraryState,
  makeItineraryMutations,
} from "./__fixtures__/trip-view.fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// PlacesSidebarMapTrigger — mock the wrapper component rather than
// SidebarLocationMap directly. The real wrapper renders SidebarLocationMap
// in TWO wrappers (hidden lg:block desktop + lg:hidden mobile sheet with
// forceMount), which produces two copies of the testid in the DOM and
// also mounts a Radix Sheet portal that interferes with query scoping.
// Mocking the wrapper gives exactly one testid and avoids the portal.
// The `data-readonly` and `mock-sidebar-pin-*` testids are preserved so
// existing tests see the same DOM shape as before Phase 3.
vi.mock("@/features/trip-view/PlacesSidebarMapTrigger", () => ({
  PlacesSidebarMapTrigger: ({
    locations,
    readOnly,
    onPinClick,
  }: {
    locations: Array<{ id: string; name: string }>;
    readOnly?: boolean;
    focusLocationId?: string | null;
    focusSeq?: number;
    onPinClick?: (id: string) => void;
  }) => (
    <div
      data-testid="sidebar-location-map-mock"
      data-readonly={String(!!readOnly)}
    >
      {onPinClick &&
        locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            data-testid={`mock-sidebar-pin-${loc.id}`}
            onClick={() => onPinClick(loc.id)}
          />
        ))}
    </div>
  ),
}));

// Heavy itinerary sub-components — stub so render is fast and assertions are
// scoped to TripView itself.  ItineraryTab receives a data-testid so tab-click
// tests can find it.
vi.mock("@/components/itinerary/ItineraryTab", () => ({
  ItineraryTab: ({
    trip,
    itineraryMutations,
  }: {
    trip: { name: string };
    itineraryMutations?: object;
  }) => (
    <div
      data-testid="itinerary-tab-mock"
      data-has-mutations={String(!!itineraryMutations)}
    >
      ItineraryTab({trip.name})
    </div>
  ),
}));

// Mock next/navigation so the component can call useRouter / useParams without
// a real Next.js environment.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "trip-abc" }),
}));

// ---------------------------------------------------------------------------
// Helper — render TripView with sensible defaults
// ---------------------------------------------------------------------------

import { TripView } from "./TripView";

function renderTripView(
  overrides: Partial<React.ComponentProps<typeof TripView>> = {}
) {
  const defaults: React.ComponentProps<typeof TripView> = {
    trip: sampleTrip,
    tripId: sampleTrip.id,
    locations: sampleLocations,
    itineraryState: makeReadOnlyItineraryState(sampleItinerary),
    readOnly: false,
    canShare: true,
    ...overrides,
  };
  return render(<TripView {...defaults} />);
}

// ===========================================================================
// EDIT MODE (readOnly=false, canShare=true)
// ===========================================================================

describe("TripView — edit mode", () => {
  it("renders the trip name as an interactive/clickable button", () => {
    renderTripView();
    // In edit mode the name is wrapped in a clickable button so the user can
    // rename inline.
    const nameBtn = screen.getByRole("button", { name: sampleTrip.name });
    expect(nameBtn).toBeInTheDocument();
  });

  it("renders TripDateRangePicker as an interactive control (not plain text)", () => {
    renderTripView();
    // TripDateRangePicker renders a button labelled "Date range" (from existing tests).
    expect(
      screen.getByRole("button", { name: /date range/i })
    ).toBeInTheDocument();
  });

  it("renders the PLANNING status pill", () => {
    renderTripView();
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it("renders a Share button", () => {
    renderTripView();
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("renders SmartLocationInput when locations.length > 0", () => {
    renderTripView();
    // SmartLocationInput uses a placeholder matching the pattern from existing tests.
    expect(
      screen.getByPlaceholderText(/search a place.*paste a google maps link/i)
    ).toBeInTheDocument();
  });

  it("does NOT render SmartLocationInput when locations is empty", () => {
    renderTripView({ locations: emptyLocations });
    expect(
      screen.queryByPlaceholderText(/search a place.*paste a google maps link/i)
    ).not.toBeInTheDocument();
  });

  it("renders the three-card empty state when locations is empty", () => {
    renderTripView({ locations: emptyLocations });
    // The three entry-point cards that are shown when a trip has no locations.
    // Each card has both a heading and a button with the same/similar text, so
    // query by heading role to disambiguate.
    expect(
      screen.getByRole("heading", { name: /paste a link/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /import a list/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /add manually/i })
    ).toBeInTheDocument();
  });

  it("renders schedule tabs with total count", () => {
    renderTripView();
    // The "All" schedule tab shows the total location count.
    const allTab = screen.getByRole("radio", { name: /all/i });
    expect(allTab).toHaveTextContent(String(sampleLocations.length));
  });

  it("renders filter toolbar: city popover trigger", () => {
    // sampleLocations has 2 distinct cities (Tokyo, Kyoto) — trigger appears.
    // Use exact match "City" to avoid ambiguity with location addresses that
    // contain "City" as part of their text (e.g. "Taito City").
    renderTripView();
    expect(screen.getByRole("button", { name: "City" })).toBeInTheDocument();
  });

  it("renders filter toolbar: category popover trigger", () => {
    renderTripView();
    // sampleLocations has 3 distinct categories — filter appears.
    expect(
      screen.getByRole("button", { name: /category/i })
    ).toBeInTheDocument();
  });

  it("renders filter toolbar: added-by popover trigger", () => {
    renderTripView();
    // Owner-only filter for filtering by who added a location.
    expect(
      screen.getByRole("button", { name: /added by/i })
    ).toBeInTheDocument();
  });

  it("renders group-by toggle controls", async () => {
    renderTripView();
    // Group-by controls live inside the City filter popover — open it first.
    // Use exact match to avoid ambiguity with location address text containing "city".
    await userEvent.click(screen.getByRole("button", { name: "City" }));
    expect(
      screen.getByRole("button", { name: /group by city/i })
    ).toBeInTheDocument();
  });

  it("renders the sidebar map component", () => {
    renderTripView();
    expect(screen.getByTestId("sidebar-location-map-mock")).toBeInTheDocument();
  });

  it("passes readOnly=false to SidebarLocationMap", () => {
    renderTripView();
    const map = screen.getByTestId("sidebar-location-map-mock");
    expect(map).toHaveAttribute("data-readonly", "false");
  });

  it("renders Places and Itinerary tabs", () => {
    renderTripView();
    expect(screen.getByRole("tab", { name: /places/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeInTheDocument();
  });

  it("clicking the Itinerary tab mounts ItineraryTab", async () => {
    renderTripView();
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    expect(screen.getByTestId("itinerary-tab-mock")).toBeInTheDocument();
  });

  it("renders ItineraryTab with itineraryMutations when in edit mode", async () => {
    const mutations = makeItineraryMutations();
    renderTripView({ itineraryMutations: mutations });
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    const tab = screen.getByTestId("itinerary-tab-mock");
    expect(tab).toHaveAttribute("data-has-mutations", "true");
  });
});

// ===========================================================================
// READ-ONLY MODE (readOnly=true, canShare=false)
// ===========================================================================

describe("TripView — read-only mode (shared view)", () => {
  function renderReadOnly(
    overrides: Partial<React.ComponentProps<typeof TripView>> = {}
  ) {
    return renderTripView({ readOnly: true, canShare: false, ...overrides });
  }

  // -------------------------------------------------------------------------
  // Must NOT render
  // -------------------------------------------------------------------------

  it("does NOT render the Share button", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /share/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT render SmartLocationInput", () => {
    renderReadOnly();
    expect(
      screen.queryByPlaceholderText(/search a place.*paste a google maps link/i)
    ).not.toBeInTheDocument();
  });

  it("does NOT render the three-card empty state when locations is empty — shows fallback text instead", () => {
    renderReadOnly({ locations: emptyLocations });
    // Three-card CTA is owner-only.
    expect(screen.queryByText(/paste a link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import a list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add manually/i)).not.toBeInTheDocument();
    // Instead, a simple "no locations" message is shown.
    expect(
      screen.getByText(/no locations added to this trip yet/i)
    ).toBeInTheDocument();
  });

  it("does NOT render the trip name as a button/input — plain h1 only", () => {
    renderReadOnly();
    // In read-only mode the trip name is a plain heading, not clickable.
    expect(
      screen.queryByRole("button", { name: sampleTrip.name })
    ).not.toBeInTheDocument();
    // The name itself is still visible.
    expect(
      screen.getByRole("heading", { name: sampleTrip.name })
    ).toBeInTheDocument();
  });

  it("does NOT render TripDateRangePicker interactive control — plain date text", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /date range/i })
    ).not.toBeInTheDocument();
    // The dates are still visible as text.
    expect(screen.getByText(/Sep/i)).toBeInTheDocument();
  });

  it("does NOT render the added-by filter popover (owner-only data)", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /added by/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT render group-by toggle controls", () => {
    renderReadOnly();
    expect(
      screen.queryByRole("button", { name: /group by/i })
    ).not.toBeInTheDocument();
  });

  it("passes readOnly=true to SidebarLocationMap", () => {
    renderReadOnly();
    const map = screen.getByTestId("sidebar-location-map-mock");
    expect(map).toHaveAttribute("data-readonly", "true");
  });

  it("does NOT pass itineraryMutations to ItineraryTab", async () => {
    renderReadOnly();
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }));
    const tab = screen.getByTestId("itinerary-tab-mock");
    expect(tab).toHaveAttribute("data-has-mutations", "false");
  });

  // -------------------------------------------------------------------------
  // Must STILL render (parity)
  // -------------------------------------------------------------------------

  it("still renders the trip name", () => {
    renderReadOnly();
    expect(
      screen.getByRole("heading", { name: sampleTrip.name })
    ).toBeInTheDocument();
  });

  it("still renders the date range as static text", () => {
    renderReadOnly();
    // The date text should appear somewhere — exact format may vary.
    expect(screen.getByText(/sep.*sep/i)).toBeInTheDocument();
  });

  it("still renders the PLANNING pill", () => {
    renderReadOnly();
    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it("still renders schedule tabs with total count", () => {
    renderReadOnly();
    const allTab = screen.getByRole("radio", { name: /all/i });
    expect(allTab).toHaveTextContent(String(sampleLocations.length));
  });

  it("still renders the city filter popover", () => {
    renderReadOnly();
    // Use exact match to avoid ambiguity with location address text containing "city".
    expect(screen.getByRole("button", { name: "City" })).toBeInTheDocument();
  });

  it("still renders the category filter popover", () => {
    renderReadOnly();
    expect(
      screen.getByRole("button", { name: /category/i })
    ).toBeInTheDocument();
  });

  it("still renders Places and Itinerary tabs", () => {
    renderReadOnly();
    expect(screen.getByRole("tab", { name: /places/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeInTheDocument();
  });

  it("renders LocationCards in read-only mode", () => {
    renderReadOnly();
    // Each location name appears in the front-face <h3> heading of a card.
    // Use getByRole("heading") to avoid ambiguity with the back-face
    // InlineEditableField that also renders the name as a span.
    expect(
      screen.getByRole("heading", { name: "Senso-ji Temple" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Shibuya Crossing" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nishiki Market" })
    ).toBeInTheDocument();
  });

  it("LocationCards in read-only mode have no edit/delete menu buttons", () => {
    renderReadOnly();
    // LocationCard already gates edit/delete behind useReadOnly(); verify the
    // contract holds at the TripView integration level.
    expect(
      screen.queryByRole("button", { name: /edit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i })
    ).not.toBeInTheDocument();
  });

  it("still renders the sidebar map", () => {
    renderReadOnly();
    expect(screen.getByTestId("sidebar-location-map-mock")).toBeInTheDocument();
  });
});

// ===========================================================================
// PARITY — same structural elements regardless of mode
// ===========================================================================

describe("TripView — mode parity (same trip, same locations)", () => {
  function tabs(container: HTMLElement) {
    return within(container)
      .getAllByRole("tab")
      .map((t) => t.textContent?.trim());
  }

  it("both modes render the same tab bar tab names", () => {
    const { unmount, container: editContainer } = renderTripView({
      readOnly: false,
    });
    const editTabs = tabs(editContainer);
    unmount();

    const { container: roContainer } = renderTripView({ readOnly: true });
    const roTabs = tabs(roContainer);

    expect(editTabs).toEqual(roTabs);
  });

  it("both modes render the same PLANNING pill text", () => {
    const { unmount } = renderTripView({ readOnly: false });
    const editPillText = screen.getByText(/planning/i).textContent;
    unmount();

    renderTripView({ readOnly: true });
    const roPillText = screen.getByText(/planning/i).textContent;

    expect(editPillText).toEqual(roPillText);
  });

  it("both modes render the same schedule tab counts", () => {
    const { unmount } = renderTripView({ readOnly: false });
    const editAllText = screen
      .getByRole("radio", { name: /all/i })
      .textContent?.trim();
    unmount();

    renderTripView({ readOnly: true });
    const roAllText = screen
      .getByRole("radio", { name: /all/i })
      .textContent?.trim();
    expect(roAllText).toEqual(editAllText);
  });
});

// ===========================================================================
// EDGE CASES
// ===========================================================================

describe("TripView — edge cases", () => {
  it("renders without crashing when trip has no dates (null start/end)", () => {
    expect(() =>
      renderTripView({ trip: sampleTripNoDates, readOnly: false })
    ).not.toThrow();
    expect(screen.getByText("Untitled Trip")).toBeInTheDocument();
  });

  it("renders without crashing in read-only mode with empty itinerary", () => {
    expect(() =>
      renderTripView({
        readOnly: true,
        itineraryState: makeReadOnlyItineraryState(emptyItinerary),
      })
    ).not.toThrow();
  });

  it("renders without crashing when itineraryMutations is undefined (edit mode)", () => {
    // itineraryMutations is optional — edit mode without mutations should not crash.
    expect(() =>
      renderTripView({ readOnly: false, itineraryMutations: undefined })
    ).not.toThrow();
  });
});

// ===========================================================================
// Phase 2 — Touch hardening contracts
// ===========================================================================

describe("TripView — Phase 2 touch hardening", () => {
  // -------------------------------------------------------------------------
  // Contract 2: LocationCard grid uses sm:grid-cols-2, NOT md:grid-cols-2
  // -------------------------------------------------------------------------

  it("LocationCard grid wrapper has sm:grid-cols-2 (two-column at 640px)", () => {
    const { container } = renderTripView();
    // The locations grid uses grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3
    // after Phase 2. Previously it was md:grid-cols-2 (768px breakpoint).
    const grid = container.querySelector(".sm\\:grid-cols-2");
    expect(grid).not.toBeNull();
  });

  it("LocationCard grid wrapper does NOT use bare md:grid-cols-2 (regression guard)", () => {
    const { container } = renderTripView();
    // md:grid-cols-2 would mean the 2-column layout only activates at 768px,
    // leaving landscape phones at 1 column. After Phase 2 this class is gone.
    const mdGrid = container.querySelector(".md\\:grid-cols-2");
    expect(mdGrid).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Contract 3: Filter pill buttons have touch-target class
  // -------------------------------------------------------------------------

  it("City filter pill button has touch-target class", () => {
    renderTripView();
    // Use exact match to avoid ambiguity with location address text containing "city".
    const cityBtn = screen.getByRole("button", { name: "City" });
    expect(cityBtn.className).toContain("touch-target");
  });

  it("Category filter pill button has touch-target class", () => {
    renderTripView();
    const catBtn = screen.getByRole("button", { name: /category/i });
    expect(catBtn.className).toContain("touch-target");
  });

  it("Added-by filter pill button has touch-target class (edit mode only)", () => {
    renderTripView({ readOnly: false });
    const addedByBtn = screen.getByRole("button", { name: /added by/i });
    expect(addedByBtn.className).toContain("touch-target");
  });

  // -------------------------------------------------------------------------
  // Contract 9: Trip header row has flex-wrap
  // -------------------------------------------------------------------------

  it("trip header status row has flex-wrap class", () => {
    const { container } = renderTripView();
    // The row is: flex items-center justify-between gap-4 flex-wrap
    // It wraps so the Planning pill + date picker can sit below the Share
    // button on very narrow screens.
    // We look for a flex container sibling to the PLANNING badge that also
    // contains the Share or date-related elements.
    const planningBadge = screen.getByText(/planning/i);
    // Walk up to the wrapping flex row — it's the first ancestor with flex-wrap.
    let el: HTMLElement | null = planningBadge.parentElement;
    let found = false;
    while (el) {
      if (el.className.includes("flex-wrap")) {
        found = true;
        break;
      }
      el = el.parentElement;
    }
    expect(found).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Contract 10: Sticky tabs bar offset accounts for safe-area inset
  // -------------------------------------------------------------------------

  it("sticky tabs bar className accounts for safe-area top inset", () => {
    const { container } = renderTripView();
    // After Phase 2 the sticky tabs bar moves from `sticky top-14 z-30` to
    // `sticky top-[calc(3.5rem+var(--safe-top))] z-30` (or a named token).
    // The test looks for any element with a `top-` value that references
    // the safe-area variable or a named header token.
    //
    // Strategy: find the element that is sticky AND z-30 (the tab bar).
    const stickyBar = container.querySelector(".sticky.z-30");
    expect(stickyBar).not.toBeNull();

    const className = stickyBar!.className;
    // Must reference safe-area top in some form.
    const hassSafeOffset =
      className.includes("safe-top") ||
      className.includes("safe-t") ||
      className.includes("--safe") ||
      // Named token e.g. top-header would also be acceptable
      className.includes("top-header");

    expect(hassSafeOffset).toBe(true);
  });

  it("sticky tabs bar does NOT use bare top-14 (regression: misses safe-area offset)", () => {
    const { container } = renderTripView();
    const stickyBar = container.querySelector(".sticky.z-30");
    expect(stickyBar).not.toBeNull();
    // `top-14` alone is the pre-Phase-2 value — must be absent or replaced.
    expect(stickyBar!.className).not.toMatch(/(^|\s)top-14(\s|$)/);
  });
});

// ===========================================================================
// Phase 3 — Mobile bottom-sheet sidebar contracts
// ===========================================================================

describe("TripView — Phase 3 mobile bottom-sheet sidebar", () => {
  // -------------------------------------------------------------------------
  // Contract 1: breakpoint lowered from xl: to lg: on the Places tab grid
  // -------------------------------------------------------------------------

  it("Places tab outer grid uses lg: breakpoint (NOT xl:) for sidebar column", () => {
    const { container } = renderTripView();
    // After Phase 3, the grid switches from xl:grid-cols-[minmax(0,1fr)_480px]
    // to lg:grid-cols-[minmax(0,1fr)_480px] or lg:grid-cols-trip-places.
    // Verify the lg: variant is present.
    const lgGrid =
      container.querySelector(
        ".lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_480px\\]"
      ) ??
      container.querySelector("[class*='lg:grid-cols-trip-places']") ??
      container.querySelector("[class*='lg:grid-cols-']");
    expect(lgGrid).not.toBeNull();
  });

  it("Places tab outer grid does NOT use xl:grid-cols- (regression guard — xl removed)", () => {
    const { container } = renderTripView();
    // The old xl:grid-cols-[minmax(0,1fr)_480px] class must be gone.
    const xlGrid = container.querySelector(
      ".xl\\:grid-cols-\\[minmax\\(0\\,1fr\\)_480px\\]"
    );
    expect(xlGrid).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Contract 2: PlacesSidebarMapTrigger replaces the raw hidden xl:flex column
  // -------------------------------------------------------------------------

  it("Places tab does NOT render the old hidden xl:flex sidebar wrapper (regression guard)", () => {
    const { container } = renderTripView();
    // The pre-Phase-3 sidebar column used hidden xl:flex.
    // After Phase 3 this class combination must be gone.
    const oldSidebar = container.querySelector(".hidden.xl\\:flex");
    expect(oldSidebar).toBeNull();
  });

  it("Places tab renders PlacesSidebarMapTrigger (identified by its test-id sentinel)", () => {
    renderTripView();
    // PlacesSidebarMapTrigger is mocked at the top of this file with
    // data-testid="sidebar-location-map-mock" (re-used from the existing mock).
    // After Phase 3, TripView uses PlacesSidebarMapTrigger instead of the raw
    // SidebarLocationMap + hidden xl:flex wrapper. The mock still surfaces the
    // sidebar-location-map-mock testid so existing assertions keep working.
    expect(screen.getByTestId("sidebar-location-map-mock")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Contract 3: Mobile-only Map button in the filter toolbar
  // -------------------------------------------------------------------------

  it("Places tab toolbar has a mobile Map button with lg:hidden class when locations exist", () => {
    const { container } = renderTripView();
    // After Phase 3 a "Map" pill button is added to the filter toolbar,
    // gated with lg:hidden so desktop users (who see the sidebar) don't get it.
    // Query by accessible name first, then verify it has lg:hidden.
    const mapButtons = screen
      .getAllByRole("button", { name: /map/i })
      .filter((btn) => btn.className.includes("lg:hidden"));
    expect(mapButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("mobile Map button is in the filter toolbar (sibling of City/Category buttons)", () => {
    renderTripView();
    // The filter toolbar has a flex-wrap row containing City, Category, Added-by pills.
    // The Map button should be in the same row. Use exact match for "City" to avoid
    // ambiguity with location address text.
    const cityBtn = screen.getByRole("button", { name: "City" });
    const toolbar = cityBtn.closest(".flex.flex-wrap");
    expect(toolbar).not.toBeNull();
    const mapBtn = within(toolbar as HTMLElement)
      .getAllByRole("button", { name: /map/i })
      .find((btn) => btn.className.includes("lg:hidden"));
    expect(mapBtn).toBeDefined();
  });

  it("mobile Map button is NOT rendered when locations is empty", () => {
    renderTripView({ locations: [] });
    // When there are no locations the toolbar doesn't render, so the Map button
    // must not appear.
    const mapBtns = screen
      .queryAllByRole("button", { name: /map/i })
      .filter((btn) => btn.className.includes("lg:hidden"));
    expect(mapBtns.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Contract 4: lg: sticky sidebar offset (not xl:)
  // -------------------------------------------------------------------------

  it("Places tab sidebar sticky offset uses lg: prefix (NOT xl:) for top offset", () => {
    const { container } = renderTripView();
    // After Phase 3, sticky top offset becomes lg:top-[6.75rem] (was xl:top-[6.75rem]).
    // Check that at least one element in the sidebar area uses lg: sticky classes.
    const lgSticky =
      container.querySelector("[class*='lg:sticky']") ??
      container.querySelector("[class*='lg:top-']");
    expect(lgSticky).not.toBeNull();
  });

  it("does NOT use xl:sticky or xl:top- on the sidebar column (regression guard)", () => {
    const { container } = renderTripView();
    // Pre-Phase-3 used xl:sticky xl:top-[6.75rem] xl:self-start — must be gone.
    const xlSticky = container.querySelector("[class*='xl:sticky']");
    const xlTop = container.querySelector("[class*='xl:top-']");
    expect(xlSticky).toBeNull();
    expect(xlTop).toBeNull();
  });
});
