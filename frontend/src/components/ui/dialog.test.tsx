/// <reference types="vitest/globals" />
/**
 * Phase 2 touch-hardening contract tests for DialogContent.
 *
 * Contract: DialogContent className must reference safe-area CSS variables
 * (`--safe-top` / `--safe-bottom`) so the dialog does not overlap the device
 * notch or home-indicator on notched iOS/Android devices.
 *
 * The current implementation uses a fixed translate-y-[-50%] centered layout
 * with no notch awareness. After Phase 2, the dialog must carry either:
 *   - a Tailwind safe-area utility class (e.g. `mt-safe-t`, `pt-safe-t`)
 *   - or an inline style / class referencing `var(--safe-top)` / `var(--safe-bottom)`
 *
 * JSDOM limitation: CSS custom properties are not evaluated, so we assert on
 * className strings.
 */
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

describe("DialogContent — Phase 2 safe-area contract", () => {
  it("DialogContent className references safe-area insets for notch awareness", () => {
    render(
      <Dialog open>
        <DialogContent data-testid="dlg">
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>Body text</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    const dlg = screen.getByTestId("dlg");
    const className = dlg.className;

    // Accept any className pattern that references safe-area top or bottom.
    // Examples that would pass:
    //   "mt-safe-t"  |  "pt-safe-t"  |  "mb-safe-b"
    //   "top-[calc(50%+var(--safe-top))]"
    //   "translate-y-[calc(-50%+var(--safe-top)/2)]"
    const hasSafeArea =
      className.includes("safe-top") ||
      className.includes("safe-bottom") ||
      className.includes("safe-t") ||
      className.includes("safe-b") ||
      className.includes("--safe");

    expect(hasSafeArea).toBe(true);
  });

  it("DialogContent still renders its children", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
          <DialogDescription>World</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("DialogContent has a close button", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Close me</DialogTitle>
          <DialogDescription>Content</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });
});
