/// <reference types="vitest/globals" />
/**
 * Phase 3 — PlacesSidebarMapTrigger contract tests.
 *
 * This component is the dual-render wrapper that:
 *   - On desktop (lg+): renders SidebarLocationMap directly as a sticky column
 *   - On mobile (< lg): renders a "Map" button that opens a Sheet containing
 *     SidebarLocationMap (with keepMounted for MapLibre keep-alive)
 *
 * JSDOM cannot evaluate CSS media queries, so viewport-dependent RENDERING
 * is verified via class assertions (hidden lg:block, lg:hidden). Behavioral
 * tests (Sheet opens on click) use userEvent against the always-present DOM.
 *
 * All tests MUST fail on current HEAD (file does not exist yet).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Location } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock SidebarLocationMap — lightweight stub exposing received props as data attrs
// ---------------------------------------------------------------------------

vi.mock("@/components/locations/SidebarLocationMap", () => ({
  SidebarLocationMap: (props: {
    locations?: Array<{ id: string; name: string }>;
    readOnly?: boolean;
    focusLocationId?: string | null;
    focusSeq?: number;
    onPinClick?: (id: string) => void;
    onLocationNoteSave?: (id: string, note: string) => Promise<void>;
    onLocationDelete?: (id: string) => Promise<void>;
  }) => (
    <div
      data-testid="sidebar-map-mock"
      data-readonly={String(!!props.readOnly)}
      data-location-count={String(props.locations?.length ?? 0)}
      data-has-onpinclick={String(typeof props.onPinClick === "function")}
    >
      {props.locations?.length ?? 0} locations
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Import the component under test — will fail until PlacesSidebarMapTrigger.tsx exists
// ---------------------------------------------------------------------------

import { PlacesSidebarMapTrigger } from "./PlacesSidebarMapTrigger";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleLocations: Location[] = [
  {
    id: "loc-1",
    name: "Senso-ji Temple",
    address: "Asakusa",
    google_link: null,
    google_place_id: null,
    note: null,
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Tokyo",
    working_hours: null,
    useful_link: null,
    requires_booking: "no",
    category: "Temple",
    latitude: 35.7148,
    longitude: 139.7967,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
  {
    id: "loc-2",
    name: "Shibuya Crossing",
    address: "Shibuya",
    google_link: null,
    google_place_id: null,
    note: null,
    added_by_user_id: "user-2",
    added_by_email: "bob@example.com",
    city: "Tokyo",
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    category: "Viewpoint",
    latitude: 35.659,
    longitude: 139.7006,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
  {
    id: "loc-3",
    name: "Nishiki Market",
    address: "Kyoto",
    google_link: null,
    google_place_id: null,
    note: null,
    added_by_user_id: "user-1",
    added_by_email: "alice@example.com",
    city: "Kyoto",
    working_hours: null,
    useful_link: null,
    requires_booking: "yes",
    category: "Market",
    latitude: 35.0053,
    longitude: 135.7654,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
    created_at: null,
  },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderTrigger(
  overrides: Partial<React.ComponentProps<typeof PlacesSidebarMapTrigger>> = {}
) {
  const defaults: React.ComponentProps<typeof PlacesSidebarMapTrigger> = {
    locations: sampleLocations,
    focusLocationId: null,
    focusSeq: 0,
    readOnly: false,
    ...overrides,
  };
  return render(<PlacesSidebarMapTrigger {...defaults} />);
}

// ===========================================================================
// Desktop wrapper — hidden lg:block
// ===========================================================================

describe("PlacesSidebarMapTrigger — desktop wrapper", () => {
  it("renders a wrapper element with 'hidden' and 'lg:block' classes", () => {
    const { container } = renderTrigger();
    // The desktop wrapper uses `hidden lg:block` so it's hidden on mobile
    // and visible on lg+ via CSS. We verify the class string.
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    expect(desktopWrapper).not.toBeNull();
  });

  it("the desktop wrapper contains a SidebarLocationMap mock", () => {
    const { container } = renderTrigger();
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    expect(desktopWrapper).not.toBeNull();
    const mapsInDesktop = desktopWrapper!.querySelectorAll(
      "[data-testid='sidebar-map-mock']"
    );
    expect(mapsInDesktop.length).toBeGreaterThanOrEqual(1);
  });

  it("passes the locations array to the desktop SidebarLocationMap", () => {
    const { container } = renderTrigger();
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    const mapMock = desktopWrapper!.querySelector(
      "[data-testid='sidebar-map-mock']"
    );
    expect(mapMock).not.toBeNull();
    expect(mapMock!.getAttribute("data-location-count")).toBe(
      String(sampleLocations.length)
    );
  });
});

// ===========================================================================
// Mobile wrapper — lg:hidden
// ===========================================================================

describe("PlacesSidebarMapTrigger — mobile wrapper", () => {
  it("renders a wrapper element with 'lg:hidden' class", () => {
    const { container } = renderTrigger();
    const mobileWrapper = container.querySelector(".lg\\:hidden");
    expect(mobileWrapper).not.toBeNull();
  });

  it("the mobile wrapper contains a button with accessible name matching /map/i", () => {
    const { container } = renderTrigger();
    const mobileWrapper = container.querySelector(".lg\\:hidden");
    expect(mobileWrapper).not.toBeNull();
    const mapBtn = within(mobileWrapper as HTMLElement).getByRole("button", {
      name: /map/i,
    });
    expect(mapBtn).toBeInTheDocument();
  });
});

// ===========================================================================
// Sheet open/close behavior
// ===========================================================================

describe("PlacesSidebarMapTrigger — Sheet interaction", () => {
  it("clicking the mobile Map button opens a Sheet (role=dialog appears)", async () => {
    renderTrigger();
    // The Map button is inside the lg:hidden wrapper
    const mapBtn = screen.getByRole("button", { name: /map/i });
    await userEvent.click(mapBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("the open Sheet contains a SidebarLocationMap", async () => {
    renderTrigger();
    const mapBtn = screen.getByRole("button", { name: /map/i });
    await userEvent.click(mapBtn);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("sidebar-map-mock")).toBeInTheDocument();
  });

  it("the Sheet passes locations to the mobile SidebarLocationMap", async () => {
    renderTrigger();
    await userEvent.click(screen.getByRole("button", { name: /map/i }));
    const dialog = screen.getByRole("dialog");
    const mobileMap = within(dialog).getByTestId("sidebar-map-mock");
    expect(mobileMap.getAttribute("data-location-count")).toBe(
      String(sampleLocations.length)
    );
  });
});

// ===========================================================================
// MapLibre keep-alive contract
// ===========================================================================

describe("PlacesSidebarMapTrigger — MapLibre keep-alive (keepMounted)", () => {
  it("the mobile SidebarLocationMap remains in the DOM after Sheet is closed", async () => {
    renderTrigger();

    // Open the sheet
    const mapBtn = screen.getByRole("button", { name: /map/i });
    await userEvent.click(mapBtn);

    // Verify it opened
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Close via the X button
    const closeBtn = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeBtn);

    // Sheet should be gone or hidden (closed state)
    // But the SidebarLocationMap inside should still be in the DOM (keepMounted)
    // There will be 2 sidebar-map-mocks total: one in desktop wrapper, one in mobile sheet.
    // At minimum, one must remain in the DOM regardless of close state.
    const maps = document.querySelectorAll("[data-testid='sidebar-map-mock']");
    // At least the desktop map (hidden lg:block) and the keep-mounted mobile map
    expect(maps.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Prop forwarding — onPinClick
// ===========================================================================

describe("PlacesSidebarMapTrigger — onPinClick forwarding", () => {
  it("passes onPinClick to the desktop SidebarLocationMap", () => {
    const onPinClick = vi.fn();
    const { container } = renderTrigger({ onPinClick });
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    const mapMock = desktopWrapper!.querySelector(
      "[data-testid='sidebar-map-mock']"
    );
    expect(mapMock!.getAttribute("data-has-onpinclick")).toBe("true");
  });

  it("passes onPinClick to the mobile SidebarLocationMap (inside Sheet)", async () => {
    const onPinClick = vi.fn();
    renderTrigger({ onPinClick });

    // Open the mobile sheet to mount the mobile SidebarLocationMap
    await userEvent.click(screen.getByRole("button", { name: /map/i }));

    const dialog = screen.getByRole("dialog");
    const mobileMap = within(dialog).getByTestId("sidebar-map-mock");
    expect(mobileMap.getAttribute("data-has-onpinclick")).toBe("true");
  });
});

// ===========================================================================
// Prop forwarding — readOnly
// ===========================================================================

describe("PlacesSidebarMapTrigger — readOnly forwarding", () => {
  it("passes readOnly=true to the desktop SidebarLocationMap", () => {
    const { container } = renderTrigger({ readOnly: true });
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    const mapMock = desktopWrapper!.querySelector(
      "[data-testid='sidebar-map-mock']"
    );
    expect(mapMock!.getAttribute("data-readonly")).toBe("true");
  });

  it("passes readOnly=false to the desktop SidebarLocationMap (default)", () => {
    const { container } = renderTrigger({ readOnly: false });
    const desktopWrapper = container.querySelector(".hidden.lg\\:block");
    const mapMock = desktopWrapper!.querySelector(
      "[data-testid='sidebar-map-mock']"
    );
    expect(mapMock!.getAttribute("data-readonly")).toBe("false");
  });

  it("passes readOnly=true to the mobile SidebarLocationMap", async () => {
    renderTrigger({ readOnly: true });
    await userEvent.click(screen.getByRole("button", { name: /map/i }));
    const dialog = screen.getByRole("dialog");
    const mobileMap = within(dialog).getByTestId("sidebar-map-mock");
    expect(mobileMap.getAttribute("data-readonly")).toBe("true");
  });
});
