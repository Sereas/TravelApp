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

// SidebarLocationMap — expose received `readOnly` prop via a data attribute so
// we can assert it was threaded through correctly.
vi.mock("@/components/locations/SidebarLocationMap", () => ({
  SidebarLocationMap: ({
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
      screen.getByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
    ).toBeInTheDocument();
  });

  it("does NOT render SmartLocationInput when locations is empty", () => {
    renderTripView({ locations: emptyLocations });
    expect(
      screen.queryByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
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

  it("renders 'N Places' heading with correct count", () => {
    renderTripView();
    // Heading shows the count of locations passed in.
    expect(
      screen.getByText(new RegExp(`${sampleLocations.length}\\s*place`, "i"))
    ).toBeInTheDocument();
  });

  it("renders filter toolbar: search input", async () => {
    renderTripView();
    // Search input is behind an expand-on-click button for compactness.
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(
      screen.getByRole("searchbox", { name: /search/i })
    ).toBeInTheDocument();
  });

  it("renders filter toolbar: city popover trigger", () => {
    // sampleLocations has 2 distinct cities (Tokyo, Kyoto) — trigger appears.
    renderTripView();
    expect(screen.getByRole("button", { name: /city/i })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: /city/i }));
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
      screen.queryByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
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

  it("still renders the 'N Places' heading", () => {
    renderReadOnly();
    expect(
      screen.getByText(new RegExp(`${sampleLocations.length}\\s*place`, "i"))
    ).toBeInTheDocument();
  });

  it("still renders the search input (filtering is a read op)", async () => {
    renderReadOnly();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(
      screen.getByRole("searchbox", { name: /search/i })
    ).toBeInTheDocument();
  });

  it("still renders the city filter popover", () => {
    renderReadOnly();
    expect(screen.getByRole("button", { name: /city/i })).toBeInTheDocument();
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
    // Each location name appears in a card.
    expect(screen.getByText("Senso-ji Temple")).toBeInTheDocument();
    expect(screen.getByText("Shibuya Crossing")).toBeInTheDocument();
    expect(screen.getByText("Nishiki Market")).toBeInTheDocument();
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

  it("both modes render the same 'N Places' count when locations > 0", () => {
    const re = new RegExp(`${sampleLocations.length}\\s*place`, "i");

    const { unmount } = renderTripView({ readOnly: false });
    expect(screen.getByText(re)).toBeInTheDocument();
    unmount();

    renderTripView({ readOnly: true });
    expect(screen.getByText(re)).toBeInTheDocument();
  });

  it("both modes render the same filter toolbar search button", () => {
    const { unmount } = renderTripView({ readOnly: false });
    const editBtn = screen.getByRole("button", { name: /search/i });
    const editText = editBtn.textContent?.trim();
    unmount();

    renderTripView({ readOnly: true });
    const roBtn = screen.getByRole("button", { name: /search/i });
    expect(roBtn.textContent?.trim()).toEqual(editText);
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
