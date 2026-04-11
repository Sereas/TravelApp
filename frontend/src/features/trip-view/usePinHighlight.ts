/**
 * usePinHighlight — shared hook for sidebar map pin → card scroll + pulse.
 *
 * Used by both `/trips/[id]` (authenticated owner) and `/shared/[token]`
 * (public shared view) so the interaction feels identical in both routes.
 *
 * Behaviour:
 *   1. `handlePinClick(locationId)` cancels any in-flight highlight, resets
 *      the visible highlight immediately (instant re-trigger for rapid clicks),
 *      then defers the DOM scroll to the next animation frame so any pending
 *      React commit lands first.
 *   2. After `delayMs` (default HIGHLIGHT_START_DELAY_MS) the highlight state
 *      is set, giving the smooth scroll time to settle before the CSS pulse
 *      fires.
 *   3. After `durationMs` (default HIGHLIGHT_ANIMATION_MS) the highlight is
 *      cleared, guarding against the same `locationId` being in-flight (a
 *      rapid re-click would leave the state as-is, so we use a functional
 *      updater to only clear when the value still matches).
 *   4. Cleanup on unmount: both timeouts are cancelled so there are no state
 *      updates on unmounted components.
 */

import { useState, useRef, useCallback, useEffect } from "react";

/** Delay between pin click and starting the highlight animation (ms). */
export const HIGHLIGHT_START_DELAY_MS = 350;

/** Duration for which the highlight pulse stays active (ms). */
export const HIGHLIGHT_ANIMATION_MS = 2000;

export interface UsePinHighlightOptions {
  /** Override the start-delay (default: HIGHLIGHT_START_DELAY_MS). */
  delayMs?: number;
  /** Override the animation duration (default: HIGHLIGHT_ANIMATION_MS). */
  durationMs?: number;
}

export interface UsePinHighlightReturn {
  highlightedLocationId: string | null;
  handlePinClick: (locationId: string) => void;
}

export function usePinHighlight(
  options: UsePinHighlightOptions = {}
): UsePinHighlightReturn {
  const {
    delayMs = HIGHLIGHT_START_DELAY_MS,
    durationMs = HIGHLIGHT_ANIMATION_MS,
  } = options;

  const [highlightedLocationId, setHighlightedLocationId] = useState<
    string | null
  >(null);

  // A single ref tracks whichever timeout is currently in-flight (either the
  // pre-highlight delay or the post-highlight clear). We only need one at a
  // time because the outer timeout overwrites the ref with the inner handle
  // when it fires, so there's never more than one active timeout to cancel.
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handlePinClick = useCallback(
    (locationId: string) => {
      // Cancel any in-flight highlight (pre-scroll wait or post-apply clear)
      // and drop any currently-visible highlight so a rapid re-click on a
      // second pin gives the user an instant visual reset.
      if (highlightTimeoutRef.current != null) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      setHighlightedLocationId(null);

      // Defer querySelector by a frame so any pending DOM commit lands first,
      // then kick off the smooth scroll.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-location-id="${CSS.escape(locationId)}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });

      // Delay applying the highlight class until the smooth scroll has had
      // time to mostly complete. Otherwise the keyframe peak plays out while
      // the card is still offscreen and the user never sees it.
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedLocationId(locationId);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedLocationId((prev) =>
            prev === locationId ? null : prev
          );
          highlightTimeoutRef.current = null;
        }, durationMs);
      }, delayMs);
    },
    [delayMs, durationMs]
  );

  // Cancel any pending highlight timeout on unmount so React's strict-mode
  // double-invocation and route changes don't leave a dangling callback.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current != null) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  return { highlightedLocationId, handlePinClick };
}
