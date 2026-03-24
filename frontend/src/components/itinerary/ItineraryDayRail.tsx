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
    <aside className="grain-overlay rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center gap-2 font-serif text-sm font-semibold text-foreground">
        <CalendarDays size={16} />
        Days
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1">
        {days.map((day) => {
          const option = selectedOptionsByDay[day.id];
          const locationCount = option?.locations.length ?? 0;
          const totalLocations = option ? option.locations.length : 0;
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
                "hover:scale-[1.01] motion-reduce:hover:scale-100",
                isSelected
                  ? "border-brand/50 bg-brand-muted/60 shadow-md"
                  : isPlanned
                    ? "border-transparent bg-brand-muted/15 hover:border-brand/25 hover:bg-brand-muted/35"
                    : "border-dashed border-border/60 bg-white hover:border-primary/30 hover:bg-primary/10 dark:bg-card"
              )}
            >
              {isSelected && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-[8px] font-bold text-brand">
                  <span className="rotate-[-8deg]">&bull;</span>
                </span>
              )}

              {!isPlanned && !isSelected && (
                <span className="pointer-events-none absolute inset-0 animate-pulse rounded-xl bg-gradient-to-r from-transparent via-primary/[0.03] to-transparent" />
              )}

              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-base font-bold text-foreground">
                  {dateLabel}
                </span>
                {weekday && (
                  <span className="text-xs text-muted-foreground/60">
                    {weekday}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {city.text ? (
                  city.start && city.end && !city.isSameCity ? (
                    <>
                      <MapPin
                        size={10}
                        className="shrink-0 text-muted-foreground/50"
                      />
                      <span className="truncate">{city.start}</span>
                      <ArrowRight size={9} className="shrink-0 opacity-40" />
                      <span className="truncate">{city.end}</span>
                    </>
                  ) : (
                    <>
                      <MapPin
                        size={10}
                        className="shrink-0 text-muted-foreground/50"
                      />
                      <span className="truncate">{city.text}</span>
                    </>
                  )
                ) : (
                  <span className="italic text-muted-foreground/40">
                    No cities set
                  </span>
                )}
              </div>

              {isPlanned && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground/70">
                    {locationCount} {locationCount === 1 ? "place" : "places"}
                  </span>
                  {totalLocations > 0 && (
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(totalLocations, 5) }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className="h-1 w-1 rounded-full bg-brand/60"
                          />
                        )
                      )}
                      {totalLocations > 5 && (
                        <div className="h-1 w-1 rounded-full bg-brand/25" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
