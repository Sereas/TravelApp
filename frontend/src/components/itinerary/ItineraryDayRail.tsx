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
      text: isSameCity ? start : `${start} > ${end}`,
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
    <aside className="grain-overlay overflow-hidden rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand">
        <CalendarDays size={14} />
        Mission Timeline
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto scrollbar-hide px-1 pb-1">
        {days.map((day, i) => {
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
              aria-current={isSelected ? "date" : undefined}
              aria-label={`Day ${i + 1}: ${dateLabel}${city.text ? `, ${city.text}` : ""}${isPlanned ? `, ${locationCount} stop${locationCount === 1 ? "" : "s"}` : ""}`}
              className={cn(
                "ticket-card group relative min-w-[170px] shrink-0 px-4 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "hover:scale-[1.02] motion-reduce:hover:scale-100",
                isSelected
                  ? "ring-2 ring-primary shadow-lg"
                  : isPlanned
                    ? "hover:shadow-md"
                    : "opacity-70 hover:opacity-100"
              )}
            >
              {isSelected && (
                <span className="stamp-badge pointer-events-none absolute right-2 top-2 text-[9px] text-primary">
                  Now
                </span>
              )}

              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-foreground">
                  {dateLabel}
                </span>
                {weekday && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50">
                    {weekday}
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {city.text ? (
                  city.start && city.end && !city.isSameCity ? (
                    <>
                      <MapPin size={10} className="shrink-0 text-primary/50" />
                      <span className="truncate font-medium">{city.start}</span>
                      <ArrowRight
                        size={9}
                        className="shrink-0 text-primary/40"
                      />
                      <span className="truncate font-medium">{city.end}</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={10} className="shrink-0 text-primary/50" />
                      <span className="truncate font-medium">{city.text}</span>
                    </>
                  )
                ) : (
                  <span className="italic text-muted-foreground/30">
                    Destination TBD
                  </span>
                )}
              </div>

              {isPlanned && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({
                      length: Math.min(locationCount, 5),
                    }).map((_, j) => (
                      <div
                        key={j}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    ))}
                    {locationCount > 5 && (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50">
                    {locationCount} {locationCount === 1 ? "stop" : "stops"}
                  </span>
                </div>
              )}

              {!isPlanned && (
                <div className="mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/30">
                    No stops
                  </span>
                </div>
              )}

              <div className="mt-2 border-t border-border/40 pt-2">
                <span className="text-[10px] font-medium text-muted-foreground/60">
                  {day.options.length}{" "}
                  {day.options.length === 1 ? "plan" : "plans"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
