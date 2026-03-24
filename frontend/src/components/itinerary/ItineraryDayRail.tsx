"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowRight, CalendarDays, Layers3, Sparkles } from "lucide-react";

function formatCityLabel(option: ItineraryOption | undefined): string | null {
  const start = option?.starting_city?.trim() || null;
  const end = option?.ending_city?.trim() || null;

  if (start && end) {
    if (start.toLowerCase() === end.toLowerCase()) return start;
    return `${start} → ${end}`;
  }
  if (start) return start;
  if (end) return end;
  return null;
}

function formatDateLabel(day: ItineraryDay): string {
  if (!day.date) return "Date pending";
  return new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface ItineraryDayRailProps {
  days: ItineraryDay[];
  selectedOptionsByDay: Record<string, ItineraryOption | undefined>;
  selectedDayId?: string | null;
  onSelectDay?: (dayId: string) => void;
}

export function ItineraryDayRail({
  days,
  selectedOptionsByDay,
  selectedDayId,
  onSelectDay,
}: ItineraryDayRailProps) {
  return (
    <aside className="rounded-2xl border border-warm-border bg-surface-card p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-primary">
        <CalendarDays size={16} />
        Days
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const option = selectedOptionsByDay[day.id];
          const locationCount = day.options.reduce(
            (sum, option) => sum + option.locations.length,
            0
          );
          const cityLabel = formatCityLabel(option);
          const start = option?.starting_city?.trim() || null;
          const end = option?.ending_city?.trim() || null;
          const isSameCity =
            start && end && start.toLowerCase() === end.toLowerCase();
          const dateLabel = formatDateLabel(day);
          const isPlanned = locationCount > 0;

          return (
            <button
              key={day.id}
              type="button"
              onClick={() => onSelectDay?.(day.id)}
              className={cn(
                "min-w-[220px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors",
                selectedDayId === day.id
                  ? isPlanned
                    ? "border-brand-green/40 bg-brand-green-light/60 shadow-sm"
                    : "border-amber-300 bg-amber-50 shadow-sm"
                  : isPlanned
                    ? "border-transparent bg-brand-green-light/20 hover:border-brand-green/30 hover:bg-brand-green-light/40"
                    : "border-dashed border-warm-border bg-white hover:border-amber-300 hover:bg-amber-50/70"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-content-primary">
                    {dateLabel}
                  </div>
                </div>
                {isPlanned ? (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-muted">
                    {locationCount} stops
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    Empty
                  </span>
                )}
              </div>
              {cityLabel ? (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-content-muted">
                  {start && end && !isSameCity ? (
                    <>
                      <span className="truncate">{start}</span>
                      <ArrowRight size={10} className="shrink-0 opacity-50" />
                      <span className="truncate">{end}</span>
                    </>
                  ) : (
                    <span className="truncate">{cityLabel}</span>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-xs text-content-muted/70">
                  Route details not set
                </div>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-content-muted">
                {isPlanned ? <Layers3 size={12} /> : <Sparkles size={12} />}
                <span>
                  {day.options.length}{" "}
                  {day.options.length === 1 ? "plan" : "plans"}
                </span>
                {!isPlanned ? (
                  <>
                    <span aria-hidden="true" className="text-content-subtle">
                      •
                    </span>
                    <span>Ready to plan</span>
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
