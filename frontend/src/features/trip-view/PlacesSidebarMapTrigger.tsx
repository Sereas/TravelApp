"use client";

/**
 * Dual-render wrapper for the Places tab sidebar map.
 *
 * - Desktop (`lg+`, 1024px+): renders `SidebarLocationMap` directly, styled
 *   as a sticky right column (the parent supplies the grid cell).
 * - Mobile (< `lg`): renders a "Map" pill button that opens a `Sheet`
 *   (bottom drawer) containing a second `SidebarLocationMap`.
 *
 * Both wrappers are ALWAYS in the DOM. Media queries (`hidden lg:block` /
 * `lg:hidden`) handle visibility — no JS detection, no hydration mismatch.
 * That also means both instances of MapLibre exist in the tree, but the
 * mobile one is `keepMounted` inside the sheet so it isn't torn down when
 * the sheet closes (remounting MapLibre costs 200–400ms on mid-range
 * Android).
 *
 * All props are pass-through to the underlying `SidebarLocationMap` so
 * pin-click and card-click behaviors keep working identically on both
 * desktop and mobile.
 *
 * The mobile `SidebarLocationMap` is given `showExpand={false}` because
 * the sheet IS the fullscreen view — opening a second nested Radix
 * Dialog on top of the sheet would be redundant and broken.
 */

import { useState } from "react";
import { Map as MapIcon } from "lucide-react";

import type { Location } from "@/lib/api";
import { SidebarLocationMap } from "@/components/locations/SidebarLocationMap";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface PlacesSidebarMapTriggerProps {
  locations: Location[];
  focusLocationId: string | null;
  focusSeq?: number;
  readOnly: boolean;
  onPinClick?: (locationId: string) => void;
  onLocationNoteSave?: (
    locationId: string,
    nextNote: string
  ) => Promise<void> | void;
  onLocationDelete?: (locationId: string) => Promise<void> | void;
  /**
   * Controlled sheet open state. `open` and `onOpenChange` MUST be
   * provided together or both omitted — providing only one puts the
   * component in a half-controlled state where the sheet's actual
   * open-ness disagrees with the parent's view of it. A dev-time
   * `console.warn` flags the mismatch.
   *
   * When both are provided, the parent owns the sheet state — useful
   * when the "Map" trigger button is rendered separately (e.g. inside
   * the `TripView` filter toolbar at the top of the Places tab, far
   * from the grid cell where this component lives).
   *
   * When both are omitted, the component manages its own `useState`
   * and the internal trigger button is the only way to open the sheet.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Whether to render the internal "Map" trigger button inside the
   * mobile wrapper. Default `true` for standalone use (tests, preview);
   * set `false` when the parent renders its own trigger that writes to
   * `onOpenChange`. The sheet itself is always rendered.
   */
  renderMobileButton?: boolean;
  highlightedLocationId?: string | null;
}

export function PlacesSidebarMapTrigger({
  locations,
  focusLocationId,
  focusSeq,
  readOnly,
  onPinClick,
  onLocationNoteSave,
  onLocationDelete,
  open,
  onOpenChange,
  renderMobileButton = true,
  highlightedLocationId,
}: PlacesSidebarMapTriggerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const sheetOpen = open ?? uncontrolledOpen;
  const setSheetOpen = onOpenChange ?? setUncontrolledOpen;

  // Dev-time invariant: `open` and `onOpenChange` must both be provided
  // or both omitted. Providing only one creates a broken half-controlled
  // state where the parent's frozen `open` value overrides internal
  // `uncontrolledOpen` and the sheet becomes unresponsive.
  if (process.env.NODE_ENV !== "production") {
    if ((open !== undefined) !== (onOpenChange !== undefined)) {
      // eslint-disable-next-line no-console
      console.warn(
        "PlacesSidebarMapTrigger: `open` and `onOpenChange` must be provided together, or both omitted."
      );
    }
  }

  return (
    <>
      {/* Desktop: sticky right column inside the parent's `lg:grid-cols-*`
       * cell. `hidden lg:block` hides this on mobile so only the sheet
       * variant below is visible. The parent (`TripView.tsx`) applies the
       * sticky positioning classes (`lg:sticky lg:top-[6.75rem]` etc.) to
       * the outer column wrapper. */}
      <div className="hidden lg:block lg:h-full">
        <SidebarLocationMap
          locations={locations}
          focusLocationId={focusLocationId}
          focusSeq={focusSeq}
          onPinClick={onPinClick}
          onLocationNoteSave={onLocationNoteSave}
          onLocationDelete={onLocationDelete}
          readOnly={readOnly}
          highlightedLocationId={highlightedLocationId}
        />
      </div>

      {/* Mobile: optional "Map" button + bottom sheet. Visible only below
       * `lg:`, where the desktop column is `hidden`. The sheet uses
       * `keepMounted` so the MapLibre instance stays alive across opens.
       * When `renderMobileButton={false}`, the parent is responsible for
       * rendering the trigger (typically in the filter toolbar). The
       * sheet itself is always rendered so the parent can open it via
       * `onOpenChange`. */}
      <div className="lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          {renderMobileButton && (
            <SheetTrigger asChild>
              <button
                type="button"
                className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                aria-label="Map"
              >
                <MapIcon size={14} />
                Map
              </button>
            </SheetTrigger>
          )}

          {/* NOTE: we previously passed `keepMounted` + `scrollLocked` here
           * to keep MapLibre alive across open/close cycles (architect's
           * perf recommendation). But `forceMount` activates Radix's
           * `react-remove-scroll` even when the sheet is closed, which
           * wraps the body in an `aria-hidden="true"` div and makes the
           * `SheetTrigger` button unreachable for keyboard + a11y tools.
           *
           * The trade-off: MapLibre remounts ~200-400ms on each open.
           * Users typically open the sheet once per session and keep it
           * open, so the cost is paid once. If perf testing shows
           * perceptible lag we can revisit with a custom non-Radix
           * bottom sheet. */}
          <SheetContent
            scrollLocked
            className="h-[85dvh]"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Places map</SheetTitle>
            <div className="min-h-0 flex-1 px-2 pb-2 pt-2">
              <div className="h-full overflow-hidden rounded-xl">
                <SidebarLocationMap
                  locations={locations}
                  focusLocationId={focusLocationId}
                  focusSeq={focusSeq}
                  onPinClick={onPinClick}
                  onLocationNoteSave={onLocationNoteSave}
                  onLocationDelete={onLocationDelete}
                  readOnly={readOnly}
                  showExpand={false}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
