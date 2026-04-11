/// <reference types="vitest/globals" />
/**
 * Phase 2 touch-hardening contract tests for PopoverContent.
 *
 * Contract: PopoverContent default className clamps width so the popover never
 * overflows the viewport on narrow screens.  The current value is `w-72`
 * (288px fixed).  After Phase 2 it must contain a viewport-relative clamp such
 * as `w-[min(18rem,calc(100vw-2rem))]` or equivalent.
 *
 * JSDOM limitation note: CSS viewport units are not evaluated, so we can only
 * assert that the className string contains the expected Tailwind class.
 */
import { render, screen } from "@testing-library/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Radix portals render into document.body — RTL handles this fine with the
// default jsdom environment as long as the Popover is in `open` state.

describe("PopoverContent — Phase 2 viewport-clamp contract", () => {
  it("default className clamps width to viewport (no overflow on narrow screens)", () => {
    render(
      <Popover open>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">Popover body</PopoverContent>
      </Popover>
    );

    const pop = screen.getByTestId("pop");

    // The class must contain a viewport-relative width constraint.
    // Accept any of these equivalent forms — the test must tolerate the
    // exact implementation choice while still failing when the old static
    // `w-72` is the only width class present.
    const className = pop.className;
    const hasViewportClamp =
      className.includes("100vw") ||
      className.includes("min(") ||
      className.includes("max-w-[calc");

    expect(hasViewportClamp).toBe(true);
  });

  it("does NOT use a bare fixed w-72 as the sole width class", () => {
    render(
      <Popover open>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="pop">Popover body</PopoverContent>
      </Popover>
    );

    const pop = screen.getByTestId("pop");

    // `w-72` alone means the popover is 288px regardless of viewport.
    // After Phase 2 this class should either be absent or superseded by a
    // clamp expression.  A viewport-clamp class must also be present —
    // both conditions together encode the contract.
    const className = pop.className;
    const hasViewportClamp =
      className.includes("100vw") ||
      className.includes("min(") ||
      className.includes("max-w-[calc");

    // The regression: if only `w-72` is present without a viewport clamp,
    // both these expectations would diverge and the test fails.
    if (className.includes("w-72") && !hasViewportClamp) {
      // Force a clear failure message.
      expect(hasViewportClamp).toBe(true);
    }

    // Positive assertion — viewport clamp must be present.
    expect(hasViewportClamp).toBe(true);
  });

  it("still renders children inside the popover", () => {
    render(
      <Popover open>
        <PopoverTrigger>trigger</PopoverTrigger>
        <PopoverContent>Hello world</PopoverContent>
      </Popover>
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });
});
