"use client";

import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import {
  Car,
  Compass,
  Footprints,
  LayoutList,
  MapPin,
  Route,
} from "lucide-react";

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

  function routeTotals(r: (typeof routes)[number]) {
    if (r.segments && r.segments.length > 0) {
      return {
        dur: r.segments.reduce((s, seg) => s + (seg.duration_seconds ?? 0), 0),
        dist: r.segments.reduce((s, seg) => s + (seg.distance_meters ?? 0), 0),
      };
    }
    return { dur: r.duration_seconds ?? 0, dist: r.distance_meters ?? 0 };
  }

  const walkDuration = walkRoutes.reduce(
    (sum, r) => sum + routeTotals(r).dur,
    0
  );
  const walkDistance = walkRoutes.reduce(
    (sum, r) => sum + routeTotals(r).dist,
    0
  );
  const transferDuration = transferRoutes.reduce(
    (sum, r) => sum + routeTotals(r).dur,
    0
  );
  const transferDistance = transferRoutes.reduce(
    (sum, r) => sum + routeTotals(r).dist,
    0
  );
  const hasWalk = walkDuration > 0 || walkDistance > 0;
  const hasTransfer = transferDuration > 0 || transferDistance > 0;

  return (
    <aside className="overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Compass size={14} className="text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Day overview
        </span>
      </div>

      {day ? (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin size={12} className="text-primary/60" />
              <span className="font-bold text-foreground">{placeCount}</span>
              <span>{placeCount === 1 ? "place" : "places"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Route size={12} className="text-primary/60" />
              <span className="font-bold text-foreground">{routeCount}</span>
              <span>{routeCount === 1 ? "route" : "routes"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <LayoutList size={12} className="text-primary/60" />
              <span className="font-bold text-foreground">
                {day.options.length}
              </span>
              <span>{day.options.length === 1 ? "plan" : "plans"}</span>
            </div>
          </div>
          {routeCount > 0 && (hasWalk || hasTransfer) && (
            <div className="flex flex-wrap gap-3 border-t border-border/50 pt-2 text-xs text-muted-foreground">
              {hasWalk && (
                <div className="flex items-center gap-1.5">
                  <Footprints size={11} className="shrink-0 text-primary/50" />
                  <span className="font-medium">
                    {walkDuration > 0 && formatDuration(walkDuration)}
                    {walkDuration > 0 && walkDistance > 0 && " / "}
                    {walkDistance > 0 && formatDistance(walkDistance)}
                  </span>
                </div>
              )}
              {hasTransfer && (
                <div className="flex items-center gap-1.5">
                  <Car size={11} className="shrink-0 text-primary/50" />
                  <span className="font-medium">
                    {transferDuration > 0 && formatDuration(transferDuration)}
                    {transferDuration > 0 && transferDistance > 0 && " / "}
                    {transferDistance > 0 && formatDistance(transferDistance)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a day to see its summary.
        </p>
      )}
    </aside>
  );
}
