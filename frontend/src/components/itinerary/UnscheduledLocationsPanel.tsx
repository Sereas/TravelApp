"use client";

import { useEffect, useState } from "react";
import type { Location } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarPlus, MapPin, Sparkles } from "lucide-react";

interface DayChoice {
  id: string;
  label: string;
}

interface UnscheduledLocationsPanelProps {
  locations: Location[];
  itineraryLocationMap: Map<string, string[]>;
  availableDays: DayChoice[];
  onScheduleToDay: (locationId: string, dayId: string) => void | Promise<void>;
  selectedLocationId?: string | null;
  onInspectLocation?: (locationId: string) => void;
}

function UnscheduledLocationRow({
  location,
  availableDays,
  onScheduleToDay,
  selected,
  onInspectLocation,
}: {
  location: Location;
  availableDays: DayChoice[];
  onScheduleToDay: (locationId: string, dayId: string) => void | Promise<void>;
  selected: boolean;
  onInspectLocation?: (locationId: string) => void;
}) {
  const [selectedDayId, setSelectedDayId] = useState(availableDays[0]?.id ?? "");

  useEffect(() => {
    setSelectedDayId((current) => current || availableDays[0]?.id || "");
  }, [availableDays]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/80 p-3 transition-colors",
        selected
          ? "border-brand-green/50 bg-brand-green-light/20"
          : "border-warm-border"
      )}
      onClick={() => onInspectLocation?.(location.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-content-primary">
            {location.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
            {location.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {location.city}
              </span>
            )}
            {location.category && (
              <span className="rounded-full bg-brand-green-light px-2 py-0.5 font-medium text-brand-green-dark">
                {location.category}
              </span>
            )}
          </div>
        </div>
      </div>
      {availableDays.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            aria-label={`Schedule ${location.name} to day`}
            value={selectedDayId}
            onChange={(event) => setSelectedDayId(event.target.value)}
          >
            {availableDays.map((day) => (
              <option key={day.id} value={day.id}>
                {day.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={!selectedDayId}
            onClick={() => onScheduleToDay(location.id, selectedDayId)}
          >
            <CalendarPlus size={12} />
            Schedule
          </Button>
        </div>
      )}
    </div>
  );
}

export function UnscheduledLocationsPanel({
  locations,
  itineraryLocationMap,
  availableDays,
  onScheduleToDay,
  selectedLocationId,
  onInspectLocation,
}: UnscheduledLocationsPanelProps) {
  const unscheduled = locations.filter(
    (location) => !itineraryLocationMap.has(location.id)
  );

  return (
    <aside className="rounded-2xl border border-warm-border bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
            <Sparkles size={16} />
            Unscheduled
          </div>
          <p className="mt-1 text-xs text-content-muted">
            Places saved to the trip but not assigned to a day yet.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            unscheduled.length > 0
              ? "bg-brand-terracotta/10 text-brand-terracotta"
              : "bg-brand-green-light text-brand-green-dark"
          )}
        >
          {unscheduled.length} open
        </span>
      </div>

      {unscheduled.length === 0 ? (
        <div className="rounded-xl border border-dashed border-warm-border px-4 py-6 text-center text-sm text-content-muted">
          Everything in this trip is already scheduled.
        </div>
      ) : (
        <div className="space-y-3">
          {unscheduled.map((location) => (
            <UnscheduledLocationRow
              key={location.id}
              location={location}
              availableDays={availableDays}
              onScheduleToDay={onScheduleToDay}
              selected={selectedLocationId === location.id}
              onInspectLocation={onInspectLocation}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
