/**
 * Phase 0 — placeholder tests for the `usePinHighlight` hook.
 *
 * The hook does not exist yet. These cases will be flipped from `it.todo`
 * to full implementations in Phase 2 once the hook is created at
 * `frontend/src/features/trip-view/usePinHighlight.ts`.
 *
 * Expected behaviour (to be implemented in Phase 2):
 *   - Clicking a map pin triggers scroll-into-view on the matching card.
 *   - A "highlighted" visual state starts after a configurable delay.
 *   - The highlight clears automatically after the animation duration.
 *   - Rapid successive clicks cancel the pending highlight from the previous one.
 *   - Unmounting the component that hosts the hook cancels any pending timer.
 */

import { describe, it } from "vitest";

describe("usePinHighlight", () => {
  it.todo("handlePinClick scrolls into view");
  it.todo("highlight starts after delay");
  it.todo("highlight clears after animation");
  it.todo("rapid clicks cancel previous highlight");
  it.todo("unmount cancels pending timeout");
});
