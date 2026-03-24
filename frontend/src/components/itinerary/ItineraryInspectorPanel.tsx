"use client";

import type { ItineraryDay, ItineraryOption, Location, LocationSummary } from "@/lib/api";
import { CalendarDays, Compass, MapPin, Route, Sparkles } from "lucide-react";

export type InspectorLocation = {
  dayId: string | null;
  optionId: string | null;
  locationId: string;
  location: Location | LocationSummary;
  dayLabel: string | null;
  optionIndex: number | null;
  timePeriod: string | null;
  scheduled: boolean;
};

interface ItineraryInspectorPanelProps {
  day: ItineraryDay | null;
  currentOption?: ItineraryOption;
  selectedLocation: InspectorLocation | null;
  unscheduledCount: number;
  onUpdateTimePeriod: (
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) => void | Promise<void>;
}

function formatDayLabel(day: ItineraryDay): string {
  if (!day.date) return `Day ${day.sort_order + 1}`;
  return new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimePeriod(value: string | null): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ItineraryInspectorPanel({
  day,
  currentOption,
  selectedLocation,
  unscheduledCount,
  onUpdateTimePeriod,
}: ItineraryInspectorPanelProps) {
  const totalStops = day
    ? day.options.reduce((sum, option) => sum + option.locations.length, 0)
    : 0;

  return (
    <aside className="rounded-2xl border border-warm-border bg-surface-card p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-content-primary">
        <Compass size={16} />
        Inspector
      </div>

      {day ? (
        <div className="rounded-xl border border-warm-border bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            Selected day
          </div>
          <div className="mt-1 text-base font-semibold text-content-primary">
            {`Day snapshot · ${formatDayLabel(day)}`}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-brand-green-light/40 px-2 py-2">
              <div className="font-semibold text-content-primary">{day.options.length}</div>
              <div className="text-content-muted">plans</div>
            </div>
            <div className="rounded-lg bg-brand-green-light/40 px-2 py-2">
              <div className="font-semibold text-content-primary">{totalStops}</div>
              <div className="text-content-muted">stops</div>
            </div>
            <div className="rounded-lg bg-brand-green-light/40 px-2 py-2">
              <div className="font-semibold text-content-primary">
                {currentOption?.routes?.length ?? 0}
              </div>
              <div className="text-content-muted">routes</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-warm-border px-4 py-5 text-sm text-content-muted">
          Select a day to inspect how many plans, stops, and routes it carries.
        </div>
      )}

      {selectedLocation ? (
        <div className="mt-4 rounded-xl border border-warm-border bg-white/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                Focused place
              </div>
              <div className="mt-1 text-base font-semibold text-content-primary">
                {selectedLocation.location.name}
              </div>
            </div>
            <span className="rounded-full bg-brand-green-light px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-green-dark">
              {selectedLocation.scheduled ? "Scheduled" : "Unscheduled"}
            </span>
          </div>

          <div className="mt-3 space-y-2 text-sm text-content-muted">
            {selectedLocation.location.city ? (
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                {selectedLocation.location.city}
              </div>
            ) : null}
            {selectedLocation.location.category ? (
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                {selectedLocation.location.category}
              </div>
            ) : null}
            {selectedLocation.dayLabel ? (
              <div className="flex items-center gap-2">
                <CalendarDays size={14} />
                {selectedLocation.dayLabel}
                {selectedLocation.optionIndex ? ` · Plan ${selectedLocation.optionIndex}` : ""}
                {formatTimePeriod(selectedLocation.timePeriod)
                  ? ` · ${formatTimePeriod(selectedLocation.timePeriod)}`
                  : ""}
              </div>
            ) : null}
            {selectedLocation.location.address ? (
              <div>{selectedLocation.location.address}</div>
            ) : null}
            {selectedLocation.location.note ? (
              <div className="whitespace-pre-wrap text-content-primary/80">
                {selectedLocation.location.note}
              </div>
            ) : null}
            {selectedLocation.scheduled &&
            selectedLocation.dayId &&
            selectedLocation.optionId ? (
              <div className="rounded-lg border border-warm-border bg-brand-green-light/20 p-2.5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Time Slot
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["morning", "afternoon", "evening", "night"] as const).map(
                    (timePeriod) => {
                      const active = selectedLocation.timePeriod === timePeriod;
                      return (
                        <button
                          key={timePeriod}
                          type="button"
                          className={
                            active
                              ? "rounded-full bg-brand-terracotta px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-full border border-warm-border bg-white px-3 py-1.5 text-xs font-medium text-content-muted hover:border-brand-terracotta/40 hover:text-content-primary"
                          }
                          onClick={() =>
                            onUpdateTimePeriod(
                              selectedLocation.dayId!,
                              selectedLocation.optionId!,
                              selectedLocation.locationId,
                              timePeriod
                            )
                          }
                        >
                          {formatTimePeriod(timePeriod)}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            ) : null}
            {"google_link" in selectedLocation.location && selectedLocation.location.google_link ? (
              <a
                href={selectedLocation.location.google_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-sm font-medium text-brand-terracotta hover:underline"
              >
                Open in Maps
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-warm-border px-4 py-5 text-sm text-content-muted">
          Expand a stop or pick an unscheduled place to inspect its details here.
        </div>
      )}

      <div className="mt-4 rounded-xl bg-brand-green-light/30 px-3 py-3 text-sm text-content-muted">
        <div className="flex items-center gap-2 font-medium text-content-primary">
          <Route size={14} />
          Planning pressure
        </div>
        <p className="mt-1">
          {unscheduledCount === 0
            ? "All saved places are assigned to a day."
            : `${unscheduledCount} saved ${unscheduledCount === 1 ? "place is" : "places are"} still outside the schedule.`}
        </p>
      </div>
    </aside>
  );
}
