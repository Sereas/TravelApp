/// <reference types="vitest/globals" />
import { render, screen } from "@testing-library/react";

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
  const Marker = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  }));
  const Map = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn().mockReturnValue(12),
    once: vi.fn(),
    on: vi.fn(),
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
  return { default: { Map, Marker, Popup, LngLatBounds, NavigationControl }, Map, Marker, Popup, LngLatBounds, NavigationControl };
});

// react-dom/client's createRoot is called inside the map effect; stub it so
// it doesn't interfere with our direct PopupCard render tests.
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

// Import AFTER mocks are set up.
import { ItineraryDayMap, PopupCard } from "./ItineraryDayMap";

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
      <ItineraryDayMap
        locations={sampleLocations}
        routes={sampleRoutes}
      />
    );
    // The map container div should be in the document
    expect(document.querySelector(".h-full.min-h-\\[200px\\]")).toBeInTheDocument();
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
    expect(document.querySelector(".h-full.min-h-\\[200px\\]")).toBeInTheDocument();
  });

  it("renders without errors when selectedRouteId is null (explicit deselect)", () => {
    render(
      <ItineraryDayMap
        locations={sampleLocations}
        routes={sampleRoutes}
        selectedRouteId={null}
      />
    );
    expect(document.querySelector(".h-full.min-h-\\[200px\\]")).toBeInTheDocument();
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
  props: Partial<React.ComponentProps<typeof PopupCard>> & { name?: string } = {}
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
    expect(img).toHaveAttribute("src", "https://images.example.com/sacre-coeur.jpg");
  });

  it("prefers user_image_url over image_url when both are provided", () => {
    renderPopupCard({
      name: "Notre-Dame",
      image_url: "https://images.example.com/notredame-stock.jpg",
      user_image_url: "https://images.example.com/notredame-user.jpg",
    });
    const img = screen.getByRole("img", { name: /notre-dame/i });
    expect(img).toHaveAttribute("src", "https://images.example.com/notredame-user.jpg");
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
    expect(img).toHaveAttribute("src", "https://images.example.com/arc-user.jpg");
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
    expect(screen.queryByTestId("popup-category-badge")).not.toBeInTheDocument();
  });

  // --- Booking status badge ---

  it("shows a BOOKED badge when requires_booking is 'yes_done'", () => {
    renderPopupCard({ requires_booking: "yes_done" });
    expect(screen.getByLabelText(/booked/i)).toBeInTheDocument();
  });

  it("shows a BOOK badge when requires_booking is 'yes'", () => {
    renderPopupCard({ requires_booking: "yes" });
    expect(screen.getByLabelText(/^book$/i)).toBeInTheDocument();
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
    expect(screen.getByTestId("popup-note")).toHaveTextContent("Best visited at sunset");
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
    expect(screen.getByRole("img", { name: /versailles palace/i })).toHaveAttribute(
      "src",
      "https://images.example.com/versailles.jpg"
    );
    expect(screen.getByLabelText(/booked/i)).toBeInTheDocument();
    expect(screen.getByText(/historic site/i)).toBeInTheDocument();
  });
});
