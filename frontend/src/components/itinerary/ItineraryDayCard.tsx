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
import { Sunrise, Sun, Sunset, Moon, MapPin, Plus } from "lucide-react";

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
    bg: "bg-time-morning-bg",
    text: "text-time-morning-text",
  },
  afternoon: {
    label: "Afternoon",
    icon: Sun,
    bg: "bg-time-afternoon-bg",
    text: "text-time-afternoon-text",
  },
  evening: {
    label: "Evening",
    icon: Sunset,
    bg: "bg-time-evening-bg",
    text: "text-time-evening-text",
  },
  night: {
    label: "Night",
    icon: Moon,
    bg: "bg-time-night-bg",
    text: "text-time-night-text",
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
  onRouteCreated: (
    dayId: string,
    optionId: string,
    routeResponse: import("@/lib/api").RouteResponse
  ) => Promise<void>;
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

  const routes = useMemo(
    () => currentOption?.routes ?? [],
    [currentOption?.routes]
  );

  // Build lookup: locationId → all route memberships
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

  async function handleSaveRoute(
    transport: "walk" | "drive" | "transit",
    locationIds: string[],
    editingRouteId: string | null
  ) {
    if (!currentOption) return;
    if (editingRouteId) {
      const routeResponse = await api.itinerary.updateRoute(
        tripId,
        day.id,
        currentOption.id,
        editingRouteId,
        {
          transport_mode: transport,
          location_ids: locationIds,
        }
      );
      await onRouteCreated(day.id, currentOption.id, routeResponse);
    } else {
      const routeResponse = await api.itinerary.createRoute(
        tripId,
        day.id,
        currentOption.id,
        {
          transport_mode: transport,
          label: null,
          location_ids: locationIds,
        }
      );
      await onRouteCreated(day.id, currentOption.id, routeResponse);
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
              aria-label="Select time of day"
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
                isPickMode={false}
                pickIds={[]}
                tpOpen={tpOpen}
                tpTrigger={tpTrigger}
                currentOptionId={currentOption.id}
                dayId={day.id}
                calculatingRouteId={calculatingRouteId}
                onTogglePick={() => {}}
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
                sortedLocations={sorted}
                routes={routes}
                calculatingRouteId={calculatingRouteId}
                routeMetricsError={routeMetricsError}
                onRetryRouteMetrics={onRetryRouteMetrics}
                onSaveRoute={handleSaveRoute}
                onDeleteRoute={handleDeleteRoute}
              />

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
    </>
  );
}
