"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImportGoogleListDialog } from "./ImportGoogleListDialog";
import { ArrowRight, FileUp, MapPin } from "lucide-react";

function looksLikeGoogleMapsUrl(text: string): boolean {
  return /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(
    text
  );
}

interface SmartLocationInputProps {
  tripId: string;
  onSubmit: (value: string, isUrl: boolean) => void;
  onImported: () => void;
}

export function SmartLocationInput({
  tripId,
  onSubmit,
  onImported,
}: SmartLocationInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed, looksLikeGoogleMapsUrl(trimmed));
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleSubmit();
  }

  return (
    <div className="mb-6 flex items-center gap-2.5">
      <div className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-primary/25 bg-primary/[0.04] px-3.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <MapPin size={14} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          autoComplete="off"
          placeholder="Add a location — paste a Google Maps link or type a name..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:outline-none"
        />
        <AnimatePresence>
          {value.trim() && (
            <motion.button
              key="submit"
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={handleSubmit}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-strong"
              aria-label="Add location"
            >
              <ArrowRight size={14} strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <ImportGoogleListDialog
        tripId={tripId}
        trigger={
          <button
            type="button"
            aria-label="Import Google List"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-foreground"
          >
            <FileUp size={16} />
            <span className="hidden sm:inline">Import List</span>
          </button>
        }
        onImported={onImported}
      />
    </div>
  );
}
