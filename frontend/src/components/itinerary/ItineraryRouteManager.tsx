"use client";

import { useEffect, useState } from "react";
import {
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryOptionLocation,
} from "@/lib/api";
import {
  ROUTE_COLORS,
  TRANSPORT,
  type TransportMode,
} from "@/components/itinerary/itinerary-route-constants";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Footprints,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function getRouteTotals(route: {
  duration_seconds?: number | null;
  distance_meters?: number | null;
  segments?: Array<{
    duration_seconds: number | null;
    distance_meters: number | null;
  }>;
}): { duration: number | null; distance: number | null } {
  if (route.segments && route.segments.length > 0) {
    const duration = route.segments.reduce(
      (sum, s) => sum + (s.duration_seconds ?? 0),
      0
    );
    const distance = route.segments.reduce(
      (sum, s) => sum + (s.distance_meters ?? 0),
      0
    );
    return {
      duration: duration > 0 ? duration : null,
      distance: distance > 0 ? distance : null,
    };
  }
  return {
    duration: route.duration_seconds ?? null,
    distance: route.distance_meters ?? null,
  };
}

function formatRouteTotalDuration(
  route: Parameters<typeof getRouteTotals>[0]
): string {
  const { duration } = getRouteTotals(route);
  if (duration == null) return "-- min";
  return formatDuration(duration);
}

function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "-- km";
  const km = meters / 1000;
  const decimals = km >= 10 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
}

function formatRouteTotalDistance(
  route: Parameters<typeof getRouteTotals>[0]
): string {
  const { distance } = getRouteTotals(route);
  return formatDistance(distance);
}

interface ItineraryRouteManagerProps {
  day: ItineraryDay;
  currentOption: ItineraryOption;
  sortedLocations: ItineraryOptionLocation[];
  routes: ItineraryOption["routes"];
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  /** Whether the route builder is active (pick mode). */
  builderMode: "create" | "edit" | null;
  onRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => void;
  onDeleteRoute: (routeId: string) => void;
  onBeginCreate: () => void;
  onBeginEdit: (route: ItineraryOption["routes"][0]) => void;
}

export function ItineraryRouteManager({
  day,
  currentOption,
  sortedLocations,
  routes,
  calculatingRouteId,
  routeMetricsError,
  builderMode,
  onRetryRouteMetrics,
  onDeleteRoute,
  onBeginCreate,
  onBeginEdit,
}: ItineraryRouteManagerProps) {
  const readOnly = useReadOnly();
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  useEffect(() => {
    if (
      expandedRouteId &&
      !routes.some((r) => r.route_id === expandedRouteId)
    ) {
      setExpandedRouteId(null);
    }
  }, [routes, expandedRouteId]);

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
        {!readOnly && sortedLocations.length >= 2 && builderMode === null && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={onBeginCreate}
          >
            <Plus size={12} />
            Create route
          </Button>
        )}
      </div>

      {/* Pick-mode hint — directs user to click locations above */}
      {builderMode !== null && (
        <p className="mb-2 text-xs text-muted-foreground">
          Click locations in the timeline above to add stops.
        </p>
      )}

      {routes.length > 0 && builderMode === null && (
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
            const stopNames = route.option_location_ids.map(
              (olId) =>
                sortedLocations.find((location) => location.id === olId)
                  ?.location.name ?? "?"
            );

            return (
              <div key={route.route_id} className="space-y-0">
                <div
                  className={cn(
                    "flex items-center gap-2 border-l-[4px] bg-card py-2.5 pl-4 pr-6 text-xs shadow-sm",
                    isExpanded ? "rounded-t-xl" : "rounded-xl",
                    color.bar
                  )}
                >
                  <Icon size={14} className={cn("shrink-0", color.text)} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-bold text-foreground"
                    title={stopNames.join(" → ")}
                    onClick={() =>
                      setExpandedRouteId(isExpanded ? null : route.route_id)
                    }
                  >
                    {stopNames.join(" → ")}
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
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-50"
                        onClick={() => onBeginEdit(route)}
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
                    </>
                  )}
                </div>

                {isExpanded && hasSegments && (
                  <div
                    className={cn(
                      "rounded-b-xl border border-t-0 border-border/40 border-l-[4px] bg-card/60 px-3 pb-2.5 pt-1",
                      color.bar
                    )}
                  >
                    {stopNames.map((name, i) => {
                      const segment = route.segments?.[i];
                      const isLast = i === stopNames.length - 1;

                      return (
                        <div key={i}>
                          <div className="flex items-center gap-2 py-1">
                            <MapPin
                              size={10}
                              className={cn("shrink-0", color.text)}
                            />
                            <span className="truncate text-xs font-bold text-foreground">
                              {name}
                            </span>
                          </div>

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

      {routes.length === 0 && builderMode === null && (
        <div className="rounded-xl border border-dashed border-border bg-card/70 px-3 py-3 text-xs text-muted-foreground">
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

// ── Sticky route builder toolbar ──────────────────────────────────────
// Rendered outside ItineraryRouteManager so it can be positioned as a
// sticky element at the card-content level, staying visible while the
// user scrolls through the timeline to pick stops.

interface RouteBuilderToolbarProps {
  builderMode: "create" | "edit" | null;
  pickIds: string[];
  transport: TransportMode;
  saving: boolean;
  onSetTransport: (mode: TransportMode) => void;
  onCancelBuilder: () => void;
  onSave: () => void;
}

export function RouteBuilderToolbar({
  builderMode,
  pickIds,
  transport,
  saving,
  onSetTransport,
  onCancelBuilder,
  onSave,
}: RouteBuilderToolbarProps) {
  if (builderMode === null) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-6 -mb-6 rounded-b-lg border-t border-brand/15 bg-card/95 px-5 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {/* Transport mode pills */}
        <div
          className="flex items-center gap-0.5"
          role="radiogroup"
          aria-label="Transport mode"
        >
          {TRANSPORT.map((mode) => {
            const MIcon = mode.icon;
            const selected = transport === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSetTransport(mode.key as TransportMode)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  selected
                    ? "bg-brand text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <MIcon size={12} />
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-border/60" />

        {/* Stop count */}
        <span className="text-[11px] font-medium text-muted-foreground">
          {pickIds.length} {pickIds.length === 1 ? "stop" : "stops"}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancelBuilder}
          disabled={saving}
          className="rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>

        {/* Create / Update */}
        <Button
          size="sm"
          className="h-7 gap-1 text-[11px]"
          disabled={pickIds.length < 2 || saving}
          onClick={onSave}
        >
          {saving ? (
            <>
              <LoadingSpinner size="sm" className="h-3 w-3" />
              Saving…
            </>
          ) : (
            <>
              <Check size={12} />
              {builderMode === "edit" ? "Update route" : "Create route"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
