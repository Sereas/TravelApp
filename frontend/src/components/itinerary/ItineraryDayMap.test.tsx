/// <reference types="vitest/globals" />
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// createdRoots is hoisted via vi.hoisted() so the vi.mock factory below can
// reference it before the module's own variable declarations are initialised.
// vi.mock factories are hoisted to the top of the file by Vitest, so any
// plain `const` declared in the test file would be in the TDZ when the factory
// runs — vi.hoisted() is the correct escape hatch for this pattern.
const { createdRoots } = vi.hoisted(() => {
  const createdRoots: Array<{
    render: (...args: unknown[]) => void;
    unmount: () => void;
    lastElement: unknown;
  }> = [];
  return { createdRoots };
});

// maplibre-gl relies on WebGL and DOM APIs not available in jsdom.
// We mock the entire module so that importing ItineraryDayMap.tsx doesn't
// crash the test environment. PopupCard itself has no maplibre dependency —
// it is a pure React component — so the mock only needs to cover the import.
vi.mock("maplibre-gl", () => {
  const Popup = vi.fn().mockImplementation(() => ({
    setDOMContent: vi.fn().mockReturnThis(),
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    isOpen: vi.fn().mockReturnValue(false),
    on: vi.fn(),
  }));
  const Marker = vi.fn().mockImplementation((opts?: { element?: unknown }) => {
    // Capture the caller-provided element (or fall back to a stub). Tests
    // that dispatch a real click event need the actual DOM node that the
    // implementation attached listeners to, so prefer the passed element.
    const element = (opts?.element as HTMLElement | undefined) ?? {
      style: {} as { zIndex?: string },
    };
    return {
      setLngLat: vi.fn().mockReturnThis(),
      setPopup: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      getElement: vi.fn(() => element),
    };
  });
  const Map = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn().mockReturnValue(12),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    remove: vi.fn(),
    resize: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  }));
  const LngLatBounds = vi.fn().mockImplementation(() => ({
    extend: vi.fn(),
    isEmpty: vi.fn().mockReturnValue(true),
  }));
  const NavigationControl = vi.fn();
  return {
    default: { Map, Marker, Popup, LngLatBounds, NavigationControl },
    Map,
    Marker,
    Popup,
    LngLatBounds,
    NavigationControl,
  };
});

// react-dom/client's createRoot is called inside the map effect; stub it so
// it doesn't interfere with our direct PopupCard render tests.
//
// Enhanced: each root instance captures the last element passed to render()
// on a `.lastElement` property. This lets the wiring integration tests find
// the PopupCard props that ItineraryDayMap threads through createRoot.render().
// `createdRoots` is provided by vi.hoisted() above so the factory can close
// over it even though vi.mock factories are hoisted before variable declarations.
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => {
    const root = {
      lastElement: null as unknown,
      render: vi.fn((el: unknown) => {
        root.lastElement = el;
      }),
      unmount: vi.fn(),
    };
    createdRoots.push(root);
    return root;
  }),
}));

// Import AFTER mocks are set up.
import { ItineraryDayMap, PopupCard } from "./ItineraryDayMap";
import { Marker as MockedMarker } from "maplibre-gl";

// ---------------------------------------------------------------------------
// Shared fixture data for ItineraryDayMap tests
// ---------------------------------------------------------------------------

const sampleLocations = [
  {
    id: "loc-1",
    name: "Eiffel Tower",
    address: "Champ de Mars, Paris",
    latitude: 48.8584,
    longitude: 2.2945,
    category: "Viewpoint",
    image_url: null,
    user_image_url: null,
    requires_booking: null,
    city: "Paris",
    note: null,
  },
  {
    id: "loc-2",
    name: "Louvre Museum",
    address: "Rue de Rivoli, Paris",
    latitude: 48.8606,
    longitude: 2.3376,
    category: "Museum",
    image_url: null,
    user_image_url: null,
    requires_booking: null,
    city: "Paris",
    note: null,
  },
];

const sampleRoutes = [
  {
    routeId: "route-1",
    color: "#3b82f6",
    encodedPolylines: ["_p~iF~ps|U_ulLnnqC"],
    label: "12 min · 1.5 km",
  },
  {
    routeId: "route-2",
    color: "#10b981",
    encodedPolylines: ["_p~iF~ps|U_ulLnnqC"],
    label: "8 min · 0.9 km",
  },
];

// ---------------------------------------------------------------------------
// ItineraryDayMap prop-contract tests (RED phase — new props not yet accepted)
// ---------------------------------------------------------------------------

describe("ItineraryDayMap — selectedRouteId / onRouteSelect prop contract", () => {
  it("renders without errors when selectedRouteId prop is undefined (no selection)", () => {
    // The component must not crash when the new prop is absent
    render(
      <ItineraryDayMap locations={sampleLocations} routes={sampleRoutes} />
    );
    // The map container div should be in the document
    expect(
      document.querySelector(".h-full.min-h-\\[200px\\]")
    ).toBeInTheDocument();
  });

  it("renders without errors when selectedRouteId is set to a known route id", () => {
    // Passing a selectedRouteId should not throw; the component accepts the prop
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        routes={sampleRoutes}
        selectedRouteId="route-1"
      />
    );
    expect(
      document.querySelector(".h-full.min-h-\\[200px\\]")
    ).toBeInTheDocument();
  });

  it("renders without errors when selectedRouteId is null (explicit deselect)", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        routes={sampleRoutes}
        selectedRouteId={null}
      />
    );
    expect(
      document.querySelector(".h-full.min-h-\\[200px\\]")
    ).toBeInTheDocument();
  });

  it("exposes data-selected-route-id on the container", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        routes={sampleRoutes}
        selectedRouteId="route-2"
      />
    );
    const container = screen.getByTestId("itinerary-day-map");
    expect(container).toHaveAttribute("data-selected-route-id", "route-2");
  });
});

// ---------------------------------------------------------------------------
// Helper: render PopupCard with sensible defaults; override per test.
// ---------------------------------------------------------------------------
function renderPopupCard(
  props: Partial<React.ComponentProps<typeof PopupCard>> & {
    name?: string;
  } = {}
) {
  const defaults = {
    name: "Eiffel Tower",
    category: null,
    image_url: null,
    user_image_url: null,
    requires_booking: null,
    city: null,
    note: null,
  };
  return render(<PopupCard {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("PopupCard", () => {
  // --- Regression: existing fields must keep working ---

  it("renders the location name", () => {
    renderPopupCard({ name: "Louvre Museum" });
    expect(screen.getByText("Louvre Museum")).toBeInTheDocument();
  });

  // --- Photo ---

  it("renders a photo when image_url is provided", () => {
    renderPopupCard({
      name: "Sacré-Cœur",
      image_url: "https://images.example.com/sacre-coeur.jpg",
    });
    const img = screen.getByRole("img", { name: /sacré-cœur/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "https://images.example.com/sacre-coeur.jpg"
    );
  });

  it("prefers user_image_url over image_url when both are provided", () => {
    renderPopupCard({
      name: "Notre-Dame",
      image_url: "https://images.example.com/notredame-stock.jpg",
      user_image_url: "https://images.example.com/notredame-user.jpg",
    });
    const img = screen.getByRole("img", { name: /notre-dame/i });
    expect(img).toHaveAttribute(
      "src",
      "https://images.example.com/notredame-user.jpg"
    );
  });

  it("does not render a photo element when neither image_url nor user_image_url is provided", () => {
    renderPopupCard({ image_url: null, user_image_url: null });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a photo when only user_image_url is provided (no image_url)", () => {
    renderPopupCard({
      name: "Arc de Triomphe",
      image_url: null,
      user_image_url: "https://images.example.com/arc-user.jpg",
    });
    const img = screen.getByRole("img", { name: /arc de triomphe/i });
    expect(img).toHaveAttribute(
      "src",
      "https://images.example.com/arc-user.jpg"
    );
  });

  // --- Category badge ---

  it("shows the category badge text in uppercase when category is provided", () => {
    renderPopupCard({ category: "Accommodation" });
    expect(screen.getByText(/accommodation/i)).toBeInTheDocument();
  });

  it("shows a different category badge for Restaurant", () => {
    renderPopupCard({ category: "Restaurant" });
    expect(screen.getByText(/restaurant/i)).toBeInTheDocument();
  });

  it("does not show a category badge when category is null", () => {
    renderPopupCard({ category: null });
    expect(
      screen.queryByTestId("popup-category-badge")
    ).not.toBeInTheDocument();
  });

  // --- Booking status badge ---

  it("shows a BOOKED badge when requires_booking is 'yes_done'", () => {
    renderPopupCard({ requires_booking: "yes_done" });
    expect(screen.getByLabelText(/booked/i)).toBeInTheDocument();
  });

  it("shows a BOOK badge when requires_booking is 'yes'", () => {
    renderPopupCard({ requires_booking: "yes" });
    expect(screen.getByLabelText(/booking needed/i)).toBeInTheDocument();
  });

  it("does not show any booking badge when requires_booking is 'no'", () => {
    renderPopupCard({ requires_booking: "no" });
    expect(screen.queryByTestId("popup-booking-badge")).not.toBeInTheDocument();
  });

  it("does not show any booking badge when requires_booking is null", () => {
    renderPopupCard({ requires_booking: null });
    expect(screen.queryByTestId("popup-booking-badge")).not.toBeInTheDocument();
  });

  // --- City ---

  it("renders the city name when provided", () => {
    renderPopupCard({ city: "Paris" });
    expect(screen.getByTestId("popup-city")).toHaveTextContent("Paris");
  });

  it("does not render a city element when city is null", () => {
    renderPopupCard({ city: null });
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.queryByTestId("popup-city")).not.toBeInTheDocument();
  });

  // --- Note ---

  it("renders the note when provided", () => {
    renderPopupCard({ note: "Best visited at sunset" });
    expect(screen.getByTestId("popup-note")).toHaveTextContent(
      "Best visited at sunset"
    );
  });

  it("does not render note element when note is null", () => {
    renderPopupCard({ note: null });
    expect(screen.queryByTestId("popup-note")).not.toBeInTheDocument();
  });

  // --- Resilience / edge cases ---

  it("does not crash when all optional fields are undefined", () => {
    // Simulate minimal call with only required fields
    render(<PopupCard name="Minimal Place" address={null} />);
    expect(screen.getByText("Minimal Place")).toBeInTheDocument();
  });

  it("renders correctly with all enriched fields populated at once", () => {
    renderPopupCard({
      name: "Versailles Palace",
      address: "Place d'Armes, Versailles",
      city: "Versailles",
      category: "Historic site",
      image_url: "https://images.example.com/versailles.jpg",
      user_image_url: null,
      requires_booking: "yes_done",
    });

    expect(screen.getByText("Versailles Palace")).toBeInTheDocument();
    expect(screen.getByTestId("popup-city")).toHaveTextContent("Versailles");
    expect(
      screen.getByRole("img", { name: /versailles palace/i })
    ).toHaveAttribute("src", "https://images.example.com/versailles.jpg");
    expect(screen.getByLabelText(/booked/i)).toBeInTheDocument();
    expect(screen.getByText(/historic site/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ItineraryDayMap — onPinClick prop contract
// ---------------------------------------------------------------------------

describe("ItineraryDayMap — onPinClick prop", () => {
  beforeEach(() => {
    (MockedMarker as unknown as { mockClear: () => void }).mockClear();
  });

  /** Helper: get the DOM element passed to the Nth Marker constructor call. */
  function getMarkerElement(n: number): HTMLElement {
    const calls = (
      MockedMarker as unknown as {
        mock: { calls: Array<[{ element: HTMLElement }]> };
      }
    ).mock.calls;
    expect(calls.length).toBeGreaterThan(n);
    return calls[n][0].element;
  }

  it("calls onPinClick with the location id when the first marker element is clicked (compact + disablePopups)", () => {
    const onPinClick = vi.fn();
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        compact
        disablePopups
        onPinClick={onPinClick}
      />
    );

    const firstEl = getMarkerElement(0);
    act(() => {
      firstEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPinClick).toHaveBeenCalledTimes(1);
    expect(onPinClick).toHaveBeenCalledWith("loc-1");
  });

  it("calls onPinClick with the correct id for the second marker", () => {
    const onPinClick = vi.fn();
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        compact
        disablePopups
        onPinClick={onPinClick}
      />
    );

    const secondEl = getMarkerElement(1);
    act(() => {
      secondEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPinClick).toHaveBeenCalledTimes(1);
    expect(onPinClick).toHaveBeenCalledWith("loc-2");
  });

  it("does not throw and does not register a stray callback when onPinClick is absent", () => {
    render(
      <ItineraryDayMap locations={sampleLocations} compact disablePopups />
    );
    // Should not throw — the resilience is the assertion.
    expect(() => {
      act(() => {
        getMarkerElement(0).dispatchEvent(
          new MouseEvent("click", { bubbles: true })
        );
      });
    }).not.toThrow();
  });

  it("does not call onPinClick on the fullscreen (popups-enabled) variant when no prop is passed", () => {
    // When SidebarLocationMap uses the fullscreen variant (no disablePopups),
    // it does not thread onPinClick. Clicking the pin should not crash and
    // should not fire any callback.
    render(<ItineraryDayMap locations={sampleLocations} />);
    expect(() => {
      act(() => {
        getMarkerElement(0).dispatchEvent(
          new MouseEvent("click", { bubbles: true })
        );
      });
    }).not.toThrow();
  });

  it("supports Enter key on the focused marker element for keyboard accessibility", () => {
    const onPinClick = vi.fn();
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        compact
        disablePopups
        onPinClick={onPinClick}
      />
    );

    const firstEl = getMarkerElement(0);
    act(() => {
      firstEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    expect(onPinClick).toHaveBeenCalledWith("loc-1");
  });

  it("supports Space key on the focused marker element for keyboard accessibility", () => {
    const onPinClick = vi.fn();
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        compact
        disablePopups
        onPinClick={onPinClick}
      />
    );

    const firstEl = getMarkerElement(0);
    act(() => {
      firstEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
      );
    });

    expect(onPinClick).toHaveBeenCalledWith("loc-1");
  });

  it("sets role='button', tabIndex='0', and aria-label on marker element when onPinClick is provided", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        compact
        disablePopups
        onPinClick={vi.fn()}
      />
    );

    const firstEl = getMarkerElement(0);
    expect(firstEl.getAttribute("role")).toBe("button");
    expect(firstEl.getAttribute("tabindex")).toBe("0");
    expect(firstEl.getAttribute("aria-label")).toContain("Eiffel Tower");
  });
});

// ---------------------------------------------------------------------------
// PopupCard — inline note editing
// ---------------------------------------------------------------------------

describe("PopupCard — inline note editing", () => {
  it("shows no edit button in view-only mode (no onSaveNote)", () => {
    renderPopupCard({ note: "Visit at dusk" });
    expect(
      screen.queryByRole("button", { name: /edit note/i })
    ).not.toBeInTheDocument();
  });

  it("shows edit button when onSaveNote is provided", () => {
    renderPopupCard({ note: "Visit at dusk", onSaveNote: vi.fn() });
    expect(
      screen.getByRole("button", { name: /edit note/i })
    ).toBeInTheDocument();
  });

  it("clicking the edit button reveals a textarea with the current note prefilled", () => {
    renderPopupCard({ note: "Visit at dusk", onSaveNote: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("Visit at dusk");
  });

  it("clicking the edit button reveals an empty textarea when note is null", () => {
    renderPopupCard({ note: null, onSaveNote: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("textarea has maxLength 2000", () => {
    renderPopupCard({ note: "test", onSaveNote: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).maxLength).toBe(2000);
  });

  it("typing + clicking Save calls onSaveNote with the typed value (trimmed)", async () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    renderPopupCard({ note: "Old note", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "  New note  " } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledTimes(1);
      expect(onSaveNote).toHaveBeenCalledWith("New note");
    });
  });

  it("typing the same value + clicking Save is a no-op (onSaveNote NOT called)", async () => {
    const onSaveNote = vi.fn();
    renderPopupCard({ note: "Same note", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    // value is already prefilled with "Same note"; do not change it
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(onSaveNote).not.toHaveBeenCalled();
    });
    // Should exit edit mode even though it was a no-op
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clicking Cancel exits edit mode without calling onSaveNote", () => {
    const onSaveNote = vi.fn();
    renderPopupCard({ note: "Keep me", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onSaveNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pressing Escape in the textarea exits edit mode without calling onSaveNote", () => {
    const onSaveNote = vi.fn();
    renderPopupCard({ note: "Keep me", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onSaveNote).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pressing Enter (no shift) in the textarea submits", async () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    renderPopupCard({ note: "Submit me", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Updated note" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledWith("Updated note");
    });
  });

  it("save failure (promise rejects) stays in edit mode and surfaces an error role=alert", async () => {
    const onSaveNote = vi.fn().mockRejectedValue(new Error("Server error"));
    renderPopupCard({ note: "Old note", onSaveNote });
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New note" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Still in edit mode
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("readOnly hides the edit button even when onSaveNote is provided", () => {
    renderPopupCard({ note: "Secret", onSaveNote: vi.fn(), readOnly: true });
    expect(
      screen.queryByRole("button", { name: /edit note/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PopupCard — delete action
// ---------------------------------------------------------------------------

describe("PopupCard — delete action", () => {
  it("shows no delete button in view-only mode (no onDelete)", () => {
    renderPopupCard();
    expect(
      screen.queryByRole("button", { name: /delete location/i })
    ).not.toBeInTheDocument();
  });

  it("shows delete button when onDelete is provided", () => {
    renderPopupCard({ onDelete: vi.fn() });
    expect(
      screen.getByRole("button", { name: /delete location/i })
    ).toBeInTheDocument();
  });

  it("clicking delete reveals an inline confirm row", () => {
    renderPopupCard({ onDelete: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /delete location/i }));
    expect(screen.getByText(/delete this location/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking Confirm calls onDelete()", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderPopupCard({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: /delete location/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  it("clicking Cancel on the confirm row does NOT call onDelete and returns to default view", () => {
    const onDelete = vi.fn();
    renderPopupCard({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: /delete location/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/delete this location/i)).not.toBeInTheDocument();
  });

  it("delete failure (promise rejects) shows an error role=alert and keeps the confirm row visible", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("Network error"));
    renderPopupCard({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: /delete location/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Confirm row remains visible after failure
    expect(screen.getByText(/delete this location/i)).toBeInTheDocument();
  });

  it("readOnly hides the delete button even when onDelete is provided", () => {
    renderPopupCard({ onDelete: vi.fn(), readOnly: true });
    expect(
      screen.queryByRole("button", { name: /delete location/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ItineraryDayMap — onLocationNoteSave / onLocationDelete prop contract
// ---------------------------------------------------------------------------

describe("ItineraryDayMap — onLocationNoteSave / onLocationDelete prop contract", () => {
  beforeEach(() => {
    (MockedMarker as unknown as { mockClear: () => void }).mockClear();
    // Reset the captured roots array before each test so leakage between
    // ItineraryDayMap renders doesn't produce stale root references.
    createdRoots.length = 0;
  });

  it("accepts onLocationNoteSave and onLocationDelete props without crashing", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        onLocationNoteSave={vi.fn()}
        onLocationDelete={vi.fn()}
      />
    );
    expect(
      document.querySelector(".h-full.min-h-\\[200px\\]")
    ).toBeInTheDocument();
  });

  it("accepts readOnly prop without crashing", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        readOnly
        onLocationNoteSave={vi.fn()}
        onLocationDelete={vi.fn()}
      />
    );
    expect(
      document.querySelector(".h-full.min-h-\\[200px\\]")
    ).toBeInTheDocument();
  });

  it("when PopupCard's captured onSaveNote is invoked, onLocationNoteSave is called with (locationId, note)", async () => {
    const onLocationNoteSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        onLocationNoteSave={onLocationNoteSave}
      />
    );

    // Find the popup root whose last-rendered element is a PopupCard for loc-1.
    // ItineraryDayMap calls popupRoot.render(<PopupCard ...>) for each location
    // that has popups enabled. The createdRoots array will contain both marker
    // roots (for the pin DOM content) and popup roots. We find the one whose
    // lastElement has type===PopupCard and props.name==="Eiffel Tower".
    const popupRoot = createdRoots.find(
      (r) =>
        r.lastElement !== null &&
        typeof r.lastElement === "object" &&
        "type" in r.lastElement &&
        r.lastElement.type === PopupCard &&
        (r.lastElement.props as { name?: string }).name === "Eiffel Tower"
    );
    expect(popupRoot).toBeDefined();

    const onSaveNote = (
      popupRoot!.lastElement!.props as {
        onSaveNote?: (note: string) => Promise<void>;
      }
    ).onSaveNote;
    expect(typeof onSaveNote).toBe("function");

    await act(async () => {
      await onSaveNote!("my new note");
    });

    expect(onLocationNoteSave).toHaveBeenCalledTimes(1);
    expect(onLocationNoteSave).toHaveBeenCalledWith("loc-1", "my new note");
  });

  it("when PopupCard's captured onDelete is invoked, onLocationDelete is called with (locationId)", async () => {
    const onLocationDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        onLocationDelete={onLocationDelete}
      />
    );

    const popupRoot = createdRoots.find(
      (r) =>
        r.lastElement !== null &&
        typeof r.lastElement === "object" &&
        "type" in r.lastElement &&
        r.lastElement.type === PopupCard &&
        (r.lastElement.props as { name?: string }).name === "Eiffel Tower"
    );
    expect(popupRoot).toBeDefined();

    const onDelete = (
      popupRoot!.lastElement!.props as { onDelete?: () => Promise<void> }
    ).onDelete;
    expect(typeof onDelete).toBe("function");

    await act(async () => {
      await onDelete!();
    });

    expect(onLocationDelete).toHaveBeenCalledTimes(1);
    expect(onLocationDelete).toHaveBeenCalledWith("loc-1");
  });
});

// ---------------------------------------------------------------------------
// Part A — Popup preservation on content-only changes
//
// The implementation will split the main map-building effect into two effects:
//   1. A heavy effect keyed on structural identity (ids join string + routes +
//      compact + disablePopups) that creates Marker instances and popup roots.
//   2. A light refresh effect keyed on [locations] that calls
//      popupRoot.render(<PopupCard ... note={newNote} />) when the id set is
//      identical (content-only update).
//
// Observable guarantees we test:
//   A1 — content-only note change does NOT construct new Marker instances
//   A2 — content-only note change DOES call popupRoot.render again with new note
//   A3 — adding a location DOES construct new Marker instances (structural)
//   A4 — removing a location DOES reconstruct Marker instances (structural)
//   A5 — reordering locations DOES reconstruct Marker instances (structural)
//   A6 — multiple sequential note-only rerenders do not accumulate markers
// ---------------------------------------------------------------------------

describe("ItineraryDayMap — popup preservation on content-only changes (Part A)", () => {
  beforeEach(() => {
    (MockedMarker as unknown as { mockClear: () => void }).mockClear();
    createdRoots.length = 0;
  });

  /** Convenience: total number of times the Marker constructor was called. */
  function markerCallCount(): number {
    return (MockedMarker as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
  }

  /** Find the popup root whose last-rendered element is a PopupCard for the given name. */
  function findPopupRoot(name: string) {
    return createdRoots.find(
      (r) =>
        r.lastElement !== null &&
        typeof r.lastElement === "object" &&
        "type" in r.lastElement &&
        (r.lastElement as { type: unknown }).type === PopupCard &&
        (
          (r.lastElement as { props: { name?: string } }).props as {
            name?: string;
          }
        ).name === name
    );
  }

  it("A1 — content-only note change does NOT construct new Marker instances", () => {
    const loc1 = { ...sampleLocations[0], note: null };
    const loc2 = { ...sampleLocations[1], note: null };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    // Verify 2 markers were created on initial render
    expect(markerCallCount()).toBe(2);

    // Rerender with the same IDs but a changed note — content-only update
    const loc1WithNote = { ...loc1, note: "Fresh note" };
    rerender(<ItineraryDayMap locations={[loc1WithNote, loc2]} />);

    // Marker constructor must NOT have been called again
    expect(markerCallCount()).toBe(2);
  });

  it("A2 — content-only note change DOES re-render the existing popup root with the new note prop", () => {
    const loc1 = { ...sampleLocations[0], note: null };
    const loc2 = { ...sampleLocations[1], note: null };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    const popupRoot = findPopupRoot("Eiffel Tower");
    expect(popupRoot).toBeDefined();

    // Count renders before the content update
    const rendersBefore = (popupRoot!.render as ReturnType<typeof vi.fn>).mock
      .calls.length;

    // Content-only update: same ids, new note
    const loc1WithNote = { ...loc1, note: "Fresh note" };
    rerender(<ItineraryDayMap locations={[loc1WithNote, loc2]} />);

    // render() on the popup root should have been called at least once more
    const rendersAfter = (popupRoot!.render as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(rendersAfter).toBeGreaterThan(rendersBefore);

    // The last render call must pass the new note prop
    const lastRenderedElement = popupRoot!.lastElement as {
      type: unknown;
      props: { note?: string | null; name?: string };
    };
    expect(lastRenderedElement.props.note).toBe("Fresh note");
  });

  it("A3 — adding a location DOES construct new Marker instances (structural change)", () => {
    const loc1 = { ...sampleLocations[0] };
    const loc2 = { ...sampleLocations[1] };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    expect(markerCallCount()).toBe(2);

    const loc3 = {
      id: "loc-3",
      name: "Musée d'Orsay",
      address: "1 Rue de la Légion d'Honneur, Paris",
      latitude: 48.86,
      longitude: 2.3266,
      category: "Museum",
      image_url: null,
      user_image_url: null,
      requires_booking: null,
      city: "Paris",
      note: null,
    };
    rerender(<ItineraryDayMap locations={[loc1, loc2, loc3]} />);

    // Must have rebuilt — total Marker constructor calls increases
    expect(markerCallCount()).toBeGreaterThan(2);
  });

  it("A4 — removing a location DOES reconstruct Marker instances (structural change)", () => {
    const loc1 = { ...sampleLocations[0] };
    const loc2 = { ...sampleLocations[1] };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    expect(markerCallCount()).toBe(2);

    // Remove loc2 — structural change (different id set)
    rerender(<ItineraryDayMap locations={[loc1]} />);

    // Markers must have been rebuilt
    expect(markerCallCount()).toBeGreaterThan(2);
  });

  it("A5 — reordering locations (id swap) DOES reconstruct Marker instances (structural change)", () => {
    const loc1 = { ...sampleLocations[0] };
    const loc2 = { ...sampleLocations[1] };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    expect(markerCallCount()).toBe(2);

    // Reverse order — structural change (join string differs)
    rerender(<ItineraryDayMap locations={[loc2, loc1]} />);

    expect(markerCallCount()).toBeGreaterThan(2);
  });

  it("A6 — multiple sequential content-only note updates do not accumulate markers", () => {
    const loc1 = { ...sampleLocations[0], note: null as string | null };
    const loc2 = { ...sampleLocations[1], note: null as string | null };

    const { rerender } = render(<ItineraryDayMap locations={[loc1, loc2]} />);

    expect(markerCallCount()).toBe(2);

    // Three sequential note-only rerenders
    rerender(
      <ItineraryDayMap locations={[{ ...loc1, note: "Note one" }, loc2]} />
    );
    rerender(
      <ItineraryDayMap locations={[{ ...loc1, note: "Note two" }, loc2]} />
    );
    rerender(
      <ItineraryDayMap locations={[{ ...loc1, note: "Note three" }, loc2]} />
    );

    // Marker count must still be exactly 2 — no leakage
    expect(markerCallCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Part B — PopupCard UX restructure
//
// New structural guarantees for the PopupCard visual layout:
//   B7 — when note is present, the edit button is rendered INSIDE the same
//        wrapper element as the note pill (data-testid="popup-note-container")
//   B8 — when note is null and onSaveNote is provided, an "Add note" visible
//        text placeholder is rendered (the button's accessible name stays
//        "Edit note" so existing aria-label selectors continue to work)
//   B9 — the delete button has VISIBLE TEXT "Delete location" (not icon-only)
// ---------------------------------------------------------------------------

describe("PopupCard — UX restructure (Part B)", () => {
  it("B7 — edit button is a descendant of the note container when note is present", () => {
    renderPopupCard({ note: "hello", onSaveNote: vi.fn() });

    // The note pill wrapper must carry data-testid="popup-note-container"
    const noteContainer = screen.getByTestId("popup-note-container");
    expect(noteContainer).toBeInTheDocument();

    // The edit button must be inside that same container
    const editButton = screen.getByRole("button", { name: /edit note/i });
    expect(noteContainer).toContainElement(editButton);
  });

  it("B8 — when note is null and onSaveNote is provided, visible 'Add note' text is rendered", () => {
    renderPopupCard({ note: null, onSaveNote: vi.fn() });

    // Visible placeholder text must be present
    expect(screen.getByText(/add note/i)).toBeInTheDocument();

    // The triggering button's accessible name must still be "Edit note"
    // so existing aria-label selectors keep working
    expect(
      screen.getByRole("button", { name: /edit note/i })
    ).toBeInTheDocument();
  });

  it("B9 — delete button has visible text 'Delete location', not just an aria-label", () => {
    renderPopupCard({ onDelete: vi.fn() });

    // The text must be visually present in the document (not just an aria-label)
    expect(screen.getByText(/delete location/i)).toBeInTheDocument();

    // The button itself must also still be findable by accessible name
    expect(
      screen.getByRole("button", { name: /delete location/i })
    ).toBeInTheDocument();
  });
});
