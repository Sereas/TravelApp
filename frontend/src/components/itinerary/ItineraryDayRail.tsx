"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    <aside
      className="overflow-hidden rounded-2xl border border-border bg-card p-3"
      aria-label="Day timeline"
    >
      {/* Horizontally-scrolling day timeline.
       *
       * The `relative` + right-edge fade gradient gives a visual affordance
       * that more days are scrollable off-screen — otherwise mobile users
       * with hidden scrollbars (`scrollbar-hide`) have no cue that the
       * list extends beyond what's visible. The gradient is
       * `pointer-events-none` so it never blocks clicks on partially
       * visible day pills underneath. */}
      <div className="relative">
        {/* `py-2 px-1` gives the selected-day tile enough room for its
         * brand-colored ring + glow box-shadow to render — otherwise the
         * scroll container's implicit `overflow-y: auto` (a side-effect
         * of `overflow-x-auto`) clips the shadow on the top and bottom
         * edges, making the active tile look cropped. */}
        <div className="-mx-1 flex gap-3 overflow-x-auto scrollbar-hide px-1 py-2">
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
                  "ticket-card group relative w-[160px] shrink-0 cursor-pointer py-2 pl-3 pr-5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "z-10"
                    : isPlanned
                      ? ""
                      : "opacity-50 hover:opacity-90"
                )}
              >
                <span className="text-base font-bold tracking-tight text-foreground">
                  {dateLabel}
                </span>

                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {city.text ? (
                    city.start && city.end && !city.isSameCity ? (
                      <div className="flex gap-1.5">
                        {/* Vertical route indicator: dots connected by a line */}
                        <div className="flex shrink-0 flex-col items-center pt-[3px]">
                          <div className="size-[5px] rounded-full bg-muted-foreground/30" />
                          <div className="-my-[1px] w-px flex-1 bg-muted-foreground/20" />
                          <div className="size-[5px] rounded-full bg-brand/50" />
                        </div>
                        {/* City names, each on its own line */}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium leading-snug">
                            {city.start}
                          </div>
                          <div className="truncate font-medium leading-snug text-foreground/70">
                            {city.end}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="size-[5px] shrink-0 rounded-full bg-muted-foreground/30" />
                        <span className="truncate font-medium">
                          {city.text}
                        </span>
                      </div>
                    )
                  ) : (
                    <span className="italic text-muted-foreground/25">
                      No destination
                    </span>
                  )}
                </div>

                <div className="mt-1">
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      isPlanned
                        ? "font-medium text-muted-foreground/50"
                        : "text-muted-foreground/25"
                    )}
                  >
                    {isPlanned
                      ? `${locationCount} ${locationCount === 1 ? "stop" : "stops"}`
                      : "No stops"}
                  </span>
                </div>
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
