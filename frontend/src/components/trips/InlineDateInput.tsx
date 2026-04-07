"use client";

import { useRef, useState } from "react";

export interface InlineDateInputProps {
  ariaLabel: string;
  defaultValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * Inline date input that distinguishes calendar-picker from keyboard typing:
 * - Calendar pick / paste: onChange fires without preceding keydown -> save immediately
 * - Keyboard typing: keydown sets isTypingRef -> onChange defers to blur / Enter
 */
export function InlineDateInput({
  ariaLabel,
  defaultValue,
  onSave,
  onCancel,
}: InlineDateInputProps) {
  const [value, setValue] = useState(defaultValue);
  const savedRef = useRef(false);
  const isTypingRef = useRef(false);
  const cancelledRef = useRef(false);

  function commit(val: string) {
    if (
      val &&
      val !== defaultValue &&
      !savedRef.current &&
      !cancelledRef.current
    ) {
      savedRef.current = true;
      onSave(val);
      onCancel();
    }
  }

  return (
    <input
      type="date"
      aria-label={ariaLabel}
      autoFocus
      value={value}
      onChange={(e) => {
        const val = e.target.value;
        const wasTyping = isTypingRef.current;
        isTypingRef.current = false; // Reset per-cycle — only tracks "keydown fired just before this onChange"
        setValue(val);
        if (!wasTyping && val.length === 10 && val !== defaultValue) {
          commit(val);
        }
      }}
      onBlur={() => {
        isTypingRef.current = false;
        if (cancelledRef.current) return;
        if (!savedRef.current) {
          if (value && value !== defaultValue) {
            commit(value);
          } else {
            onCancel();
          }
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          cancelledRef.current = true;
          setValue(defaultValue);
          onCancel();
          return;
        }
        if (e.key === "Enter") {
          if (value && value !== defaultValue) {
            commit(value);
          } else {
            cancelledRef.current = true;
            onCancel();
          }
          return;
        }
        // Any other key means the user is typing
        isTypingRef.current = true;
      }}
      className="date-input-branded inline rounded border border-border/50 bg-card px-1.5 py-0.5 text-sm shadow-sm"
    />
  );
}
