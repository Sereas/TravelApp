"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryOptionLocation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Footprints,
  GripVertical,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Car,
  TrainFront,
  Navigation,
  X,
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

type TransportMode = "walk" | "drive" | "transit";

const TIME_PERIOD_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  night: 3,
};

interface ItineraryRouteManagerProps {
  day: ItineraryDay;
  currentOption: ItineraryOption;
  sortedLocations: ItineraryOptionLocation[];
  routes: ItineraryOption["routes"];
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  onRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => void;
  onSaveRoute: (
    transport: TransportMode,
    locationIds: string[],
    editingRouteId: string | null
  ) => Promise<void>;
  onDeleteRoute: (routeId: string) => void;
}

function InlineRouteBuilder({
  sortedLocations,
  initialPickIds,
  initialTransport,
  isEditing,
  saving,
  onSave,
  onCancel,
}: {
  sortedLocations: ItineraryOptionLocation[];
  initialPickIds: string[];
  initialTransport: TransportMode;
  isEditing: boolean;
  saving: boolean;
  onSave: (transport: TransportMode, locationIds: string[]) => void;
  onCancel: () => void;
}) {
  const displayLocations = useMemo(
    () =>
      [...sortedLocations].sort((a, b) => {
        const ta = TIME_PERIOD_ORDER[a.time_period || "morning"] ?? 0;
        const tb = TIME_PERIOD_ORDER[b.time_period || "morning"] ?? 0;
        if (ta !== tb) return ta - tb;
        return a.sort_order - b.sort_order;
      }),
    [sortedLocations]
  );

  const [pickIds, setPickIds] = useState<string[]>(initialPickIds);
  const [transport, setTransport] = useState<TransportMode>(initialTransport);

  const toggleStop = useCallback((olId: string) => {
    setPickIds((prev) =>
      prev.includes(olId) ? prev.filter((id) => id !== olId) : [...prev, olId]
    );
  }, []);

  const moveStop = useCallback((index: number, direction: -1 | 1) => {
    setPickIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeStop = useCallback((olId: string) => {
    setPickIds((prev) => prev.filter((id) => id !== olId));
  }, []);

  const selectAllInOrder = useCallback(() => {
    setPickIds(displayLocations.map((l) => l.id));
  }, [displayLocations]);

  return (
    <div className="space-y-3 rounded-xl border border-brand/20 bg-brand/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-brand">
          {isEditing ? "Edit route" : "New route"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Transport mode */}
      <div
        className="flex items-center gap-1"
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
              onClick={() => setTransport(mode.key as TransportMode)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                selected
                  ? "bg-brand text-white shadow-sm"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <MIcon size={13} />
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Stop list header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Select stops in order ({pickIds.length} selected)
        </span>
        {displayLocations.length >= 2 &&
          pickIds.length < displayLocations.length && (
            <button
              type="button"
              onClick={selectAllInOrder}
              className="text-[11px] font-medium text-brand transition-colors hover:text-brand-strong"
            >
              Select all
            </button>
          )}
      </div>

      {/* Available stops */}
      <div className="space-y-1">
        {displayLocations.map((ol) => {
          const selected = pickIds.includes(ol.id);
          const seq = selected ? pickIds.indexOf(ol.id) + 1 : 0;
          return (
            <button
              key={ol.id}
              type="button"
              onClick={() => toggleStop(ol.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-all",
                selected
                  ? "border-brand/30 bg-white shadow-sm dark:bg-card"
                  : "border-transparent bg-card/50 hover:bg-card dark:bg-card/30 dark:hover:bg-card/60"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                  selected
                    ? "bg-brand text-white"
                    : "border-2 border-muted-foreground/20 text-muted-foreground/40"
                )}
              >
                {selected ? seq : ""}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-medium",
                  selected ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {ol.location.name}
              </span>
              {ol.location.city && (
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                  {ol.location.city}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Reorder selected stops */}
      {pickIds.length >= 2 && (
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Route order
          </span>
          <div className="rounded-lg border border-border/60 bg-card p-1">
            {pickIds.map((id, i) => {
              const ol = displayLocations.find((l) => l.id === id);
              if (!ol) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {ol.location.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveStop(i, -1)}
                      disabled={i === 0}
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-30"
                      aria-label={`Move ${ol.location.name} up`}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStop(i, 1)}
                      disabled={i === pickIds.length - 1}
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-30"
                      aria-label={`Move ${ol.location.name} down`}
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStop(id)}
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive"
                      aria-label={`Remove ${ol.location.name}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={pickIds.length < 2 || saving}
          onClick={() => onSave(transport, pickIds)}
        >
          {saving ? (
            <>
              <LoadingSpinner size="sm" className="h-3 w-3" />
              Saving…
            </>
          ) : (
            <>
              <Check size={13} />
              {isEditing
                ? "Update route"
                : `Create route (${pickIds.length} stops)`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function ItineraryRouteManager({
  day,
  currentOption,
  sortedLocations,
  routes,
  calculatingRouteId,
  routeMetricsError,
  onRetryRouteMetrics,
  onSaveRoute,
  onDeleteRoute,
}: ItineraryRouteManagerProps) {
  const readOnly = useReadOnly();
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [builderMode, setBuilderMode] = useState<"create" | "edit" | null>(
    null
  );
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editInitialIds =
    editingRouteId != null
      ? (routes.find((r) => r.route_id === editingRouteId)
          ?.option_location_ids ?? [])
      : [];
  const editInitialTransport =
    editingRouteId != null
      ? ((routes.find((r) => r.route_id === editingRouteId)
          ?.transport_mode as TransportMode) ?? "walk")
      : "walk";

  function handleBeginCreate() {
    setBuilderMode("create");
    setEditingRouteId(null);
  }

  function handleBeginEdit(route: (typeof routes)[0]) {
    setBuilderMode("edit");
    setEditingRouteId(route.route_id);
  }

  function handleCancel() {
    setBuilderMode(null);
    setEditingRouteId(null);
  }

  async function handleSave(transport: TransportMode, locationIds: string[]) {
    setSaving(true);
    try {
      await onSaveRoute(transport, locationIds, editingRouteId);
      setBuilderMode(null);
      setEditingRouteId(null);
    } catch {
      /* error shown by parent */
    } finally {
      setSaving(false);
    }
  }

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
            onClick={handleBeginCreate}
          >
            <Plus size={12} />
            Create route
          </Button>
        )}
      </div>

      {/* Inline route builder */}
      {builderMode === "create" && (
        <div className="mb-3">
          <InlineRouteBuilder
            sortedLocations={sortedLocations}
            initialPickIds={[]}
            initialTransport="walk"
            isEditing={false}
            saving={saving}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {builderMode === "edit" && editingRouteId && (
        <div className="mb-3">
          <InlineRouteBuilder
            key={editingRouteId}
            sortedLocations={sortedLocations}
            initialPickIds={editInitialIds}
            initialTransport={editInitialTransport}
            isEditing
            saving={saving}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
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
                    "ticket-card flex items-center gap-2 border-l-[4px] py-2.5 pl-4 pr-6 text-xs",
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
                        onClick={() => handleBeginEdit(route)}
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
