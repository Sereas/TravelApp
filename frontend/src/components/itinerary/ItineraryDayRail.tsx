"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

function formatCityLabel(option: ItineraryOption | undefined): {
  text: string | null;
  start: string | null;
  end: string | null;
  isSameCity: boolean;
} {
  const start = option?.starting_city?.trim() || null;
  const end = option?.ending_city?.trim() || null;
  const isSameCity = !!(
    start &&
    end &&
    start.toLowerCase() === end.toLowerCase()
  );

  if (start && end) {
    return {
      text: isSameCity ? start : `${start} → ${end}`,
      start,
      end,
      isSameCity,
    };
  }
  return { text: start || end, start, end, isSameCity };
}

function formatDateLabel(day: ItineraryDay): string {
  if (!day.date) return "Date pending";
  return new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatWeekday(day: ItineraryDay): string | null {
  if (!day.date) return null;
  return new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
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
      <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1">
        {days.map((day) => {
          const option = selectedOptionsByDay[day.id];
          const locationCount = option?.locations.length ?? 0;
          const city = formatCityLabel(option);
          const dateLabel = formatDateLabel(day);
          const weekday = formatWeekday(day);
          const isPlanned = locationCount > 0;
          const isSelected = selectedDayId === day.id;

          return (
            <button
              key={day.id}
              type="button"
              onClick={() => onSelectDay?.(day.id)}
              className={cn(
                "group relative min-w-[160px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                isSelected
                  ? "border-brand-green/50 bg-brand-green-light/60 shadow-sm"
                  : isPlanned
                    ? "border-transparent bg-brand-green-light/15 hover:border-brand-green/25 hover:bg-brand-green-light/35"
                    : "border-dashed border-warm-border/60 bg-white hover:border-brand-terracotta/30 hover:bg-brand-terracotta-light/20"
              )}
            >
              {/* Subtle shimmer for unplanned days */}
              {!isPlanned && !isSelected && (
                <span className="pointer-events-none absolute inset-0 animate-pulse rounded-xl bg-gradient-to-r from-transparent via-brand-terracotta/[0.03] to-transparent" />
              )}

              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-content-primary">
                  {dateLabel}
                </span>
                {weekday && (
                  <span className="text-xs text-content-muted/60">
                    {weekday}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs text-content-muted">
                {city.text ? (
                  city.start && city.end && !city.isSameCity ? (
                    <>
                      <MapPin
                        size={10}
                        className="shrink-0 text-content-muted/50"
                      />
                      <span className="truncate">{city.start}</span>
                      <ArrowRight size={9} className="shrink-0 opacity-40" />
                      <span className="truncate">{city.end}</span>
                    </>
                  ) : (
                    <>
                      <MapPin
                        size={10}
                        className="shrink-0 text-content-muted/50"
                      />
                      <span className="truncate">{city.text}</span>
                    </>
                  )
                ) : (
                  <span className="italic text-content-muted/40">
                    No cities set
                  </span>
                )}
              </div>

              {isPlanned && (
                <div className="mt-1.5 text-[11px] text-content-muted/70">
                  {locationCount} {locationCount === 1 ? "place" : "places"}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
