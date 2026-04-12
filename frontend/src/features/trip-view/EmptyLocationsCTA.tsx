"use client";

import { motion } from "motion/react";
import { FileUp, Link2, PenLine } from "lucide-react";
import { ImportGoogleListDialog } from "@/components/locations/ImportGoogleListDialog";
import type { AddingLocationMode } from "./TripView";

export interface EmptyLocationsCTAProps {
  tripId: string;
  onStartAddingLocation?: (mode: AddingLocationMode) => void;
  onRefreshData?: () => void | Promise<void>;
}

export function EmptyLocationsCTA({
  tripId,
  onStartAddingLocation,
  onRefreshData,
}: EmptyLocationsCTAProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center py-12 text-center"
    >
      <h2 className="text-3xl font-bold tracking-tight text-foreground">
        Ready to build your <span className="italic text-primary">pool?</span>
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Choose how you want to add your first spots. Your pool is a curated
        collection of inspirations for your next journey.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Paste a Link — recommended */}
        <div className="relative flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
          <span className="absolute -top-3 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Recommended
          </span>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Link2 size={22} className="text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Paste a Link</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Found a spot on Google Maps? Paste the link and we&#39;ll fill in
            the details automatically.
          </p>
          <button
            type="button"
            onClick={() => onStartAddingLocation?.({ mode: "link-entry" })}
            className="mt-4 w-full rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md"
          >
            Paste Link
          </button>
        </div>

        {/* Import a List */}
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
            <FileUp size={22} className="text-brand" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Import a List</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Have a saved Google Maps list? Import all your bookmarked places at
            once.
          </p>
          <ImportGoogleListDialog
            tripId={tripId}
            trigger={
              <button
                type="button"
                className="mt-4 w-full rounded-full border border-border bg-secondary/80 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Import List
              </button>
            }
            onImported={onRefreshData ?? (() => {})}
          />
        </div>

        {/* Add Manually */}
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
            <PenLine size={22} className="text-accent-foreground/60" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Add Manually</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Know a hidden gem? Type in the name and details yourself — no link
            needed.
          </p>
          <button
            type="button"
            onClick={() => onStartAddingLocation?.({ mode: "manual" })}
            className="mt-4 w-full rounded-full border border-border bg-secondary/80 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Add Manually
          </button>
        </div>
      </div>
    </motion.div>
  );
}
