"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { CalendarDays } from "lucide-react";

interface ItineraryInspectorPanelProps {
  day: ItineraryDay | null;
  currentOption?: ItineraryOption;
}

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export function ItineraryInspectorPanel({
  day,
  currentOption,
}: ItineraryInspectorPanelProps) {
  const placeCount = currentOption?.locations.length ?? 0;
  const routeCount = currentOption?.routes?.length ?? 0;

  const totalDuration =
    currentOption?.routes?.reduce(
      (sum, r) => sum + (r.duration_seconds ?? 0),
      0
    ) ?? 0;
  const totalDistance =
    currentOption?.routes?.reduce(
      (sum, r) => sum + (r.distance_meters ?? 0),
      0
    ) ?? 0;

  return (
    <aside className="rounded-2xl border border-warm-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-primary">
        <CalendarDays size={16} />
        Day overview
      </div>

      {day ? (
        <>
          <div className="flex gap-3 text-center text-xs">
            <div className="flex-1 rounded-lg bg-brand-green-light/40 px-2 py-2">
              <div className="text-base font-semibold text-content-primary">
                {placeCount}
              </div>
              <div className="text-content-muted">
                {placeCount === 1 ? "place" : "places"}
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-brand-green-light/40 px-2 py-2">
              <div className="text-base font-semibold text-content-primary">
                {routeCount}
              </div>
              <div className="text-content-muted">
                {routeCount === 1 ? "route" : "routes"}
              </div>
            </div>
            {day.options.length > 1 && (
              <div className="flex-1 rounded-lg bg-brand-green-light/40 px-2 py-2">
                <div className="text-base font-semibold text-content-primary">
                  {day.options.length}
                </div>
                <div className="text-content-muted">plans</div>
              </div>
            )}
          </div>
          {routeCount > 0 && (totalDuration > 0 || totalDistance > 0) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-content-muted">
              {totalDuration > 0 && (
                <span>{formatDuration(totalDuration)}</span>
              )}
              {totalDuration > 0 && totalDistance > 0 && (
                <span className="opacity-40">·</span>
              )}
              {totalDistance > 0 && (
                <span>{formatDistance(totalDistance)}</span>
              )}
              <span className="opacity-40">total travel</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-content-muted">
          Select a day to see its summary.
        </p>
      )}
    </aside>
  );
}
