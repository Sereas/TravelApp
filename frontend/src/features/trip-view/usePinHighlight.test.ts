/**
 * Tests for the `usePinHighlight` hook.
 *
 * Covers:
 *   - scrollIntoView on click (via data-location-id attribute selector)
 *   - highlight starts after HIGHLIGHT_START_DELAY_MS
 *   - highlight clears after HIGHLIGHT_ANIMATION_MS
 *   - rapid clicks cancel the previous highlight
 *   - unmount cancels any pending timeout (no state update on dead component)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePinHighlight,
  HIGHLIGHT_START_DELAY_MS,
  HIGHLIGHT_ANIMATION_MS,
} from "./usePinHighlight";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function makeFakeElement() {
  const scrollIntoView = vi.fn();
  const el = { scrollIntoView } as unknown as HTMLElement;
  return { el, scrollIntoView };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePinHighlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("handlePinClick scrolls into view", () => {
    const { el, scrollIntoView } = makeFakeElement();

    // Stub querySelector to return our fake element for any data-location-id selector
    vi.spyOn(document, "querySelector").mockImplementation((selector) => {
      if (selector.includes("data-location-id")) return el;
      return null;
    });

    const { result } = renderHook(() => usePinHighlight());

    act(() => {
      result.current.handlePinClick("loc-1");
    });

    // requestAnimationFrame is auto-flushed by fake timers in vitest
    // but we need to flush pending microtasks/rAF
    act(() => {
      vi.runAllTimers();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("highlight starts after delay", () => {
    const { result } = renderHook(() => usePinHighlight());

    act(() => {
      result.current.handlePinClick("loc-1");
    });

    // Immediately: no highlight
    expect(result.current.highlightedLocationId).toBeNull();

    // Advance past the start delay
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_START_DELAY_MS);
    });

    expect(result.current.highlightedLocationId).toBe("loc-1");
  });

  it("highlight clears after animation", () => {
    const { result } = renderHook(() => usePinHighlight());

    act(() => {
      result.current.handlePinClick("loc-1");
    });

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_START_DELAY_MS);
    });

    expect(result.current.highlightedLocationId).toBe("loc-1");

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_ANIMATION_MS);
    });

    expect(result.current.highlightedLocationId).toBeNull();
  });

  it("rapid clicks cancel previous highlight", () => {
    const { result } = renderHook(() => usePinHighlight());

    // First click
    act(() => {
      result.current.handlePinClick("loc-1");
    });

    // Advance 100ms — still inside the delay for loc-1
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.highlightedLocationId).toBeNull();

    // Second click cancels loc-1 and starts fresh for loc-2
    act(() => {
      result.current.handlePinClick("loc-2");
    });

    // Advance another full delay
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_START_DELAY_MS);
    });

    // loc-2 should be highlighted, NOT loc-1
    expect(result.current.highlightedLocationId).toBe("loc-2");
    expect(result.current.highlightedLocationId).not.toBe("loc-1");
  });

  it("unmount cancels pending timeout", () => {
    const { result, unmount } = renderHook(() => usePinHighlight());

    act(() => {
      result.current.handlePinClick("loc-1");
    });

    // Unmount before the delay fires
    unmount();

    // Advance past all timers — no state update should throw on dead component
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(
          HIGHLIGHT_START_DELAY_MS + HIGHLIGHT_ANIMATION_MS + 100
        );
      });
    }).not.toThrow();
  });
});
