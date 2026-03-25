"use client";

import { useState } from "react";
import { type ItineraryDay, type ItineraryOption } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Footprints,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Car,
  TrainFront,
  Navigation,
} from "lucide-react";

const TRANSPORT = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "drive", label: "Drive", icon: Car },
  { key: "transit", label: "Transit", icon: TrainFront },
] as const;

const ROUTE_COLORS = [
  {
    bar: "border-l-route-1",
    bg: "bg-route-1/10",
    text: "text-route-1",
    hex: "hsl(213, 94%, 68%)",
  },
  {
    bar: "border-l-route-2",
    bg: "bg-route-2/10",
    text: "text-route-2",
    hex: "hsl(160, 64%, 52%)",
  },
  {
    bar: "border-l-route-3",
    bg: "bg-route-3/10",
    text: "text-route-3",
    hex: "hsl(27, 96%, 61%)",
  },
  {
    bar: "border-l-route-4",
    bg: "bg-route-4/10",
    text: "text-route-4",
    hex: "hsl(263, 70%, 72%)",
  },
  {
    bar: "border-l-route-5",
    bg: "bg-route-5/10",
    text: "text-route-5",
    hex: "hsl(350, 80%, 65%)",
  },
] as const;

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function formatRouteTotalDuration(route: {
  duration_seconds?: number | null;
}): string {
  if (route.duration_seconds == null) return "-- min";
  return formatDuration(route.duration_seconds);
}

function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "-- km";
  const km = meters / 1000;
  const decimals = km >= 10 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
}

function formatRouteTotalDistance(route: {
  distance_meters?: number | null;
}): string {
  return formatDistance(route.distance_meters);
}

interface ItineraryRouteManagerProps {
  day: ItineraryDay;
  currentOption: ItineraryOption;
  sortedLocations: Array<{
    location_id: string;
    location: { name: string };
  }>;
  routes: ItineraryOption["routes"];
  isPickMode: boolean;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  onRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => Promise<void>;
  onEditRoute: (route: ItineraryOption["routes"][number]) => void;
  onDeleteRoute: (routeId: string) => void;
  onBeginCreateRoute: () => void;
}

export function ItineraryRouteManager({
  day,
  currentOption,
  sortedLocations,
  routes,
  isPickMode,
  calculatingRouteId,
  routeMetricsError,
  onRetryRouteMetrics,
  onEditRoute,
  onDeleteRoute,
  onBeginCreateRoute,
}: ItineraryRouteManagerProps) {
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation size={14} className="text-brand" />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-brand">
              Logistics
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Routes between stops
            </p>
          </div>
        </div>
        {sortedLocations.length >= 2 && !isPickMode && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={onBeginCreateRoute}
          >
            <Plus size={12} />
            Create route
          </Button>
        )}
      </div>

      {isPickMode && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary/70">
          Click stops above to add them to the route.
        </div>
      )}

      {routes.length > 0 && !isPickMode && (
        <div className="space-y-2">
          {routes.map((route, index) => {
            const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
            const Icon =
              TRANSPORT.find((mode) => mode.key === route.transport_mode)
                ?.icon ?? Footprints;
            const isCalculating = calculatingRouteId === route.route_id;
            const metricsError = routeMetricsError[route.route_id];
            const isExpanded = expandedRouteId === route.route_id;
            const hasSegments = route.segments && route.segments.length > 0;
            const stopNames = route.location_ids.map(
              (locationId) =>
                sortedLocations.find(
                  (location) => location.location_id === locationId
                )?.location.name ?? "?"
            );

            return (
              <div key={route.route_id} className="space-y-0">
                {/* Ticket-style route card */}
                <div
                  className={cn(
                    "ticket-card flex items-center gap-2 border-l-[4px] pl-4 pr-6 py-2.5 text-xs",
                    isExpanded ? "rounded-t-xl" : "rounded-xl",
                    color.bar
                  )}
                >
                  <Icon size={14} className={cn("shrink-0", color.text)} />
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 flex-1 truncate text-left font-bold",
                      color.text
                    )}
                    title={stopNames.join(" > ")}
                    onClick={() =>
                      setExpandedRouteId(isExpanded ? null : route.route_id)
                    }
                  >
                    {stopNames.join(" > ")}
                  </button>
                  {isCalculating && (
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <LoadingSpinner size="sm" className="shrink-0" />
                      <span>Calculating...</span>
                    </span>
                  )}
                  {!isCalculating && metricsError && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded bg-booking-pending-bg px-1.5 py-0.5 text-booking-pending-text">
                        <AlertCircle size={11} />
                        <span
                          className="max-w-[140px] truncate"
                          title={metricsError}
                        >
                          Metrics unavailable
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={() =>
                          onRetryRouteMetrics(
                            day.id,
                            currentOption.id,
                            route.route_id
                          )
                        }
                      >
                        Retry
                      </Button>
                    </span>
                  )}
                  {!isCalculating && !metricsError && (
                    <span className="shrink-0 font-medium text-muted-foreground">
                      {formatRouteTotalDuration(route)} /{" "}
                      {formatRouteTotalDistance(route)}
                      {route.route_status === "error" && (
                        <span
                          className="ml-1 text-booking-pending-text"
                          title="Some segments could not be calculated"
                        >
                          (partial)
                        </span>
                      )}
                    </span>
                  )}
                  {hasSegments && !isCalculating && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                      onClick={() =>
                        setExpandedRouteId(isExpanded ? null : route.route_id)
                      }
                      aria-label={isExpanded ? "Collapse" : "Expand segments"}
                    >
                      {isExpanded ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-50"
                    onClick={() => onEditRoute(route)}
                    aria-label="Edit route"
                    disabled={isCalculating}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    onClick={() => onDeleteRoute(route.route_id)}
                    aria-label="Delete route"
                    disabled={isCalculating}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Expanded segment details */}
                {isExpanded && hasSegments && (
                  <div
                    className={cn(
                      "rounded-b-xl border border-t-0 border-white/80 border-l-[4px] px-3 pb-2.5 pt-1 bg-white/60",
                      color.bar
                    )}
                  >
                    {stopNames.map((name, i) => {
                      const segment = route.segments?.[i];
                      const isLast = i === stopNames.length - 1;

                      return (
                        <div key={i}>
                          {/* Stop */}
                          <div className="flex items-center gap-2 py-1">
                            <MapPin
                              size={10}
                              className={cn("shrink-0", color.text)}
                            />
                            <span className="truncate text-xs font-bold text-foreground">
                              {name}
                            </span>
                          </div>

                          {/* Segment connector */}
                          {!isLast && segment && (
                            <div className="ml-[4px] flex items-center gap-2 border-l border-dashed py-0.5 pl-3.5">
                              <Icon
                                size={9}
                                className="shrink-0 text-muted-foreground/50"
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {segment.duration_seconds != null
                                  ? formatDuration(segment.duration_seconds)
                                  : "--"}
                                {" / "}
                                {formatDistance(segment.distance_meters)}
                              </span>
                            </div>
                          )}
                          {!isLast && !segment && (
                            <div className="ml-[4px] flex items-center gap-2 border-l border-dashed py-0.5 pl-3.5">
                              <Icon
                                size={9}
                                className="shrink-0 text-muted-foreground/50"
                              />
                              <span className="text-[11px] text-muted-foreground/50">
                                -- min / -- km
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {routes.length === 0 && !isPickMode && (
        <div className="rounded-xl border border-dashed border-border bg-white/70 px-3 py-3 text-xs text-muted-foreground dark:bg-card/70">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-primary/20" />
            No routes yet
            <span className="inline-block h-px w-6 bg-primary/20" />
          </span>
        </div>
      )}
    </section>
  );
}
