"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  api,
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryOptionLocation,
  type Location,
} from "@/lib/api";
import {
  ItineraryDayMap,
  type MapRoutePolyline,
} from "@/components/itinerary/ItineraryDayMap";
import { ItineraryDayHeader } from "@/components/itinerary/ItineraryDayHeader";
import { ItineraryDayTimeline } from "@/components/itinerary/ItineraryDayTimeline";
import { ItineraryRouteManager } from "@/components/itinerary/ItineraryRouteManager";
import { AddLocationsToOptionDialog } from "@/components/itinerary/AddLocationsToOptionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  Sunrise,
  Sun,
  Sunset,
  Moon,
  MapPin,
  Plus,
  Footprints,
  Car,
  TrainFront,
  X,
  ListOrdered,
} from "lucide-react";

const TIME_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number | string }>;
    bg: string;
    text: string;
  }
> = {
  morning: {
    label: "Morning",
    icon: Sunrise,
    bg: "bg-amber-50",
    text: "text-amber-800",
  },
  afternoon: {
    label: "Afternoon",
    icon: Sun,
    bg: "bg-sky-50",
    text: "text-sky-800",
  },
  evening: {
    label: "Evening",
    icon: Sunset,
    bg: "bg-purple-50",
    text: "text-purple-800",
  },
  night: {
    label: "Night",
    icon: Moon,
    bg: "bg-slate-800",
    text: "text-slate-50",
  },
};

const ROUTE_COLORS = [
  {
    bar: "border-l-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-400",
    hex: "#60a5fa",
  },
  {
    bar: "border-l-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
    hex: "#34d399",
  },
  {
    bar: "border-l-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
    hex: "#fb923c",
  },
  {
    bar: "border-l-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-400",
    hex: "#a78bfa",
  },
  {
    bar: "border-l-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-400",
    hex: "#fb7185",
  },
];

const PICK_TRANSPORT = [
  { key: "walk" as const, label: "Walk", icon: Footprints },
  { key: "drive" as const, label: "Drive", icon: Car },
  { key: "transit" as const, label: "Transit", icon: TrainFront },
];

/** Format a duration in seconds to human-readable string. */
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

export interface ItineraryDayCardProps {
  day: ItineraryDay;
  tripId: string;
  currentOption: ItineraryOption | undefined;
  tripLocations: Location[];
  createOptionLoading: boolean;
  tripStartDate: string | null;
  tripEndDate: string | null;
  onUpdateDayDate: (
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) => void;
  onSelectOption: (dayId: string, optionId: string) => void;
  onCreateAlternative: (
    dayId: string,
    name?: string
  ) => Promise<string | null> | void;
  onDeleteOption: (dayId: string, optionId: string) => void;
  onSaveOptionDetails: (
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) => void;
  onAddLocations: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => Promise<void>;
  onRemoveLocation: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
  onUpdateTimePeriod: (
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) => void;
  onReorderLocations: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => void;
  onRoutesChanged: () => void;
  /** After route is created, parent triggers calculation and passes back updated route. */
  onRouteCreated: (
    dayId: string,
    optionId: string,
    routeResponse: import("@/lib/api").RouteResponse
  ) => Promise<void>;
  /** Retry calculating metrics for a route that previously failed. */
  onRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => Promise<void>;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  onInspectLocation: (dayId: string, locationId: string) => void;
}

export function ItineraryDayCard({
  day,
  tripId,
  currentOption,
  tripLocations,
  createOptionLoading,
  tripStartDate,
  tripEndDate,
  onUpdateDayDate,
  onSelectOption,
  onCreateAlternative,
  onDeleteOption,
  onSaveOptionDetails,
  onAddLocations,
  onRemoveLocation,
  onUpdateTimePeriod,
  onReorderLocations,
  onRoutesChanged,
  onRouteCreated,
  onRetryRouteMetrics,
  calculatingRouteId,
  routeMetricsError,
  onInspectLocation,
}: ItineraryDayCardProps) {
  const readOnly = useReadOnly();
  const alreadyAdded = useMemo(
    () => new Set(currentOption?.locations.map((l) => l.location_id) ?? []),
    [currentOption]
  );

  // Routes from itinerary tree (loaded with tree, no separate fetch)
  const routes = useMemo(
    () => currentOption?.routes ?? [],
    [currentOption?.routes]
  );

  // Route creation / editing
  const [creating, setCreating] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [pickTransport, setPickTransport] = useState<
    "walk" | "drive" | "transit"
  >("walk");
  const [savingRoute, setSavingRoute] = useState(false);

  const isPickMode = creating || editingRouteId !== null;

  function handleEditRoute(route: (typeof routes)[0]) {
    setEditingRouteId(route.route_id);
    setPickIds([...route.location_ids]);
    setPickTransport(
      (route.transport_mode as "walk" | "drive" | "transit") || "walk"
    );
    setCreating(false);
  }

  function handleCancelPick() {
    setCreating(false);
    setEditingRouteId(null);
    setPickIds([]);
  }

  async function handleSaveRoute() {
    if (pickIds.length < 2 || !currentOption) return;
    setSavingRoute(true);
    try {
      if (editingRouteId) {
        const routeResponse = await api.itinerary.updateRoute(
          tripId,
          day.id,
          currentOption.id,
          editingRouteId,
          {
            transport_mode: pickTransport,
            location_ids: pickIds,
          }
        );
        setEditingRouteId(null);
        setPickIds([]);
        await onRouteCreated(day.id, currentOption.id, routeResponse);
      } else {
        const routeResponse = await api.itinerary.createRoute(
          tripId,
          day.id,
          currentOption.id,
          {
            transport_mode: pickTransport,
            label: null,
            location_ids: pickIds,
          }
        );
        setCreating(false);
        setPickIds([]);
        await onRouteCreated(day.id, currentOption.id, routeResponse);
      }
    } catch {
      /* error shown by parent */
    } finally {
      setSavingRoute(false);
    }
  }

  async function handleDeleteRoute(routeId: string) {
    if (!currentOption) return;
    try {
      await api.itinerary.deleteRoute(
        tripId,
        day.id,
        currentOption.id,
        routeId
      );
      onRoutesChanged();
    } catch {
      /* swallow */
    }
  }

  // Build lookup: locationId → all route memberships (a location can belong to multiple routes).
  const locRouteMap = useMemo(() => {
    const m = new Map<
      string,
      {
        route: (typeof routes)[0];
        idx: number;
        color: (typeof ROUTE_COLORS)[0];
      }[]
    >();
    routes.forEach((r, ri) => {
      const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
      r.location_ids.forEach((lid, idx) => {
        const arr = m.get(lid) ?? [];
        arr.push({ route: r, idx, color });
        m.set(lid, arr);
      });
    });
    return m;
  }, [routes]);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  // Time picker
  const [tpOpen, setTpOpen] = useState<string | null>(null);
  const [tpPos, setTpPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const tpTrigger = useRef<HTMLDivElement | null>(null);
  const tpDrop = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!tpOpen) {
      setTpPos(null);
      return;
    }
    const el = tpTrigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 168));
    setTpPos(
      below < 200
        ? { bottom: window.innerHeight - r.top + 4, left }
        : { top: r.bottom + 4, left }
    );
  }, [tpOpen]);

  useEffect(() => {
    if (!tpOpen) return;
    const c = () => setTpOpen(null);
    document.addEventListener("scroll", c, true);
    return () => document.removeEventListener("scroll", c, true);
  }, [tpOpen]);
  useEffect(() => {
    if (!tpOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tpTrigger.current?.contains(t) || tpDrop.current?.contains(t)) return;
      setTpOpen(null);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [tpOpen]);

  const [showMap, setShowMap] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      currentOption
        ? [...currentOption.locations].sort(
            (a, b) => a.sort_order - b.sort_order
          )
        : [],
    [currentOption]
  );

  const mapLocations = useMemo(
    () =>
      sorted
        .map((ol) => tripLocations.find((loc) => loc.id === ol.location_id))
        .filter(
          (loc): loc is Location =>
            !!loc &&
            typeof loc.latitude === "number" &&
            typeof loc.longitude === "number"
        )
        .map((loc) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          latitude: loc.latitude as number,
          longitude: loc.longitude as number,
          category: loc.category ?? null,
        })),
    [sorted, tripLocations]
  );

  const mapRoutes: MapRoutePolyline[] = useMemo(() => {
    if (!routes.length) return [];
    return routes
      .map((route, ri) => {
        const polylines = (route.segments ?? [])
          .filter((s) => s.encoded_polyline)
          .sort((a, b) => a.segment_order - b.segment_order)
          .map((s) => s.encoded_polyline!);
        if (polylines.length === 0) return null;
        const dur = formatRouteTotalDuration(route);
        const dist = formatRouteTotalDistance(route);
        return {
          routeId: route.route_id,
          color: ROUTE_COLORS[ri % ROUTE_COLORS.length].hex,
          encodedPolylines: polylines,
          label: `${dur} · ${dist}`,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [routes]);

  // Drag handlers
  function onDragStart(locId: string, e: React.DragEvent) {
    setDragId(locId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", locId);
  }
  function onDragEnd() {
    setDragId(null);
    setDropId(null);
  }
  function onDragOver(locId: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId) setDropId(locId);
  }
  function onDrop(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    setDropId(null);
    if (!dragId || !currentOption || dragId === targetId) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.location_id === dragId);
    const ti = sorted.findIndex((l) => l.location_id === targetId);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.splice(ti > fi ? ti - 1 : ti, 0, rm);
    setDragId(null);
    onReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.location_id)
    );
  }

  function onDropAtEnd(e: React.DragEvent) {
    e.preventDefault();
    setDropId(null);
    if (!dragId || !currentOption) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.location_id === dragId);
    if (fi < 0 || fi === sorted.length - 1) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.push(rm);
    setDragId(null);
    onReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.location_id)
    );
  }

  // Time picker portal
  const tpPortal =
    tpOpen && tpPos && currentOption
      ? (() => {
          const ol = sorted.find((l) => l.location_id === tpOpen);
          if (!ol) return null;
          const style: CSSProperties = {
            position: "fixed",
            left: tpPos.left,
            zIndex: 9999,
            width: 160,
            ...(tpPos.top !== undefined
              ? { top: tpPos.top }
              : { bottom: tpPos.bottom }),
          };
          return createPortal(
            <div
              ref={tpDrop}
              className="rounded-md border border-border bg-popover p-1 text-xs shadow-md"
              style={style}
              role="listbox"
            >
              {(["morning", "afternoon", "evening", "night"] as const).map(
                (k) => {
                  const m = TIME_META[k];
                  const I = m.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="option"
                      aria-selected={k === (ol.time_period || "morning")}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left",
                        k === (ol.time_period || "morning")
                          ? "bg-accent"
                          : "hover:bg-accent"
                      )}
                      onClick={() => {
                        setTpOpen(null);
                        onUpdateTimePeriod(
                          day.id,
                          currentOption.id,
                          ol.location_id,
                          k
                        );
                      }}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full",
                          m.bg,
                          m.text
                        )}
                      >
                        <I className="h-3 w-3" size={12} />
                      </span>
                      <span>{m.label}</span>
                    </button>
                  );
                }
              )}
            </div>,
            document.body
          );
        })()
      : null;

  return (
    <>
      {tpPortal}
      <Card>
        <CardHeader className="pb-2">
          <ItineraryDayHeader
            day={day}
            currentOption={currentOption}
            createOptionLoading={createOptionLoading}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            onUpdateDayDate={onUpdateDayDate}
            onSelectOption={onSelectOption}
            onCreateAlternative={onCreateAlternative}
            onDeleteOption={onDeleteOption}
            onSaveOptionDetails={onSaveOptionDetails}
          />
        </CardHeader>

        <CardContent className="pt-0">
          {currentOption && (
            <div key={currentOption.id} className="animate-page-flip">
              {/* Add locations */}
              {!readOnly && (
                <div className="mb-3">
                  <AddLocationsToOptionDialog
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                      >
                        <Plus size={12} />
                        Add locations
                      </Button>
                    }
                    allLocations={tripLocations}
                    alreadyAddedIds={alreadyAdded}
                    startingCity={currentOption.starting_city}
                    endingCity={currentOption.ending_city}
                    onConfirm={(ids) =>
                      onAddLocations(day.id, currentOption.id, ids)
                    }
                  />
                </div>
              )}

              <ItineraryDayTimeline
                sorted={sorted}
                locRouteMap={locRouteMap}
                expandedId={expandedId}
                dragId={dragId}
                dropId={dropId}
                isPickMode={isPickMode}
                pickIds={pickIds}
                tpOpen={tpOpen}
                tpTrigger={tpTrigger}
                currentOptionId={currentOption.id}
                dayId={day.id}
                calculatingRouteId={calculatingRouteId}
                onTogglePick={(locationId) =>
                  setPickIds((current) =>
                    current.includes(locationId)
                      ? current.filter((id) => id !== locationId)
                      : [...current, locationId]
                  )
                }
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDropLeave={() => setDropId(null)}
                onToggleExpanded={(locationId) =>
                  setExpandedId((current) =>
                    current === locationId ? null : locationId
                  )
                }
                onInspectLocation={(locationId) =>
                  onInspectLocation(day.id, locationId)
                }
                onToggleTimePicker={(locationId) =>
                  setTpOpen((current) =>
                    current === locationId ? null : locationId
                  )
                }
                onRemoveLocation={onRemoveLocation}
                onDropAtEnd={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropId("__end__");
                  onDropAtEnd(e);
                }}
              />

              <ItineraryRouteManager
                day={day}
                currentOption={currentOption}
                sortedLocations={sorted.map((location) => ({
                  location_id: location.location_id,
                  location: { name: location.location.name },
                }))}
                routes={routes}
                isPickMode={isPickMode}
                calculatingRouteId={calculatingRouteId}
                routeMetricsError={routeMetricsError}
                onRetryRouteMetrics={onRetryRouteMetrics}
                onEditRoute={handleEditRoute}
                onDeleteRoute={handleDeleteRoute}
                onBeginCreateRoute={() => {
                  setCreating(true);
                  setEditingRouteId(null);
                  setPickIds([]);
                  setPickTransport("walk");
                }}
              />

              {/* Map — visible by default at bottom */}
              {mapLocations.length > 0 && (
                <div className="mt-4">
                  {showMap ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Map
                        </span>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => setShowMap(false)}
                        >
                          Hide
                        </button>
                      </div>
                      <ItineraryDayMap
                        locations={mapLocations}
                        routes={mapRoutes}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                      onClick={() => setShowMap(true)}
                    >
                      <MapPin size={12} />
                      Show map
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!currentOption && (
            <p className="text-sm text-muted-foreground">No locations</p>
          )}
        </CardContent>
      </Card>

      {/* Sticky bottom pick-mode toolbar — portaled so it floats above everything */}
      {!readOnly &&
        isPickMode &&
        currentOption &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
              {/* Left group: mode label + transport */}
              <div className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-muted/50 px-2.5 py-1.5 dark:bg-brand-muted/20">
                <span className="text-xs font-semibold text-brand">
                  {editingRouteId ? "Edit" : "Route"}
                </span>
                {PICK_TRANSPORT.map((mode) => {
                  const MIcon = mode.icon;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                        pickTransport === mode.key
                          ? "bg-brand text-brand-foreground shadow-sm"
                          : "text-brand/60 hover:bg-brand/10 hover:text-brand"
                      )}
                      onClick={() => setPickTransport(mode.key)}
                    >
                      <MIcon size={11} className="mr-0.5 inline" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {/* Center: picked stops sequence */}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card px-2.5 py-1.5 scrollbar-hide">
                {pickIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground/50">
                    Click stops to add…
                  </span>
                ) : (
                  pickIds.map((id, i) => {
                    const name =
                      sorted.find((l) => l.location_id === id)?.location.name ??
                      "?";
                    return (
                      <span
                        key={id}
                        className="inline-flex shrink-0 items-center"
                      >
                        {i > 0 && (
                          <span className="mx-1 text-[10px] text-muted-foreground/30">
                            →
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand">
                            {i + 1}
                          </span>
                          <span className="max-w-[100px] truncate">{name}</span>
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setPickIds((cur) =>
                                cur.filter((pid) => pid !== id)
                              )
                            }
                            aria-label={`Remove ${name}`}
                          >
                            <X size={9} />
                          </button>
                        </span>
                      </span>
                    );
                  })
                )}
              </div>

              {/* Right group: actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {sorted.length >= 2 && pickIds.length < sorted.length && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setPickIds(sorted.map((l) => l.location_id))}
                  >
                    <ListOrdered size={10} />
                    All
                  </button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={pickIds.length < 2 || savingRoute}
                  onClick={handleSaveRoute}
                >
                  {savingRoute ? "Saving…" : `Save (${pickIds.length})`}
                </Button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={handleCancelPick}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
