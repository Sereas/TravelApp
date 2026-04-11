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
    <aside className="overflow-hidden rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <CalendarDays size={13} />
        Timeline
      </div>
      {/* Horizontally-scrolling day timeline.
       *
       * The `relative` + right-edge fade gradient gives a visual affordance
       * that more days are scrollable off-screen — otherwise mobile users
       * with hidden scrollbars (`scrollbar-hide`) have no cue that the
       * list extends beyond what's visible. The gradient is
       * `pointer-events-none` so it never blocks clicks on partially
       * visible day pills underneath. */}
      <div className="relative">
        <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-1">
          {days.map((day, i) => {
            const option = selectedOptionsByDay[day.id];
            const locationCount = option?.locations.length ?? 0;
            const city = formatCityLabel(option);
            const dateLabel = formatDateLabel(day);
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
                  "ticket-card group relative min-w-[140px] shrink-0 px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "ring-2 ring-primary shadow-sm"
                    : isPlanned
                      ? "hover:shadow-sm"
                      : "opacity-60 hover:opacity-100"
                )}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-foreground">
                    {dateLabel}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {city.text ? (
                    city.start && city.end && !city.isSameCity ? (
                      <>
                        <MapPin
                          size={10}
                          className="shrink-0 text-primary/50"
                        />
                        <span className="truncate font-medium">
                          {city.start}
                        </span>
                        <ArrowRight
                          size={9}
                          className="shrink-0 text-primary/40"
                        />
                        <span className="truncate font-medium">{city.end}</span>
                      </>
                    ) : (
                      <>
                        <MapPin
                          size={10}
                          className="shrink-0 text-primary/50"
                        />
                        <span className="truncate font-medium">
                          {city.text}
                        </span>
                      </>
                    )
                  ) : (
                    <span className="italic text-muted-foreground/30">
                      Destination TBD
                    </span>
                  )}
                </div>

                {isPlanned && (
                  <div className="mt-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground/50">
                      {locationCount} {locationCount === 1 ? "stop" : "stops"}
                    </span>
                  </div>
                )}

                {!isPlanned && (
                  <div className="mt-1.5">
                    <span className="text-[10px] text-muted-foreground/30">
                      No stops
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {/* Right-edge fade: signals horizontal overflow on narrow viewports. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
        />
      </div>
    </aside>
  );
}
