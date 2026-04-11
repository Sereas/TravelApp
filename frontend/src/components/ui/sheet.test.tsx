/// <reference types="vitest/globals" />
/**
 * Phase 3 bottom-sheet primitive contract tests.
 *
 * These tests encode every contract defined for the new `sheet.tsx` component
 * before the implementation exists. All tests MUST fail on current HEAD.
 *
 * Contracts verified:
 *   - Sheet is a styled bottom-anchored wrapper around Radix Dialog
 *   - SheetContent carries bottom-sheet positioning classes
 *   - SheetContent renders a grab handle pill at the top
 *   - SheetContent has a visible close (X) button
 *   - `keepMounted` prop → forceMount keeps content in DOM when closed
 *   - Without `keepMounted` the content unmounts when closed
 *   - `scrollLocked` prop → touch-none + overflow-hidden on the content body
 *
 * JSDOM limitation: CSS media queries / animations are not evaluated.
 * We assert on className strings and DOM presence/absence.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetHeader,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Helper — controlled wrapper for open/close state tests
// ---------------------------------------------------------------------------

function ControlledSheet({
  keepMounted,
  scrollLocked,
  initialOpen = false,
}: {
  keepMounted?: boolean;
  scrollLocked?: boolean;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button">Open</button>
      </SheetTrigger>
      <SheetContent keepMounted={keepMounted} scrollLocked={scrollLocked}>
        <SheetTitle>Sheet body title</SheetTitle>
        <SheetDescription>Sheet body description</SheetDescription>
        <div data-testid="sheet-child">Sheet body content</div>
      </SheetContent>
    </Sheet>
  );
}

// ===========================================================================
// Basic smoke — renders and opens
// ===========================================================================

describe("Sheet — smoke tests", () => {
  it("renders trigger button in the DOM", () => {
    render(<ControlledSheet />);
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });

  it("clicking SheetTrigger opens the sheet and shows role=dialog", async () => {
    render(<ControlledSheet />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sheet body content")).toBeInTheDocument();
  });

  it("SheetHeader, SheetTitle, SheetDescription render children", async () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>My Title</SheetTitle>
            <SheetDescription>My Description</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Description")).toBeInTheDocument();
  });
});

// ===========================================================================
// SheetContent className contracts — bottom-sheet positioning
// ===========================================================================

describe("SheetContent — bottom-sheet positioning classes", () => {
  it("SheetContent className contains bottom-0 (anchored to bottom of viewport)", () => {
    const { container } = render(
      <Sheet open>
        <SheetContent data-testid="sheet-content">
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    // The Radix Content element renders into a portal; query via role=dialog
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bottom-0");
  });

  it("SheetContent className contains rounded-t-2xl (top corners rounded, not bottom)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-t-2xl");
  });

  it("SheetContent className contains max-h-[90dvh] (caps height at 90% dynamic viewport)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[90dvh]");
  });

  it("SheetContent className contains w-full and max-w-full (full width)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-full");
    expect(dialog.className).toContain("max-w-full");
  });

  it("SheetContent className contains pb-safe-b (absorbs home-indicator safe-area)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("pb-safe-b");
  });

  it("SheetContent className contains left-0 and right-0 (full-width horizontal span)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("left-0");
    expect(dialog.className).toContain("right-0");
  });
});

// ===========================================================================
// Grab handle pill
// ===========================================================================

describe("SheetContent — grab handle pill", () => {
  it("renders a grab handle pill element with h-1 w-10 classes", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    // Radix Dialog renders content via Portal into document.body, not
    // inside the test container. Query the global document.
    const handle = document.querySelector(".h-1.w-10");
    expect(handle).not.toBeNull();
  });

  it("grab handle pill has rounded-full class", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const handle = document.querySelector(".h-1.w-10");
    expect(handle).not.toBeNull();
    expect(handle!.className).toContain("rounded-full");
  });
});

// ===========================================================================
// Close button
// ===========================================================================

describe("SheetContent — close button", () => {
  it("renders a visible close button accessible by role and name", async () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Close me</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("clicking the close button dismisses the sheet (dialog leaves DOM)", async () => {
    render(<ControlledSheet initialOpen />);
    // Sheet starts open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Click the X close button
    const closeBtn = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeBtn);

    // Dialog should be gone (Radix unmounts when closed by default)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// keepMounted — MapLibre keep-alive contract
// ===========================================================================

describe("SheetContent — keepMounted prop (MapLibre keep-alive)", () => {
  it("with keepMounted=true, content remains in the DOM when sheet is closed", () => {
    render(
      <Sheet open={false}>
        <SheetContent keepMounted>
          <SheetTitle>Kept alive</SheetTitle>
          <div data-testid="map-placeholder">MapLibre would live here</div>
        </SheetContent>
      </Sheet>
    );
    // With forceMount the content portal is in the DOM even when open=false.
    // Query document (not container) because Radix portal renders outside.
    const mapPlaceholder = document.querySelector(
      "[data-testid='map-placeholder']"
    );
    expect(mapPlaceholder).not.toBeNull();
  });

  it("with keepMounted=true and closed, the content element has a hidden indicator in className or data attribute", () => {
    render(
      <Sheet open={false}>
        <SheetContent keepMounted>
          <SheetTitle>Hidden but mounted</SheetTitle>
          <div data-testid="keep-alive-child">alive</div>
        </SheetContent>
      </Sheet>
    );
    // Query document (portal) not container. When closed, Radix sets
    // data-state=closed on the Content element. SheetContent applies
    // data-[state=closed]:hidden via Tailwind so it's visually hidden.
    const keepAliveChild = document.querySelector(
      "[data-testid='keep-alive-child']"
    );
    expect(keepAliveChild).not.toBeNull();

    // Walk up to find the Radix Content wrapper that should carry the hidden class
    let el: HTMLElement | null = keepAliveChild!.parentElement;
    let foundHiddenClass = false;
    while (el) {
      if (
        el.className.includes("data-[state=closed]:hidden") ||
        el.getAttribute("data-state") === "closed"
      ) {
        foundHiddenClass = true;
        break;
      }
      el = el.parentElement;
    }
    // The content element should have data-state=closed when sheet is closed
    expect(foundHiddenClass).toBe(true);
  });

  it("without keepMounted, content is NOT in the DOM when sheet is closed", () => {
    render(
      <Sheet open={false}>
        <SheetContent>
          <SheetTitle>Not mounted</SheetTitle>
          <div data-testid="unmounted-child">should not exist</div>
        </SheetContent>
      </Sheet>
    );
    // Without forceMount, Radix unmounts the portal when closed.
    expect(screen.queryByTestId("unmounted-child")).not.toBeInTheDocument();
  });

  it("with keepMounted=true, content appears after sheet opens without remounting", async () => {
    // Simulate: mount closed, open, verify content is accessible
    const { rerender } = render(
      <Sheet open={false}>
        <SheetContent keepMounted>
          <SheetTitle>Keep alive open test</SheetTitle>
          <div data-testid="ka-child">content</div>
        </SheetContent>
      </Sheet>
    );

    // Content should already be in DOM (forceMount)
    expect(screen.getByTestId("ka-child")).toBeInTheDocument();

    // Re-render with open=true — content should remain (no remount)
    rerender(
      <Sheet open>
        <SheetContent keepMounted>
          <SheetTitle>Keep alive open test</SheetTitle>
          <div data-testid="ka-child">content</div>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("ka-child")).toBeInTheDocument();
  });
});

// ===========================================================================
// scrollLocked — touch-none + overflow-hidden for map gesture isolation
// ===========================================================================

describe("SheetContent — scrollLocked prop", () => {
  it("with scrollLocked=true, the content body has touch-none class", () => {
    const { container } = render(
      <Sheet open>
        <SheetContent scrollLocked>
          <SheetTitle>Scroll locked</SheetTitle>
          <div data-testid="locked-child">map here</div>
        </SheetContent>
      </Sheet>
    );
    // The content wrapper (the scrollable body area inside SheetContent)
    // should carry touch-none so MapLibre touch gestures don't fight the sheet.
    const dialog = screen.getByRole("dialog");
    // The touch-none class should be on the dialog or a direct wrapper inside it
    const hasTouchNone =
      dialog.className.includes("touch-none") ||
      dialog.querySelector(".touch-none") !== null;
    expect(hasTouchNone).toBe(true);
  });

  it("with scrollLocked=true, the content body has overflow-hidden class", () => {
    const { container } = render(
      <Sheet open>
        <SheetContent scrollLocked>
          <SheetTitle>Scroll locked</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    const hasOverflowHidden =
      dialog.className.includes("overflow-hidden") ||
      dialog.querySelector(".overflow-hidden") !== null;
    expect(hasOverflowHidden).toBe(true);
  });

  it("without scrollLocked, touch-none is NOT applied to the content body", () => {
    const { container } = render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Not locked</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    // touch-none should be absent when scrollLocked is not set
    expect(dialog.className).not.toContain("touch-none");
    expect(dialog.querySelector(".touch-none")).toBeNull();
  });
});
