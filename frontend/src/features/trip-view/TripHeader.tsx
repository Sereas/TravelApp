"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import type { ItineraryResponse, Trip } from "@/lib/api";
import { TripGradient } from "@/components/trips/TripGradient";
import { TripDateRangePicker } from "@/components/trips/TripDateRangePicker";
import { Progress } from "@/components/ui/progress";

/** Stable no-op async fallback for optional edit callbacks. */
const noopAsync = async () => {};

export interface TripHeaderProps {
  trip: Trip;
  itinerary: ItineraryResponse | null;
  isReadOnly: boolean;
  canShare: boolean;
  canEditName?: boolean;
  canEditDates?: boolean;
  onBack?: () => void;
  onInlineNameSave?: (name: string) => void | Promise<void>;
  onDateRangeSave?: (newStart: string, newEnd: string) => void | Promise<void>;
  onShareClick?: () => void;
}

export function TripHeader({
  trip,
  itinerary,
  isReadOnly,
  canShare,
  canEditName = true,
  canEditDates = true,
  onBack,
  onInlineNameSave,
  onDateRangeSave,
  onShareClick,
}: TripHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const nameCancelledRef = useRef(false);

  const totalDays = itinerary?.days.length ?? 0;
  const plannedDays =
    itinerary?.days.filter((day) =>
      day.options.some((opt) => opt.locations.length > 0)
    ).length ?? 0;

  return (
    <div className="relative -mx-4 -mt-4 px-4 pt-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      <TripGradient
        name={trip.name}
        className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-30"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-background" />

      {onBack && (
        <button
          type="button"
          className="-ml-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary/70 transition-colors hover:text-primary"
          onClick={onBack}
          aria-label="Back to Trips"
        >
          <ChevronLeft size={14} className="shrink-0" />
          Back to Trips
        </button>
      )}

      <motion.div
        className="relative pb-3 pt-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Status line */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-strong">
              Planning
            </span>
            {isReadOnly || !canEditDates ? (
              <TripDateRangeReadOnly
                startDate={trip.start_date}
                endDate={trip.end_date}
              />
            ) : (
              <TripDateRangePicker
                startDate={trip.start_date}
                endDate={trip.end_date}
                onDateRangeChange={onDateRangeSave ?? noopAsync}
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            {totalDays > 0 && (
              <div className="hidden items-center gap-2.5 sm:flex">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Progress
                </span>
                <Progress
                  value={Math.round((plannedDays / totalDays) * 100)}
                  className="h-1.5 w-24"
                />
                <span className="text-xs font-semibold tabular-nums text-primary">
                  {plannedDays}/{totalDays} days
                </span>
              </div>
            )}
            {canShare && (
              <button
                type="button"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md"
                onClick={onShareClick}
              >
                Share
              </button>
            )}
          </div>
        </div>

        {/* Trip name */}
        <div className="mt-1">
          {isReadOnly || !canEditName ? (
            <h1 className="-mx-1 px-1 text-left text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
              {trip.name}
            </h1>
          ) : editingName ? (
            <input
              type="text"
              aria-label="Trip name"
              autoFocus
              defaultValue={trip.name}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  nameCancelledRef.current = true;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                if (nameCancelledRef.current) {
                  nameCancelledRef.current = false;
                  setEditingName(false);
                  return;
                }
                const val = e.target.value.trim();
                setEditingName(false);
                if (val && val !== trip.name) {
                  onInlineNameSave?.(val);
                }
              }}
              className="w-full rounded-lg bg-transparent px-1 text-2xl font-bold tracking-tight text-foreground outline-none ring-1 ring-primary/30 sm:text-3xl md:text-4xl"
            />
          ) : (
            <button
              type="button"
              aria-label={trip.name}
              onClick={() => setEditingName(true)}
              className="-mx-1 cursor-text rounded-lg px-1 text-left text-2xl font-bold tracking-tight text-foreground transition-colors hover:bg-muted/50 sm:text-3xl md:text-4xl"
            >
              {trip.name}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function TripDateRangeReadOnly({
  startDate,
  endDate,
}: {
  startDate: string | null;
  endDate: string | null;
}) {
  if (!startDate && !endDate) {
    return <span className="text-xs text-muted-foreground">No dates set</span>;
  }
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  if (startDate && endDate) {
    return (
      <span className="text-xs font-medium text-foreground">
        {fmt(startDate)} — {fmt(endDate)}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-foreground">
      {fmt(startDate ?? endDate!)}
    </span>
  );
}
