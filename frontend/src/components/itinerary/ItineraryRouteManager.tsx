"use client";

import { type ItineraryDay, type ItineraryOption } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronRight,
  Footprints,
  Pencil,
  Plus,
  Trash2,
  Car,
  TrainFront,
} from "lucide-react";

const TRANSPORT = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "drive", label: "Drive", icon: Car },
  { key: "transit", label: "Transit", icon: TrainFront },
] as const;

const ROUTE_COLORS = [
  {
    bar: "border-l-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    hex: "#60a5fa",
  },
  {
    bar: "border-l-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    hex: "#34d399",
  },
  {
    bar: "border-l-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    hex: "#fb923c",
  },
  {
    bar: "border-l-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    hex: "#a78bfa",
  },
  {
    bar: "border-l-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    hex: "#fb7185",
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
  if (route.duration_seconds == null) return "— min";
  return formatDuration(route.duration_seconds);
}

function formatRouteTotalDistance(route: {
  distance_meters?: number | null;
}): string {
  if (route.distance_meters == null) return "— km";
  const km = route.distance_meters / 1000;
  const decimals = km >= 10 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
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
  editingRouteId: string | null;
  pickIds: string[];
  pickTransport: "walk" | "drive" | "transit";
  savingRoute: boolean;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  onSetPickTransport: (mode: "walk" | "drive" | "transit") => void;
  onSaveRoute: () => void;
  onCancelPick: () => void;
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
  editingRouteId,
  pickIds,
  pickTransport,
  savingRoute,
  calculatingRouteId,
  routeMetricsError,
  onSetPickTransport,
  onSaveRoute,
  onCancelPick,
  onRetryRouteMetrics,
  onEditRoute,
  onDeleteRoute,
  onBeginCreateRoute,
}: ItineraryRouteManagerProps) {
  return (
    <section className="mt-5 rounded-2xl border border-warm-border/70 bg-muted/20 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            Mobility
          </div>
          <p className="mt-0.5 text-xs text-content-muted">
            Keep routes lightweight. The stop sequence remains the primary plan.
          </p>
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
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">
            {editingRouteId
              ? "Edit route — click to add/remove stops"
              : "Click locations in order"}
          </span>
          <div className="flex-1" />
          {TRANSPORT.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.key}
                type="button"
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-medium",
                  pickTransport === mode.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
                onClick={() => onSetPickTransport(mode.key)}
              >
                <Icon size={11} className="mr-0.5 inline" />
                {mode.label}
              </button>
            );
          })}
          <Button
            size="sm"
            className="h-6 text-[11px]"
            disabled={pickIds.length < 2 || savingRoute}
            onClick={onSaveRoute}
          >
            {savingRoute ? "Saving…" : `Save (${pickIds.length})`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={onCancelPick}
          >
            Cancel
          </Button>
        </div>
      )}

      {routes.length > 0 && !isPickMode && (
        <div className="space-y-2">
          {routes.map((route, index) => {
            const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
            const Icon =
              TRANSPORT.find((mode) => mode.key === route.transport_mode)
                ?.icon ?? Footprints;
            const names = route.location_ids
              .map(
                (locationId) =>
                  sortedLocations.find(
                    (location) => location.location_id === locationId
                  )?.location.name ?? "?"
              )
              .join(" → ");
            const isCalculating = calculatingRouteId === route.route_id;
            const metricsError = routeMetricsError[route.route_id];

            return (
              <div
                key={route.route_id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-white/80 border-l-[3px] px-2.5 py-2 text-xs shadow-sm",
                  color.bar,
                  color.bg
                )}
              >
                <Icon size={12} className={cn("shrink-0", color.text)} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-medium",
                    color.text
                  )}
                  title={names}
                >
                  {names}
                </span>
                <ChevronRight
                  size={12}
                  className="shrink-0 text-muted-foreground/40"
                />
                {isCalculating && (
                  <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <LoadingSpinner size="sm" className="shrink-0" />
                    <span>Calculating…</span>
                  </span>
                )}
                {!isCalculating && metricsError && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
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
                  <span className="text-muted-foreground">
                    {formatRouteTotalDuration(route)} ·{" "}
                    {formatRouteTotalDistance(route)}
                    {route.route_status === "error" && (
                      <span
                        className="ml-1 text-amber-600"
                        title="Some segments could not be calculated"
                      >
                        (partial)
                      </span>
                    )}
                  </span>
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
            );
          })}
        </div>
      )}

      {routes.length === 0 && !isPickMode && (
        <div className="rounded-xl border border-dashed border-warm-border bg-white/70 px-3 py-3 text-xs text-content-muted">
          No routes yet. Add one only when travel time between stops matters.
        </div>
      )}
    </section>
  );
}
