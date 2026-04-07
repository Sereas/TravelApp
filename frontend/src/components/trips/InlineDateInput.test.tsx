/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineDateInput } from "./InlineDateInput";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(props?: Partial<React.ComponentProps<typeof InlineDateInput>>) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const label = props?.ariaLabel ?? "Start date";
  render(
    <InlineDateInput
      ariaLabel={label}
      defaultValue="2026-05-16"
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />
  );
  const input = screen.getByLabelText(label) as HTMLInputElement;
  return { onSave, onCancel, input };
}

/**
 * Simulate a calendar-picker change: browser sets value and fires a single
 * "change" event with no preceding keydown for printable characters.
 */
function simulateCalendarPick(input: HTMLInputElement, dateValue: string) {
  // jsdom doesn't actually constrain .value on date inputs,
  // so we can set it directly then dispatch change.
  fireEvent.change(input, { target: { value: dateValue } });
}

/**
 * Simulate the user pressing a digit key. Fires keydown → (optionally) the
 * browser normalises the date → fires change with `newDateValue`.
 */
function simulateKeyThenChange(
  input: HTMLInputElement,
  key: string,
  newDateValue: string
) {
  fireEvent.keyDown(input, { key, code: `Digit${key}`, bubbles: true });
  fireEvent.change(input, { target: { value: newDateValue } });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("InlineDateInput", () => {
  // ── 1. Calendar picker: immediate save ──────────────────────────────────

  describe("calendar picker selection", () => {
    it("saves immediately when a complete date arrives via onChange without preceding keydown", () => {
      const { onSave, onCancel, input } = setup();

      // Calendar pick: change event fires directly, no prior keydown
      simulateCalendarPick(input, "2026-06-01");

      expect(onSave).toHaveBeenCalledWith("2026-06-01");
      expect(onCancel).toHaveBeenCalled();
    });

    it("saves immediately on calendar pick even after a preceding keystroke", () => {
      const { onSave, onCancel, input } = setup();

      // User starts typing (sets isTypingRef)
      simulateKeyThenChange(input, "3", "2026-05-03");
      expect(onSave).not.toHaveBeenCalled();

      // Then user opens calendar and picks a date (no keydown before this onChange)
      simulateCalendarPick(input, "2026-07-15");

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith("2026-07-15");
      expect(onCancel).toHaveBeenCalled();
    });

    it("does NOT call onSave when calendar picks the same value as defaultValue", () => {
      const { onSave, onCancel, input } = setup();

      simulateCalendarPick(input, "2026-05-16"); // same as default

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  // ── 2. Keyboard typing: no premature save on intermediate values ─────────

  describe("keyboard typing — intermediate values do NOT trigger early save", () => {
    it("does NOT save after typing only one digit that produces a valid 10-char date", () => {
      // Bug scenario: typing "3" over "1" in "16" → browser normalises to
      // "2026-05-03" (10 chars, valid, different). Must NOT save yet.
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");

      expect(onSave).not.toHaveBeenCalled();
    });

    it("does NOT save after typing another digit that produces a different valid 10-char date", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      // First digit
      simulateKeyThenChange(input, "3", "2026-05-03");
      // Second digit — browser rewrites again
      simulateKeyThenChange(input, "1", "2026-05-31");

      expect(onSave).not.toHaveBeenCalled();
    });

    it("does NOT save while user types into the month portion of the date", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      // User moves to month field and types "0"
      simulateKeyThenChange(input, "0", "2026-01-16");
      expect(onSave).not.toHaveBeenCalled();
    });

    it("does NOT save after a sequence of keystrokes even if each produces a complete date", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      const steps = [
        { key: "3", date: "2026-05-03" },
        { key: "1", date: "2026-05-31" },
        { key: "2", date: "2026-02-28" },
      ];
      for (const { key, date } of steps) {
        simulateKeyThenChange(input, key, date);
      }

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  // ── 3. Keyboard typing + blur → save ────────────────────────────────────

  describe("keyboard typing then blur", () => {
    it("saves on blur after keyboard-typed complete date", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");
      simulateKeyThenChange(input, "1", "2026-05-31");

      // No save yet
      expect(onSave).not.toHaveBeenCalled();

      // Blur commits the current value
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalledWith("2026-05-31");
      expect(onCancel).toHaveBeenCalled();
    });

    it("calls only onCancel (not onSave) on blur when value is unchanged", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      // No change — blur immediately
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does NOT double-save if both onChange (calendar) and blur fire", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      // Calendar pick (no keydown)
      simulateCalendarPick(input, "2026-06-01");
      // Then blur also fires (as browsers do after picker closes)
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("does NOT save on blur after Escape reverted the value", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");

      // Escape reverts
      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
      // Blur that follows Escape
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  // ── 4. Enter key → save ─────────────────────────────────────────────────

  describe("Enter key", () => {
    it("saves on Enter after keyboard-typed date", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");
      simulateKeyThenChange(input, "1", "2026-05-31");

      // Press Enter to confirm
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      expect(onSave).toHaveBeenCalledWith("2026-05-31");
      expect(onCancel).toHaveBeenCalled();
    });

    it("calls only onCancel on Enter when value is unchanged", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      // No typing — just Enter
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does NOT double-save if Enter fires then blur fires", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-31");
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      // Subsequent blur
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("does NOT double-cancel if Enter with unchanged value then blur fires", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. Escape → revert and cancel ───────────────────────────────────────

  describe("Escape key", () => {
    it("reverts value to defaultValue and calls onCancel on Escape", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");
      expect(onSave).not.toHaveBeenCalled();

      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

      // Value reverted
      expect(input.value).toBe("2026-05-16");
      // onSave must NOT have been called
      expect(onSave).not.toHaveBeenCalled();
      // onCancel fired
      expect(onCancel).toHaveBeenCalled();
    });

    it("does NOT save on the blur that follows Escape", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      simulateKeyThenChange(input, "3", "2026-05-03");

      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
      // onCancel called exactly once — not twice
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("Escape with unchanged value just cancels without calling onSave", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });
  });

  // ── 6. Paste behaviour: treated like calendar pick ───────────────────────

  describe("paste", () => {
    it("saves immediately on paste of a complete valid date (no preceding keydown)", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      // Paste: fires paste event then change event, no prior keydown
      fireEvent.paste(input);
      fireEvent.change(input, { target: { value: "2026-07-04" } });

      expect(onSave).toHaveBeenCalledWith("2026-07-04");
      expect(onCancel).toHaveBeenCalled();
    });

    it("paste followed by blur does not double-save", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      fireEvent.paste(input);
      fireEvent.change(input, { target: { value: "2026-07-04" } });
      fireEvent.blur(input);

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  // ── 7. Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("renders with the defaultValue pre-filled", () => {
      const { input } = setup({ defaultValue: "2026-05-16" });
      expect(input.value).toBe("2026-05-16");
    });

    it("renders with the correct aria-label", () => {
      setup({ ariaLabel: "Trip end date" });
      expect(screen.getByLabelText("Trip end date")).toBeInTheDocument();
    });

    it("does not save if value is empty string on blur", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      // Simulate input being cleared (keyboard clear — sets typing flag)
      fireEvent.keyDown(input, { key: "Delete", code: "Delete" });
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      expect(onSave).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does not save if value is empty string from calendar clear (no keydown)", () => {
      const { onSave, onCancel, input } = setup({ defaultValue: "2026-05-16" });

      // Calendar-style clear (no keydown before change)
      simulateCalendarPick(input, "");

      expect(onSave).not.toHaveBeenCalled();
      // No action — no onCancel either (nothing changed)
    });

    it("handles rapid successive keystrokes — none should save until blur", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      const steps = [
        { key: "3", date: "2026-05-03" },
        { key: "1", date: "2026-05-31" },
        { key: "2", date: "2026-02-28" },
        { key: "0", date: "2026-02-01" },
        { key: "6", date: "2026-06-01" },
      ];
      for (const { key, date } of steps) {
        simulateKeyThenChange(input, key, date);
      }

      expect(onSave).not.toHaveBeenCalled();

      // Only after blur
      fireEvent.blur(input);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("typing guard is local — a fresh component instance starts in non-typing state", () => {
      // Instance 1: user types → blur → saved
      const onSave1 = vi.fn();
      const onCancel1 = vi.fn();
      const { getByLabelText, unmount } = render(
        <InlineDateInput
          ariaLabel="Date A"
          defaultValue="2026-05-16"
          onSave={onSave1}
          onCancel={onCancel1}
        />
      );
      const input1 = getByLabelText("Date A") as HTMLInputElement;
      simulateKeyThenChange(input1, "3", "2026-05-03");
      fireEvent.blur(input1);
      expect(onSave1).toHaveBeenCalledWith("2026-05-03");
      unmount();

      // Instance 2: fresh component — calendar pick should save immediately
      const onSave2 = vi.fn();
      const onCancel2 = vi.fn();
      const { getByLabelText: getByLabelText2 } = render(
        <InlineDateInput
          ariaLabel="Date B"
          defaultValue="2026-05-16"
          onSave={onSave2}
          onCancel={onCancel2}
        />
      );
      const input2 = getByLabelText2("Date B") as HTMLInputElement;
      simulateCalendarPick(input2, "2026-07-20");
      expect(onSave2).toHaveBeenCalledWith("2026-07-20");
      expect(onCancel2).toHaveBeenCalled();
    });

    it("onSave receives the correct final value when user corrects a mid-entry value", () => {
      const { onSave, input } = setup({ defaultValue: "2026-05-16" });

      // User types "3" → "2026-05-03", then types "1" → "2026-05-31"
      simulateKeyThenChange(input, "3", "2026-05-03");
      simulateKeyThenChange(input, "1", "2026-05-31");

      fireEvent.blur(input);

      // Must save the LAST value, not the intermediate one
      expect(onSave).toHaveBeenCalledWith("2026-05-31");
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
});
