"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { Car, Compass, Footprints, Route } from "lucide-react";

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
  const routes = currentOption?.routes ?? [];

  const walkRoutes = routes.filter((r) => r.transport_mode === "walk");
  const transferRoutes = routes.filter((r) => r.transport_mode !== "walk");

  const walkDuration = walkRoutes.reduce(
    (sum, r) => sum + (r.duration_seconds ?? 0),
    0
  );
  const walkDistance = walkRoutes.reduce(
    (sum, r) => sum + (r.distance_meters ?? 0),
    0
  );
  const transferDuration = transferRoutes.reduce(
    (sum, r) => sum + (r.duration_seconds ?? 0),
    0
  );
  const transferDistance = transferRoutes.reduce(
    (sum, r) => sum + (r.distance_meters ?? 0),
    0
  );
  const hasWalk = walkDuration > 0 || walkDistance > 0;
  const hasTransfer = transferDuration > 0 || transferDistance > 0;

  return (
    <aside className="grain-overlay rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 font-serif text-sm font-semibold text-foreground">
        <Compass size={16} className="text-primary/60" />
        Day overview
      </div>

      {day ? (
        <>
          <div className="flex gap-3 text-center text-xs">
            <div className="flex-1 rounded-lg bg-brand-muted/40 px-2 py-2">
              <Footprints
                size={14}
                className="mx-auto mb-1 text-muted-foreground/50"
              />
              <div className="text-base font-semibold text-foreground">
                {placeCount}
              </div>
              <div className="text-muted-foreground">
                {placeCount === 1 ? "place" : "places"}
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-brand-muted/40 px-2 py-2">
              <Route
                size={14}
                className="mx-auto mb-1 text-muted-foreground/50"
              />
              <div className="text-base font-semibold text-foreground">
                {routeCount}
              </div>
              <div className="text-muted-foreground">
                {routeCount === 1 ? "route" : "routes"}
              </div>
            </div>
            {day.options.length > 1 && (
              <div className="flex-1 rounded-lg bg-brand-muted/40 px-2 py-2">
                <div className="text-base font-semibold text-foreground">
                  {day.options.length}
                </div>
                <div className="text-muted-foreground">plans</div>
              </div>
            )}
          </div>
          {routeCount > 0 && (hasWalk || hasTransfer) && (
            <div className="mt-3 space-y-1.5">
              {hasWalk && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Footprints size={12} className="shrink-0 text-brand/50" />
                  <span className="font-medium">
                    {walkDuration > 0 && formatDuration(walkDuration)}
                    {walkDuration > 0 && walkDistance > 0 && " · "}
                    {walkDistance > 0 && formatDistance(walkDistance)}
                  </span>
                  <span className="text-muted-foreground/50">on foot</span>
                </div>
              )}
              {hasTransfer && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Car size={12} className="shrink-0 text-brand/50" />
                  <span className="font-medium">
                    {transferDuration > 0 && formatDuration(transferDuration)}
                    {transferDuration > 0 && transferDistance > 0 && " · "}
                    {transferDistance > 0 && formatDistance(transferDistance)}
                  </span>
                  <span className="text-muted-foreground/50">transfer</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a day to see its summary.
        </p>
      )}
    </aside>
  );
}
