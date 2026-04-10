"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { NavigationControl, type Offset } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Pencil, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import {
  CATEGORY_OPTIONS,
  CATEGORY_META,
  type CategoryKey,
} from "@/lib/location-constants";
import { cn } from "@/lib/utils";

// Max note length — must match backend `_LOCATION_NOTE_MAX` in schemas.py.
const POPUP_NOTE_MAX_LENGTH = 2000;

function getCategoryColors(category: string | null | undefined): {
  text: string;
} {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const meta = CATEGORY_META[categoryKey];
  return { text: meta.hexText };
}

export interface ItineraryDayMapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  note?: string | null;
}

export interface MapRoutePolyline {
  routeId: string;
  color: string;
  encodedPolylines: string[];
  /** Pre-formatted label, e.g. "26 min · 1.9 km" */
  label?: string;
}

interface ItineraryDayMapProps {
  locations: ItineraryDayMapLocation[];
  routes?: MapRoutePolyline[];
  selectedRouteId?: string | null;
  /** When set, the map flies to this location and opens its popup. */
  focusLocationId?: string | null;
  /** Incrementing counter to re-trigger focus even when the same location is clicked again. */
  focusSeq?: number;
  /** When true, clicking a pin will not open a popup card. */
  disablePopups?: boolean;
  /** Called with the clicked location id. Only active when `disablePopups`
   *  is also set (otherwise the popup click path handles it). Enables the
   *  sidebar map's "click pin → scroll the main page to the card" flow. */
  onPinClick?: (locationId: string) => void;
  /** When provided, the popup card exposes an inline note editor that calls
   *  this with `(locationId, nextNote)` on save. Held in a ref so callback
   *  identity changes don't re-run the heavy map-building effect. */
  onLocationNoteSave?: (
    locationId: string,
    nextNote: string
  ) => Promise<void> | void;
  /** When provided, the popup card exposes a delete action that calls this
   *  with the location id on confirmation. Held in a ref for the same reason. */
  onLocationDelete?: (locationId: string) => Promise<void> | void;
  /** Threaded as a prop rather than read from `useReadOnly()` because the
   *  popup content is rendered into an imperatively-created `createRoot`
   *  outside the React tree and would not inherit context. */
  readOnly?: boolean;
}

/** Decode a Google-encoded polyline string into [lng, lat] pairs for GeoJSON. */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng * 1e-5, lat * 1e-5]);
  }
  return coords;
}

function MapMarkerContent({
  category,
  name,
  isOpen,
  isSelected,
  isHovered,
}: {
  category: string | null | undefined;
  name: string;
  isOpen?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const colors = getCategoryColors(category);
  // Show label on hover only — hide when popup card is open to avoid overlap
  const showLabel = isHovered && !isOpen;
  const active = isOpen || isSelected;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        // Outer wrapper is transparent to pointer events; only the pin body
        // below catches them. This keeps the hit area small and stable when
        // pins are close together, so hover switches feel responsive.
        pointerEvents: "none",
        filter: active
          ? "drop-shadow(0 2px 8px rgba(0,0,0,.3))"
          : "drop-shadow(0 1px 4px rgba(0,0,0,.18))",
      }}
      title={name}
    >
      {/* Label pill — absolutely positioned so it never inflates the hit
          area or blocks hover on neighbouring pins. */}
      {showLabel && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: "white",
            border: `1.5px solid ${colors.text}`,
            whiteSpace: "nowrap",
          }}
        >
          <CategoryIcon
            category={categoryKey}
            size={12}
            className="shrink-0"
            style={{ color: colors.text }}
          />
          <span
            className="max-w-[120px] truncate text-[11px] font-semibold leading-none"
            style={{ color: colors.text }}
          >
            {name}
          </span>
        </div>
      )}
      {/* Pin body — teardrop with category icon. Only element that captures
          pointer events (cursor + clicks). */}
      <div
        className="relative flex cursor-pointer items-center justify-center transition-transform duration-150"
        style={{
          width: 34,
          height: 40,
          pointerEvents: "auto",
          transform: active
            ? "scale(1.2)"
            : isHovered
              ? "scale(1.08)"
              : "scale(1)",
        }}
      >
        <svg
          viewBox="0 0 34 40"
          width="34"
          height="40"
          className="absolute inset-0"
        >
          <path
            d="M17 39C17 39 32 23.5 32 14.5C32 6.492 25.284 0.5 17 0.5C8.716 0.5 2 6.492 2 14.5C2 23.5 17 39 17 39Z"
            fill={active ? colors.text : "white"}
            stroke={colors.text}
            strokeWidth={active ? "0" : "1.5"}
          />
        </svg>
        <div
          className="relative z-10 flex items-center justify-center"
          style={{ marginBottom: 8 }}
        >
          <CategoryIcon
            category={categoryKey}
            size={16}
            className="shrink-0"
            style={{ color: active ? "white" : colors.text }}
          />
        </div>
      </div>
    </div>
  );
}

export function PopupCard({
  name,
  category,
  image_url,
  user_image_url,
  requires_booking,
  city,
  note,
  readOnly,
  onSaveNote,
  onDelete,
}: {
  name: string;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  note?: string | null;
  /** When true, hides all mutation affordances (edit/delete). Threaded as a
   *  prop (not via React context) because the popup is rendered into a
   *  detached root by `createRoot(popupContentEl)` and would not inherit
   *  the `ReadOnlyProvider` context from the surrounding page. */
  readOnly?: boolean;
  /** When provided (and not readOnly), shows a pencil button that reveals
   *  an inline textarea. Receives the trimmed next value. Rejected promise
   *  keeps edit mode open and surfaces an inline error. */
  onSaveNote?: (nextNote: string) => Promise<void> | void;
  /** When provided (and not readOnly), shows a trash button that reveals
   *  an inline confirmation row. Rejected promise keeps the confirm row
   *  visible and surfaces an inline error. */
  onDelete?: () => Promise<void> | void;
}) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Mirror the incoming `note` prop into the draft while NOT in edit mode.
  // If a save elsewhere updates the note, the popup's view should reflect it;
  // during active editing, the user's draft wins.
  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(note ?? "");
    }
  }, [note, editingNote]);

  const imageUrl = user_image_url || image_url;
  const booking = requires_booking ?? "no";
  const showBooking = booking === "yes" || booking === "yes_done";
  const canEditNote = !readOnly && onSaveNote != null;
  const canDelete = !readOnly && onDelete != null;

  const enterEditMode = () => {
    // `noteDraft` is already kept in sync with `note` while !editingNote via
    // the effect above, so no explicit reset is needed here.
    setNoteError(null);
    setEditingNote(true);
  };

  const cancelEdit = () => {
    setEditingNote(false);
    setNoteDraft(note ?? "");
    setNoteError(null);
  };

  const submitEdit = async () => {
    if (!onSaveNote) return;
    const trimmed = noteDraft.trim();
    // No-op when the user hasn't actually changed anything. Exit edit mode
    // anyway so the pencil → Save round-trip feels like a valid "close" path.
    if (trimmed === (note ?? "")) {
      setEditingNote(false);
      setNoteError(null);
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      await onSaveNote(trimmed);
      setEditingNote(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  const requestDelete = () => {
    setDeleteError(null);
    setConfirmingDelete(true);
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      // Parent will typically remove this location, which destroys the
      // popup root entirely — no need to reset local state here.
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete location"
      );
      setDeleting(false);
    }
  };

  return (
    <div className="w-[220px] overflow-hidden rounded-xl bg-card shadow-lg">
      {imageUrl ? (
        <div className="relative h-28 w-full bg-muted">
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover object-center"
          />
          {/* Gradient overlay for badge readability */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                  booking === "yes_done"
                    ? "bg-booking-done-bg/95 text-booking-done-text"
                    : "bg-booking-pending-bg/95 text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        </div>
      ) : (
        (category || showBooking) && (
          <div className="flex flex-wrap gap-1 px-3 pt-3">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  booking === "yes_done"
                    ? "border-booking-done-border bg-booking-done-bg text-booking-done-text"
                    : "border-booking-pending-border bg-booking-pending-bg text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        )
      )}
      <div className="px-3 pb-3 pt-2.5">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {name}
        </p>
        {city && (
          <p
            data-testid="popup-city"
            className="mt-0.5 text-xs text-muted-foreground"
          >
            {city}
          </p>
        )}

        {/* Note area — wraps the pill and an absolutely-positioned pencil
         *  overlay so the edit affordance is visually attached to the
         *  note field (addressing user feedback that a bottom-row icon
         *  looked detached and ambiguous). Also holds the "Add note"
         *  placeholder for the null-note case. */}
        {!editingNote && (
          <div data-testid="popup-note-container" className="relative mt-2">
            {note ? (
              <>
                <button
                  type="button"
                  data-testid="popup-note"
                  onClick={() => setNoteExpanded((prev) => !prev)}
                  className="block w-full cursor-pointer rounded-md bg-muted/60 px-2 py-1.5 pr-7 text-left text-[11px] leading-relaxed text-muted-foreground outline-none transition-colors hover:bg-muted"
                >
                  <span className={noteExpanded ? "" : "line-clamp-2"}>
                    {note}
                  </span>
                </button>
                {canEditNote && (
                  <button
                    type="button"
                    aria-label="Edit note"
                    onClick={(e) => {
                      // Sibling of (not child of) the note button above, so
                      // clicks here stop propagation defensively — the two
                      // live in the same relative wrapper and we don't want
                      // a bubble to hit the expand-toggle.
                      e.stopPropagation();
                      enterEditMode();
                    }}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </>
            ) : (
              canEditNote && (
                <button
                  type="button"
                  aria-label="Edit note"
                  onClick={enterEditMode}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
                >
                  <Pencil size={11} />
                  Add note
                </button>
              )
            )}
          </div>
        )}

        {/* Note — edit mode */}
        {editingNote && (
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              aria-label="Edit note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEdit();
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  void submitEdit();
                }
              }}
              rows={3}
              maxLength={POPUP_NOTE_MAX_LENGTH}
              disabled={savingNote}
              autoFocus
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
              placeholder="Add a note…"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={savingNote}
                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {savingNote ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingNote}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {noteError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {noteError}
              </p>
            )}
          </div>
        )}

        {/* Delete confirmation row */}
        {confirmingDelete && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
            <p className="text-[11px] font-medium text-foreground">
              Delete this location?
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="rounded-md bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground outline-none transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {deleteError}
              </p>
            )}
          </div>
        )}

        {/* Labeled "Delete location" button — full-width with explicit text
         *  so users can't mistake it for "delete note". Hidden in read-only
         *  mode and while editing/confirming. */}
        {canDelete && !editingNote && !confirmingDelete && (
          <button
            type="button"
            aria-label="Delete location"
            onClick={requestDelete}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={12} />
            Delete location
          </button>
        )}
      </div>
    </div>
  );
}

export function ItineraryDayMap({
  locations,
  routes,
  compact,
  selectedRouteId,
  focusLocationId,
  focusSeq,
  disablePopups,
  onPinClick,
  onLocationNoteSave,
  onLocationDelete,
  readOnly,
}: ItineraryDayMapProps & { compact?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  // Refs mirror state so imperative code (popup/marker event handlers,
  // mousemove handler) can read the current selection synchronously without
  // waiting for React to flush state updates.
  const selectedLocationIdRef = useRef<string | null>(null);
  const hoveredLocationIdRef = useRef<string | null>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const renderAllMarkersRef = useRef<(() => void) | null>(null);
  // onPinClick held in a ref so the map-building effect doesn't re-run on
  // every parent render just because the callback identity changed. The
  // sync runs in a layout effect (not a passive effect) so the ref is
  // always current before the browser can paint — which means a click
  // landing in the same frame as a prop update will read the new callback.
  const onPinClickRef = useRef(onPinClick);
  useLayoutEffect(() => {
    onPinClickRef.current = onPinClick;
  }, [onPinClick]);
  // Same ref-mirror pattern for the new popup-card edit/delete callbacks:
  // they are invoked from inside closures captured by `popupRoot.render()`,
  // so we must read the latest callback identity at call time rather than
  // baking it into the map-building effect's dependency list.
  const onLocationNoteSaveRef = useRef(onLocationNoteSave);
  const onLocationDeleteRef = useRef(onLocationDelete);
  const readOnlyRef = useRef(readOnly);
  useLayoutEffect(() => {
    onLocationNoteSaveRef.current = onLocationNoteSave;
    onLocationDeleteRef.current = onLocationDelete;
    readOnlyRef.current = readOnly;
  }, [onLocationNoteSave, onLocationDelete, readOnly]);
  const markerStateRef = useRef<{
    roots: ReturnType<typeof createRoot>[];
    markers: maplibregl.Marker[];
    // Parallel to `markers`; entry is null when `disablePopups` is set.
    popups: (maplibregl.Popup | null)[];
    popupRoots: (ReturnType<typeof createRoot> | null)[];
    locations: ItineraryDayMapLocation[];
  } | null>(null);
  // Track route layer source IDs and coords so the highlight effect can update paint properties and fit bounds
  const routeSourceIdsRef = useRef<
    { routeId: string; sourceId: string; coords: [number, number][] }[]
  >([]);

  // Structural key for the map-building effect: changes only when the set or
  // order of location IDs changes. Content-only updates (e.g. a note save)
  // keep the key stable, so the heavy map/marker rebuild does not run and
  // the open popup stays open. A separate effect below patches the existing
  // popups in place on content changes.
  const locationsStructKey = useMemo(
    () => locations.map((l) => l.id).join("|"),
    [locations]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (!locations.length) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setSelectedLocationId(null);
    selectedLocationIdRef.current = null;
    hoveredLocationIdRef.current = null;
    cursorPosRef.current = null;
    markerStateRef.current = null;

    let disposed = false;

    const first = locations[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: [first.longitude, first.latitude],
      zoom: locations.length === 1 ? 14.5 : 11,
      attributionControl: compact ? false : undefined,
    });

    mapRef.current = map;
    if (!compact) {
      map.addControl(
        new NavigationControl({ visualizePitch: true }),
        "top-right"
      );
    }

    const bounds = new maplibregl.LngLatBounds();
    const roots: ReturnType<typeof createRoot>[] = [];
    const markers: maplibregl.Marker[] = [];
    const popups: (maplibregl.Popup | null)[] = [];
    const popupRoots: (ReturnType<typeof createRoot> | null)[] = [];
    // Per-marker teardown callbacks (remove click/keydown listeners we
    // attached directly to the marker DOM element). Called from cleanup.
    const markerTeardowns: Array<() => void> = [];

    // Unified re-render of every marker based on current refs (selection +
    // hover). All imperative code paths (popup open/close, proximity hover,
    // focus effect) call this to keep visuals consistent.
    //
    // Reads `locations` through `markerStateRef.current?.locations` so the
    // content-refresh effect (below the main build effect) can mutate the
    // stored snapshot when a content-only update arrives, and subsequent
    // `renderAllMarkers` calls will see the fresh category/name fields
    // without needing to rebuild the entire map.
    const renderAllMarkers = () => {
      if (disposed) return;
      const currentLocations = markerStateRef.current?.locations ?? locations;
      for (let i = 0; i < markers.length; i++) {
        const loc = currentLocations[i];
        const isOpen = popups[i]?.isOpen() ?? false;
        const isSelected = loc.id === selectedLocationIdRef.current;
        const isHovered = loc.id === hoveredLocationIdRef.current;
        roots[i].render(
          <MapMarkerContent
            category={loc.category}
            name={loc.name}
            isOpen={isOpen}
            isSelected={isSelected}
            isHovered={isHovered}
          />
        );
        const el = markers[i].getElement();
        // Z-index priority (highest to lowest):
        //   popup open (15) > hovered (12) > selected (10) > default ("")
        // Selected gets its own tier so a pin that was focused via a card
        // click or a sidebar pin click always sits above non-selected pins
        // nearby, even when none are being hovered. Hover still wins so the
        // user can inspect neighbours without losing the selected context.
        el.style.zIndex = isOpen
          ? "15"
          : isHovered
            ? "12"
            : isSelected
              ? "10"
              : "";
      }
    };

    locations.forEach((loc) => {
      const lngLat: [number, number] = [loc.longitude, loc.latitude];
      bounds.extend(lngLat);

      // Only allocate the popup (and its React root) when popups are
      // enabled. When `disablePopups` is set we never open one, so we
      // skip the DOM + React tree allocation entirely.
      let popup: maplibregl.Popup | null = null;
      if (!disablePopups) {
        const popupContentEl = document.createElement("div");
        const popupRoot = createRoot(popupContentEl);
        // Note-save and delete are passed as ref-reading closures so the
        // map-building effect does not need to re-run when callback identity
        // changes. `readOnly` is also read via ref so runtime toggles work
        // without rebuilding.
        //
        // SNAPSHOT CAVEAT: the ternary that decides whether to pass a defined
        // callback (vs `undefined`) is evaluated ONCE here at map-build time.
        // If a caller mounts `ItineraryDayMap` without `onLocationNoteSave`
        // and later starts passing it, the edit button will NOT appear for
        // the current session — the popup is baked with `onSaveNote=undefined`
        // until `[locations, routes, compact, disablePopups]` change and the
        // map rebuilds. Same for `onLocationDelete` and `readOnly`. Callers
        // must pass (or omit) these props consistently from the first render.
        // The trip detail page passes both callbacks unconditionally; shared
        // trip pages pass neither.
        const saveCb = onLocationNoteSaveRef.current;
        const deleteCb = onLocationDeleteRef.current;
        popupRoot.render(
          <PopupCard
            name={loc.name}
            category={loc.category}
            image_url={loc.image_url}
            user_image_url={loc.user_image_url}
            requires_booking={loc.requires_booking}
            city={loc.city}
            note={loc.note}
            readOnly={readOnlyRef.current}
            onSaveNote={
              saveCb
                ? (nextNote: string) =>
                    onLocationNoteSaveRef.current?.(loc.id, nextNote)
                : undefined
            }
            onDelete={
              deleteCb ? () => onLocationDeleteRef.current?.(loc.id) : undefined
            }
          />
        );
        popupRoots.push(popupRoot);

        popup = new maplibregl.Popup({
          anchor: "bottom",
          offset: [0, -46] as Offset,
          closeButton: true,
          closeOnClick: false,
          maxWidth: "240px",
        }).setDOMContent(popupContentEl);

        popup.on("open", () => {
          if (disposed) return;
          // Set the ref BEFORE closing other popups, so their synchronous
          // close handlers see ref !== theirLoc.id and leave it alone.
          selectedLocationIdRef.current = loc.id;
          setSelectedLocationId(loc.id);
          // Close other popups — index through markerStateRef so we see any
          // content-refresh updates. Ids stay stable within a structural key.
          const currentLocs = markerStateRef.current?.locations ?? locations;
          markers.forEach((m, i) => {
            if (currentLocs[i].id !== loc.id) {
              popups[i]?.remove();
            }
          });
          renderAllMarkers();
          // Fly to pin and center the popup+pin combo on screen. Read the
          // live marker position (not the closure-captured `lngLat`) so a
          // lat/lng update flowed in by the content-refresh effect targets
          // the new coordinates.
          const zoom = map.getZoom();
          const targetZoom = zoom < 12 ? 12 : zoom;
          const { lng, lat } = marker.getLngLat();
          map.flyTo({
            center: [lng, lat],
            zoom: targetZoom,
            offset: [0, 60],
            duration: 500,
          });
        });
        popup.on("close", () => {
          if (disposed) return;
          if (selectedLocationIdRef.current === loc.id) {
            selectedLocationIdRef.current = null;
            setSelectedLocationId((prev) => (prev === loc.id ? null : prev));
          }
          renderAllMarkers();
        });
      } else {
        popupRoots.push(null);
      }
      popups.push(popup);

      const el = document.createElement("div");
      const root = createRoot(el);
      roots.push(root);

      const markerBuilder = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, 0],
      }).setLngLat(lngLat);
      if (popup) {
        markerBuilder.setPopup(popup);
      }
      const marker = markerBuilder.addTo(map);
      markers.push(marker);

      // Click/keyboard wiring for the "sidebar pin click → scroll to card"
      // flow. Only attached when popups are disabled, so we don't double-fire
      // with MapLibre's built-in popup click handler. Reads the callback via
      // a ref so re-renders with a new callback identity don't thrash the
      // map-building effect. Listeners are attached to `el` (the outer
      // marker container) which is stable across `renderAllMarkers` calls.
      if (disablePopups) {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", `Focus ${loc.name}`);
        // Tag for the :focus-visible style in globals.css — gives keyboard
        // users a visible focus ring that a plain div otherwise wouldn't get.
        el.classList.add("map-pin-focusable");

        const invoke = () => {
          const cb = onPinClickRef.current;
          if (!cb) return;
          selectedLocationIdRef.current = loc.id;
          setSelectedLocationId(loc.id);
          renderAllMarkers();
          cb(loc.id);
        };

        const handleMarkerClick = (ev: MouseEvent) => {
          ev.stopPropagation();
          invoke();
        };
        const handleMarkerKeyDown = (ev: KeyboardEvent) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            ev.stopPropagation();
            invoke();
          }
        };

        el.addEventListener("click", handleMarkerClick);
        el.addEventListener("keydown", handleMarkerKeyDown);
        markerTeardowns.push(() => {
          el.removeEventListener("click", handleMarkerClick);
          el.removeEventListener("keydown", handleMarkerKeyDown);
        });
      }
    });

    markerStateRef.current = {
      roots,
      markers,
      popups,
      popupRoots,
      locations,
    };

    // Publish the render function now that the parallel arrays are fully
    // populated. Doing this after the forEach guarantees any external call
    // site invoking the ref sees a complete marker set.
    renderAllMarkersRef.current = renderAllMarkers;
    renderAllMarkers();

    // Proximity-based hover detection. We find the pin closest to the cursor
    // within a pixel threshold and treat that as hovered. This avoids the
    // problem where two pins sit on top of each other and the DOM's
    // mouseenter/mouseleave events fire lazily because the mouse is still
    // "inside" the bounding box of the first pin.
    const HOVER_THRESHOLD_SQ = 32 * 32;
    // Marker anchor is bottom; the teardrop's visual center sits ~20px
    // above the anchor point (height 40, weighted toward the top of the pin).
    const PIN_VISUAL_CENTER_OFFSET_Y = 20;
    const mapContainer = containerRef.current;

    const updateHoverFromCursor = () => {
      if (!cursorPosRef.current) return;
      const { x: localX, y: localY } = cursorPosRef.current;
      // Read through markerStateRef so the content-refresh effect's lat/lng
      // updates flow into the hit-test, parallel to the `renderAllMarkers`
      // read path. Fallback to closure-captured `locations` during the
      // initial build, before markerStateRef is populated.
      const currentLocations = markerStateRef.current?.locations ?? locations;
      let closestId: string | null = null;
      let closestDistSq = Infinity;
      for (let i = 0; i < currentLocations.length; i++) {
        const loc = currentLocations[i];
        const pt = map.project([loc.longitude, loc.latitude]);
        const dx = pt.x - localX;
        const dy = pt.y - PIN_VISUAL_CENTER_OFFSET_Y - localY;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestId = loc.id;
        }
      }
      if (closestDistSq > HOVER_THRESHOLD_SQ) closestId = null;
      if (closestId !== hoveredLocationIdRef.current) {
        hoveredLocationIdRef.current = closestId;
        renderAllMarkers();
      }
    };

    const handleContainerMouseMove = (e: MouseEvent) => {
      const rect = mapContainer.getBoundingClientRect();
      cursorPosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      updateHoverFromCursor();
    };

    const handleContainerMouseLeave = () => {
      cursorPosRef.current = null;
      if (hoveredLocationIdRef.current !== null) {
        hoveredLocationIdRef.current = null;
        renderAllMarkers();
      }
    };

    // Re-evaluate hover while the map pans under a stationary cursor.
    const handleMapMove = () => {
      updateHoverFromCursor();
    };

    mapContainer.addEventListener("mousemove", handleContainerMouseMove);
    mapContainer.addEventListener("mouseleave", handleContainerMouseLeave);
    map.on("move", handleMapMove);

    const labelMarkers: maplibregl.Marker[] = [];
    const pendingLabels: {
      color: string;
      label: string;
      coords: [number, number][];
    }[] = [];

    const routeSources: {
      routeId: string;
      sourceId: string;
      coords: [number, number][];
    }[] = [];

    map.once("load", () => {
      // Add route polylines
      if (routes && routes.length > 0) {
        routes.forEach((route, routeIdx) => {
          const allCoords: [number, number][] = [];
          for (const encoded of route.encodedPolylines) {
            const decoded = decodePolyline(encoded);
            allCoords.push(...decoded);
          }
          if (allCoords.length === 0) return;

          // Extend bounds to include route path
          for (const coord of allCoords) {
            bounds.extend(coord as [number, number]);
          }

          const sourceId = `route-${route.routeId}-${routeIdx}`;
          routeSources.push({
            routeId: route.routeId,
            sourceId,
            coords: allCoords,
          });
          const color = route.color;

          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: allCoords,
              },
            },
          });

          // Outer glow for contrast and depth
          map.addLayer({
            id: `${sourceId}-glow`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": color,
              "line-width": 10,
              "line-opacity": 0.08,
              "line-blur": 4,
            },
          });

          // White casing for contrast against the map
          map.addLayer({
            id: `${sourceId}-outline`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#ffffff",
              "line-width": 6,
              "line-opacity": 0.85,
            },
          });

          // Main colored line
          map.addLayer({
            id: `${sourceId}-line`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": color,
              "line-width": 3.5,
              "line-opacity": 0.85,
            },
          });

          // Direction chevrons along the route
          map.addLayer({
            id: `${sourceId}-arrows`,
            type: "symbol",
            source: sourceId,
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": 80,
              "text-field": "▸",
              "text-size": 14,
              "text-rotation-alignment": "map",
              "text-keep-upright": false,
              "text-allow-overlap": true,
            },
            paint: {
              "text-color": color,
              "text-opacity": 0.7,
            },
          });

          // Store coords for deferred label placement (after fitBounds)
          if (route.label && allCoords.length >= 2) {
            pendingLabels.push({
              color,
              label: route.label,
              coords: allCoords,
            });
          }
        });
      }

      if (locations.length === 1) {
        map.setCenter([first.longitude, first.latitude]);
        map.setZoom(14.5);
      } else if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: compact ? 20 : 40,
          maxZoom: compact ? 13 : 15,
          duration: 0,
        });
      }
      map.resize();

      // Place route labels avoiding marker overlap.
      // We check whether the label's bounding box (estimated from text)
      // would overlap any marker's bounding box on screen.
      if (pendingLabels.length > 0) {
        const MARKER_HALF_W = 20;
        const MARKER_HALF_H = 24;
        const LABEL_PAD = 6; // extra breathing room around label
        const SAMPLE_STEP = 2;

        const markerScreenPts = locations.map((loc) =>
          map.project([loc.longitude, loc.latitude])
        );

        // Check if a label rect overlaps any marker rect
        const overlapsAnyMarker = (
          cx: number,
          cy: number,
          halfW: number,
          halfH: number
        ): boolean => {
          for (const mp of markerScreenPts) {
            if (
              cx - halfW < mp.x + MARKER_HALF_W &&
              cx + halfW > mp.x - MARKER_HALF_W &&
              cy - halfH < mp.y + MARKER_HALF_H &&
              cy + halfH > mp.y - MARKER_HALF_H
            ) {
              return true;
            }
          }
          return false;
        };

        for (const { color, label, coords } of pendingLabels) {
          // Estimate label size from text length
          const labelHalfW = label.length * 3.5 + 10 + LABEL_PAD;
          const labelHalfH = 12 + LABEL_PAD;

          let bestPt: [number, number] | null = null;
          let bestMinDist = -1;

          for (let i = 0; i < coords.length; i += SAMPLE_STEP) {
            const sp = map.project(coords[i]);

            // Skip if label rect would overlap any marker
            if (overlapsAnyMarker(sp.x, sp.y, labelHalfW, labelHalfH)) continue;

            // Among non-overlapping candidates, pick the one farthest from any marker
            let minDist = Infinity;
            for (const mp of markerScreenPts) {
              const dx = sp.x - mp.x;
              const dy = sp.y - mp.y;
              const d = dx * dx + dy * dy;
              if (d < minDist) minDist = d;
            }
            if (minDist > bestMinDist) {
              bestMinDist = minDist;
              bestPt = coords[i];
            }
          }

          // Only place the label if we found a non-overlapping position
          if (bestPt) {
            const el = document.createElement("div");
            const isDark = document.documentElement.classList.contains("dark");
            el.style.cssText =
              `background:${isDark ? "hsl(20,20%,10%)" : "white"};color:${isDark ? "hsl(30,20%,85%)" : "#374151"};font-size:11px;font-weight:500;` +
              `padding:2px 6px;border-radius:10px;border:1.5px solid ${color};` +
              `white-space:nowrap;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.12);`;
            el.textContent = label;
            const labelMarker = new maplibregl.Marker({
              element: el,
              anchor: "center",
            })
              .setLngLat(bestPt)
              .addTo(map);
            labelMarkers.push(labelMarker);
          }
        }
      }

      // Store route layer IDs now that all layers are added
      routeSourceIdsRef.current = routeSources;
    });

    requestAnimationFrame(() => map.resize());

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      mapContainer.removeEventListener("mousemove", handleContainerMouseMove);
      mapContainer.removeEventListener("mouseleave", handleContainerMouseLeave);
      map.off("move", handleMapMove);
      markerTeardowns.forEach((fn) => fn());
      roots.forEach((r) => r.unmount());
      popupRoots.forEach((r) => r?.unmount());
      labelMarkers.forEach((m) => m.remove());
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerStateRef.current = null;
      renderAllMarkersRef.current = null;
    };
    // Dep list intentionally uses `locationsStructKey` (not `locations`) so
    // content-only updates do NOT rebuild the map. Structural changes
    // (add/remove/reorder of ids) flip the key and rebuild correctly.
    // The content-refresh effect below patches open popups in place.
  }, [locationsStructKey, routes, compact, disablePopups]);

  // Content-refresh effect: when `locations` identity changes but the
  // structural key is stable (same ids in same order), patch the existing
  // marker positions and popup contents in place without rebuilding the
  // map. This is what keeps an open popup open across a note save — the
  // main effect no longer runs, so the popup root is reused and
  // `popupRoot.render(<PopupCard ...>)` just flows fresh props through
  // React's reconciler (which preserves PopupCard's internal state).
  useEffect(() => {
    const state = markerStateRef.current;
    if (!state) return;
    // Structural guard: if length/order differs, the main effect is about
    // to rebuild everything — skip to avoid double work and stale updates.
    if (state.locations.length !== locations.length) return;
    for (let i = 0; i < locations.length; i++) {
      if (state.locations[i].id !== locations[i].id) return;
    }

    // Mutate the cached snapshot so closures reading through it
    // (e.g. `renderAllMarkers`, `popup.on("open")`) see fresh data.
    state.locations = locations;

    // Update marker positions in case lat/lng drifted (rare but possible).
    // Also patch the popup content for each location that has a popup.
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      state.markers[i].setLngLat([loc.longitude, loc.latitude]);
      const popupRoot = state.popupRoots[i];
      if (!popupRoot) continue;
      // Same ref-reading closure pattern as the initial popup render inside
      // the main effect — SNAPSHOT CAVEAT comment there applies verbatim.
      const saveCb = onLocationNoteSaveRef.current;
      const deleteCb = onLocationDeleteRef.current;
      popupRoot.render(
        <PopupCard
          name={loc.name}
          category={loc.category}
          image_url={loc.image_url}
          user_image_url={loc.user_image_url}
          requires_booking={loc.requires_booking}
          city={loc.city}
          note={loc.note}
          readOnly={readOnlyRef.current}
          onSaveNote={
            saveCb
              ? (nextNote: string) =>
                  onLocationNoteSaveRef.current?.(loc.id, nextNote)
              : undefined
          }
          onDelete={
            deleteCb ? () => onLocationDeleteRef.current?.(loc.id) : undefined
          }
        />
      );
    }
    // Refresh marker DOM content (pin icon/label colour depend on category).
    renderAllMarkersRef.current?.();
  }, [locations]);

  // Keep the selection ref in sync with React state and force a marker
  // re-render. Runs on every selection change (including deselection) so
  // hover handlers can never get "stuck" in an old state.
  useEffect(() => {
    selectedLocationIdRef.current = selectedLocationId;
    renderAllMarkersRef.current?.();
  }, [selectedLocationId]);

  // Highlight the selected route, dim others
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sources = routeSourceIdsRef.current;
    if (sources.length === 0) return;

    let selectedCoords: [number, number][] | null = null;

    for (const { routeId, sourceId, coords } of sources) {
      const isSelected = routeId === selectedRouteId;
      const isDimmed = selectedRouteId != null && !isSelected;

      if (isSelected) selectedCoords = coords;

      try {
        map.setPaintProperty(
          `${sourceId}-line`,
          "line-opacity",
          isDimmed ? 0.25 : 0.85
        );
        map.setPaintProperty(
          `${sourceId}-line`,
          "line-width",
          isSelected ? 5 : 3.5
        );
        map.setPaintProperty(
          `${sourceId}-outline`,
          "line-opacity",
          isDimmed ? 0.3 : 0.85
        );
        map.setPaintProperty(
          `${sourceId}-outline`,
          "line-width",
          isSelected ? 8 : 6
        );
        map.setPaintProperty(
          `${sourceId}-glow`,
          "line-opacity",
          isSelected ? 0.15 : isDimmed ? 0.02 : 0.08
        );
        map.setPaintProperty(
          `${sourceId}-arrows`,
          "text-opacity",
          isDimmed ? 0.15 : isSelected ? 0.9 : 0.7
        );
      } catch {
        // Layers may not exist yet if map hasn't loaded
      }
    }

    // Fit the map to the selected route's bounds
    if (selectedCoords && selectedCoords.length >= 2) {
      const routeBounds = new maplibregl.LngLatBounds();
      for (const c of selectedCoords) routeBounds.extend(c);
      map.fitBounds(routeBounds, {
        padding: compact ? 30 : 60,
        maxZoom: 15,
        duration: 500,
      });
    } else if (selectedRouteId == null) {
      // Deselected — fit back to all locations + routes
      const allBounds = new maplibregl.LngLatBounds();
      for (const loc of locations) {
        allBounds.extend([loc.longitude, loc.latitude]);
      }
      for (const { coords } of sources) {
        for (const c of coords) allBounds.extend(c);
      }
      if (!allBounds.isEmpty()) {
        map.fitBounds(allBounds, {
          padding: compact ? 20 : 40,
          maxZoom: compact ? 13 : 15,
          duration: 500,
        });
      }
    }
  }, [selectedRouteId, locations, compact]);

  // Fly to a specific location and highlight its marker (no popup)
  useEffect(() => {
    const map = mapRef.current;
    const state = markerStateRef.current;
    if (!map || !state || !focusLocationId) return;

    const idx = state.locations.findIndex((l) => l.id === focusLocationId);
    if (idx === -1) return;

    const loc = state.locations[idx];

    // Set selection BEFORE closing popups. Popup.remove() fires "close"
    // handlers synchronously — if the ref still points at the previously
    // selected loc, that handler would null the ref and briefly render an
    // unselected state before we re-set it below. Setting the ref first
    // makes the close handlers a no-op for selection state.
    selectedLocationIdRef.current = loc.id;
    setSelectedLocationId(loc.id);

    // Close any open popups
    state.popups.forEach((p) => p?.remove());

    // Apply the new highlight (renderAllMarkers handles z-index + scale).
    renderAllMarkersRef.current?.();

    // Fly to the location
    map.flyTo({
      center: [loc.longitude, loc.latitude],
      zoom: Math.max(map.getZoom(), 13),
      duration: 500,
    });
  }, [focusLocationId, focusSeq]);

  return (
    <div
      ref={containerRef}
      data-testid="itinerary-day-map"
      data-selected-route-id={selectedRouteId ?? ""}
      className="h-full min-h-[200px] w-full"
    />
  );
}
