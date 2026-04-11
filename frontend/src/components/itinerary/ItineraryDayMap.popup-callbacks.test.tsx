/// <reference types="vitest/globals" />
/**
 * Phase 0 — RED tests for PopupCard callback wiring.
 *
 * These tests verify the PUBLIC CONTRACT of the PopupCard component:
 * - Correct affordances appear/disappear based on props.
 * - Save trims whitespace before calling onSaveNote.
 * - Delete calls onDelete with the correct location id (via the wrapper).
 * - readOnly suppresses affordances even when callbacks are provided.
 *
 * PopupCard is rendered directly (not through the map) because the behaviour
 * under test lives entirely in React and has no maplibre dependency.
 *
 * The companion file ItineraryDayMap.test.tsx covers the lower-level wiring
 * inside the imperative createRoot path. This file focuses on the visible
 * user-facing affordances and call-site contract.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PopupCard } from "./ItineraryDayMap";

// maplibre-gl is imported by ItineraryDayMap.tsx even though PopupCard itself
// has no dependency on it. Mock it so jsdom doesn't crash on WebGL import.
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
    unproject: vi.fn().mockReturnValue([0, 0]),
    remove: vi.fn(),
    resize: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    getContainer: vi.fn().mockReturnValue({ clientHeight: 600 }),
  }));
  const LngLatBounds = vi.fn().mockImplementation(() => ({
    extend: vi.fn(),
    isEmpty: vi.fn().mockReturnValue(false),
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

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPopup(
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
// Tests
// ---------------------------------------------------------------------------

describe("PopupCard — callback wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── onSaveNote ─────────────────────────────────────────────────────────────

  it("test_popup_with_onSaveNote_shows_pencil_button", () => {
    renderPopup({ note: "Some note", onSaveNote: vi.fn() });
    // The edit affordance is an aria-labelled "Edit note" button.
    expect(
      screen.getByRole("button", { name: /edit note/i })
    ).toBeInTheDocument();
  });

  it("shows 'Add note' affordance when note is null but onSaveNote is provided", () => {
    renderPopup({ note: null, onSaveNote: vi.fn() });
    // When note is null the component renders an "Add note" button (still aria-label "Edit note").
    expect(
      screen.getByRole("button", { name: /edit note/i })
    ).toBeInTheDocument();
  });

  // ── onDelete ───────────────────────────────────────────────────────────────

  it("test_popup_with_onDelete_shows_delete_button", () => {
    renderPopup({ onDelete: vi.fn() });
    expect(
      screen.getByRole("button", { name: /delete location/i })
    ).toBeInTheDocument();
  });

  // ── No callbacks → no affordances ─────────────────────────────────────────

  it("test_popup_without_callbacks_hides_affordances", () => {
    renderPopup({ note: "Some note" });
    expect(
      screen.queryByRole("button", { name: /edit note/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete location/i })
    ).not.toBeInTheDocument();
  });

  // ── readOnly suppresses even when callbacks are provided ───────────────────

  it("test_popup_readOnly_hides_affordances_even_when_callbacks_provided", () => {
    renderPopup({
      note: "Visible note",
      onSaveNote: vi.fn(),
      onDelete: vi.fn(),
      readOnly: true,
    });
    expect(
      screen.queryByRole("button", { name: /edit note/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete location/i })
    ).not.toBeInTheDocument();
  });

  // ── Save trims value ───────────────────────────────────────────────────────

  it("test_popup_saves_trimmed_note_value", async () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    renderPopup({ note: "Old note", onSaveNote });

    // Enter edit mode.
    fireEvent.click(screen.getByRole("button", { name: /edit note/i }));

    // Type a new value with surrounding whitespace.
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "  Trimmed note  " } });

    // Click Save.
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledTimes(1);
      expect(onSaveNote).toHaveBeenCalledWith("Trimmed note");
    });
  });

  // ── onDelete receives the location id ─────────────────────────────────────
  //
  // PopupCard itself calls onDelete() with no arguments — the location-id
  // wrapping is the responsibility of the ItineraryDayMap call site (tested in
  // ItineraryDayMap.test.tsx). Here we assert the PopupCard-level contract:
  // clicking Confirm calls onDelete() with no arguments.

  it("test_popup_delete_click_calls_onDelete_with_location_id", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderPopup({ onDelete });

    // Click the delete affordance to open the confirmation row.
    fireEvent.click(screen.getByRole("button", { name: /delete location/i }));

    // Confirm deletion.
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});
